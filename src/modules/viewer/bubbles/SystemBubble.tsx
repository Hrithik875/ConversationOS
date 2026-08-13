/**
 * SystemBubble.tsx — Renders a system message (centered pill style).
 *
 * Examples: "Messages and calls are end-to-end encrypted",
 * "Alice added Bob", "Charlie left"
 */

interface SystemBubbleProps {
  content: string
}

export function SystemBubble({ content }: SystemBubbleProps) {
  return (
    <div className="flex justify-center py-1">
      <div className="max-w-[85%] rounded-lg bg-muted/70 px-3 py-1.5 shadow-sm">
        <p className="text-center text-xs text-muted-foreground">{content}</p>
      </div>
    </div>
  )
}
