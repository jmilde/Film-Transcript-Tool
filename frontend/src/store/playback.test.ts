import { beforeEach, describe, expect, it } from 'vitest'
import { usePlaybackStore } from './playback'

beforeEach(() => {
  usePlaybackStore.setState({
    currentTime: 0,
    duration: 0,
    playing: false,
    activeVideoId: null,
    playSelection: null,
  })
})

describe('usePlaybackStore', () => {
  it('sets activeVideoId and playSelection together', () => {
    const fn = (_start: number, _end: number) => {}
    usePlaybackStore.getState().setActiveVideo('v-1', fn)

    expect(usePlaybackStore.getState().activeVideoId).toBe('v-1')
    expect(usePlaybackStore.getState().playSelection).toBe(fn)
  })

  it('clears both when set back to null', () => {
    usePlaybackStore.getState().setActiveVideo('v-1', () => {})
    usePlaybackStore.getState().setActiveVideo(null, null)

    expect(usePlaybackStore.getState().activeVideoId).toBeNull()
    expect(usePlaybackStore.getState().playSelection).toBeNull()
  })

  it('reset() does not clear activeVideoId/playSelection', () => {
    const fn = () => {}
    usePlaybackStore.getState().setActiveVideo('v-1', fn)
    usePlaybackStore.getState().reset()

    expect(usePlaybackStore.getState().activeVideoId).toBe('v-1')
    expect(usePlaybackStore.getState().playSelection).toBe(fn)
    expect(usePlaybackStore.getState().currentTime).toBe(0)
  })
})
