import { formatTime } from './format'
import { SPEED_OPTIONS } from './usePlaybackSpeed'
import { Select } from '../../components/ui/Select'
import {
  Pause as PauseIcon,
  Play as PlayIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
} from 'lucide-react'

export const SKIP_SECONDS = 5

const SPEED_SELECT_OPTIONS = SPEED_OPTIONS.map((s) => ({ value: String(s), label: `${s}x` }))

interface PlayerControlsProps {
  currentTime: number
  duration: number
  playing: boolean
  speed: number
  onTogglePlay: () => void
  /** Called with a signed delta in seconds (±`SKIP_SECONDS`). */
  onSkip: (seconds: number) => void
  onSpeedChange: (speed: number) => void
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
  onSpeedChange,
}: PlayerControlsProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Skip back 5 seconds"
          title="Skip back 5s"
          onClick={() => onSkip(-SKIP_SECONDS)}
          className="rounded-lg p-1.5 text-text-muted hover:bg-glass"
        >
          <SkipBackIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
          className="rounded-lg bg-brand p-2 text-text-inverted hover:bg-brand-hover"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Skip forward 5 seconds"
          title="Skip forward 5s"
          onClick={() => onSkip(SKIP_SECONDS)}
          className="rounded-lg p-1.5 text-text-muted hover:bg-glass"
        >
          <SkipForwardIcon className="h-5 w-5" />
        </button>
        <Select
          aria-label="Playback speed"
          value={String(speed)}
          onValueChange={(value) => onSpeedChange(Number(value))}
          options={SPEED_SELECT_OPTIONS}
          className="px-2 py-1 text-small font-semibold"
        />
      </div>
      <div className="flex justify-between font-mono text-small text-text-muted">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
