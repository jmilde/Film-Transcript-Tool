import type { RefObject } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { PlayerControls } from './PlayerControls'
import { usePlaybackSpeed } from './usePlaybackSpeed'
import { useFullscreen } from './useFullscreen'
import { Maximize as MaximizeIcon, Minimize as MinimizeIcon } from 'lucide-react'

interface PlayerProps {
  src: string
  videoRef: RefObject<HTMLVideoElement | null>
}

/**
 * Thin HTML5 player abstraction. Deliberately has no native controls — no
 * hover toolbar, and no click-to-seek on the video itself, since seeking is
 * meant to happen only via the waveform below it. Play/pause/skip/speed live
 * in the shared `PlayerControls` row instead, wired here to the global
 * playback store so other panels (waveform, transcript) can stay in sync.
 */
export function VideoPlayer({ src, videoRef }: PlayerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const duration = usePlaybackStore((s) => s.duration)
  const playing = usePlaybackStore((s) => s.playing)
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime)
  const setDuration = usePlaybackStore((s) => s.setDuration)
  const setPlaying = usePlaybackStore((s) => s.setPlaying)
  const { speed, changeSpeed } = usePlaybackSpeed(videoRef)
  const { isFullscreen, toggleFullscreen } = useFullscreen(videoRef)

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

  return (
    // The video clips its own top corners to match the enclosing glass
    // Card's rounding (VideoWorkspace) — the Card itself deliberately isn't
    // `overflow-hidden`, since that would also clip PlayerControls' button
    // row if it ever overflows a narrowed panel, silently hiding controls
    // instead of just letting them spill visibly.
    <div>
      <div className="group relative">
        <video
          ref={videoRef}
          src={src}
          className="aspect-video w-full rounded-t-xl bg-black"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <button
          type="button"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={isFullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
        >
          {isFullscreen ? (
            <MinimizeIcon className="h-4 w-4" />
          ) : (
            <MaximizeIcon className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="p-3">
        <PlayerControls
          currentTime={currentTime}
          duration={duration}
          playing={playing}
          speed={speed}
          onTogglePlay={togglePlay}
          onSkip={skip}
          onSpeedChange={changeSpeed}
        />
      </div>
    </div>
  )
}
