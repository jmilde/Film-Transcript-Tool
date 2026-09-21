import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Fullscreen state + toggle for a `<video>` element, plus an "f" keyboard
 * shortcut (ignored while typing in an input/textarea/contenteditable, same
 * guard `VideoWorkspace`'s Space-to-play shortcut uses).
 */
export function useFullscreen(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else void el.requestFullscreen()
  }, [videoRef])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === videoRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [videoRef])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'f' && e.key !== 'F') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      if (target?.isContentEditable) return
      e.preventDefault()
      toggleFullscreen()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleFullscreen])

  return { isFullscreen, toggleFullscreen }
}
