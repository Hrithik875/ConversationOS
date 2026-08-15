/**
 * fulltextIndex.ts — Main-thread wrapper for the full-text search worker.
 *
 * Manages the fulltext index worker lifecycle:
 * - Decrypts all messages (via the existing decryptionCache infrastructure)
 *   and sends plaintext to the worker to build the MiniSearch index.
 * - Routes search queries to the worker and returns results.
 * - On vault lock: terminates the worker so no plaintext survives in memory.
 *
 * The index is in-memory only and never persisted. It is rebuilt once per
 * unlock session, lazily on first use or eagerly after unlock (caller's choice).
 *
 * SECURITY NOTE: This module sends plaintext message content to the worker.
 * The worker holds it in memory only for the duration of the session.
 */

import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto/aes'
import { useSearchStore } from '@/stores/searchStore'
import type { IndexableMessage, SearchResult, FulltextWorkerResponse } from '@/types/search'

/** Model version string used to identify stored fulltext index — not persisted but used for logging. */
const PENDING_RESOLVERS = new Map<string, (results: SearchResult[]) => void>()
const PENDING_REJECTORS = new Map<string, (err: Error) => void>()

let worker: Worker | null = null
let isReady = false
let buildPromise: Promise<void> | null = null

/** Get or create the fulltext worker. */
function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('../../workers/fulltextIndex.worker.ts', import.meta.url), {
    type: 'module',
  })

  worker.onmessage = (e: MessageEvent<FulltextWorkerResponse>) => {
    const msg = e.data

    if (msg.type === 'progress') {
      // Progress is informational — fulltext index builds fast so we don't
      // expose it in the store (semantic indexing has the progress UI).
      return
    }

    if (msg.type === 'ready') {
      isReady = true
      useSearchStore.getState().setFulltextStatus('ready')
      return
    }

    if (msg.type === 'results') {
      const resolve = PENDING_RESOLVERS.get(msg.requestId)
      if (resolve) {
        PENDING_RESOLVERS.delete(msg.requestId)
        PENDING_REJECTORS.delete(msg.requestId)
        resolve(msg.results)
      }
      return
    }

    if (msg.type === 'error') {
      console.error('[fulltextIndex] Worker error:', msg.message)
      useSearchStore.getState().setFulltextStatus('error')
      // Reject any pending search promises.
      for (const [id, reject] of PENDING_REJECTORS) {
        reject(new Error(msg.message))
        PENDING_RESOLVERS.delete(id)
        PENDING_REJECTORS.delete(id)
      }
    }
  }

  worker.onerror = (err) => {
    console.error('[fulltextIndex] Uncaught worker error:', err)
    useSearchStore.getState().setFulltextStatus('error')
  }

  return worker
}

/**
 * Build the full-text index for all messages across all chats.
 *
 * Decrypts all message content using the vault key, then sends the
 * plaintext to the worker. Safe to call multiple times — returns the
 * existing build promise if a build is already in progress.
 *
 * @param derivedKey - AES-GCM CryptoKey from the vault store.
 */
export async function buildFulltextIndex(derivedKey: CryptoKey): Promise<void> {
  if (buildPromise) return buildPromise

  buildPromise = _doBuild(derivedKey).catch((err) => {
    console.error('[fulltextIndex] Build failed:', err)
    useSearchStore.getState().setFulltextStatus('error')
    buildPromise = null
  })

  return buildPromise
}

async function _doBuild(derivedKey: CryptoKey): Promise<void> {
  useSearchStore.getState().setFulltextStatus('building')
  isReady = false

  // Load all chats to get titles.
  const chats = await db.chats.toArray()
  const chatTitleMap = new Map<number, string>(chats.map((c) => [c.id!, c.title]))

  // Load all messages (metadata + encrypted content).
  const messages = await db.messages.toArray()

  const indexable: IndexableMessage[] = []

  // Decrypt in parallel with concurrency limit to avoid OOM on huge chats.
  const CONCURRENCY = 50
  for (let i = 0; i < messages.length; i += CONCURRENCY) {
    const batch = messages.slice(i, i + CONCURRENCY)
    const decrypted = await Promise.all(
      batch.map(async (msg) => {
        try {
          const content = await decrypt(msg.encryptedContent, msg.iv, derivedKey)
          return {
            id: msg.id!,
            chatId: msg.chatId,
            chatTitle: chatTitleMap.get(msg.chatId) ?? 'Unknown',
            content,
            senderRaw: msg.senderRaw,
            timestamp: msg.timestamp,
          } satisfies IndexableMessage
        } catch {
          return null
        }
      }),
    )
    indexable.push(...(decrypted.filter(Boolean) as IndexableMessage[]))
  }

  const w = getWorker()
  w.postMessage({ type: 'build', messages: indexable })
  // Worker will respond with 'ready' when done, which flips isReady.
}

/**
 * Search the full-text index.
 *
 * @param query - Search query string.
 * @returns Array of SearchResult objects sorted by relevance.
 */
export function searchFulltext(query: string): Promise<SearchResult[]> {
  if (!isReady || !worker) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    const requestId = `ft-${Date.now()}-${Math.random()}`
    PENDING_RESOLVERS.set(requestId, resolve)
    PENDING_REJECTORS.set(requestId, reject)
    worker!.postMessage({ type: 'search', query, requestId })
    // Timeout after 5s to avoid dangling promises.
    setTimeout(() => {
      if (PENDING_RESOLVERS.has(requestId)) {
        PENDING_RESOLVERS.delete(requestId)
        PENDING_REJECTORS.delete(requestId)
        resolve([])
      }
    }, 5000)
  })
}

/** Whether the full-text index is ready for queries. */
export function isFulltextReady(): boolean {
  return isReady
}

/**
 * Clear the full-text index and terminate the worker.
 * Must be called on vault lock.
 */
export function clearFulltextIndex(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
  isReady = false
  buildPromise = null
  PENDING_RESOLVERS.clear()
  PENDING_REJECTORS.clear()
  useSearchStore.getState().setFulltextStatus('idle')
}
