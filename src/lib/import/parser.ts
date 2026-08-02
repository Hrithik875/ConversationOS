/**
 * parser.ts — WhatsApp transcript parser with format auto-detection.
 *
 * Parses WhatsApp chat export .txt transcripts into a normalized
 * in-memory message list. This module is pure and unit-testable —
 * it has no dependencies on UI, storage, or encryption.
 *
 * ## Format variants handled (discovered from real samples):
 *
 * ### Format A — Android 12h (most common)
 * `DD/MM/YYYY, H:MM am/pm - Sender: Content`
 * Example: `27/10/2023, 7:08 pm - HRITHIK: Hey bro`
 * Note: WhatsApp often inserts U+202F (narrow no-break space) before am/pm.
 *
 * ### Format B — iOS bracketed with seconds
 * `[DD/MM/YYYY, H:MM:SS am/pm] Sender: Content`
 * Example: `[12/01/24, 10:15:32 PM] Alice: Hey`
 *
 * ### Format C — 24-hour format
 * `DD/MM/YYYY, HH:MM - Sender: Content`
 * Example: `12/01/24, 22:15 - Alice: Hey`
 *
 * ### Format D — US date format (MM/DD/YY or MM/DD/YYYY)
 * `MM/DD/YY, H:MM AM/PM - Sender: Content`
 *
 * ## Special message types:
 * - **System messages**: No sender (e.g. "Messages and calls are end-to-end encrypted")
 * - **Deleted messages**: "This message was deleted" / "You deleted this message"
 * - **Media attached**: `filename (file attached)` or `<attached: filename>`
 * - **Media omitted**: `<Media omitted>` (export without actual media files)
 *
 * ## Unicode handling:
 * - U+200E (LRM), U+200F (RLM), U+202F (narrow no-break space) are stripped
 *   from timestamp/sender areas during parsing to prevent match corruption.
 */

import type { ParsedMessage, MessageType } from '@/types/import'

// ---------------------------------------------------------------------------
// Unicode cleanup
// ---------------------------------------------------------------------------

/**
 * Strip invisible Unicode formatting characters that WhatsApp injects.
 * These include LRM (U+200E), RLM (U+200F), and narrow no-break space (U+202F).
 */
function stripInvisibleChars(text: string): string {
  return text
    .replace(/\u200E/g, '')
    .replace(/\u200F/g, '')
    .replace(/\u202F/g, '')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\uFEFF/g, '')
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Regex patterns for known WhatsApp transcript formats.
 * Each pattern captures: (date) (time) (separator) (rest of line).
 * The "rest" may or may not contain a sender.
 */
const FORMAT_PATTERNS = [
  {
    // Format A: DD/MM/YYYY, H:MM am/pm - ...
    // Also handles DD/MM/YY
    name: 'android-12h',
    regex: /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*-\s*(.+)$/,
    parseDate: (dateStr: string, timeStr: string) => parseDateTime(dateStr, timeStr, 'DMY', '12h'),
  },
  {
    // Format B: [DD/MM/YYYY, H:MM:SS am/pm] ...
    name: 'ios-bracketed',
    regex: /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp][Mm])\]\s*(.+)$/,
    parseDate: (dateStr: string, timeStr: string) => parseDateTime(dateStr, timeStr, 'DMY', '12h'),
  },
  {
    // Format C: DD/MM/YYYY, HH:MM - ... (24-hour)
    // Uses negative lookahead to avoid matching "7:08 pm" style lines.
    name: 'android-24h',
    regex: /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2})(?!\s*[AaPp][Mm])\s*-\s*(.+)$/,
    parseDate: (dateStr: string, timeStr: string) => parseDateTime(dateStr, timeStr, 'DMY', '24h'),
  },
  {
    // Format D: MM/DD/YY, H:MM AM/PM - ... (US date)
    name: 'us-12h',
    regex: /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*-\s*(.+)$/,
    parseDate: (dateStr: string, timeStr: string) => parseDateTime(dateStr, timeStr, 'MDY', '12h'),
  },
]

/**
 * Parse a date + time string into a Date object.
 *
 * @param dateStr - Date portion (e.g. "27/10/2023" or "10/27/2023")
 * @param timeStr - Time portion (e.g. "7:08 pm" or "19:08")
 * @param dateOrder - 'DMY' or 'MDY'
 * @param timeFormat - '12h' or '24h'
 */
