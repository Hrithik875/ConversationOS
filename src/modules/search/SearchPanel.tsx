/**
 * SearchPanel.tsx — Full-text + semantic search interface.
 *
 * A full-screen overlay panel (slide-in from top) containing:
 * - A search input with mode toggle (Keyword / Semantic / Both)
 * - Results list with snippets, sender, timestamp, chat title
 * - Semantic indexing progress indicator when not yet complete
 * - Click navigates to the correct message in its chat
 *
 * Keyboard: Escape closes the panel, Cmd/Ctrl+K opens it.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useVaultStore } from '@/stores/vaultStore'
import { useSearchStore } from '@/stores/searchStore'
import { searchFulltext, isFulltextReady } from '@/lib/search/fulltextIndex'
import { searchSemantic } from '@/lib/search/semanticIndex'
import type { SearchResult, SearchMode } from '@/types/search'

interface SearchPanelProps {
  /** Called when user clicks a result — navigates to that chat + message. */
  onNavigate: (chatId: number, messageId: number) => void
}

export function SearchPanel({ onNavigate }: SearchPanelProps) {
  const isOpen = useSearchStore((s) => s.isSearchOpen)
  const closeSearch = useSearchStore((s) => s.closeSearch)
  const fulltextStatus = useSearchStore((s) => s.fulltextStatus)
  const embeddingStatus = useSearchStore((s) => s.embeddingStatus)
  const embeddingDone = useSearchStore((s) => s.embeddingDone)
  const embeddingTotal = useSearchStore((s) => s.embeddingTotal)
  const modelProgress = useSearchStore((s) => s.modelProgress)
  const derivedKey = useVaultStore((s) => s.derivedKey)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when panel opens; reset state when panel closes.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Use microtask to avoid synchronous setState in effect body.
      Promise.resolve().then(() => {
        setQuery('')
        setResults([])
      })
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch()
    }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeSearch])

  const runSearch = useCallback(
    async (q: string, m: SearchMode) => {
      if (!q.trim() || !derivedKey) {
        setResults([])
        return
      }

      setIsSearching(true)
      try {
        const kwResults: SearchResult[] = []
        const semResults: SearchResult[] = []

        if ((m === 'keyword' || m === 'both') && isFulltextReady()) {
          const r = await searchFulltext(q)
          kwResults.push(...r)
        }

        if ((m === 'semantic' || m === 'both') && embeddingStatus === 'ready') {
          const r = await searchSemantic(q, 20, derivedKey)
          semResults.push(...r)
        }

        if (m === 'both') {
          // Interleave: keyword first, then semantic (deduped by messageId)
          const seen = new Set<number>()
          const combined: SearchResult[] = []
          for (const r of [...kwResults, ...semResults]) {
            if (!seen.has(r.messageId)) {
              seen.add(r.messageId)
              combined.push(r)
            }
          }
          setResults(combined.slice(0, 50))
        } else if (m === 'keyword') {
          setResults(kwResults.slice(0, 50))
        } else {
          setResults(semResults.slice(0, 50))
        }
      } catch (err) {
        console.error('[SearchPanel] Search error:', err)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [derivedKey, embeddingStatus],
  )

  // Debounced search on query/mode change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(query, mode)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, mode, runSearch])

  const handleResultClick = (result: SearchResult) => {
    closeSearch()
    onNavigate(result.chatId, result.messageId)
  }

  const embeddingPct = embeddingTotal > 0 ? Math.round((embeddingDone / embeddingTotal) * 100) : 0

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={closeSearch}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed left-1/2 top-[10vh] z-50 w-full max-w-2xl -translate-x-1/2 rounded-xl border border-border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {isSearching ? (
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <svg
              className="h-4 w-4 shrink-0 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
          <input
            ref={inputRef}
            id="search-input"
            type="text"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={closeSearch}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border hover:bg-muted"
          >
            Esc
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 border-b border-border px-4 py-2">
          {(['keyword', 'semantic', 'both'] as SearchMode[]).map((m) => (
            <button
              key={m}
              id={`search-mode-${m}`}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}

          {/* Fulltext status */}
          {fulltextStatus === 'building' && (
            <span className="ml-2 text-[10px] text-muted-foreground">Building keyword index…</span>
          )}

          {/* Semantic progress */}
          {(mode === 'semantic' || mode === 'both') && embeddingStatus !== 'ready' && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {embeddingStatus === 'loading-model'
                ? `Loading AI model… ${Math.round(modelProgress)}%`
                : embeddingStatus === 'indexing'
                  ? `Semantic indexing: ${embeddingPct}% (${embeddingDone.toLocaleString()}/${embeddingTotal.toLocaleString()})`
                  : embeddingStatus === 'idle'
                    ? 'Semantic index not started'
                    : 'Semantic index error'}
            </span>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && query.trim() && !isSearching && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type to search across all imported chats
            </div>
          )}

          {/* Keyword section */}
          {mode === 'both' && results.some((r) => r.source === 'keyword') && (
            <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Keyword matches
            </div>
          )}
          {mode === 'both' &&
            results
              .filter((r) => r.source === 'keyword')
              .map((result) => (
                <ResultRow
                  key={`kw-${result.messageId}`}
                  result={result}
                  onClick={handleResultClick}
                />
              ))}

          {/* Semantic section */}
          {mode === 'both' && results.some((r) => r.source === 'semantic') && (
            <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Semantic matches
            </div>
          )}
          {mode === 'both' &&
            results
              .filter((r) => r.source === 'semantic')
              .map((result) => (
                <ResultRow
                  key={`sem-${result.messageId}`}
                  result={result}
                  onClick={handleResultClick}
                />
              ))}

          {/* Single-mode results */}
          {mode !== 'both' &&
            results.map((result) => (
              <ResultRow
                key={`${result.source}-${result.messageId}`}
                result={result}
                onClick={handleResultClick}
              />
            ))}
        </div>

        {results.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Result row sub-component
// ---------------------------------------------------------------------------

interface ResultRowProps {
  result: SearchResult
  onClick: (result: SearchResult) => void
}

function ResultRow({ result, onClick }: ResultRowProps) {
  return (
    <button
      id={`search-result-${result.messageId}`}
      onClick={() => onClick(result)}
      className="flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 last:border-0"
    >
      {/* Top row: chat title + timestamp */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-semibold text-primary">{result.chatTitle}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatTimestamp(result.timestamp)}
        </span>
      </div>

      {/* Sender */}
      {result.senderRaw && (
        <span className="text-[10px] font-medium text-muted-foreground">{result.senderRaw}</span>
      )}

      {/* Snippet with highlights */}
      <HighlightedSnippet snippet={result.snippet} highlights={result.highlights} />

      {/* Source badge */}
      <span
        className={`mt-0.5 self-start rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
          result.source === 'keyword'
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
        }`}
      >
        {result.source === 'keyword' ? '🔍 keyword' : '✨ semantic'}
      </span>
    </button>
  )
}

interface HighlightedSnippetProps {
  snippet: string
  highlights: [number, number][]
}

function HighlightedSnippet({ snippet, highlights }: HighlightedSnippetProps) {
  if (highlights.length === 0) {
    return <p className="truncate text-xs text-foreground/80">{snippet}</p>
  }

  const parts: { text: string; highlight: boolean }[] = []
  let cursor = 0

  for (const [start, end] of highlights) {
    if (start > cursor) parts.push({ text: snippet.slice(cursor, start), highlight: false })
    parts.push({ text: snippet.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), highlight: false })

  return (
    <p className="text-xs text-foreground/80 line-clamp-2">
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="rounded-sm bg-yellow-300/60 px-0.5 dark:bg-yellow-500/40">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  )
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}
