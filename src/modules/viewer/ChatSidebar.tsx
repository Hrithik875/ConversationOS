/**
 * ChatSidebar.tsx — List of imported chats with lazy-decrypted previews.
 *
 * Queries the chats table and displays each chat with:
 * - Title, participant names, message count
 * - Last-message preview (decrypted on demand)
 * - Click to navigate to the chat viewer
 *
 * Empty state directs user to the import flow.
 */

import { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/db'
import { useVaultStore } from '@/stores/vaultStore'
import { useViewerStore } from '@/stores/viewerStore'
import { useImportStore } from '@/stores/importStore'
import { getCachedDecryption } from '@/lib/viewer/decryptionCache'
import type { Chat, Message } from '@/types/import'

interface ChatWithPreview extends Chat {
  lastMessagePreview: string | null
  lastMessageTime: string | null
}

export function ChatSidebar() {
  const [chats, setChats] = useState<ChatWithPreview[] | null>(null)
  const activeChatId = useViewerStore((s) => s.activeChatId)
  const selectChat = useViewerStore((s) => s.selectChat)
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const importStatus = useImportStore((s) => s.status)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false

    const load = async () => {
      const allChats = await db.chats.toArray()
      if (abortRef.current) return

      const chatsWithPreviews: ChatWithPreview[] = await Promise.all(
        allChats.map(async (chat) => {
          let lastMessagePreview: string | null = null
          let lastMessageTime: string | null = null

          if (derivedKey && chat.id !== undefined) {
            const lastMsg = await db.messages
              .where('chatId')
              .equals(chat.id)
              .reverse()
              .sortBy('sortIndex')
              .then((msgs: Message[]) => msgs[0])

            if (lastMsg && lastMsg.id !== undefined) {
              try {
                const decrypted = await getCachedDecryption(
                  lastMsg.id,
                  lastMsg.encryptedContent,
                  lastMsg.iv,
                  derivedKey,
                )
                lastMessagePreview =
                  decrypted.length > 80 ? decrypted.slice(0, 80) + '…' : decrypted
                lastMessageTime = lastMsg.timestamp
              } catch {
                lastMessagePreview = '[Unable to decrypt]'
              }
            }
          }

          return { ...chat, lastMessagePreview, lastMessageTime }
        }),
      )

      if (!abortRef.current) {
        setChats(chatsWithPreviews)
      }
    }

    load()
    return () => {
      abortRef.current = true
    }
  }, [derivedKey, importStatus])

  if (chats === null) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading chats…</p>
      </div>
    )
  }

  if (chats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <span className="text-xl">💬</span>
        </div>
        <p className="text-sm font-medium text-foreground">No chats imported</p>
        <p className="text-xs text-muted-foreground">
          Import a WhatsApp chat export to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Chats</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => chat.id !== undefined && selectChat(chat.id)}
            className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
              activeChatId === chat.id ? 'bg-muted' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">{chat.title}</span>
              {chat.lastMessageTime && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatTimeShort(chat.lastMessageTime)}
                </span>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {chat.participantHints.join(', ')}
            </span>
            {chat.lastMessagePreview && (
              <span className="truncate text-xs text-muted-foreground/70">
                {chat.lastMessagePreview}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {chat.messageCount.toLocaleString()} messages
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTimeShort(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
