/**
 * DeletedBubble.tsx — Renders a deleted message indicator.
 *
 * Italic, muted styling with a "deleted" visual cue.
 * Aligned left/right based on sender identity.
 */

import { useMemo } from 'react'

interface DeletedBubbleProps {
  content: string
  timestamp: string
  isSelf: boolean
}

export function DeletedBubble({ content, timestamp, isSelf }: DeletedBubbleProps) {
  const formattedTime = useMemo(() => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [timestamp])

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl border border-dashed px-3.5 py-2 ${
          isSelf
            ? 'rounded-br-md border-primary/30 bg-primary/5'
            : 'rounded-bl-md border-border bg-muted/30'
        }`}
      >
        <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          {content}
        </p>
        <p
          className="mt-1 text-right text-[10px] text-muted-foreground/60"
        >
          {formattedTime}
        </p>
      </div>
    </div>
  )
}
