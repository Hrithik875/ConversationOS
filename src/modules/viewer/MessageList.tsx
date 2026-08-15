/**
 * MessageList.tsx — Virtualized, paginated, date-grouped message list.
 *
 * Features:
 * - Fetches messages from Dexie in batches by sortIndex
 * - Renders via @tanstack/react-virtual for DOM efficiency
 * - Lazy decryption via decryptionCache as messages enter viewport
 * - Day grouping with date separator rows
 * - Scroll-to-bottom on initial load
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { db } from '@/lib/db'
import { useVaultStore } from '@/stores/vaultStore'
import { getCachedDecryption, isCached } from '@/lib/viewer/decryptionCache'
import { TextBubble } from './bubbles/TextBubble'
import { SystemBubble } from './bubbles/SystemBubble'
import { DeletedBubble } from './bubbles/DeletedBubble'
import { MediaBubble } from './bubbles/MediaBubble'
import { ImageLightbox } from './ImageLightbox'
import type { Message } from '@/types/import'

/** Sentinel value stored in decryptedMap when decryption fails for a message. */
const DECRYPT_FAILED = '\x00DECRYPT_FAILED\x00'

interface MessageListProps {
  chatId: number
  selfParticipant: string | null
  /** When set, the virtualizer scrolls to this message ID and briefly highlights it. */
  scrollToMessageId?: number | null
  /** Called after scroll-to has been performed (so parent can clear the prop). */
  onScrollToComplete?: () => void
}

/** A row in the virtual list — either a date separator or a message. */
type ListRow =
  { kind: 'date'; label: string } | { kind: 'message'; message: Message; decrypted: string | null }

