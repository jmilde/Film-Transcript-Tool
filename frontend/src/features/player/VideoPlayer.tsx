import { useState, type RefObject } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { PlayerControls } from './PlayerControls'

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
      <PlayerControls
        currentTime={currentTime}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={togglePlay}
        onSkip={skip}
        onToggleSpeed={toggleSpeed}
      />
    </div>
  )
}
