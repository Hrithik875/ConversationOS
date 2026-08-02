import { create } from 'zustand'

interface AppState {
  // Empty root store for now
  // Future feature stores can be added here or created separately as modular stores.
  initialized: boolean
  setInitialized: (val: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  initialized: false,
  setInitialized: (val) => set({ initialized: val }),
}))
