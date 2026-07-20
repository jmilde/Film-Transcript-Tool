import { useState, type RefObject } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { formatTime } from './format'
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '../../components/icons'

interface PlayerProps {
  src: string
  videoRef: RefObject<HTMLVideoElement | null>
}

const SKIP_SECONDS = 5

/**
 * Thin HTML5 player abstraction. Deliberately has no native controls — no
 * hover toolbar, and no click-to-seek on the video itself, since seeking is
 * meant to happen only via the waveform below it. Play/pause/skip/speed live
 * in a custom control row instead, and playback state is mirrored into the
 * playback store so other panels (waveform, transcript) can stay in sync.
 */
export function VideoPlayer({ src, videoRef }: PlayerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const duration = usePlaybackStore((s) => s.duration)
  const playing = usePlaybackStore((s) => s.playing)
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime)
  const setDuration = usePlaybackStore((s) => s.setDuration)
  const setPlaying = usePlaybackStore((s) => s.setPlaying)
  const [speed, setSpeed] = useState(1)

  function togglePlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function skip(seconds: number) {
    const el = videoRef.current
    if (!el) return
    const max = duration > 0 ? duration : Infinity
    el.currentTime = Math.min(Math.max(el.currentTime + seconds, 0), max)
  }

  function toggleSpeed() {
    const next = speed === 1 ? 2 : 1
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={src}
        className="w-full rounded bg-black"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Skip back 5 seconds"
          title="Skip back 5s"
          onClick={() => skip(-SKIP_SECONDS)}
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <SkipBackIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
          className="rounded bg-slate-800 p-2 text-white hover:bg-slate-700"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Skip forward 5 seconds"
          title="Skip forward 5s"
          onClick={() => skip(SKIP_SECONDS)}
          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <SkipForwardIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Toggle 2x speed"
          title="2x speed"
          onClick={toggleSpeed}
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
