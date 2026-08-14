/**
 * semanticIndex.ts — Main-thread module for semantic (embedding-based) search.
 *
 * Responsibilities:
 * 1. GENERATION: Find messages without embeddings, send plaintext to the
 *    embedding worker in batches, encrypt each returned vector, store in Dexie.
 * 2. SESSION LOAD: On unlock, decrypt all stored embeddings into an in-memory
 *    Float32Array[] for fast cosine similarity search.
 * 3. QUERY: Embed the query string (via worker), compute cosine similarity
 *    against in-memory vectors, return top-K results.
 * 4. LOCK: Clear in-memory vectors on vault lock (encrypted Dexie rows remain).
 *
 * Security:
 * - Embedding vectors are derived from plaintext and are treated as sensitive.
 * - They are encrypted with the vault key before storage in Dexie.
 * - The plaintext Float32Array lives in memory only during an unlocked session.
 * - All generation happens in the embedding.worker.ts Web Worker.
 *
 * The model identifier is stored in each EmbeddingEntry so future model
 * upgrades can detect and re-embed stale vectors.
 */

import { db } from '@/lib/db'
import { encrypt, decrypt, bytesToBase64, base64ToBytes } from '@/lib/crypto/aes'
import { useSearchStore } from '@/stores/searchStore'
import type {
  SearchResult,
  EmbeddableMessage,
  EmbeddingWorkerResponse,
  EmbeddingEntry,
} from '@/types/search'

/** Must match MODEL_ID in embedding.worker.ts. */
const MODEL_VERSION = 'Xenova/all-MiniLM-L6-v2'

/** Batch size for messages sent to the embedding worker per postMessage. */
const SEND_BATCH_SIZE = 64

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** All in-memory decrypted vectors. Index matches embeddedMessageIds. */
let inMemoryVectors: Float32Array[] = []
/** Message IDs corresponding to inMemoryVectors (same order). */
let embeddedMessageIds: number[] = []
/** Chat IDs for each in-memory vector (same order). */
let embeddedChatIds: number[] = []

let embeddingWorker: Worker | null = null
let isLoadingSession = false

// Pending query resolvers waiting on worker response
const QUERY_RESOLVERS = new Map<
  string,
  { resolve: (v: Float32Array) => void; reject: (e: Error) => void }
>()

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

function getEmbeddingWorker(derivedKey: CryptoKey): Worker {
  if (embeddingWorker) return embeddingWorker

  embeddingWorker = new Worker(new URL('../../workers/embedding.worker.ts', import.meta.url), {
    type: 'module',
  })

  embeddingWorker.onmessage = async (e: MessageEvent<EmbeddingWorkerResponse>) => {
    const msg = e.data

    if (msg.type === 'modelLoading') {
      useSearchStore.getState().setEmbeddingProgress('loading-model')
      return
    }

    if (msg.type === 'modelReady') {
      // Status will be updated to 'indexing' once we start sending batches.
      return
    }

    if (msg.type === 'result') {
      // Encrypt the vector and store it in Dexie.
      await storeVector(msg.messageId, msg.vector, derivedKey)
      // Also add to in-memory index.
      const chatId = await getChatIdForMessage(msg.messageId)
      inMemoryVectors.push(msg.vector)
      embeddedMessageIds.push(msg.messageId)
      embeddedChatIds.push(chatId)
      return
    }

    if (msg.type === 'progress') {
      useSearchStore.getState().setEmbeddingProgress('indexing', msg.done, msg.total)
      return
    }

    if (msg.type === 'done') {
      useSearchStore
        .getState()
        .setEmbeddingProgress('ready', inMemoryVectors.length, inMemoryVectors.length)
      return
    }

    if (msg.type === 'queryResult') {
      const pending = QUERY_RESOLVERS.get(msg.requestId)
      if (pending) {
        QUERY_RESOLVERS.delete(msg.requestId)
        pending.resolve(msg.vector)
      }
      return
    }

    if (msg.type === 'modelProgress') {
      useSearchStore.getState().setModelProgress(msg.progress)
      return
    }

    if (msg.type === 'queryError') {
      const pending = QUERY_RESOLVERS.get(msg.requestId)
      if (pending) {
        QUERY_RESOLVERS.delete(msg.requestId)
        pending.reject(new Error(msg.message))
      }
      return
    }

    if (msg.type === 'error') {
      console.error('[semanticIndex] Worker error:', msg.message)
      useSearchStore.getState().setEmbeddingProgress('error')
      for (const [id, { reject }] of QUERY_RESOLVERS) {
        reject(new Error(msg.message))
        QUERY_RESOLVERS.delete(id)
      }
    }
  }

  embeddingWorker.onerror = (err) => {
    console.error('[semanticIndex] Uncaught worker error:', err)
    useSearchStore.getState().setEmbeddingProgress('error')
  }

  return embeddingWorker
}