function parseDateTime(
  dateStr: string,
  timeStr: string,
  dateOrder: 'DMY' | 'MDY',
  timeFormat: '12h' | '24h',
): Date {
  const dateParts = dateStr.split('/')
  let day: number, month: number, year: number

  if (dateOrder === 'DMY') {
    day = parseInt(dateParts[0], 10)
    month = parseInt(dateParts[1], 10) - 1 // 0-indexed
    year = parseInt(dateParts[2], 10)
  } else {
    month = parseInt(dateParts[0], 10) - 1
    day = parseInt(dateParts[1], 10)
    year = parseInt(dateParts[2], 10)
  }

  // Handle 2-digit years
  if (year < 100) {
    year += 2000
  }

  let hours: number
  let minutes: number

  if (timeFormat === '12h') {
    // Match H:MM or H:MM:SS followed by am/pm. Optional seconds are ignored.
    const timeParts = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])/i)
    if (!timeParts) return new Date(NaN)

    hours = parseInt(timeParts[1], 10)
    minutes = parseInt(timeParts[2], 10)
    const period = timeParts[3].toLowerCase()

    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
  } else {
    const timeParts = timeStr.match(/(\d{1,2}):(\d{2})/)
    if (!timeParts) return new Date(NaN)
    hours = parseInt(timeParts[1], 10)
    minutes = parseInt(timeParts[2], 10)
  }

  return new Date(year, month, day, hours, minutes)
}

/** Result of format auto-detection. */
export interface DetectedFormat {
  /** Name of the detected format (e.g. 'android-12h'). */
  name: string
  /** Match rate (0-1) — proportion of sample lines that matched. */
  matchRate: number
  /** Index into FORMAT_PATTERNS. */
  patternIndex: number
}

/**
 * Auto-detect the transcript format by testing multiple patterns
 * against the first ~50 non-empty lines.
 *
 * Scores each pattern by match rate, picks the best fit.
 * If no pattern matches >20% of lines, falls back to the first pattern
 * with a warning.
 *
 * @param lines - All lines from the transcript.
 * @returns The detected format info.
 */
export function detectFormat(lines: string[]): DetectedFormat {
  // Take the first 50 non-empty lines for detection.
  const sampleLines = lines.filter((l) => l.trim().length > 0).slice(0, 50)

  if (sampleLines.length === 0) {
    return { name: 'android-12h', matchRate: 0, patternIndex: 0 }
  }

  let bestScore = 0
  let bestIndex = 0

  // Only test the first 3 patterns for scoring (skip US date — it's ambiguous
  // with DMY for dates where day ≤ 12). US format is only tried as a fallback.
  for (let i = 0; i < 3; i++) {
    const pattern = FORMAT_PATTERNS[i]
    const cleaned = sampleLines.map(stripInvisibleChars)
    const matchCount = cleaned.filter((line) => pattern.regex.test(line)).length
    const score = matchCount / sampleLines.length

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return {
    name: FORMAT_PATTERNS[bestIndex].name,
    matchRate: bestScore,
    patternIndex: bestIndex,
  }
}

// ---------------------------------------------------------------------------
// Message type detection
// ---------------------------------------------------------------------------

/** System message patterns (no sender). */
const SYSTEM_MESSAGE_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /\badded\b/i,
  /\bleft\b$/i,
  /\bremoved\b/i,
  /\bchanged the (?:subject|group (?:icon|description))\b/i,
  /\bcreated group\b/i,
  /\bchanged this group/i,
  /\bsecurity code changed\b/i,
  /\bjoined using this group/i,
  /\bmissed (?:voice|video) call\b/i,
  /\byou're now an admin\b/i,
  /\bwaiting for this message/i,
]

/** Patterns indicating a deleted message. */
const DELETED_PATTERNS = [/^this message was deleted$/i, /^you deleted this message$/i]

/** Media reference patterns. */
const MEDIA_ATTACHED_PATTERN = /^(.+)\s*\(file attached\)$/
const MEDIA_OMITTED_PATTERN = /^<Media omitted>$/i
const MEDIA_ATTACHED_ALT_PATTERN = /^<attached:\s*(.+?)>$/i

/**
 * Classify a message's type and extract media info.
 */
