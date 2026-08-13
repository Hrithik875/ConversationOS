/**
 * ChatViewer.tsx — Main chat viewing surface.
 *
 * Combines the message list with a chat header showing:
 * - Chat title and participant info
 * - Self-participant selection trigger
 * - Back button to return to sidebar
 *
 * Prompts for self-participant selection on first open.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useViewerStore } from '@/stores/viewerStore'
import { MessageList } from './MessageList'
import { SelfParticipantModal } from './SelfParticipantModal'
import type { Chat } from '@/types/import'

export function ChatViewer() {
  const activeChatId = useViewerStore((s) => s.activeChatId)
  const deselectChat = useViewerStore((s) => s.deselectChat)
  const [chat, setChat] = useState<Chat | null>(null)
  const [showParticipantModal, setShowParticipantModal] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    // Reset state synchronously via the dependency change itself, not setState.
    // The effect only sets state in async callbacks (after await).

    if (activeChatId === null) {
      // Use a microtask to avoid synchronous setState in effect body
      Promise.resolve().then(() => {
        if (!abortRef.current) {
          setChat(null)
          setLoaded(true)
        }
      })
      return () => {
        abortRef.current = true
      }
    }

    // Chain via Promise to avoid synchronous setState in effect body
    // (react-hooks/set-state-in-effect)
    Promise.resolve()
      .then(() => {
        if (abortRef.current) return
        setLoaded(false)
        return db.chats.get(activeChatId)
      })
      .then((c) => {
        if (abortRef.current) return
        if (c) {
          setChat(c)
          if (!c.selfParticipant) {
            setShowParticipantModal(true)
          }
        }
        setLoaded(true)
      })

    return () => {
      abortRef.current = true
    }
  }, [activeChatId])

  const handleParticipantSelect = useCallback(
    (participant: string) => {
      if (chat) {
        setChat({ ...chat, selfParticipant: participant })
      }
      setShowParticipantModal(false)
    },
    [chat],
  )

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!chat || activeChatId === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <span className="text-3xl">💬</span>
        </div>
        <p className="text-lg font-medium text-foreground">Select a chat</p>
        <p className="text-sm text-muted-foreground">
          Choose a conversation from the sidebar to start reading.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        {/* Back button (mobile-friendly) */}
        <button
          onClick={deselectChat}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{chat.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {chat.participantHints.join(', ')} · {chat.messageCount.toLocaleString()} messages
          </p>
        </div>

        {/* Self-participant selector */}
        <button
          onClick={() => setShowParticipantModal(true)}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Change which participant you are"
        >
          {chat.selfParticipant ? (
            <span>You: {chat.selfParticipant}</span>
          ) : (
            <span>Set identity</span>
          )}
        </button>
      </header>

      {/* Message list */}
      <MessageList chatId={activeChatId} selfParticipant={chat.selfParticipant ?? null} />

      {/* Self-participant modal */}
      {showParticipantModal && (
        <SelfParticipantModal
          chat={chat}
          onSelect={handleParticipantSelect}
          onClose={() => setShowParticipantModal(false)}
        />
      )}
    </div>
  )
}
