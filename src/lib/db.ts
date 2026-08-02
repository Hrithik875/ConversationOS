import Dexie from 'dexie'

export class ConversationOSDatabase extends Dexie {
  // Database schema will be added here per-feature in later phases
  // e.g., chats, messages, etc.

  constructor() {
    super('ConversationOSDatabase')

    // Phase 1+ tables will be defined here
    this.version(1).stores({
      // Table schemas go here
      // For OPFS (Phase 2, Media Manager), no Dexie table is needed, but metadata might be stored here.
    })
  }
}

export const db = new ConversationOSDatabase()
