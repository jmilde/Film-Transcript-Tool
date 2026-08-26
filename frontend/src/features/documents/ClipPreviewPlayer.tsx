import { useEffect, useRef } from 'react'
import { proxyUrl, useMediaToken } from '../../api/hooks/useMedia'

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
 * `VideoWorkspace`'s own playback display for an unrelated video.
 */
export function ClipPreviewPlayer({ videoId, startTime, endTime }: ClipPreviewPlayerProps) {
  const { data: media } = useMediaToken(videoId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const endRef = useRef(endTime)
  endRef.current = endTime

  useEffect(() => {
    const el = videoRef.current
    if (!el || !media) return
    el.currentTime = startTime
    void el.play()
  }, [media, videoId, startTime])

  if (!media) {
    return <div className="p-4 text-center text-xs text-slate-400">Loading preview…</div>
  }

  return (
    <video
      ref={videoRef}
      src={proxyUrl(videoId, media.token)}
      controls
      className="w-full bg-black"
      onTimeUpdate={(e) => {
        if (e.currentTarget.currentTime >= endRef.current) e.currentTarget.pause()
      }}
    />
  )
}
