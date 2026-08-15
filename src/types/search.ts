/**
 * search.ts — Type definitions for the Phase 4 search layer.
 *
 * Covers both full-text (MiniSearch) and semantic (embedding-based) search,
 * plus the worker message protocol for each search worker.
 */

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

/** A single search result, used for both keyword and semantic search. */
export interface SearchResult {
  /** Dexie message ID. */
  messageId: number
  /** Dexie chat ID (for cross-chat navigation). */
  chatId: number
  /** Chat title (for display in results). */
  chatTitle: string
  /** Plaintext snippet of the message content. */
  snippet: string
  /** Raw sender name (null for system messages). */
  senderRaw: string | null
  /** ISO timestamp string. */
  timestamp: string
  /**
   * Highlight ranges within `snippet` — pairs of [start, end] character
   * offsets marking where the query matched. Only populated for keyword
   * results; empty array for semantic results.
   */
  highlights: [number, number][]
  /** Score: BM25 relevance score for keyword; cosine similarity for semantic. */
  score: number
  /** Which search mode produced this result. */
  source: 'keyword' | 'semantic'
}

/** Which search mode the user has selected. */
export type SearchMode = 'keyword' | 'semantic' | 'both'

// ---------------------------------------------------------------------------
// Full-text index worker protocol
// ---------------------------------------------------------------------------

/** A minimal message descriptor sent to the full-text worker for indexing. */
export interface IndexableMessage {
  id: number
  chatId: number
  chatTitle: string
  content: string
  senderRaw: string | null
  timestamp: string
}

/** Messages sent from main thread → fulltext worker. */
export type FulltextWorkerRequest =
  | { type: 'build'; messages: IndexableMessage[] }
  | { type: 'search'; query: string; requestId: string }
  | { type: 'clear' }

/** Messages sent from fulltext worker → main thread. */
export type FulltextWorkerResponse =
  | { type: 'progress'; indexed: number; total: number }
  | { type: 'ready' }
  | { type: 'results'; requestId: string; results: SearchResult[] }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// Embedding worker protocol
// ---------------------------------------------------------------------------

/** A message with its decrypted content, ready for embedding. */
export interface EmbeddableMessage {
  messageId: number
  content: string
}

/** Messages sent from main thread → embedding worker. */
export type EmbeddingWorkerRequest =
  | { type: 'embed'; batch: EmbeddableMessage[] }
  | { type: 'embedQuery'; text: string; requestId: string }

/** Messages sent from embedding worker → main thread. */
export type EmbeddingWorkerResponse =
  | { type: 'modelLoading' }
  | {
      type: 'modelProgress'
      file: string
      progress: number
      loaded: number
      total: number
    }
  | { type: 'modelReady' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; messageId: number; vector: Float32Array }
  | { type: 'done' }
  | { type: 'queryResult'; requestId: string; vector: Float32Array }
  | { type: 'queryError'; requestId: string; message: string }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// Embedding database entry
// ---------------------------------------------------------------------------

/**
 * A persisted embedding vector row in the `embeddings` Dexie table.
 *
 * SECURITY NOTE: `encryptedVector` holds AES-GCM encrypted Float32Array bytes.
 * The plaintext vector is NEVER persisted — it is decrypted into memory only
 * for the duration of an unlocked session.
 */
export interface EmbeddingEntry {
  /** Auto-increment primary key. */
  id?: number
  /** FK to the messages table. */
  messageId: number
  /** AES-GCM encrypted Float32Array (serialised as raw bytes, base64). */
  encryptedVector: string
  /** AES-GCM IV for this vector (base64). */
  iv: string
  /**
   * Identifier of the model that produced this embedding.
   * Used to detect stale embeddings if the model is upgraded.
   * E.g. 'Xenova/all-MiniLM-L6-v2'
   */
  modelVersion: string
}