// ---------------------------------------------------------------------------
// Vector encryption helpers
// ---------------------------------------------------------------------------

function float32ToBase64(vec: Float32Array): string {
  return bytesToBase64(new Uint8Array(vec.buffer))
}

function base64ToFloat32(b64: string): Float32Array {
  const bytes = base64ToBytes(b64)
  // Ensure the byte array is aligned for Float32Array view.
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Float32Array(copy.buffer)
}

async function storeVector(messageId: number, vector: Float32Array, key: CryptoKey): Promise<void> {
  const plaintext = float32ToBase64(vector)
  const { ciphertext, iv } = await encrypt(plaintext, key)

  const entry: EmbeddingEntry = {
    messageId,
    encryptedVector: ciphertext,
    iv,
    modelVersion: MODEL_VERSION,
  }

  // Upsert: if an entry already exists for this messageId + modelVersion, replace it.
  const existing = await db.embeddings
    .where('messageId')
    .equals(messageId)
    .filter((e) => e.modelVersion === MODEL_VERSION)
    .first()

  if (existing?.id !== undefined) {
    await db.embeddings.update(existing.id, entry)
  } else {
    await db.embeddings.add(entry)
  }
}

// Small cache to avoid repeated DB lookups for chatId during embedding.
const msgChatIdCache = new Map<number, number>()

