import { formatTime } from './format'
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '../../components/icons'

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
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <SkipBackIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
          className="rounded bg-slate-800 p-2 text-white hover:bg-slate-700"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Skip forward 5 seconds"
          title="Skip forward 5s"
          onClick={() => onSkip(SKIP_SECONDS)}
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <SkipForwardIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Toggle 2x speed"
          title="2x speed"
          onClick={onToggleSpeed}
          className={`rounded border px-2 py-1 text-xs font-semibold ${
            speed === 2
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100'
          }`}
        >
          2x
        </button>
      </div>
      <div className="flex justify-between font-mono text-xs text-slate-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
