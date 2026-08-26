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
  // Which video (if any) currently owns a page-level player, and that page's
  // own play-a-range function — set by `VideoWorkspace` on mount, cleared on
  // unmount. Lets the document panel reuse the existing player for a clip
  // from the video already open there, instead of spawning a second one.
  activeVideoId: string | null
  playSelection: ((start: number, end: number) => void) | null
  setCurrentTime: (currentTime: number) => void
  setDuration: (duration: number) => void
  setPlaying: (playing: boolean) => void
  setAutoFollow: (autoFollow: boolean) => void
  setActiveVideo: (
    videoId: string | null,
    playSelection: ((start: number, end: number) => void) | null,
  ) => void
  reset: () => void
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  autoFollow: true,
  activeVideoId: null,
  playSelection: null,
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ playing }),
  setAutoFollow: (autoFollow) => set({ autoFollow }),
  setActiveVideo: (activeVideoId, playSelection) => set({ activeVideoId, playSelection }),
  reset: () => set({ currentTime: 0, duration: 0, playing: false }),
}))
