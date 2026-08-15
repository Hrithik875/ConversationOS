/**
 * fulltextIndex.worker.ts — Web Worker for MiniSearch full-text indexing.
 *
 * Receives pre-decrypted message content from the main thread, builds a
 * MiniSearch index in-memory, and responds to search queries.
 *
 * SECURITY NOTE: This worker receives plaintext message content. It must
 * never persist anything to storage. The index lives entirely in worker
 * memory and is destroyed when the worker is terminated (on vault lock).
 *
 * Protocol (main → worker):
 *   { type: 'build', messages: IndexableMessage[] }
 *   { type: 'search', query: string, requestId: string }
 *   { type: 'clear' }
 *
 * Protocol (worker → main):
 *   { type: 'progress', indexed: number, total: number }
 *   { type: 'ready' }
 *   { type: 'results', requestId: string, results: SearchResult[] }
 *   { type: 'error', message: string }
 */

import MiniSearch from 'minisearch'
import type { IndexableMessage, SearchResult, FulltextWorkerRequest } from '../types/search'

let index: MiniSearch<IndexableMessage> | null = null

/** Build or rebuild the in-memory MiniSearch index. */
function buildIndex(messages: IndexableMessage[]): void {
  index = new MiniSearch<IndexableMessage>({
    fields: ['content', 'senderRaw'],
    storeFields: ['chatId', 'chatTitle', 'snippet', 'senderRaw', 'timestamp'],
    processTerm: (term) => term.toLowerCase(),
    searchOptions: {
      boost: { content: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  })

  const total = messages.length
  const BATCH = 500

  for (let i = 0; i < total; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    // Map to MiniSearch-compatible objects (id must be numeric).
    const docs = batch.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      chatTitle: m.chatTitle,
      // Store only a short snippet (first 200 chars) to avoid keeping
      // all plaintext in the index's stored fields.
      snippet: m.content.slice(0, 200),
      // Keep full content for search field (not stored, just indexed).
      content: m.content,
      senderRaw: m.senderRaw ?? '',
      timestamp: m.timestamp,
    }))

    index.addAll(docs)
    self.postMessage({ type: 'progress', indexed: Math.min(i + BATCH, total), total })
  }

  self.postMessage({ type: 'ready' })
}

/** Run a search query and return results. */
function runSearch(query: string, requestId: string): void {
  if (!index) {
    self.postMessage({ type: 'results', requestId, results: [] })
    return
  }

  try {
    const raw = index.search(query, { fuzzy: 0.2, prefix: true, boost: { content: 2 } })

    const results: SearchResult[] = raw.slice(0, 50).map((r) => {
      // Build highlight ranges by finding query terms in the snippet.
      const highlights: [number, number][] = []
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
      const snippetLower = (r.snippet as string).toLowerCase()
      for (const term of terms) {
        let idx = 0
        while (idx < snippetLower.length) {
          const pos = snippetLower.indexOf(term, idx)
          if (pos === -1) break
          highlights.push([pos, pos + term.length])
          idx = pos + term.length
        }
      }
      // Merge overlapping ranges.
      highlights.sort((a, b) => a[0] - b[0])
      const merged: [number, number][] = []
      for (const h of highlights) {
        if (merged.length > 0 && h[0] <= merged[merged.length - 1][1]) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], h[1])
        } else {
          merged.push([...h])
        }
      }

      return {
        messageId: r.id as number,
        chatId: r.chatId as number,
        chatTitle: r.chatTitle as string,
        snippet: r.snippet as string,
        senderRaw: (r.senderRaw as string) || null,
        timestamp: r.timestamp as string,
        highlights: merged,
        score: r.score,
        source: 'keyword' as const,
      }
    })

    self.postMessage({ type: 'results', requestId, results })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}

self.onmessage = (e: MessageEvent<FulltextWorkerRequest>) => {
  const msg = e.data

  if (msg.type === 'build') {
    try {
      buildIndex(msg.messages)
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }

  if (msg.type === 'search') {
    runSearch(msg.query, msg.requestId)
    return
  }

  if (msg.type === 'clear') {
    index = null
    return
  }
}
