import { create } from 'zustand'

/**
 * Local UI state for video playback, kept out of the server-state (Query) cache.
 * The player writes currentTime/duration/playing here; the transcript viewer
 * (F3) reads currentTime to highlight the active token and, when autoFollow is
 * on, scroll to it.
 */
interface PlaybackState {
  currentTime: number
  duration: number
  playing: boolean
  autoFollow: boolean
  setCurrentTime: (currentTime: number) => void
  setDuration: (duration: number) => void
  setPlaying: (playing: boolean) => void
  setAutoFollow: (autoFollow: boolean) => void
  reset: () => void
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  autoFollow: true,
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ playing }),
  setAutoFollow: (autoFollow) => set({ autoFollow }),
  reset: () => set({ currentTime: 0, duration: 0, playing: false }),
}))
