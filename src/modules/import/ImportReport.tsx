/**
 * ImportReport.tsx — Post-import report screen.
 *
 * Shows a summary of the completed import: message counts by type,
 * media matched vs missing, detected format, and parse errors.
 */

import { useImportStore } from '@/stores/importStore'

export function ImportReport() {
  const stats = useImportStore((s) => s.stats)
  const errorMessage = useImportStore((s) => s.errorMessage)
  const status = useImportStore((s) => s.status)
  const reset = useImportStore((s) => s.reset)

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <span className="text-2xl">❌</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Import Failed</h2>
          <p className="mt-2 max-w-md text-sm text-destructive">{errorMessage}</p>
        </div>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!stats) return null

  const totalMedia = stats.mediaMatched + stats.mediaMissing + stats.mediaOmitted

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
          <span className="text-2xl">✅</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Import Complete</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your chat has been imported and encrypted successfully.
        </p>
      </div>

      {/* Stats grid */}
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Summary</h3>

        <div className="grid grid-cols-2 gap-3">
          <StatItem label="Total messages" value={stats.messageCount} />
          <StatItem label="Text messages" value={stats.textMessages} />
          <StatItem label="System messages" value={stats.systemMessages} />
          <StatItem label="Deleted messages" value={stats.deletedMessages} />
          <StatItem label="Media (total refs)" value={totalMedia} />
          <StatItem label="Media matched" value={stats.mediaMatched} success />
          <StatItem
            label="Media missing"
            value={stats.mediaMissing}
            warning={stats.mediaMissing > 0}
          />
          <StatItem label="Media omitted" value={stats.mediaOmitted} />
        </div>

        {stats.participants.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Participants</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {stats.participants.map((name) => (
                <span
                  key={name}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {stats.parseErrors.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-destructive">
              Parse warnings ({stats.parseErrors.length})
            </p>
            <div className="mt-1 max-h-32 overflow-y-auto rounded bg-muted p-2">
              {stats.parseErrors.map((err, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {err}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          disabled
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground opacity-50 cursor-not-allowed"
          title="Coming in Phase 3"
        >
          View Chat → Phase 3
        </button>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Import Another
        </button>
      </div>
    </div>
  )
}

function StatItem({
  label,
  value,
  success,
  warning,
}: {
  label: string
  value: number
  success?: boolean
  warning?: boolean
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-bold ${
          success
            ? 'text-green-600 dark:text-green-400'
            : warning
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-foreground'
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}
