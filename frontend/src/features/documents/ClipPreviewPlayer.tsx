import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { proxyUrl, useMediaToken } from '../../api/hooks/useMedia'
import { PlayerControls } from '../player/PlayerControls'

interface ClipPreviewPlayerProps {
  videoId: string
  startTime: number
  endTime: number
}

/**
 * A minimal, self-contained player for previewing a clip from the document
 * panel when its video isn't already open in `VideoWorkspace`. Deliberately
 * does not touch `usePlaybackStore` — that store is the page-level player's
 * shared state (waveform/transcript sync); a second writer here would corrupt
 * `VideoWorkspace`'s own playback display for an unrelated video. Uses the
 * same `PlayerControls` chrome as `VideoPlayer`, wired to local state instead,
 * so the two players look and behave identically.
 */
export function ClipPreviewPlayer({ videoId, startTime, endTime }: ClipPreviewPlayerProps) {
  const { data: media } = useMediaToken(videoId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const endRef = useRef(endTime)
  endRef.current = endTime

  const [currentTime, setCurrentTime] = useState(startTime)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !media) return
    el.currentTime = startTime
    void el.play()
  }, [media, videoId, startTime])

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

  if (!media) {
    return <div className="p-4 text-center text-xs text-slate-400">Loading preview…</div>
  }

  return (
    <div className="space-y-2 p-2">
      <video
        ref={videoRef}
        src={proxyUrl(videoId, media.token)}
        className="w-full rounded bg-black"
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime)
          if (e.currentTarget.currentTime >= endRef.current) e.currentTarget.pause()
        }}
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
      <Link
        to={`/videos/${videoId}`}
        className="block text-center text-xs text-slate-500 hover:underline"
      >
        Open in workspace →
      </Link>
    </div>
  )
}
