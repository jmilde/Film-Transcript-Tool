import { useState, type RefObject } from 'react'

/** Playback rate steps offered in the speed picker — finer-grained than a
 * single 1x/2x toggle, most useful around 1x for careful review. */
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** Local playback-rate state for one `<video>` element, shared by
 * `VideoPlayer` and `ClipPreviewPlayer` so both offer the same speed steps
 * through one implementation instead of duplicating the toggle logic. */
export function usePlaybackSpeed(videoRef: RefObject<HTMLVideoElement | null>) {
  const [speed, setSpeed] = useState(1)

  function changeSpeed(next: number) {
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  return { speed, changeSpeed }
}
