/**
 * kdf.ts — Key Derivation Function (Argon2id via hash-wasm)
 *
 * SECURITY CRITICAL MODULE — read carefully before modifying.
 *
 * Responsibility: derive an AES-256-GCM CryptoKey from a user passphrase
 * and a stored salt. The output key lives in memory only and is NEVER stored.
 *
 * Algorithm choice: Argon2id (RFC 9106 winner). It combines Argon2i's
 * side-channel resistance with Argon2d's brute-force resistance. It is the
 * current OWASP and NIST-recommended choice for password hashing/key derivation.
 *
 * Why not PBKDF2? PBKDF2 is entirely CPU-bound. Attackers with GPUs or ASICs
 * can parallelise it cheaply. Argon2id has a configurable memory requirement
 * that makes massively parallel attacks much more expensive.
 */

import { argon2id } from 'hash-wasm'
import type { KdfParams } from '@/types/vault'

/**
 * Default Argon2id parameters.
 *
 * Security/UX tradeoff reasoning (documented here per prompt requirement):
 *   - memoryCost 65536 (64 MB): Well above the Argon2 spec minimum. On mid-range
 *     desktop/mobile browsers this causes ~0.5–2s derivation time, which is the
 *     intended friction against brute-force. Reduces to ~128MB if targeting
 *     higher security in a future setting.
 *   - timeCost 3: OWASP minimum recommendation for Argon2id when memory ≥ 64 MB.
 *   - parallelism 1: Browser WASM is single-threaded per call; parallelism > 1
 *     does not help here and may cause errors in some environments.
 *
 * IMPORTANT: These params are stored in vaultMeta alongside each vault so that
 * they can be changed in future versions without breaking existing vaults.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryCost: 65536, // 64 MB in KiB
  timeCost: 3,
  parallelism: 1,
  variant: 'argon2id',
}

/**
 * Generate a cryptographically random salt.
 *
 * 32 bytes = 256-bit salt, well above the 128-bit minimum recommended by OWASP.
 * Must be unique per vault — never reuse a salt.
 *
 * @returns Uint8Array of 32 random bytes.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

/**
 * Derive a CryptoKey from a passphrase and salt using Argon2id.
 *
 * This is the most sensitive function in the module. The output key is used
 * for all AES-GCM encryption/decryption and must NEVER be stored or logged.
 *
 * Process:
 * 1. Run Argon2id (hash-wasm) with the given params to produce 32 raw key bytes.
 * 2. Import those bytes into the Web Crypto API as a non-extractable AES-GCM key.
 *
 * "Non-extractable" means the browser will not allow the raw key bytes to be
 * read back out after import — an additional safety layer on top of our own
 * no-persistence policy.
 *
 * @param passphrase - The user's plaintext passphrase.
 * @param salt - Random salt (Uint8Array), stored in vaultMeta.
 * @param params - Argon2id cost parameters, stored in vaultMeta.
 * @returns A non-extractable AES-GCM CryptoKey ready for encrypt/decrypt.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<CryptoKey> {
  // Argon2id returns a hex string; we request 32 bytes = 256 bits for AES-256.
  const hashHex = await argon2id({
    password: passphrase,
    salt,
    memorySize: params.memoryCost,
    iterations: params.timeCost,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'hex',
  })

  // Convert hex string → Uint8Array → import as AES-GCM key.
  const keyBytes = hexToBytes(hashHex)

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: key bytes cannot be read back out
    ['encrypt', 'decrypt'],
  )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a lowercase hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