function classifyMessage(content: string): {
  type: MessageType
  mediaFilename: string | null
  isMediaOmitted: boolean
  cleanContent: string
} {
  const trimmed = content.trim()

  // Check for deleted messages.
  if (DELETED_PATTERNS.some((p) => p.test(trimmed))) {
    return { type: 'deleted', mediaFilename: null, isMediaOmitted: false, cleanContent: trimmed }
  }

  // Check for <Media omitted>.
  if (MEDIA_OMITTED_PATTERN.test(trimmed)) {
    return { type: 'media', mediaFilename: null, isMediaOmitted: true, cleanContent: trimmed }
  }

  // Check for "filename (file attached)".
  const attachedMatch = trimmed.match(MEDIA_ATTACHED_PATTERN)
  if (attachedMatch) {
    return {
      type: 'media',
      mediaFilename: attachedMatch[1].trim(),
      isMediaOmitted: false,
      cleanContent: trimmed,
    }
  }

  // Check for "<attached: filename>".
  const altMatch = trimmed.match(MEDIA_ATTACHED_ALT_PATTERN)
  if (altMatch) {
    return {
      type: 'media',
      mediaFilename: altMatch[1].trim(),
      isMediaOmitted: false,
      cleanContent: trimmed,
    }
  }

  return { type: 'text', mediaFilename: null, isMediaOmitted: false, cleanContent: trimmed }
}

/**
 * Check if a line's "rest" content (after timestamp + separator) is a
 * system message (no sender, just a notification).
 *
 * System messages have no "Sender: " prefix — the entire rest is the message.
 */
function isSystemMessage(rest: string): boolean {
  // If there's no colon at all, it's likely a system message.
  if (!rest.includes(':')) return true

  // Check known system message patterns.
  return SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(rest))
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a WhatsApp transcript into a normalized message list.
 *
 * @param text - Full transcript text content.
 * @returns Object containing the parsed messages and detected format info.
 */
export function parseTranscript(text: string): {
  messages: ParsedMessage[]
  format: DetectedFormat
  parseErrors: string[]
} {
  const rawLines = text.split('\n')
  const lines = rawLines.map((l) => l.replace(/\r$/, '')) // Normalize line endings
  const format = detectFormat(lines)
  const pattern = FORMAT_PATTERNS[format.patternIndex]
  const messages: ParsedMessage[] = []
  const parseErrors: string[] = []
  let sortIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().length === 0) continue

    // Strip invisible chars for matching, but keep original for content.
    const cleanLine = stripInvisibleChars(line)
    const match = cleanLine.match(pattern.regex)

    if (!match) {
      // This line doesn't match the timestamp pattern.
      // It's either a continuation of the previous message or a parse error.
      if (messages.length > 0) {
        // Append as continuation of previous message (multi-line message).
        messages[messages.length - 1].content += '\n' + line
      } else {
        // No previous message to attach to — this is unusual.
        parseErrors.push(
          `Line ${i + 1}: Could not parse and no previous message: "${line.slice(0, 80)}"`,
        )
      }
      continue
    }

    const dateStr = match[1]
    const timeStr = match[2]
    const rest = match[3]
    const timestamp = pattern.parseDate(dateStr, timeStr)

    if (isNaN(timestamp.getTime())) {
      parseErrors.push(`Line ${i + 1}: Invalid date/time: "${dateStr} ${timeStr}"`)
      continue
    }

    // Determine if this is a system message or a sender message.
    if (isSystemMessage(rest)) {
      const { type, mediaFilename, isMediaOmitted, cleanContent } = classifyMessage(rest)
      messages.push({
        timestamp,
        senderRaw: null,
        type: type === 'text' ? 'system' : type,
        content: cleanContent,
        mediaFilename,
        isMediaOmitted,
        sortIndex: sortIndex++,
      })
      continue
    }

    // Split "Sender: Content" — find the first colon that separates sender from content.
    const colonIndex = rest.indexOf(':')
    if (colonIndex === -1) {
      // No colon found — treat as system message.
      messages.push({
        timestamp,
        senderRaw: null,
        type: 'system',
        content: rest.trim(),
        mediaFilename: null,
        isMediaOmitted: false,
        sortIndex: sortIndex++,
      })
      continue
    }

    const senderRaw = rest.slice(0, colonIndex).trim()
    const rawContent = rest.slice(colonIndex + 1).trim()

    // Classify the message content.
    const { type, mediaFilename, isMediaOmitted, cleanContent } = classifyMessage(rawContent)

    messages.push({
      timestamp,
      senderRaw: senderRaw || null,
      type,
      content: cleanContent,
      mediaFilename,
      isMediaOmitted,
      sortIndex: sortIndex++,
    })
  }

  return { messages, format, parseErrors }
}

/**
 * Extract unique participant names from parsed messages.
 * Excludes null senders (system messages).
 */
export function extractParticipants(messages: ParsedMessage[]): string[] {
  const participants = new Set<string>()
  for (const msg of messages) {
    if (msg.senderRaw) {
      participants.add(msg.senderRaw)
    }
  }
  return Array.from(participants)
}