async function getChatIdForMessage(messageId: number): Promise<number> {
  if (msgChatIdCache.has(messageId)) return msgChatIdCache.get(messageId)!
  const msg = await db.messages.get(messageId)
  const chatId = msg?.chatId ?? 0
  msgChatIdCache.set(messageId, chatId)
  return chatId
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the session: decrypt all stored embeddings into memory.
 * Called once per unlock, before starting generation of new embeddings.
 */
export async function loadEmbeddingSession(derivedKey: CryptoKey): Promise<void> {
  if (isLoadingSession) return
  isLoadingSession = true

  try {
    // Load all stored embeddings for the current model version.
    const stored = await db.embeddings.where('modelVersion').equals(MODEL_VERSION).toArray()

    inMemoryVectors = []
    embeddedMessageIds = []
    embeddedChatIds = []

    // Decrypt all stored vectors in parallel (batched for memory safety).
    const BATCH = 200
    for (let i = 0; i < stored.length; i += BATCH) {
      const batch = stored.slice(i, i + BATCH)
      const decrypted = await Promise.all(
        batch.map(async (entry) => {
          try {
            const plaintext = await decrypt(entry.encryptedVector, entry.iv, derivedKey)
            const vec = base64ToFloat32(plaintext)
            return { messageId: entry.messageId, vec }
          } catch {
            return null
          }
        }),
      )

      for (const item of decrypted) {
        if (!item) continue
        const chatId = await getChatIdForMessage(item.messageId)
        inMemoryVectors.push(item.vec)
        embeddedMessageIds.push(item.messageId)
        embeddedChatIds.push(chatId)
      }
    }

    if (inMemoryVectors.length > 0) {
      useSearchStore
        .getState()
        .setEmbeddingProgress('ready', inMemoryVectors.length, inMemoryVectors.length)
    }
  } finally {
    isLoadingSession = false
  }
}

/**
 * Start generating embeddings for all messages that don't have one yet.
 * Resumable: skips messages already in `db.embeddings` for this modelVersion.
 *
 * @param derivedKey - Vault key for encrypting vectors before storage.
 */
export async function generateMissingEmbeddings(derivedKey: CryptoKey): Promise<void> {
  // Find all message IDs that already have an embedding for this model.
  const existingIds = new Set(
    (await db.embeddings.where('modelVersion').equals(MODEL_VERSION).toArray()).map(
      (e) => e.messageId,
    ),
  )

  // Load all messages and filter to those without embeddings.
  const allMessages = await db.messages.toArray()
  const needsEmbedding = allMessages.filter((m) => m.id !== undefined && !existingIds.has(m.id!))

  if (needsEmbedding.length === 0) {
    // All messages already embedded — update status if vectors are in memory.
    if (inMemoryVectors.length > 0) {
      useSearchStore
        .getState()
        .setEmbeddingProgress('ready', inMemoryVectors.length, inMemoryVectors.length)
    }
    return
  }

  // Decrypt content for messages that need embedding.
  useSearchStore.getState().setEmbeddingProgress('indexing', existingIds.size, allMessages.length)

  const w = getEmbeddingWorker(derivedKey)
  const total = needsEmbedding.length

  // Send in batches to avoid one giant postMessage.
  for (let i = 0; i < total; i += SEND_BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + SEND_BATCH_SIZE)
    const decrypted: EmbeddableMessage[] = []

    for (const msg of batch) {
      try {
        const content = await decrypt(msg.encryptedContent, msg.iv, derivedKey)
        decrypted.push({ messageId: msg.id!, content })
      } catch {
        // Skip undecryptable messages silently.
      }
    }

    if (decrypted.length > 0) {
      w.postMessage({ type: 'embed', batch: decrypted })
    }
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity search
// ---------------------------------------------------------------------------

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  // Vectors are already L2-normalized by the embedding worker, so |a|=|b|=1.
  return dot
}

/**
 * Search using semantic similarity.
 *
 * @param queryText - Natural language query.
 * @param topK - Maximum number of results to return.
 * @param derivedKey - Vault key (needed for query embedding).
 * @returns Top-K results sorted by cosine similarity (descending).
 */
export async function searchSemantic(
  queryText: string,
  topK: number,
  derivedKey: CryptoKey,
): Promise<SearchResult[]> {
  if (inMemoryVectors.length === 0) return []

  // Embed the query via the worker.
  const queryVector = await embedQuery(queryText, derivedKey)

  // Compute cosine similarity against all stored vectors.
  const scores: { idx: number; score: number }[] = []
  for (let i = 0; i < inMemoryVectors.length; i++) {
    scores.push({ idx: i, score: cosine(queryVector, inMemoryVectors[i]) })
  }

  scores.sort((a, b) => b.score - a.score)
  const top = scores.slice(0, topK)

  // Build results — needs message metadata for display.
  const chats = await db.chats.toArray()
  const chatTitleMap = new Map<number, string>(chats.map((c) => [c.id!, c.title]))

  const results: SearchResult[] = []
  for (const { idx, score } of top) {
    const messageId = embeddedMessageIds[idx]
    const chatId = embeddedChatIds[idx]
    const msg = await db.messages.get(messageId)
    if (!msg) continue

    let snippet: string
    try {
      const content = await decrypt(msg.encryptedContent, msg.iv, derivedKey)
      snippet = content.slice(0, 200)
    } catch {
      snippet = '[Unable to decrypt]'
    }

    results.push({
      messageId,
      chatId,
      chatTitle: chatTitleMap.get(chatId) ?? 'Unknown',
      snippet,
      senderRaw: msg.senderRaw,
      timestamp: msg.timestamp,
      highlights: [], // No keyword highlights for semantic results.
      score,
      source: 'semantic',
    })
  }

  return results
}

async function embedQuery(text: string, _derivedKey: CryptoKey): Promise<Float32Array> {
  const w = getEmbeddingWorker(_derivedKey)
  return new Promise((resolve, reject) => {
    const requestId = `q-${Date.now()}-${Math.random()}`
    QUERY_RESOLVERS.set(requestId, { resolve, reject })
    w.postMessage({ type: 'embedQuery', text, requestId })
    setTimeout(() => {
      if (QUERY_RESOLVERS.has(requestId)) {
        QUERY_RESOLVERS.delete(requestId)
        reject(new Error('Query embedding timed out'))
      }
    }, 30000)
  })
}

/** How many messages are currently indexed in memory. */
export function getEmbeddingCount(): number {
  return inMemoryVectors.length
}

/**
 * Clear all in-memory vectors and terminate the embedding worker.
 * Must be called on vault lock. Encrypted Dexie rows are preserved.
 */
export function clearSemanticIndex(): void {
  inMemoryVectors = []
  embeddedMessageIds = []
  embeddedChatIds = []
  msgChatIdCache.clear()
  QUERY_RESOLVERS.clear()

  if (embeddingWorker) {
    embeddingWorker.terminate()
    embeddingWorker = null
  }

  isLoadingSession = false
  useSearchStore.getState().setEmbeddingProgress('idle', 0, 0)
}
