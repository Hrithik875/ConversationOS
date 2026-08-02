/**
 * media.ts — Media hashing, matching, and encrypted OPFS storage.
 *
 * Handles:
 * 1. SHA-256 hashing of media files for content-addressable dedup.
 * 2. Matching media files from the zip to references in parsed messages.
 * 3. Encrypting media bytes with AES-GCM and writing to OPFS.
 *
 * SECURITY NOTE: Media file bytes are encrypted before being written to OPFS.
 * The raw (unencrypted) bytes only exist transiently in memory during import.
 */

import type { ParsedMessage, MediaEntry } from '@/types/import'
import { inferMimeType } from './zip'

// ---------------------------------------------------------------------------
// SHA-256 hashing
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of file bytes using Web Crypto.
 * Returns hex-encoded hash string.
 */
export async function hashFile(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// AES-GCM encryption for binary data (media files)
// ---------------------------------------------------------------------------

/**
 * Encrypt raw bytes with AES-256-GCM.
 *
 * Unlike the text-based encrypt() in crypto/aes.ts, this operates on
 * raw Uint8Array data and returns raw Uint8Array output (no base64 encoding)
 * to avoid doubling memory usage for large media files.
 *
 * @param data - Raw file bytes to encrypt.
 * @param key - AES-GCM CryptoKey from the vault.
 * @returns Encrypted bytes and IV.
 */
export async function encryptBytes(
  data: Uint8Array,
  key: CryptoKey,
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    },
    key,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  )
  return { encrypted: new Uint8Array(encrypted), iv }
}

// ---------------------------------------------------------------------------
// Base64 helpers (duplicated from crypto/aes.ts to avoid cross-module import
// issues in Web Workers — workers can't use path aliases)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// OPFS storage
// ---------------------------------------------------------------------------

/**
 * Write encrypted media bytes to OPFS.
 *
 * Files are stored under a `media/` directory in OPFS, keyed by their
 * SHA-256 hash. This enables content-addressable dedup across imports.
 *
 * @param hash - SHA-256 hash of the original (unencrypted) file.
 * @param encryptedBytes - AES-GCM encrypted file bytes.
 * @returns The OPFS path where the file was stored.
 */
export async function writeToOpfs(hash: string, encryptedBytes: Uint8Array): Promise<string> {
  const root = await navigator.storage.getDirectory()
  const mediaDir = await root.getDirectoryHandle('media', { create: true })
  const fileHandle = await mediaDir.getFileHandle(hash, { create: true })

  // Use the standard writable stream API (works in main thread and workers).
  const writable = await fileHandle.createWritable()
  await writable.write(encryptedBytes)
  await writable.close()

  return `media/${hash}`
}

// ---------------------------------------------------------------------------
// Media matching and processing
// ---------------------------------------------------------------------------

/** Result of processing a single media file. */
export interface ProcessedMedia {
  entry: MediaEntry
  /** The media DB id will be set after Dexie insert. */
}

/**
 * Process a single media file: hash, encrypt, store in OPFS.
 *
 * @param filename - Original filename from the zip.
 * @param bytes - Raw file bytes.
 * @param key - AES-GCM CryptoKey from the vault.
 * @returns MediaEntry ready for Dexie insertion.
 */
export async function processMediaFile(
  filename: string,
  bytes: Uint8Array,
  key: CryptoKey,
): Promise<MediaEntry> {
  const hash = await hashFile(bytes)
  const { encrypted, iv } = await encryptBytes(bytes, key)
  const opfsPath = await writeToOpfs(hash, encrypted)

  return {
    sha256Hash: hash,
    opfsPath,
    mimeType: inferMimeType(filename),
    originalFilename: filename,
    sizeBytes: bytes.length,
    encryptedIv: bytesToBase64(iv),
    matched: true,
  }
}

/**
 * Match media files from the zip to their references in parsed messages.
 *
 * For each message that references a media file (type === 'media' with a
 * mediaFilename), find the corresponding file in the zip's media map.
 *
 * Returns a map of filename → Uint8Array for files that were successfully
 * matched, and a list of filenames that were referenced but not found.
 *
 * @param messages - Parsed messages from the transcript.
 * @param mediaFiles - Map of filename → bytes from zip extraction.
 * @returns Object with matched files and missing references.
 */
export function matchMediaToMessages(
  messages: ParsedMessage[],
  mediaFiles: Map<string, Uint8Array>,
): {
  matched: Map<string, Uint8Array>
  missing: string[]
  mediaOmittedCount: number
} {
  const matched = new Map<string, Uint8Array>()
  const missing: string[] = []
  let mediaOmittedCount = 0

  // Collect all referenced filenames from messages.
  for (const msg of messages) {
    if (msg.type !== 'media') continue

    if (msg.isMediaOmitted) {
      mediaOmittedCount++
      continue
    }

    if (!msg.mediaFilename) continue

    // Try exact match first.
    if (mediaFiles.has(msg.mediaFilename)) {
      matched.set(msg.mediaFilename, mediaFiles.get(msg.mediaFilename)!)
      continue
    }

    // Try case-insensitive match.
    const lowerName = msg.mediaFilename.toLowerCase()
    let found = false
    for (const [zipName, bytes] of mediaFiles) {
      if (zipName.toLowerCase() === lowerName) {
        matched.set(msg.mediaFilename, bytes)
        found = true
        break
      }
    }

    if (!found) {
      missing.push(msg.mediaFilename)
    }
  }

  return { matched, missing, mediaOmittedCount }
}

/**
 * Create a placeholder MediaEntry for a referenced file that was NOT
 * found in the zip archive. This ensures the reference is tracked
 * (with matched: false) rather than silently dropped.
 */
export function createMissingMediaEntry(filename: string): MediaEntry {
  return {
    sha256Hash: '',
    opfsPath: '',
    mimeType: inferMimeType(filename),
    originalFilename: filename,
    sizeBytes: 0,
    encryptedIv: '',
    matched: false,
  }
}
