import Dexie, { type Table } from 'dexie'
import type { VaultMeta, SettingsRow } from '@/types/vault'

/**
 * ConversationOS IndexedDB database.
 *
 * Schema versioning rules:
 * - Never modify a past version's `.stores()` call — always add a new version.
 * - Version 1: Empty schema from Phase 0 scaffold.
 * - Version 2: Vault metadata table added (Phase 1).
 * - Version 3: Settings table added (Phase 1 — auto-lock timeout config).
 * - Version 4: Dev-only test harness scratch table (Phase 1 — temporary, remove before v1.0).
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
  }
}

export const db = new ConversationOSDatabase()
