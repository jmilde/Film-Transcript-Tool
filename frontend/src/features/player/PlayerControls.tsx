import { formatTime } from './format'
import {
  Pause as PauseIcon,
  Play as PlayIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
} from 'lucide-react'

export const SKIP_SECONDS = 5

interface PlayerControlsProps {
  currentTime: number
  duration: number
  playing: boolean
  speed: number
  onTogglePlay: () => void
  /** Called with a signed delta in seconds (±`SKIP_SECONDS`). */
  onSkip: (seconds: number) => void
  onToggleSpeed: () => void
}

/**
 * The play/pause/skip/speed control row shared by `VideoPlayer` (wired to
 * the global playback store) and `ClipPreviewPlayer` (wired to local state),
 * so both players present identical chrome regardless of which state they
 * read from. Purely presentational — all playback state and DOM/video-ref
 * access lives in the caller.
 */
export function PlayerControls({
  currentTime,
  duration,
  playing,
  speed,
  onTogglePlay,
  onSkip,
  onToggleSpeed,
}: PlayerControlsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Skip back 5 seconds"
          title="Skip back 5s"
          onClick={() => onSkip(-SKIP_SECONDS)}
          className="rounded-md p-1.5 text-text-muted hover:bg-surface-raised"
        >
          <SkipBackIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
          className="rounded-md bg-brand p-2 text-text-inverted hover:bg-brand-hover"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Skip forward 5 seconds"
          title="Skip forward 5s"
          onClick={() => onSkip(SKIP_SECONDS)}
          className="rounded-md p-1.5 text-text-muted hover:bg-surface-raised"
        >
          <SkipForwardIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Toggle 2x speed"
          title="2x speed"
          onClick={onToggleSpeed}
          className={`rounded-md border px-2 py-1 text-small font-semibold ${
            speed === 2
              ? 'border-brand bg-brand text-text-inverted'
              : 'border-border text-text-muted hover:bg-surface-raised'
          }`}
        >
          2x
        </button>
      </div>
      <div className="flex justify-between font-mono text-small text-text-muted">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
