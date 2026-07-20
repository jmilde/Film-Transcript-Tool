import { type RefObject } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { formatTime } from './format'

interface PlayerProps {
  src: string
  videoRef: RefObject<HTMLVideoElement | null>
}

/**
 * Thin HTML5 player abstraction. Uses the native controls for
 * play/pause/seek/volume/fullscreen, and mirrors playback state into the
 * playback store so other panels (waveform, transcript) can stay in sync.
 */
export function VideoPlayer({ src, videoRef }: PlayerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const duration = usePlaybackStore((s) => s.duration)
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime)
  const setDuration = usePlaybackStore((s) => s.setDuration)
  const setPlaying = usePlaybackStore((s) => s.setPlaying)

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={src}
        controls
        className="w-full rounded bg-black"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flex justify-between font-mono text-xs text-slate-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
