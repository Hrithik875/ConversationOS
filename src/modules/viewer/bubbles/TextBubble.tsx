/**
 * TextBubble.tsx — Renders a text message bubble.
 *
 * Features:
 * - Sender name (colorized by hash) + timestamp
 * - Linkified URLs
 * - Preserved line breaks
 * - Left/right alignment based on selfParticipant
 */

import { useMemo } from 'react'

interface TextBubbleProps {
  content: string
  senderRaw: string | null
  timestamp: string
  isSelf: boolean
}

export function TextBubble({ content, senderRaw, timestamp, isSelf }: TextBubbleProps) {
  const formattedTime = useMemo(() => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [timestamp])

  const senderColor = useMemo(() => {
    if (!senderRaw) return undefined
    return getSenderColor(senderRaw)
  }, [senderRaw])

  const linkified = useMemo(() => linkifyText(content), [content])

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
          isSelf
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {senderRaw && !isSelf && (
          <p className="mb-0.5 text-xs font-semibold" style={{ color: senderColor }}>
            {senderRaw}
          </p>
        )}
        <p
          className="whitespace-pre-wrap break-words text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: linkified }}
        />
        <p
          className={`mt-1 text-right text-[10px] ${
            isSelf ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          {formattedTime}
        </p>
      </div>
    </div>
  )
}

/** Generate a stable HSL color from a sender name. */
function getSenderColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

/** Turn URLs in text into clickable links. */
function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<>]+)/gi
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline break-all">$1</a>')
}
