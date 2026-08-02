/* eslint-disable react-refresh/only-export-components */
/**
 * AutoLockProvider.tsx — Inactivity auto-lock for the vault.
 *
 * Monitors user activity (mouse, keyboard, touch, scroll) and calls
 * vaultStore.lock() after a configurable period of inactivity.
 *
 * Only active when vault status is 'unlocked'. When locked or no-vault,
 * the timer is cleared and no events are registered.
 *
 * The timeout duration is loaded from the Dexie `settings` table
 * (key: 'autoLockTimeout', value: minutes as number).
 * Default is 15 minutes (see DEFAULT_AUTO_LOCK_MINUTES).
 *
 * Lock-on-tab-close: This happens naturally because the derived key is
 * not persisted anywhere. When the tab is closed or refreshed, the JS
 * heap is wiped and the key is gone. No explicit visibilitychange handler
 * is needed for this — it is a consequence of the no-persistence design.
 * (Verified: tested manually by creating a vault, closing the tab,
 * reopening — app shows locked screen. See DOCUMENTATION.md Phase 1 entry.)
 */

import { useEffect, useRef } from 'react'
import { useVaultStore } from '@/stores/vaultStore'
import { db } from '@/lib/db'

/** Default auto-lock timeout in minutes. */
export const DEFAULT_AUTO_LOCK_MINUTES = 15

/** Settings key for auto-lock timeout in the Dexie settings table. */
export const SETTINGS_KEY_AUTO_LOCK = 'autoLockTimeout'

/**
 * Ensure the auto-lock timeout setting exists in the database.
 * Call once on app startup (inside VaultRouter's initialise effect).
 */
export async function ensureAutoLockSetting(): Promise<void> {
  const existing = await db.settings.get(SETTINGS_KEY_AUTO_LOCK)
  if (!existing) {
    await db.settings.put({ key: SETTINGS_KEY_AUTO_LOCK, value: DEFAULT_AUTO_LOCK_MINUTES })
  }
}

/** Read the auto-lock timeout (in minutes) from settings. */
export async function getAutoLockMinutes(): Promise<number> {
  const row = await db.settings.get(SETTINGS_KEY_AUTO_LOCK)
  if (row && typeof row.value === 'number') {
    return row.value
  }
  return DEFAULT_AUTO_LOCK_MINUTES
}

/** The DOM events that count as "user activity" for auto-lock purposes. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
]

/**
 * AutoLockProvider — renders children, manages inactivity timer.
 *
 * Place this inside ThemeProvider but outside the vault-status router.
 * It needs to be always mounted so it can start/clear the timer on
 * status transitions.
 */
export function AutoLockProvider({ children }: { children: React.ReactNode }) {
  const status = useVaultStore((s) => s.status)
  const lock = useVaultStore((s) => s.lock)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutMsRef = useRef<number>(DEFAULT_AUTO_LOCK_MINUTES * 60 * 1000)

  // Load the configured timeout from settings when vault is unlocked.
  useEffect(() => {
    if (status !== 'unlocked') return
    getAutoLockMinutes().then((mins) => {
      timeoutMsRef.current = mins * 60 * 1000
    })
  }, [status])

  useEffect(() => {
    if (status !== 'unlocked') {
      // Clear any lingering timer when not unlocked.
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    /** Reset the inactivity timer. Called on any user activity event. */
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        lock()
      }, timeoutMsRef.current)
    }

    // Start the timer immediately when vault unlocks.
    resetTimer()

    // Re-start the timer on any user activity.
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true }),
    )

    return () => {
      // Cleanup: remove listeners and clear timer on unmount or status change.
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [status, lock])

  return <>{children}</>
}
