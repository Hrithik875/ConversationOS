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
import { getCachedDecryption } from '@/lib/viewer/decryptionCache'
import { TextBubble } from './bubbles/TextBubble'
import { SystemBubble } from './bubbles/SystemBubble'
import { DeletedBubble } from './bubbles/DeletedBubble'
import { MediaBubble } from './bubbles/MediaBubble'
import { ImageLightbox } from './ImageLightbox'
import type { Message } from '@/types/import'

interface MessageListProps {
  chatId: number
  selfParticipant: string | null
}

/** A row in the virtual list — either a date separator or a message. */
type ListRow =
  { kind: 'date'; label: string } | { kind: 'message'; message: Message; decrypted: string | null }

export function MessageList({ chatId, selfParticipant }: MessageListProps) {
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const parentRef = useRef<HTMLDivElement>(null)
  const [decryptedMap, setDecryptedMap] = useState<Map<number, string>>(new Map())

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

  // Decrypt visible messages lazily
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
      if (decryptedMap.has(msg.id)) continue

      try {
        const plaintext = await getCachedDecryption(
          msg.id,
          msg.encryptedContent,
          msg.iv,
          derivedKey,
        )
        newDecryptions.set(msg.id, plaintext)
        hasNew = true
      } catch {
        newDecryptions.set(msg.id, '[Decryption failed]')
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
  }, [derivedKey, virtualizer, rows, decryptedMap])

  // Trigger decryption when virtual items change
  useEffect(() => {
    decryptVisibleMessages()
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
}

function MessageRow({ message, decrypted, selfParticipant, onImageClick }: MessageRowProps) {
  const isSelf = selfParticipant !== null && message.senderRaw === selfParticipant
  const content = decrypted ?? '...'

  if (message.type === 'system') {
    return <SystemBubble content={content} />
  }

  if (message.type === 'deleted') {
    return (
      <div className="py-0.5">
        <DeletedBubble content={content} timestamp={message.timestamp} isSelf={isSelf} />
      </div>
    )
  }

  if (message.type === 'media') {
    return (
      <div className="py-0.5">
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
    <div className="py-0.5">
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