export function MessageList({
  chatId,
  selfParticipant,
  scrollToMessageId,
  onScrollToComplete,
}: MessageListProps) {
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const parentRef = useRef<HTMLDivElement>(null)
  const [decryptedMap, setDecryptedMap] = useState<Map<number, string>>(new Map())
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null)

  // Load all messages for this chat (sorted by sortIndex)
  useEffect(() => {
    setLoading(true)
    setDecryptedMap(new Map())
    db.messages
      .where('chatId')
      .equals(chatId)
      .sortBy('sortIndex')
      .then((msgs) => {
        setAllMessages(msgs)
        setLoading(false)
      })
  }, [chatId])

  // Build rows with date separators
  const rows: ListRow[] = useMemo(() => {
    const result: ListRow[] = []
    let lastDateStr = ''

    for (const msg of allMessages) {
      const dateStr = formatDateGroup(msg.timestamp)
      if (dateStr !== lastDateStr) {
        result.push({ kind: 'date', label: dateStr })
        lastDateStr = dateStr
      }
      result.push({
        kind: 'message',
        message: msg,
        decrypted: msg.id !== undefined ? (decryptedMap.get(msg.id) ?? null) : null,
      })
    }
    return result
  }, [allMessages, decryptedMap])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is safe here; virtualizer state is local.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (row.kind === 'date') return 36
      return 72 // Reasonable estimate for message bubbles
    },
    overscan: 15,
  })

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && rows.length > 0) {
      // Small delay to let virtualizer set up
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
      })
    }
  }, [loading, rows.length, virtualizer])

  // Scroll to a specific message when requested (from search navigation).
  useEffect(() => {
    if (!scrollToMessageId || loading || rows.length === 0) return
    const rowIndex = rows.findIndex(
      (r) => r.kind === 'message' && r.message.id === scrollToMessageId,
    )
    if (rowIndex === -1) return
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(rowIndex, { align: 'center' })
      setHighlightedMessageId(scrollToMessageId)
      // Remove highlight after 2 seconds.
      setTimeout(() => setHighlightedMessageId(null), 2000)
      onScrollToComplete?.()
    })
    // onScrollToComplete intentionally excluded — it's a stable callback ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, loading, rows, virtualizer])

  // Decrypt visible messages lazily.
  //
  // ROOT CAUSE FIX (Phase 3 Bugfix): The original implementation captured
  // `decryptedMap` in the useCallback dependency array. This meant the callback
  // (and its triggering useEffect) only re-ran after a decrypt batch completed —
  // never when the scroll position changed. When the user scrolled, TanStack
  // Virtual updated its internal visible-items set but nothing in the React
  // dependency chain observed that change, so newly visible messages were never
  // decrypted.
  //
  // Fix: Remove `decryptedMap` from the callback's deps and instead use
  // `isCached()` (which reads from the module-level singleton Map, always
  // current) to guard already-decrypted messages. This makes the callback
  // stable across decryption batches. A native `scroll` event listener on the
  // container (below) is the actual scroll trigger, so decryption fires for
  // every viewport shift regardless of whether `decryptedMap` has changed.
  const decryptVisibleMessages = useCallback(async () => {
    if (!derivedKey) return

    const virtualItems = virtualizer.getVirtualItems()
    const newDecryptions = new Map<number, string>()
    let hasNew = false

    for (const item of virtualItems) {
      const row = rows[item.index]
      if (row.kind !== 'message') continue

      const msg = row.message
      if (msg.id === undefined) continue
      // Use the module-level cache singleton to check, NOT the React state
      // variable — avoids capturing a stale closure over `decryptedMap`.
      if (isCached(msg.id)) continue

      try {
        const plaintext = await getCachedDecryption(
          msg.id,
          msg.encryptedContent,
          msg.iv,
          derivedKey,
        )
        newDecryptions.set(msg.id, plaintext)
        hasNew = true
      } catch (err) {
        console.error(`[MessageList] Decryption failed for message id=${msg.id}:`, err)
        newDecryptions.set(msg.id, DECRYPT_FAILED)
        hasNew = true
      }
    }

    if (hasNew) {
      setDecryptedMap((prev) => {
        const next = new Map(prev)
        for (const [k, v] of newDecryptions) {
          next.set(k, v)
        }
        return next
      })
    }
    // `decryptedMap` intentionally omitted — see comment above.
  }, [derivedKey, virtualizer, rows])

  // Trigger decryption on mount/chat change (catches initial viewport).
  useEffect(() => {
    decryptVisibleMessages()
  }, [decryptVisibleMessages])

  // Trigger decryption on every scroll event so newly visible messages are
  // decrypted as the user scrolls in either direction.
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const handleScroll = () => {
      decryptVisibleMessages()
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
    }
  }, [decryptVisibleMessages])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (allMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages in this chat.</p>
      </div>
    )
  }

  return (
    <>
      <div ref={parentRef} className="flex-1 overflow-y-auto px-3 py-2">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index]

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {row.kind === 'date' ? (
                  <DateSeparator label={row.label} />
                ) : (
                  <MessageRow
                    message={row.message}
                    decrypted={row.decrypted}
                    selfParticipant={selfParticipant}
                    onImageClick={setLightboxUrl}
                    isHighlighted={row.message.id === highlightedMessageId}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  )
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-3">
      <div className="rounded-full bg-muted px-3 py-1">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

interface MessageRowProps {
  message: Message
  decrypted: string | null
  selfParticipant: string | null
  onImageClick: (url: string) => void
  /** Briefly highlight this row when navigated to from a search result. */
  isHighlighted?: boolean
}

function MessageRow({
  message,
  decrypted,
  selfParticipant,
  onImageClick,
  isHighlighted,
}: MessageRowProps) {
  const isSelf = selfParticipant !== null && message.senderRaw === selfParticipant

  // Distinguish loading (null → '...') from a genuine decryption failure
  // (DECRYPT_FAILED sentinel → visible error label).
  const isDecryptFailed = decrypted === DECRYPT_FAILED
  const content = isDecryptFailed ? '⚠ Failed to decrypt' : (decrypted ?? '...')

  // Highlight ring when navigated to from a search result.
  const highlightClass = isHighlighted
    ? 'rounded-lg ring-2 ring-amber-400/70 ring-offset-1 transition-all duration-300'
    : ''

  if (message.type === 'system') {
    return (
      <div className={highlightClass}>
        <SystemBubble content={content} />
      </div>
    )
  }

  if (message.type === 'deleted') {
    return (
      <div className={`py-0.5 ${highlightClass}`}>
        <DeletedBubble content={content} timestamp={message.timestamp} isSelf={isSelf} />
      </div>
    )
  }

  if (message.type === 'media') {
    return (
      <div className={`py-0.5 ${highlightClass}`}>
        <MediaBubble
          content={content}
          senderRaw={message.senderRaw}
          timestamp={message.timestamp}
          isSelf={isSelf}
          mediaRef={message.mediaRef}
          onImageClick={onImageClick}
        />
      </div>
    )
  }

  // text
  return (
    <div className={`py-0.5 ${highlightClass}`}>
      <TextBubble
        content={content}
        senderRaw={message.senderRaw}
        timestamp={message.timestamp}
        isSelf={isSelf}
      />
    </div>
  )
}

function formatDateGroup(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}
