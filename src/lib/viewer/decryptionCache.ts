/**
 * decryptionCache.ts — In-memory LRU cache for decrypted message content.
 *
 * SECURITY CRITICAL: This cache holds plaintext message content in memory.
 * It must NEVER be persisted to any storage. It is cleared entirely when
 * the vault locks (via vaultStore subscription).
 *
 * Design:
 * - Map<messageId, decryptedPlaintext> with a configurable max size.
 * - Eviction: FIFO (oldest inserted entry removed when at capacity).
 *   This approximates LRU well enough for sequential scroll access.
 * - Max size: 2000 entries (~60 screens of content).
 */

import { decrypt } from '@/lib/crypto/aes'

/** Maximum number of decrypted messages to hold in memory. */
const MAX_CACHE_SIZE = 2000

/** The cache instance. Module-scoped singleton. */
const cache = new Map<number, string>()

/**
 * Get a decrypted message from the cache, or decrypt it on demand.
 *
 * @param messageId - Dexie primary key of the message.
 * @param encryptedContent - Base64-encoded AES-GCM ciphertext.
 * @param iv - Base64-encoded IV.
 * @param key - AES-GCM CryptoKey from the vault.
 * @returns Decrypted plaintext string.
 */
export async function getCachedDecryption(
  messageId: number,
  encryptedContent: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const cached = cache.get(messageId)
  if (cached !== undefined) return cached

  const plaintext = await decrypt(encryptedContent, iv, key)

  // Evict oldest if at capacity.
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }

  cache.set(messageId, plaintext)
  return plaintext
}

/**
 * Check if a message is already cached (without decrypting).
 */
export function isCached(messageId: number): boolean {
  return cache.has(messageId)
}

/**
 * Clear the entire decryption cache.
 *
 * MUST be called when the vault locks to ensure no plaintext
 * remains in memory after lock.
 */
export function clearDecryptionCache(): void {
  cache.clear()
}

/**
 * Get the current cache size (for diagnostics/testing).
 */
export function getDecryptionCacheSize(): number {
  return cache.size
}
