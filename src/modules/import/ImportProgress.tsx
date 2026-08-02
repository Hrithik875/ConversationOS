/**
 * ImportProgress.tsx — Live progress display during import.
 *
 * Shows the current pipeline phase, progress bar, and counts
 * while the Web Worker processes the zip file.
 */

import { useImportStore } from '@/stores/importStore'
import type { ImportPhase } from '@/types/import'

const PHASE_LABELS: Record<ImportPhase, string> = {
  extracting: 'Extracting zip file…',
  parsing: 'Parsing transcript…',
  media: 'Processing media files…',
  encrypting: 'Encrypting messages…',
  saving: 'Saving to database…',
}

const PHASE_ICONS: Record<ImportPhase, string> = {
  extracting: '📦',
  parsing: '📝',
  media: '🖼️',
  encrypting: '🔐',
  saving: '💾',
}

export function ImportProgress() {
  const phase = useImportStore((s) => s.phase)
  const current = useImportStore((s) => s.progressCurrent)
  const total = useImportStore((s) => s.progressTotal)
  const detail = useImportStore((s) => s.progressDetail)

  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="text-2xl">{phase ? PHASE_ICONS[phase] : '⏳'}</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Importing…</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {phase ? PHASE_LABELS[phase] : 'Starting import…'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="mb-2 flex justify-between text-xs text-muted-foreground">
          <span>
            {current.toLocaleString()} / {total.toLocaleString()}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {detail && <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>}
      </div>

      <p className="text-xs text-muted-foreground">
        This runs in the background — your browser won&apos;t freeze.
      </p>
    </div>
  )
}
