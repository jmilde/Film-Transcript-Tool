import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipBlockView } from './ClipBlockView'
import { DocumentCommentsContext } from './documentCommentsContext'
import { usePlaybackStore } from '../../store/playback'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { ReactNodeViewProps } from '@tiptap/react'

function makeProps(overrides: Partial<ReactNodeViewProps> = {}) {
  return {
    node: {
      attrs: {
        nodeId: 'n-1',
        transcriptId: 't-1',
        videoId: 'v-1',
        startTokenId: 'tok-a',
        endTokenId: 'tok-b',
        video_name: 'Interview A',
        start_time: 1,
        end_time: 2,
        excerpt: 'hello there',
        thumbnail_token: null,
        folder_path: [],
      },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
    ...overrides,
  } as unknown as ReactNodeViewProps
}

beforeEach(() => {
  usePlaybackStore.setState({ activeVideoId: null, playSelection: null })
  useDocumentPanelStore.setState({ previewClip: null })
})

describe('ClipBlockView', () => {
  it('renders the excerpt as inline text, not a card', () => {
    render(<ClipBlockView {...makeProps()} />)

    expect(screen.getByText('hello there')).toBeInTheDocument()
    expect(screen.queryByAltText('Interview A')).not.toBeInTheDocument()
    expect(screen.queryByText(/Interview A/)).not.toBeInTheDocument()
  })

  it('shows no action row until selected', () => {
    render(<ClipBlockView {...makeProps({ selected: false })} />)

    expect(screen.queryByRole('button', { name: 'Play clip' })).not.toBeInTheDocument()
  })

  it('gains an underline once a comment exists on the clip', () => {
    const { rerender } = render(<ClipBlockView {...makeProps()} />)
    const span = screen.getByText('hello there')
    expect(span.className).not.toContain('underline')

    rerender(
      <DocumentCommentsContext.Provider
        value={{
          clipCommentStatus: new Map([['n-1', { resolved: false }]]),
          createClipComment: vi.fn(),
        }}
      >
        <ClipBlockView {...makeProps()} />
      </DocumentCommentsContext.Provider>,
    )

    expect(screen.getByText('hello there').className).toContain('underline')
  })

  describe('play button', () => {
    it("reuses the page's existing player when its video is already open", async () => {
      const playSelection = vi.fn()
      usePlaybackStore.setState({ activeVideoId: 'v-1', playSelection })
      render(<ClipBlockView {...makeProps({ selected: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'Play clip' }))

      expect(playSelection).toHaveBeenCalledWith(1, 2)
      expect(useDocumentPanelStore.getState().previewClip).toBeNull()
    })

    it('spawns the panel-owned preview player for a different active video', async () => {
      usePlaybackStore.setState({ activeVideoId: 'other-video', playSelection: vi.fn() })
      render(<ClipBlockView {...makeProps({ selected: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'Play clip' }))

      expect(useDocumentPanelStore.getState().previewClip).toEqual({
        videoId: 'v-1',
        startTime: 1,
        endTime: 2,
      })
    })
  })

  it('removes the node via deleteNode', async () => {
    const deleteNode = vi.fn()
    render(<ClipBlockView {...makeProps({ selected: true, deleteNode })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove clip' }))

    expect(deleteNode).toHaveBeenCalled()
  })

  it('creates a clip comment via the context callback', async () => {
    const createClipComment = vi.fn()
    render(
      <DocumentCommentsContext.Provider value={{ clipCommentStatus: new Map(), createClipComment }}>
        <ClipBlockView {...makeProps({ selected: true })} />
      </DocumentCommentsContext.Provider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Comment on clip' }))
    await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Nice moment')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(createClipComment).toHaveBeenCalledWith('n-1', 'Nice moment')
  })
})
