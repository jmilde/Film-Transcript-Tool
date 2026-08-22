import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { formatTime } from './format'

interface WaveformProps {
  peaks: number[]
  onSeek: (seconds: number) => void
}

// A real video seek is expensive (network fetch + decode to the nearest
// frame) — far slower than the 100+ pointermove events a drag fires per
// second. Throttling to this interval keeps the video element from falling
// behind the cursor during a scrub.
const SEEK_THROTTLE_MS = 100

/**
 * Canvas waveform with a live playhead and its current time shown above it;
 * click or drag the playhead to seek. This is the only place seeking
 * happens — the video element itself has no seek bar.
 */
export function Waveform({ peaks, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const duration = usePlaybackStore((s) => s.duration)
  // While dragging, the playhead tracks the cursor directly instead of the
  // store's `currentTime` (which only catches up once each throttled seek
  // actually completes), so the visual playhead never lags behind the mouse.
  const [dragTime, setDragTime] = useState<number | null>(null)
  const lastSeekAtRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  const trailingTimeoutRef = useRef<number | null>(null)

  const displayTime = dragTime ?? currentTime

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom has no 2d context; nothing to draw in tests

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = '#cbd5e1'
    const n = peaks.length || 1
    const barW = Math.max(1, width / n)
    peaks.forEach((peak, i) => {
      const barH = Math.max(1, peak * height)
      ctx.fillRect((i / n) * width, (height - barH) / 2, barW, barH)
    })

    if (duration > 0) {
      ctx.fillStyle = '#0f172a'
      ctx.fillRect((displayTime / duration) * width, 0, 2, height)
    }
  }, [peaks, displayTime, duration])

  useEffect(() => {
    return () => {
      if (trailingTimeoutRef.current !== null) window.clearTimeout(trailingTimeoutRef.current)
    }
  }, [])

  function timeFromClientX(clientX: number): number | null {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return null
    const rect = canvas.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return fraction * duration
  }

  /** Seeks immediately if outside the throttle window, otherwise schedules a
   * trailing seek so the video always ends up at the last requested time. */
  function scheduleSeek(seconds: number) {
    pendingSeekRef.current = seconds
    const now = performance.now()
    const elapsed = now - lastSeekAtRef.current
    if (elapsed >= SEEK_THROTTLE_MS) {
      lastSeekAtRef.current = now
      onSeek(seconds)
      return
    }
    if (trailingTimeoutRef.current !== null) return
    trailingTimeoutRef.current = window.setTimeout(() => {
      trailingTimeoutRef.current = null
      lastSeekAtRef.current = performance.now()
      if (pendingSeekRef.current !== null) onSeek(pendingSeekRef.current)
    }, SEEK_THROTTLE_MS - elapsed)
  }

  // Pointer capture keeps delivering move/up events to the canvas even once
  // the cursor leaves it, so dragging the playhead off the edges still works.
  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const time = timeFromClientX(event.clientX)
    if (time === null) return
    setDragTime(time)
    lastSeekAtRef.current = performance.now()
    onSeek(time)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const time = timeFromClientX(event.clientX)
    if (time === null) return
    setDragTime(time)
    scheduleSeek(time)
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (trailingTimeoutRef.current !== null) {
      window.clearTimeout(trailingTimeoutRef.current)
      trailingTimeoutRef.current = null
    }
    // Land exactly on the release point, bypassing the throttle.
    const time = timeFromClientX(event.clientX) ?? dragTime
    if (time !== null) onSeek(time)
    setDragTime(null)
  }

  const fraction = duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0
  // Clamped so the label doesn't clip past the waveform's edges near 0%/100%.
  const labelLeft = Math.min(97, Math.max(3, fraction * 100))

  return (
    <div className="relative pt-5">
      <div
        className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-white"
        style={{ left: `${labelLeft}%` }}
      >
        {formatTime(displayTime)}
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={64}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-16 w-full cursor-pointer rounded bg-slate-50"
      />
    </div>
  )
}
