/**
 * parser.test.ts — Unit tests for the WhatsApp transcript parser.
 *
 * Covers each format variant, edge cases, and real-sample excerpts.
 */

import { describe, it, expect } from 'vitest'
import { parseTranscript, detectFormat, extractParticipants } from './parser'

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
  it('detects android-12h format', () => {
    const lines = [
      '27/10/2023, 7:08 pm - HRITHIK: Hey bro',
      '27/10/2023, 7:08 pm - Goutham Aiml: Hi bro',
      '27/10/2023, 7:09 pm - HRITHIK: How are you?',
    ]
    const result = detectFormat(lines)
    expect(result.name).toBe('android-12h')
    expect(result.matchRate).toBeGreaterThan(0.5)
  })

  it('detects ios-bracketed format', () => {
    const lines = [
      '[12/01/24, 10:15:32 PM] Alice: Hey, how are you?',
      '[12/01/24, 10:16:00 AM] Bob: I am good!',
      '[12/01/24, 10:17:45 PM] Alice: Great to hear',
    ]
    const result = detectFormat(lines)
    expect(result.name).toBe('ios-bracketed')
    expect(result.matchRate).toBeGreaterThan(0.5)
  })

  it('detects android-24h format', () => {
    const lines = [
      '12/01/24, 22:15 - Alice: Hey, how are you?',
      '12/01/24, 22:16 - Bob: I am fine',
      '12/01/24, 22:17 - Alice: Cool',
    ]
    const result = detectFormat(lines)
    expect(result.name).toBe('android-24h')
    expect(result.matchRate).toBeGreaterThan(0.5)
  })

  it('returns a default for empty input', () => {
    const result = detectFormat([])
    expect(result.name).toBe('android-12h')
    expect(result.matchRate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Basic parsing — Format A (android-12h)
// ---------------------------------------------------------------------------

describe('parseTranscript — Format A (android-12h)', () => {
  it('parses basic messages with senders', () => {
    const text = `27/10/2023, 7:08 pm - HRITHIK: Hey bro
27/10/2023, 7:08 pm - Goutham Aiml: Hi bro
27/10/2023, 7:08 pm - Goutham Aiml: How's ur health?`

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(3)
    expect(messages[0].senderRaw).toBe('HRITHIK')
    expect(messages[0].content).toBe('Hey bro')
    expect(messages[0].type).toBe('text')
    expect(messages[1].senderRaw).toBe('Goutham Aiml')
    expect(messages[2].content).toBe("How's ur health?")
  })

  it('parses timestamps correctly', () => {
    const text = '27/10/2023, 7:08 pm - User: Test message'
    const { messages } = parseTranscript(text)
    expect(messages[0].timestamp.getFullYear()).toBe(2023)
    expect(messages[0].timestamp.getMonth()).toBe(9) // October = 9 (0-indexed)
    expect(messages[0].timestamp.getDate()).toBe(27)
    expect(messages[0].timestamp.getHours()).toBe(19) // 7 pm = 19
    expect(messages[0].timestamp.getMinutes()).toBe(8)
  })

  it('handles 2-digit years', () => {
    const text = '27/10/23, 7:08 pm - User: Short year'
    const { messages } = parseTranscript(text)
    expect(messages[0].timestamp.getFullYear()).toBe(2023)
  })
})

// ---------------------------------------------------------------------------
// Format B (ios-bracketed)
// ---------------------------------------------------------------------------

describe('parseTranscript — Format B (ios-bracketed)', () => {
  it('parses bracketed format with seconds', () => {
    const text = '[12/01/24, 10:15:32 PM] Alice: Hey, how are you?'
    const { messages, format } = parseTranscript(text)
    expect(format.name).toBe('ios-bracketed')
    expect(messages).toHaveLength(1)
    expect(messages[0].senderRaw).toBe('Alice')
    expect(messages[0].content).toBe('Hey, how are you?')
  })
})

// ---------------------------------------------------------------------------
// Format C (android-24h)
// ---------------------------------------------------------------------------

describe('parseTranscript — Format C (android-24h)', () => {
  it('parses 24-hour format', () => {
    const text = '12/01/24, 22:15 - Alice: Hey, how are you?'
    const { messages, format } = parseTranscript(text)
    expect(format.name).toBe('android-24h')
    expect(messages).toHaveLength(1)
    expect(messages[0].senderRaw).toBe('Alice')
    expect(messages[0].timestamp.getHours()).toBe(22)
    expect(messages[0].timestamp.getMinutes()).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// Multi-line messages
// ---------------------------------------------------------------------------

describe('multi-line messages', () => {
  it('merges continuation lines into previous message', () => {
    const text = `27/10/2023, 7:18 pm - HRITHIK: Chalo bro....see you
Take care
27/10/2023, 7:18 pm - Goutham Aiml: Yeah bye bro`

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('Chalo bro....see you\nTake care')
    expect(messages[1].content).toBe('Yeah bye bro')
  })

  it('handles multiple continuation lines', () => {
    const text = `27/10/2023, 7:18 pm - User: Line one
Line two
Line three
27/10/2023, 7:19 pm - User: Next message`

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('Line one\nLine two\nLine three')
  })
})

// ---------------------------------------------------------------------------
// System messages
// ---------------------------------------------------------------------------

describe('system messages', () => {
  it('detects encryption notice as system message', () => {
    const text =
      '12/10/2023, 2:11 pm - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. *Learn more*'

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('system')
    expect(messages[0].senderRaw).toBeNull()
  })

  it('detects "X added Y" as system message', () => {
    const text = '12/10/2023, 2:11 pm - Alice added Bob'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('system')
    expect(messages[0].senderRaw).toBeNull()
  })

  it('detects "X left" as system message', () => {
    const text = '12/10/2023, 2:11 pm - Charlie left'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('system')
  })
})

// ---------------------------------------------------------------------------
// Deleted messages
// ---------------------------------------------------------------------------

describe('deleted messages', () => {
  it('detects "This message was deleted"', () => {
    const text = '02/01/2024, 1:56 pm - Goutham Aiml: This message was deleted'
    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('deleted')
    expect(messages[0].senderRaw).toBe('Goutham Aiml')
  })

  it('detects "You deleted this message"', () => {
    const text = '27/07/2024, 11:10 am - HRITHIK: You deleted this message'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('deleted')
    expect(messages[0].senderRaw).toBe('HRITHIK')
  })
})

// ---------------------------------------------------------------------------
// Media references
// ---------------------------------------------------------------------------

describe('media references', () => {
  it('detects "filename (file attached)"', () => {
    const text = '30/10/2023, 7:59 am - HRITHIK: Om Makadia Aiml.vcf (file attached)'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('media')
    expect(messages[0].mediaFilename).toBe('Om Makadia Aiml.vcf')
    expect(messages[0].isMediaOmitted).toBe(false)
  })

  it('detects "<Media omitted>"', () => {
    const text = '30/10/2023, 9:48 am - Goutham Aiml: <Media omitted>'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('media')
    expect(messages[0].mediaFilename).toBeNull()
    expect(messages[0].isMediaOmitted).toBe(true)
  })

  it('detects "<attached: filename>"', () => {
    const text = '30/10/2023, 7:59 am - User: <attached: photo.jpg>'
    const { messages } = parseTranscript(text)
    expect(messages[0].type).toBe('media')
    expect(messages[0].mediaFilename).toBe('photo.jpg')
    expect(messages[0].isMediaOmitted).toBe(false)
  })

  it('handles image filename with standard WhatsApp naming', () => {
    const text = '07/11/2023, 11:22 am - HRITHIK: IMG-20231107-WA0000.jpg (file attached)'
    const { messages } = parseTranscript(text)
    expect(messages[0].mediaFilename).toBe('IMG-20231107-WA0000.jpg')
  })
})

// ---------------------------------------------------------------------------
// Unicode handling
// ---------------------------------------------------------------------------

describe('unicode handling', () => {
  it('strips narrow no-break space (U+202F) from timestamps', () => {
    // This is what the real sample export looks like — U+202F before "pm"
    const text = '27/10/2023, 7:08\u202Fpm - HRITHIK: Hey bro'
    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(1)
    expect(messages[0].senderRaw).toBe('HRITHIK')
    expect(messages[0].content).toBe('Hey bro')
  })

  it('strips LRM (U+200E) characters', () => {
    const text = '\u200E27/10/2023, 7:08 pm - HRITHIK: Hey\u200E bro'
    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty transcript', () => {
    const { messages, parseErrors } = parseTranscript('')
    expect(messages).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
  })

  it('handles transcript with only system messages', () => {
    const text = `12/10/2023, 2:11 pm - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
12/10/2023, 2:11 pm - Alice added Bob`

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(2)
    expect(messages.every((m) => m.type === 'system')).toBe(true)
  })

  it('assigns sequential sortIndex values', () => {
    const text = `27/10/2023, 7:08 pm - A: One
27/10/2023, 7:09 pm - B: Two
27/10/2023, 7:10 pm - A: Three`

    const { messages } = parseTranscript(text)
    expect(messages[0].sortIndex).toBe(0)
    expect(messages[1].sortIndex).toBe(1)
    expect(messages[2].sortIndex).toBe(2)
  })

  it('consecutive messages from same sender are separate messages', () => {
    const text = `27/10/2023, 7:08 pm - HRITHIK: First
27/10/2023, 7:08 pm - HRITHIK: Second
27/10/2023, 7:08 pm - HRITHIK: Third`

    const { messages } = parseTranscript(text)
    expect(messages).toHaveLength(3)
    expect(messages.every((m) => m.senderRaw === 'HRITHIK')).toBe(true)
  })

  it('handles message with colon in content', () => {
    const text = '27/10/2023, 7:08 pm - User: Time is 3:00 PM'
    const { messages } = parseTranscript(text)
    expect(messages[0].senderRaw).toBe('User')
    expect(messages[0].content).toBe('Time is 3:00 PM')
  })
})

// ---------------------------------------------------------------------------
// extractParticipants
// ---------------------------------------------------------------------------

describe('extractParticipants', () => {
  it('extracts unique participant names', () => {
    const text = `27/10/2023, 7:08 pm - HRITHIK: Hey
27/10/2023, 7:08 pm - Goutham Aiml: Hi
27/10/2023, 7:09 pm - HRITHIK: Bye
12/10/2023, 2:11 pm - Messages and calls are end-to-end encrypted.`

    const { messages } = parseTranscript(text)
    const participants = extractParticipants(messages)
    expect(participants).toContain('HRITHIK')
    expect(participants).toContain('Goutham Aiml')
    expect(participants).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Real sample excerpt (from the provided export)
// ---------------------------------------------------------------------------

describe('real sample excerpt', () => {
  it('parses the provided WhatsApp export correctly', () => {
    const text = `12/10/2023, 2:11\u202Fpm - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. *Learn more*
13/10/2023, 12:59\u202Fpm - Goutham Aiml: \u200E
18/10/2023, 7:42\u202Fpm - HRITHIK: BS Grewal higher engineering mathematics
27/10/2023, 7:18\u202Fpm - HRITHIK: Chalo bro....see you
Take care
27/10/2023, 7:18\u202Fpm - Goutham Aiml: Yeah bye bro
30/10/2023, 7:59\u202Fam - HRITHIK: Om Makadia Aiml.vcf (file attached)
30/10/2023, 9:48\u202Fam - Goutham Aiml: <Media omitted>
02/01/2024, 1:56\u202Fpm - Goutham Aiml: This message was deleted
27/07/2024, 11:10\u202Fam - HRITHIK: You deleted this message`

    const { messages, format } = parseTranscript(text)
    expect(format.name).toBe('android-12h')

    // System message (encryption notice)
    expect(messages[0].type).toBe('system')
    expect(messages[0].senderRaw).toBeNull()

    // Multi-line message
    const multiLine = messages.find((m) => m.content.includes('Take care'))
    expect(multiLine).toBeDefined()
    expect(multiLine!.content).toContain('Chalo bro....see you\nTake care')

    // Media attached
    const mediaAttached = messages.find((m) => m.mediaFilename === 'Om Makadia Aiml.vcf')
    expect(mediaAttached).toBeDefined()
    expect(mediaAttached!.type).toBe('media')

    // Media omitted
    const mediaOmitted = messages.find((m) => m.isMediaOmitted)
    expect(mediaOmitted).toBeDefined()
    expect(mediaOmitted!.type).toBe('media')

    // Deleted messages
    const deleted = messages.filter((m) => m.type === 'deleted')
    expect(deleted).toHaveLength(2)
    expect(deleted[0].senderRaw).toBe('Goutham Aiml')
    expect(deleted[1].senderRaw).toBe('HRITHIK')
  })
})
