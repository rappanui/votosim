interface ProgressBarProps {
  current: number
  total: number
}

const toPercent = (current: number, total: number): string =>
  `${Math.round((current / total) * 100)}%`

/** Displays "Pergunta X de N" with a filled progress bar. Rendered inside the Header. */
export function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <div className="w-full">
      <p className="mb-1 text-center text-xs text-white/80">
        Pergunta {current} de {total}
      </p>
      <div className="h-1 w-full rounded-full bg-white/30">
        <div
          data-testid="progress-fill"
          className="h-1 rounded-full bg-white transition-all duration-300"
          style={{ width: toPercent(current, total) }}
        />
      </div>
    </div>
  )
}
