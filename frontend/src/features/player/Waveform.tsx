import { useEffect, useRef, type MouseEvent } from 'react'
import { usePlaybackStore } from '../../store/playback'

interface WaveformProps {
  peaks: number[]
  onSeek: (seconds: number) => void
}

/** Canvas waveform with a live playhead; click to seek. */
export function Waveform({ peaks, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const duration = usePlaybackStore((s) => s.duration)

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
      ctx.fillRect((currentTime / duration) * width, 0, 2, height)
    }
  }, [peaks, currentTime, duration])

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return
    const rect = canvas.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    onSeek(fraction * duration)
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={64}
      onClick={handleClick}
      className="h-16 w-full cursor-pointer rounded bg-slate-50"
    />
  )
}
