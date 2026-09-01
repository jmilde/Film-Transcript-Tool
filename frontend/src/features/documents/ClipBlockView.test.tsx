import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClipBlockView } from './ClipBlockView'
import { DocumentCommentsContext } from './documentCommentsContext'
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
    updateAttributes: () => {},
    selected: false,
    ...overrides,
  } as unknown as ReactNodeViewProps
}

describe('ClipBlockView', () => {
  it('renders the excerpt as inline text, not a card', () => {
    render(<ClipBlockView {...makeProps()} />)

    expect(screen.getByText('hello there')).toBeInTheDocument()
    expect(screen.queryByAltText('Interview A')).not.toBeInTheDocument()
    expect(screen.queryByText(/Interview A/)).not.toBeInTheDocument()
  })

  it('shows a selection ring only when selected — actions live in the shared BubbleMenu', () => {
    render(<ClipBlockView {...makeProps({ selected: false })} />)
    expect(screen.getByText('hello there').className).not.toContain('ring-1')

    render(<ClipBlockView {...makeProps({ selected: true })} />)
    expect(screen.getAllByText('hello there')[1].className).toContain('ring-1')
  })

  it('gains an underline once a comment exists on the clip', () => {
    const { rerender } = render(<ClipBlockView {...makeProps()} />)
    const span = screen.getByText('hello there')
    expect(span.className).not.toContain('underline')

    rerender(
      <DocumentCommentsContext.Provider
        value={{
          clipCommentStatus: new Map([['n-1', { resolved: false }]]),
          highlightedNodeId: null,
        }}
      >
        <ClipBlockView {...makeProps()} />
      </DocumentCommentsContext.Provider>,
    )

    expect(screen.getByText('hello there').className).toContain('underline')
  })

  it('gains a highlight ring/tint when its comment is hovered or selected', () => {
    render(
      <DocumentCommentsContext.Provider
        value={{ clipCommentStatus: new Map(), highlightedNodeId: 'n-1' }}
      >
        <ClipBlockView {...makeProps()} />
      </DocumentCommentsContext.Provider>,
    )

    const span = screen.getByText('hello there')
    expect(span.className).toContain('ring-1')
    expect(span.className).toContain('bg-brand-subtle')
  })
})
