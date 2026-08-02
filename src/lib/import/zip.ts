/**
 * zip.ts — Zip extraction and file classification for WhatsApp exports.
 *
 * Extracts a WhatsApp chat export .zip file and classifies its contents:
 * - Identifies the transcript .txt file
 * - Buckets all other files as media candidates by extension
 *
 * Uses `fflate` for fast, dependency-light zip decompression.
 * This module is pure and does not depend on any UI or storage concerns.
 */

import { unzipSync } from 'fflate'

/** Result of extracting a WhatsApp export zip. */
export interface ZipExtractionResult {
  /** The transcript text content (decoded from the .txt file). */
  transcript: string
  /** Map of filename → raw file bytes for all non-transcript files. */
  mediaFiles: Map<string, Uint8Array>
  /** The original filename of the transcript .txt file found in the zip. */
  transcriptFilename: string
}

/** Known media file extensions (case-insensitive matching). */
const MEDIA_EXTENSIONS = new Set([
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  // Video
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.3gp',
  '.webm',
  // Audio
  '.mp3',
  '.ogg',
  '.opus',
  '.m4a',
  '.aac',
  '.wav',
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  // Contacts
  '.vcf',
  // Other
  '.apk',
  '.zip',
])

/**
 * Extract a WhatsApp export zip file.
 *
 * @param buffer - Raw bytes of the .zip file.
 * @returns Extracted transcript text and media files map.
 * @throws Error if the zip is corrupt, missing a transcript, or otherwise malformed.
 */
export function extractZip(buffer: ArrayBuffer): ZipExtractionResult {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer))
  } catch (err) {
    throw new Error(
      `Failed to extract zip file. The file may be corrupt or not a valid zip archive. (${String(err)})`,
      { cause: err },
    )
  }

  const filenames = Object.keys(entries)
  if (filenames.length === 0) {
    throw new Error('The zip archive is empty — no files found inside.')
  }

  // Find the transcript .txt file.
  // WhatsApp exports typically name it "WhatsApp Chat with <Name>.txt"
  // but we don't assume a specific naming convention — just look for .txt files.
  const txtFiles = filenames.filter((name) => {
    const lower = name.toLowerCase()
    return lower.endsWith('.txt') && !lower.startsWith('__macosx') && !lower.startsWith('.')
  })

  if (txtFiles.length === 0) {
    throw new Error(
      'No .txt transcript file found in the zip archive. This does not appear to be a WhatsApp chat export.',
    )
  }

  // If multiple .txt files, pick the largest one (most likely the transcript).
  let transcriptFilename = txtFiles[0]
  if (txtFiles.length > 1) {
    transcriptFilename = txtFiles.reduce((a, b) => (entries[a].length > entries[b].length ? a : b))
  }

  // Decode the transcript as UTF-8.
  const decoder = new TextDecoder('utf-8')
  const transcript = decoder.decode(entries[transcriptFilename])

  if (transcript.trim().length === 0) {
    throw new Error('The transcript file is empty.')
  }

  // Collect all other files as media candidates.
  const mediaFiles = new Map<string, Uint8Array>()
  for (const filename of filenames) {
    if (filename === transcriptFilename) continue
    // Skip macOS resource fork files and hidden files.
    if (filename.startsWith('__MACOSX') || filename.startsWith('.')) continue
    // Skip directories (zero-length entries with trailing slash).
    if (filename.endsWith('/') && entries[filename].length === 0) continue

    mediaFiles.set(filename, entries[filename])
  }

  return {
    transcript,
    mediaFiles,
    transcriptFilename,
  }
}

/**
 * Get the file extension (lowercase, including the dot) from a filename.
 * Returns empty string if no extension found.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) return ''
  return filename.slice(lastDot).toLowerCase()
}

/**
 * Infer MIME type from a file extension.
 * Returns 'application/octet-stream' for unknown extensions.
 */
export function inferMimeType(filename: string): string {
  const ext = getFileExtension(filename)
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.3gp': 'video/3gpp',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.vcf': 'text/vcard',
    '.apk': 'application/vnd.android.package-archive',
    '.zip': 'application/zip',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

/**
 * Check if a filename has a known media extension.
 */
export function isKnownMediaExtension(filename: string): boolean {
  return MEDIA_EXTENSIONS.has(getFileExtension(filename))
}
