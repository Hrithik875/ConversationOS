/**
 * mediaCache.ts — In-memory cache for decrypted media object URLs.
 *
 * SECURITY CRITICAL: Object URLs point to in-memory Blobs containing
 * decrypted media. They must be revoked (freed) when evicted and when
 * the vault locks.
 *
 * Design:
 * - Map<mediaId, objectURL> with a max size of 100 entries.
 * - On eviction: URL.revokeObjectURL() is called to free the Blob.
 * - clearAll() revokes ALL URLs and empties the cache.
 */

import { base64ToBytes } from '@/lib/crypto/aes'

/** Maximum number of media object URLs to hold in memory. */
const MAX_MEDIA_CACHE_SIZE = 100

/** The cache instance. Module-scoped singleton. */
const cache = new Map<number, string>()

/**
 * Get a cached object URL for a media item, or decrypt and create one.
 *
 * @param mediaId - Dexie primary key of the media entry.
 * @param opfsPath - Path within OPFS where encrypted bytes are stored.
 * @param encryptedIv - Base64-encoded IV used to encrypt the media.
 * @param mimeType - MIME type for the Blob.
 * @param key - AES-GCM CryptoKey from the vault.
 * @returns Object URL pointing to the decrypted media Blob.
 */
export async function getCachedMediaUrl(
  mediaId: number,
  opfsPath: string,
  encryptedIv: string,
  mimeType: string,
  key: CryptoKey,
): Promise<string> {
  const cached = cache.get(mediaId)
  if (cached !== undefined) return cached

  // Read encrypted bytes from OPFS.
  const root = await navigator.storage.getDirectory()
  const parts = opfsPath.split('/')
  let dirHandle = root
  for (let i = 0; i < parts.length - 1; i++) {
    dirHandle = await dirHandle.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1])
  const file = await fileHandle.getFile()
  const encryptedBytes = new Uint8Array(await file.arrayBuffer())

  // Decrypt.
  const ivBytes = base64ToBytes(encryptedIv)
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes.buffer.slice(
        ivBytes.byteOffset,
        ivBytes.byteOffset + ivBytes.byteLength,
      ) as ArrayBuffer,
    },
    key,
    encryptedBytes.buffer.slice(
      encryptedBytes.byteOffset,
      encryptedBytes.byteOffset + encryptedBytes.byteLength,
    ) as ArrayBuffer,
  )

  // Create object URL.
  const blob = new Blob([decryptedBuffer], { type: mimeType })
  const url = URL.createObjectURL(blob)

  // Evict oldest if at capacity.
  if (cache.size >= MAX_MEDIA_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      const oldUrl = cache.get(firstKey)
      if (oldUrl) URL.revokeObjectURL(oldUrl)
      cache.delete(firstKey)
    }
  }

  cache.set(mediaId, url)
  return url
}

/**
 * Revoke and remove a specific media URL from the cache.
 */
export function revokeMediaUrl(mediaId: number): void {
  const url = cache.get(mediaId)
  if (url) {
    URL.revokeObjectURL(url)
    cache.delete(mediaId)
  }
}

/**
 * Clear the entire media cache, revoking all object URLs.
 *
 * MUST be called when the vault locks.
 */
export function clearMediaCache(): void {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url)
  }
  cache.clear()
}

/**
 * Get the current media cache size (for diagnostics).
 */
export function getMediaCacheSize(): number {
  return cache.size
}
