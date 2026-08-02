/**
 * TypeScript types for the Vault module.
 *
 * These types describe non-secret metadata stored in Dexie (vaultMeta table).
 * The passphrase and derived key are NEVER stored — they live in memory only.
 */

/** Argon2id KDF parameters stored alongside the vault.
 *
 * These are stored in plaintext — they are public parameters, not secrets.
 * The security comes from the passphrase itself and the cost of running Argon2id.
 */
export interface KdfParams {
  /** Memory cost in KiB. 65536 = 64 MB. */
  memoryCost: number
  /** Number of iterations. */
  timeCost: number
  /** Parallelism factor. 1 = single-threaded (appropriate for browser WASM). */
  parallelism: number
  /** Argon2 variant identifier, always 'argon2id' for this project. */
  variant: 'argon2id'
}

/**
 * An encrypted verifier blob stored in Dexie.
 * This is the ciphertext of a known plaintext constant, encrypted with the derived key.
 * Correct passphrase → correct key → successful decryption = vault is unlocked.
 *
 * NEVER store the plaintext constant, the passphrase, or the derived key here.
 */
export interface VerifierBlob {
  /** AES-GCM ciphertext, base64-encoded. */
  ciphertext: string
  /** AES-GCM IV, base64-encoded. */
  iv: string
}

/** A row in the vaultMeta Dexie table. */
export interface VaultMeta {
  /** Auto-assigned primary key by Dexie (++). */
  id?: number
  /** Random salt used for Argon2id key derivation, base64-encoded. */
  salt: string
  /** Argon2id parameters used to derive the key from this salt. */
  kdfParams: KdfParams
  /**
   * Encrypted known-plaintext blob used to verify the passphrase on unlock.
   * Does NOT contain the passphrase or key.
   */
  verifier: VerifierBlob
  /** ISO 8601 timestamp of vault creation. */
  createdAt: string
}

/** A row in the settings Dexie table (non-secret configuration). */
export interface SettingsRow {
  /** The setting key (string, primary key). */
  key: string
  /** The setting value (any JSON-serializable value). */
  value: unknown
}

/** The possible states of the vault in the current session. */
export type VaultStatus = 'no-vault' | 'locked' | 'unlocked'
