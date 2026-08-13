/**
 * Import-related type definitions for Phase 2.
 *
 * These types define the data model for imported chats, messages,
 * media entries, and import records stored in Dexie.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Discriminated message type for categorisation. */
export type MessageType = 'text' | 'media' | 'system' | 'deleted'

/**
 * Intermediate parsed message — output of the parser, before encryption.
 * This is the in-memory representation used between parsing and persistence.
 *
 * SECURITY NOTE: This type holds plaintext content. It must NEVER be
 * persisted to IndexedDB or any storage. It exists only transiently
 * in the Web Worker's memory during the import pipeline.
 */
export interface ParsedMessage {
  /** Raw timestamp from the transcript line. */
  timestamp: Date
  /** Raw sender name as it appears in the transcript (null for system messages). */
  senderRaw: string | null
  /** Message type classification. */
  type: MessageType
  /** Plaintext content of the message. */
  content: string
  /**
   * Referenced media filename, if any.
   * - For `(file attached)` lines: the filename before the parenthetical.
   * - For `<Media omitted>` lines: null (no filename available).
   * - For `<attached: filename>` lines: the filename inside the angle brackets.
   */
  mediaFilename: string | null
  /** True if this is a `<Media omitted>` reference (no actual file expected). */
  isMediaOmitted: boolean
  /** 0-based sort index for stable ordering within a chat. */
  sortIndex: number
}

// ---------------------------------------------------------------------------
// Persisted Dexie table types
// ---------------------------------------------------------------------------

/** A single imported chat conversation. */
export interface Chat {
  /** Auto-increment primary key. */
  id?: number
  /** Display title (derived from zip filename or transcript header). */
  title: string
  /**
   * Raw sender name strings seen in the transcript.
   * Real contact resolution is deferred to a later phase.
   */
  participantHints: string[]
  /** ISO timestamp of the earliest message in this chat. */
  createdAt: string
  /** Total number of messages in this chat. */
  messageCount: number
  /** FK to the imports table — which import produced this chat. */
  importId: number
  /**
   * Which participant the user identifies as in this chat.
   * Drives message alignment (own messages → right, others → left).
   * Set via self-participant selection on first chat open (Phase 3).
   */
  selfParticipant?: string
}

/**
 * A single message stored in Dexie.
 *
 * The `encryptedContent` and `iv` fields hold the AES-GCM encrypted
 * message content. The plaintext is NEVER stored.
 *
 * Metadata fields (timestamp, type, chatId, senderRaw) are stored
 * unencrypted because they are needed for sorting, filtering, and
 * display without decrypting every message. This is a documented
 * privacy/performance tradeoff — see DOCUMENTATION.md Phase 2 entry.
 */
export interface Message {
  /** Auto-increment primary key. */
  id?: number
  /** FK to chats table. */
  chatId: number
  /** Message timestamp (ISO string for indexing). */
  timestamp: string
  /** Raw sender name (null for system messages). */
  senderRaw: string | null
  /** Message type. */
  type: MessageType
  /** AES-GCM encrypted message content (base64). */
  encryptedContent: string
  /** AES-GCM IV for this message (base64). */
  iv: string
  /** FK to media table, if this message references media (null otherwise). */
  mediaRef: number | null
  /** Stable sort index for ordering within a chat. */
  sortIndex: number
}

/**
 * A media file entry.
 *
 * Media bytes are encrypted and stored in OPFS, keyed by their SHA-256
 * hash. This entry tracks the metadata and links back to message references.
 */
export interface MediaEntry {
  /** Auto-increment primary key. */
  id?: number
  /** SHA-256 hash of the original (unencrypted) file bytes. For dedup. */
  sha256Hash: string
  /** Path within OPFS where the encrypted bytes are stored. */
  opfsPath: string
  /** MIME type inferred from file extension. */
  mimeType: string
  /** Original filename from the zip archive. */
  originalFilename: string
  /** Size of the original (unencrypted) file in bytes. */
  sizeBytes: number
  /** AES-GCM IV used to encrypt this media file (base64). */
  encryptedIv: string
  /**
   * Whether this media file was actually found in the zip archive.
   * - true: file existed in the zip and was encrypted+stored.
   * - false: the transcript references this file but it wasn't in the zip.
   */
  matched: boolean
}

/**
 * Aggregate statistics for a single import operation.
 * Stored as a JSON blob in the `imports` table.
 */
export interface ImportStats {
  messageCount: number
  mediaMatched: number
  mediaMissing: number
  mediaOmitted: number
  systemMessages: number
  deletedMessages: number
  textMessages: number
  parseErrors: string[]
  participants: string[]
}

/** A single import operation record. */
export interface ImportRecord {
  /** Auto-increment primary key. */
  id?: number
  /** ISO timestamp of when the import was performed. */
  timestamp: string
  /** Original zip filename. */
  sourceFileName: string
  /** Which transcript format was auto-detected. */
  detectedFormat: string
  /** Aggregate stats for this import. */
  stats: ImportStats
  /** 'complete' or 'incomplete' (if import failed partway). */
  status: 'complete' | 'incomplete'
}

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

/** Messages sent from main thread → import worker. */
export interface ImportWorkerRequest {
  type: 'start'
  zipBuffer: ArrayBuffer
  sourceFileName: string
}

/** Progress phases during import. */
export type ImportPhase = 'extracting' | 'parsing' | 'media' | 'encrypting' | 'saving'

/** Messages sent from import worker → main thread. */
export type ImportWorkerResponse =
  | { type: 'progress'; phase: ImportPhase; current: number; total: number; detail?: string }
  | { type: 'complete'; importId: number; stats: ImportStats }
  | { type: 'error'; message: string }
  | { type: 'needKey' }
