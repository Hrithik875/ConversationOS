/**
 * import.worker.ts — Web Worker for the import pipeline.
 *
 * Runs the entire import flow off the main thread:
 *   1. Extract zip file
 *   2. Parse transcript
 *   3. Match media to messages
 *   4. Encrypt message content
 *   5. Encrypt and store media in OPFS
 *   6. Write everything to Dexie
 *
 * Communicates with the main thread via postMessage:
 *   Main → Worker: { type: 'start', zipBuffer, sourceFileName }
 *   Main → Worker: { type: 'setKey', key } (transfers CryptoKey)
 *   Worker → Main: { type: 'progress', phase, current, total }
 *   Worker → Main: { type: 'complete', importId, stats }
 *   Worker → Main: { type: 'error', message }
 *   Worker → Main: { type: 'needKey' }
 */

import Dexie from 'dexie'
import { extractZip } from '../lib/import/zip'
import { parseTranscript, extractParticipants } from '../lib/import/parser'
import {
  matchMediaToMessages,
  processMediaFile,
  createMissingMediaEntry,
} from '../lib/import/media'
import type { ImportStats, Chat, Message, MediaEntry, ImportRecord } from '../types/import'

// ---------------------------------------------------------------------------
// Database setup (workers can't use path aliases, so we inline the schema)
// ---------------------------------------------------------------------------

class WorkerDB extends Dexie {
  chats!: Dexie.Table
  messages!: Dexie.Table
  media!: Dexie.Table
  imports!: Dexie.Table

  constructor() {
    super('ConversationOSDatabase')

    // Must match the schema in src/lib/db.ts v5.
    this.version(5).stores({
      vaultMeta: '++id',
      settings: 'key',
      _devTestCiphertext: '++id',
      chats: '++id, importId',
      messages: '++id, chatId, timestamp, type, sortIndex',
      media: '++id, sha256Hash, originalFilename',
      imports: '++id, timestamp',
    })
  }
}

const db = new WorkerDB()

// ---------------------------------------------------------------------------
// AES-GCM text encryption (inlined to avoid path alias issues in workers)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function encryptText(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
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

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

let vaultKey: CryptoKey | null = null

