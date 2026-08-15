import Dexie, { type Table } from 'dexie'
import type { VaultMeta, SettingsRow } from '@/types/vault'
import type { Chat, Message, MediaEntry, ImportRecord } from '@/types/import'
import type { EmbeddingEntry } from '@/types/search'

/**
 * ConversationOS IndexedDB database.
 *
 * Schema versioning rules:
 * - Never modify a past version's `.stores()` call — always add a new version.
 * - Version 1: Empty schema from Phase 0 scaffold.
 * - Version 2: Vault metadata table added (Phase 1).
 * - Version 3: Settings table added (Phase 1 — auto-lock timeout config).
 * - Version 4: Dev-only test harness scratch table (Phase 1 — temporary, remove before v1.0).
 * - Version 5: Import engine tables (Phase 2 — chats, messages, media, imports).
 * - Version 6: Embeddings table (Phase 4 — encrypted semantic search vectors).
 */
export class ConversationOSDatabase extends Dexie {
  /**
   * Non-secret vault metadata: salt, KDF params, encrypted verifier, createdAt.
   *
   * SECURITY NOTE: This table NEVER stores the passphrase or derived key.
   * Only the verifier (encrypted known-plaintext blob) is stored here.
   * The derived key lives in memory only (vaultStore.ts).
   */
  vaultMeta!: Table<VaultMeta, number>

  /**
   * Non-secret app settings (e.g. auto-lock timeout duration).
   * Key-value store. Values are plain JSON — nothing sensitive lives here.
   */
  settings!: Table<SettingsRow, string>

  /**
   * TEMPORARY DEV SCAFFOLDING — remove before v1.0.
   * Used by the round-trip test harness (Phase 1, Task 7) to store
   * a sample encrypted string across page reloads to prove the crypto core
   * works end-to-end. Not used for any real data.
   */
  _devTestCiphertext!: Table<{ id?: number; ciphertext: string; iv: string }, number>

  /**
   * Imported chat conversations.
   * Each row represents one chat (one-to-one or group) from a WhatsApp export.
   */
  chats!: Table<Chat, number>

  /**
   * Individual messages within chats.
   *
   * SECURITY NOTE: The `encryptedContent` and `iv` fields hold AES-GCM
   * encrypted message text. The plaintext content is NEVER stored.
   * Metadata (timestamp, type, chatId, senderRaw) is stored unencrypted
   * for query performance — this is a documented tradeoff.
   */
  messages!: Table<Message, number>

  /**
   * Media file metadata and OPFS storage references.
   * Actual file bytes are encrypted and stored in OPFS, not in IndexedDB.
   */
  media!: Table<MediaEntry, number>

  /**
   * Import operation records — one per zip file import.
   * Tracks what was imported, when, and aggregate stats.
   */
  imports!: Table<ImportRecord, number>

  /**
   * Encrypted embedding vectors for semantic search.
   *
   * SECURITY NOTE: Vectors are derived from message content and could leak
   * semantic information. They are encrypted at rest with the vault key.
   * The plaintext Float32Array lives in memory only during an unlocked session.
   */
  embeddings!: Table<EmbeddingEntry, number>

  constructor() {
    super('ConversationOSDatabase')

    // Version 1: Empty schema from Phase 0 scaffold.
    this.version(1).stores({})

    // Version 2: Vault metadata table.
    // `++id` = auto-increment integer primary key.
    this.version(2).stores({
      vaultMeta: '++id',
    })

    // Version 3: Settings table.
    // `key` = string primary key (no auto-increment).
    this.version(3).stores({
      vaultMeta: '++id',
      settings: 'key',
    })

    // Version 4: Dev-only test harness scratch table.
    this.version(4).stores({
      vaultMeta: '++id',
      settings: 'key',
      _devTestCiphertext: '++id',
    })

    // Version 5: Import engine tables (Phase 2).
    // - chats: indexed by importId for per-import queries.
    // - messages: indexed by chatId + timestamp for chronological display,
    //   type for filtering, sortIndex for stable ordering.
    // - media: indexed by sha256Hash for dedup, originalFilename for matching.
    // - imports: indexed by timestamp for chronological listing.
    this.version(5).stores({
      vaultMeta: '++id',
      settings: 'key',
      _devTestCiphertext: '++id',
      chats: '++id, importId',
      messages: '++id, chatId, timestamp, type, sortIndex',
      media: '++id, sha256Hash, originalFilename',
      imports: '++id, timestamp',
    })

    // Version 6: Embeddings table (Phase 4).
    // - embeddings: indexed by messageId for O(1) lookup, modelVersion for
    //   detecting stale vectors when the model is upgraded.
    this.version(6).stores({
      vaultMeta: '++id',
      settings: 'key',
      _devTestCiphertext: '++id',
      chats: '++id, importId',
      messages: '++id, chatId, timestamp, type, sortIndex',
      media: '++id, sha256Hash, originalFilename',
      imports: '++id, timestamp',
      embeddings: '++id, messageId, modelVersion',
    })
  }
}

export const db = new ConversationOSDatabase()
