/**
 * aes.ts — AES-256-GCM encryption and decryption via Web Crypto API.
 *
 * SECURITY CRITICAL MODULE — read carefully before modifying.
 *
 * Responsibility: encrypt and decrypt arbitrary string data using a CryptoKey
 * derived by kdf.ts. All output values are base64-encoded for safe storage
 * in Dexie (which handles JSON serialisation).
 *
 * Algorithm: AES-256-GCM
 *   - AES: symmetric cipher, 256-bit key provides 128-bit security margin.
 *   - GCM (Galois/Counter Mode): authenticated encryption. Automatically
 *     detects tampering — decryption fails if ciphertext has been modified.
 *     No separate MAC step needed.
 *   - IV: 12 random bytes per encryption call. MUST be unique per (key, message)
 *     pair. Reusing an IV with the same key catastrophically breaks GCM's
 *     security guarantees. We generate a fresh IV on every encrypt() call.
 *
 * Using the browser's native `crypto.subtle` — no third-party library needed
 * for this layer. The implementation is auditable and dependency-free.
 */

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * A fresh random 12-byte IV is generated on every call. The IV must be
 * stored alongside the ciphertext (it is not secret, just must be unique).
 *
 * @param plaintext - UTF-8 string to encrypt.
 * @param key - AES-GCM CryptoKey (derived by deriveKey() in kdf.ts).
 * @returns Object containing base64-encoded `ciphertext` and `iv`.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  // Generate a unique IV for this encryption operation.
  // 12 bytes is the recommended IV length for AES-GCM (96 bits).
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const encoded = new TextEncoder().encode(plaintext)
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    },
    key,
    encoded,
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
  }
}

/**
 * Decrypt an AES-256-GCM ciphertext.
 *
 * GCM is authenticated: if the ciphertext has been tampered with, or if the
 * wrong key is used, this function will throw. The caller should catch this
 * and treat it as "wrong passphrase" or "data corruption".
 *
 * @param ciphertext - Base64-encoded ciphertext produced by encrypt().
 * @param iv - Base64-encoded IV produced by the same encrypt() call.
 * @param key - AES-GCM CryptoKey. Must be the same key used during encryption.
 * @returns Decrypted UTF-8 string.
 * @throws DOMException if decryption fails (wrong key or tampered data).
 */
export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const ciphertextBytes = base64ToBytes(ciphertext)
  const ivBytes = base64ToBytes(iv)

  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes.buffer.slice(
        ivBytes.byteOffset,
        ivBytes.byteOffset + ivBytes.byteLength,
      ) as ArrayBuffer,
    },
    key,
    ciphertextBytes.buffer.slice(
      ciphertextBytes.byteOffset,
      ciphertextBytes.byteOffset + ciphertextBytes.byteLength,
    ) as ArrayBuffer,
  )

  return new TextDecoder().decode(plaintextBuffer)
}

// ---------------------------------------------------------------------------
// Internal helpers — base64 encode/decode without external libraries
// ---------------------------------------------------------------------------

/** Convert a Uint8Array to a base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Convert a base64 string to a Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
