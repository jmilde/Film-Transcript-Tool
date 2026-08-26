import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipBlockView } from './ClipBlockView'
import { usePlaybackStore } from '../../store/playback'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { ReactNodeViewProps } from '@tiptap/react'

function makeProps() {
  return {
    node: {
      attrs: {
        nodeId: 'n-1',
        transcriptId: 't-1',
        videoId: 'v-1',
        startTokenId: 'tok-a',
        endTokenId: 'tok-b',
        note: null,
        video_name: 'Interview A',
        start_time: 1,
        end_time: 2,
        excerpt: 'hello there',
        thumbnail_token: null,
        folder_path: [],
      },
    },
    updateAttributes: vi.fn(),
    selected: false,
  } as unknown as ReactNodeViewProps
}

beforeEach(() => {
  usePlaybackStore.setState({ activeVideoId: null, playSelection: null })
  useDocumentPanelStore.setState({ previewClip: null })
})

describe('ClipBlockView play button', () => {
  it("reuses the page's existing player when its video is already open", async () => {
    const playSelection = vi.fn()
    usePlaybackStore.setState({ activeVideoId: 'v-1', playSelection })
    render(<ClipBlockView {...makeProps()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Play clip' }))

    expect(playSelection).toHaveBeenCalledWith(1, 2)
    expect(useDocumentPanelStore.getState().previewClip).toBeNull()
  })

  it('spawns the panel-owned preview player for a different active video', async () => {
    const playSelection = vi.fn()
    usePlaybackStore.setState({ activeVideoId: 'other-video', playSelection })
    render(<ClipBlockView {...makeProps()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Play clip' }))

    expect(playSelection).not.toHaveBeenCalled()
    expect(useDocumentPanelStore.getState().previewClip).toEqual({
      videoId: 'v-1',
      startTime: 1,
      endTime: 2,
    })
  })

  it('spawns the panel-owned preview player when no page player is active', async () => {
    render(<ClipBlockView {...makeProps()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Play clip' }))

    expect(useDocumentPanelStore.getState().previewClip).toEqual({
      videoId: 'v-1',
      startTime: 1,
      endTime: 2,
    })
  })
})
