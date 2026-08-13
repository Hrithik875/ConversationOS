/**
 * SelfParticipantModal.tsx — Prompt user to identify themselves in a chat.
 *
 * Shown the first time a chat is opened (when selfParticipant is not set).
 * Presents participantHints as selectable options.
 * Also accessible from the chat header to change the selection.
 */

import { useState } from 'react'
import { db } from '@/lib/db'
import type { Chat } from '@/types/import'

interface SelfParticipantModalProps {
  chat: Chat
  onSelect: (participant: string) => void
  onClose: () => void
}

export function SelfParticipantModal({ chat, onSelect, onClose }: SelfParticipantModalProps) {
  const [selected, setSelected] = useState<string | null>(chat.selfParticipant ?? null)

  const handleConfirm = async () => {
    if (!selected || chat.id === undefined) return
    await db.chats.update(chat.id, { selfParticipant: selected })
    onSelect(selected)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground">Which participant are you?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This determines message alignment — your messages will appear on the right.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {chat.participantHints.map((name) => (
            <button
              key={name}
              onClick={() => setSelected(name)}
              className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                selected === name
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