self.onmessage = async (e: MessageEvent) => {
  const data = e.data

  if (data.type === 'setKey') {
    vaultKey = data.key
    return
  }

  if (data.type === 'start') {
    try {
      await runImport(data.zipBuffer, data.sourceFileName)
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
  }
}

async function runImport(zipBuffer: ArrayBuffer, sourceFileName: string) {
  if (!vaultKey) {
    self.postMessage({ type: 'needKey' })
    return
  }

  // ── Phase 1: Extract zip ──────────────────────────────────────────
  self.postMessage({ type: 'progress', phase: 'extracting', current: 0, total: 1 })

  let transcript: string
  let mediaFiles: Map<string, Uint8Array>
  try {
    const result = extractZip(zipBuffer)
    transcript = result.transcript
    mediaFiles = result.mediaFiles
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
    return
  }

  self.postMessage({ type: 'progress', phase: 'extracting', current: 1, total: 1 })

  // ── Phase 2: Parse transcript ─────────────────────────────────────
  self.postMessage({ type: 'progress', phase: 'parsing', current: 0, total: 1 })

  const { messages: parsedMessages, format, parseErrors } = parseTranscript(transcript)

  if (parsedMessages.length === 0) {
    self.postMessage({
      type: 'error',
      message:
        'No messages found in the transcript. The file may be empty or in an unrecognized format.',
    })
    return
  }

  const participants = extractParticipants(parsedMessages)

  self.postMessage({ type: 'progress', phase: 'parsing', current: 1, total: 1 })

  // ── Phase 3: Match media ──────────────────────────────────────────
  self.postMessage({ type: 'progress', phase: 'media', current: 0, total: mediaFiles.size })

  const { matched, missing, mediaOmittedCount } = matchMediaToMessages(parsedMessages, mediaFiles)

  // Process matched media files (hash + encrypt + store in OPFS).
  const mediaEntryMap = new Map<string, number>() // filename → media DB id
  let mediaProcessed = 0

  // Also process media files in the zip that weren't referenced in text.
  // These are "extra" files — still worth storing.
  const allMediaToProcess = new Map(matched)
  for (const [filename, bytes] of mediaFiles) {
    if (!allMediaToProcess.has(filename)) {
      allMediaToProcess.set(filename, bytes)
    }
  }

  for (const [filename, bytes] of allMediaToProcess) {
    try {
      const entry = await processMediaFile(filename, bytes, vaultKey)
      const id = await db.media.add(entry as MediaEntry)
      mediaEntryMap.set(filename, id as number)
    } catch (err) {
      // Log but don't fail the entire import for one media file.
      parseErrors.push(`Media processing failed for ${filename}: ${String(err)}`)
    }
    mediaProcessed++
    self.postMessage({
      type: 'progress',
      phase: 'media',
      current: mediaProcessed,
      total: allMediaToProcess.size,
      detail: filename,
    })
  }

  // Insert placeholder entries for missing media references.
  for (const filename of missing) {
    const entry = createMissingMediaEntry(filename)
    const id = await db.media.add(entry as MediaEntry)
    mediaEntryMap.set(filename, id as number)
  }

  // ── Phase 4: Encrypt messages and write to Dexie ──────────────────
  const totalMessages = parsedMessages.length

  // Derive chat title from zip filename.
  const chatTitle = sourceFileName
    .replace(/\.zip$/i, '')
    .replace(/^WhatsApp Chat with /i, '')
    .trim()

  // Create the import record first (status: 'incomplete' until we finish).
  const importRecord: ImportRecord = {
    timestamp: new Date().toISOString(),
    sourceFileName,
    detectedFormat: format.name,
    stats: {
      messageCount: 0,
      mediaMatched: matched.size,
      mediaMissing: missing.length,
      mediaOmitted: mediaOmittedCount,
      systemMessages: 0,
      deletedMessages: 0,
      textMessages: 0,
      parseErrors,
      participants,
    },
    status: 'incomplete',
  }
  const importId = (await db.imports.add(importRecord as ImportRecord)) as number

  // Create the chat record.
  const chatRecord: Chat = {
    title: chatTitle,
    participantHints: participants,
    createdAt: parsedMessages[0]?.timestamp.toISOString() ?? new Date().toISOString(),
    messageCount: totalMessages,
    importId,
  }
  const chatId = (await db.chats.add(chatRecord as Chat)) as number

  // Encrypt and insert messages in batches.
  const BATCH_SIZE = 50
  let messagesInserted = 0
  let systemCount = 0
  let deletedCount = 0
  let textCount = 0

  for (let i = 0; i < totalMessages; i += BATCH_SIZE) {
    const batch = parsedMessages.slice(i, i + BATCH_SIZE)
    const messageRecords: Message[] = []

    for (const msg of batch) {
      const { ciphertext, iv } = await encryptText(msg.content, vaultKey)

      // Count message types.
      if (msg.type === 'system') systemCount++
      else if (msg.type === 'deleted') deletedCount++
      else if (msg.type === 'text') textCount++

      // Resolve media reference.
      let mediaRef: number | null = null
      if (msg.mediaFilename && mediaEntryMap.has(msg.mediaFilename)) {
        mediaRef = mediaEntryMap.get(msg.mediaFilename)!
      }

      messageRecords.push({
        chatId,
        timestamp: msg.timestamp.toISOString(),
        senderRaw: msg.senderRaw,
        type: msg.type,
        encryptedContent: ciphertext,
        iv,
        mediaRef,
        sortIndex: msg.sortIndex,
      })
    }

    await db.messages.bulkAdd(messageRecords)
    messagesInserted += batch.length

    self.postMessage({
      type: 'progress',
      phase: 'encrypting',
      current: messagesInserted,
      total: totalMessages,
    })
  }

  // ── Phase 5: Finalize ─────────────────────────────────────────────
  // Update the import record with final stats and mark as complete.
  await db.imports.update(importId, {
    stats: {
      messageCount: totalMessages,
      mediaMatched: matched.size,
      mediaMissing: missing.length,
      mediaOmitted: mediaOmittedCount,
      systemMessages: systemCount,
      deletedMessages: deletedCount,
      textMessages: textCount,
      parseErrors,
      participants,
    },
    status: 'complete',
  } as Partial<ImportRecord>)

  self.postMessage({
    type: 'progress',
    phase: 'saving',
    current: 1,
    total: 1,
  })

  self.postMessage({
    type: 'complete',
    importId,
    stats: {
      messageCount: totalMessages,
      mediaMatched: matched.size,
      mediaMissing: missing.length,
      mediaOmitted: mediaOmittedCount,
      systemMessages: systemCount,
      deletedMessages: deletedCount,
      textMessages: textCount,
      parseErrors,
      participants,
    } satisfies ImportStats,
  })
}
