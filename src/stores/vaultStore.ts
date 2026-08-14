/**
 * vaultStore.ts — Zustand vault session store.
 *
 * SECURITY CRITICAL — read carefully before modifying.
 *
 * This store holds the in-memory vault state for the current browser session.
 *
 * PERSISTENCE: This store intentionally does NOT use Zustand's persist()
 * middleware or any other persistence mechanism (localStorage, sessionStorage,
 * IndexedDB, cookies, etc.). This is a deliberate security requirement, not an
 * oversight. The derived CryptoKey must ONLY exist in memory and must vanish
 * automatically on page refresh, tab close, or browser restart.
 *
 * If you are considering adding persistence here: do not. See DOCUMENTATION.md
 * for the threat model rationale.
 */

import { create } from 'zustand'
import { db } from '@/lib/db'
import {
  deriveKey,
  generateSalt,
  generateVerifier,
  checkVerifier,
  bytesToBase64,
  base64ToBytes,
  DEFAULT_KDF_PARAMS,
} from '@/lib/crypto'
import type { VaultStatus } from '@/types/vault'

interface VaultState {
  /**
   * Current vault status:
   *   'no-vault'  — no vault has ever been created on this device.
   *   'locked'    — a vault exists but the session key has not been derived yet.
   *   'unlocked'  — the session key is in memory and the app is accessible.
   */
  status: VaultStatus

  /**
   * The in-memory AES-256-GCM session key.
   *
   * SECURITY: This value is NEVER persisted. It exists only for the duration
   * of an unlocked session. When lock() is called (or the page is refreshed),
   * this becomes null and the derived key is gone.
   */
  derivedKey: CryptoKey | null

  /** Error message from the last failed unlock attempt (or null if none). */
  lastError: string | null

  /**
   * Number of consecutive failed unlock attempts in the current session.
   * Resets to 0 on a successful unlock. Used to apply rate-limiting.
   * NOT persisted — resets on page refresh (intentional).
   */
  failedAttempts: number

  /**
   * Whether a vault operation (create/unlock) is currently in progress.
   * Used to disable the UI during the slow Argon2id derivation.
   */
  isLoading: boolean

  /**
   * Create a brand-new vault from a passphrase.
   *
   * Process:
   * 1. Generate a random 32-byte salt.
   * 2. Derive an AES-256-GCM key via Argon2id (this is intentionally slow).
   * 3. Generate an encrypted verifier blob from the key.
   * 4. Store salt + kdfParams + verifier in Dexie (vaultMeta table).
   * 5. Place the derived key in this store (session starts as 'unlocked').
   *
   * The passphrase itself is NEVER stored. Only the salt, params, and the
   * encrypted verifier (ciphertext of a known constant) are persisted.
   *
   * @param passphrase - The user's chosen passphrase (plaintext, memory-only).
   */
  createVault: (passphrase: string) => Promise<void>

  /**
   * Attempt to unlock an existing vault with a passphrase.
   *
   * Process:
   * 1. Load salt + kdfParams + verifier from Dexie.
   * 2. Derive the key using the entered passphrase + stored salt.
   * 3. Check the derived key against the stored verifier.
   * 4. If correct: set derivedKey in store, status → 'unlocked'.
   * 5. If wrong: increment failedAttempts, set lastError, do not store key.
   *
   * @param passphrase - The passphrase the user typed (plaintext, memory-only).
   */
  unlock: (passphrase: string) => Promise<void>

  /**
   * Lock the vault by wiping the session key from memory.
   *
   * This actively sets derivedKey to null (not just a status flip) so the
   * CryptoKey object is eligible for garbage collection. The app transitions
   * back to 'locked' state and all encrypted data becomes inaccessible until
   * the correct passphrase is re-entered.
   */
  lock: () => void

  /** Clear the lastError message (e.g. when the user starts typing again). */
  clearError: () => void

  /** Initialise the store by checking whether a vault exists in Dexie. */
  initialise: () => Promise<void>
}

export const useVaultStore = create<VaultState>()((set, get) => ({
  status: 'locked', // will be corrected by initialise()
  derivedKey: null,
  lastError: null,
  failedAttempts: 0,
  isLoading: false,

  initialise: async () => {
    const count = await db.vaultMeta.count()
    set({ status: count === 0 ? 'no-vault' : 'locked' })
  },

  createVault: async (passphrase: string) => {
    set({ isLoading: true, lastError: null })
    try {
      const saltBytes = generateSalt()
      const saltBase64 = bytesToBase64(saltBytes)
      const kdfParams = DEFAULT_KDF_PARAMS

      const key = await deriveKey(passphrase, saltBytes, kdfParams)
      const verifier = await generateVerifier(key)

      await db.vaultMeta.add({
        salt: saltBase64,
        kdfParams,
        verifier,
        createdAt: new Date().toISOString(),
      })

      set({
        status: 'unlocked',
        derivedKey: key,
        failedAttempts: 0,
        lastError: null,
        isLoading: false,
      })
    } catch (err) {
      set({
        isLoading: false,
        lastError: 'Failed to create vault. Please try again.',
      })
      // Re-throw so callers can handle unexpected errors.
      throw err
    }
  },

  unlock: async (passphrase: string) => {
    set({ isLoading: true, lastError: null })
    try {
      const meta = await db.vaultMeta.toCollection().first()
      if (!meta) {
        set({ isLoading: false, status: 'no-vault' })
        return
      }

      const saltBytes = base64ToBytes(meta.salt)
      const key = await deriveKey(passphrase, saltBytes, meta.kdfParams)
      const isCorrect = await checkVerifier(key, meta.verifier)

      if (isCorrect) {
        set({
          status: 'unlocked',
          derivedKey: key,
          failedAttempts: 0,
          lastError: null,
          isLoading: false,
        })
      } else {
        const newFailedAttempts = get().failedAttempts + 1
        set({
          isLoading: false,
          lastError: 'Incorrect passphrase.',
          failedAttempts: newFailedAttempts,
          // derivedKey stays null — do NOT put a wrong key in the store.
        })
      }
    } catch (err) {
      set({
        isLoading: false,
        lastError: 'An unexpected error occurred. Please try again.',
      })
      throw err
    }
  },

  lock: () => {
    // Actively clear the key from memory first, then flip status.
    // This is not just a status change — setting derivedKey to null removes
    // the reference so the CryptoKey object can be garbage collected.
    set({
      derivedKey: null,
      status: 'locked',
      lastError: null,
      // failedAttempts intentionally NOT reset here — it persists within
      // a session across lock/unlock cycles, resetting only on page load.
    })
  },

  clearError: () => set({ lastError: null }),
}))

// ---------------------------------------------------------------------------
// Development HMR (Hot Module Replacement) Support
// ---------------------------------------------------------------------------
// Persists the in-memory state (including the CryptoKey) across Vite HMR reloads.
// This prevents the frustrating experience of being logged out every time a file
// is saved during development. This data is purely in-memory and does not survive
// a hard page refresh, preserving the security model.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.state = useVaultStore.getState()
  })
  if (import.meta.hot.data?.state) {
    useVaultStore.setState(import.meta.hot.data.state)
  }
}

