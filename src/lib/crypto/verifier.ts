/**
 * verifier.ts — Vault unlock verifier (encrypted known-plaintext proof)
 *
 * SECURITY CRITICAL MODULE — read carefully before modifying.
 *
 * Problem: We need to verify that the user entered the correct passphrase
 * on unlock, WITHOUT storing the passphrase or the derived key anywhere.
 *
 * Solution (standard approach):
 *   1. On vault creation: encrypt a well-known constant plaintext with the
 *      derived key. Store only the ciphertext + IV (the "verifier blob").
 *   2. On unlock attempt: re-derive the key from the entered passphrase +
 *      stored salt. Attempt to decrypt the stored verifier. If decryption
 *      succeeds (AES-GCM is authenticated — it throws on wrong key), the
 *      passphrase is correct.
 *
 * The known plaintext itself is not secret — it is a fixed string baked into
 * the code. Security comes from the key, not the plaintext.
 *
 * IMPORTANT: The verifier does NOT reveal whether the entered passphrase is
 * "close" to correct. AES-GCM decryption either fully succeeds or throws.
 * There is no partial-match oracle.
 */

import { encrypt, decrypt } from './aes'
import type { VerifierBlob } from '@/types/vault'

/**
 * The fixed known-plaintext used for verifier generation.
 * This is NOT a secret — the security comes from the key, not this string.
 * It must remain constant across all versions of the app.
 */
const VERIFIER_KNOWN_PLAINTEXT = 'ConversationOS:vault-verifier:v1'

/**
 * Generate a verifier blob from a derived key.
 *
 * Call this once on vault creation. The result is stored in vaultMeta.verifier.
 * Do NOT store the key or passphrase — only this blob.
 *
 * @param key - The derived CryptoKey (from deriveKey() in kdf.ts).
 * @returns A VerifierBlob (ciphertext + iv, both base64-encoded).
 */
export async function generateVerifier(key: CryptoKey): Promise<VerifierBlob> {
  return encrypt(VERIFIER_KNOWN_PLAINTEXT, key)
}

/**
 * Check whether a derived key matches the stored verifier.
 *
 * On unlock, re-derive the key from the entered passphrase and stored salt,
 * then call this function. If it returns true, the passphrase is correct and
 * the key can be placed in the vault store.
 *
 * Implementation note: We rely on AES-GCM's authentication tag to detect
 * wrong keys. A wrong key will cause crypto.subtle.decrypt() to throw a
 * DOMException. We catch that specific case and return false. Any other
 * error (e.g. malformed ciphertext, storage corruption) is re-thrown.
 *
 * @param key - A freshly derived CryptoKey to test.
 * @param storedVerifier - The VerifierBlob stored in vaultMeta.
 * @returns true if the key is correct, false if the passphrase was wrong.
 * @throws Error for unexpected failures (storage corruption, etc.).
 */
export async function checkVerifier(
  key: CryptoKey,
  storedVerifier: VerifierBlob,
): Promise<boolean> {
  try {
    const plaintext = await decrypt(storedVerifier.ciphertext, storedVerifier.iv, key)
    // Extra paranoia check: confirm the decrypted value matches our constant.
    // AES-GCM authentication should already catch wrong keys, but this adds
    // an explicit application-layer check as a second line of defence.
    return plaintext === VERIFIER_KNOWN_PLAINTEXT
  } catch (err) {
    // AES-GCM throws DOMException on authentication failure (wrong key).
    // Any such error means "wrong passphrase" — return false, do not throw.
    if (err instanceof DOMException) {
      return false
    }
    // Unexpected error (storage corruption, programming bug) — re-throw
    // so it surfaces as an actual error, not a silent wrong-passphrase.
    throw err
  }
}
