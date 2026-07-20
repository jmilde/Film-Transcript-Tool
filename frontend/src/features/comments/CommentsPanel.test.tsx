import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentsPanel } from './CommentsPanel'
import { AuthProvider } from '../../auth/AuthProvider'
import { useSelectionStore } from '../../store/selection'
import { useCommentsStore } from '../../store/comments'
import { server } from '../../test/server'
import type { Comment } from '../../api/hooks/useComments'

const TRANSCRIPT_ID = 't-1'

const COMMENT: Comment = {
  id: 'c-1',
  transcript_id: TRANSCRIPT_ID,
  created_by: 'user-a',
  text: 'Check this quote',
  resolved: false,
  start_token_id: 'tok-a',
  end_token_id: 'tok-b',
  in_time: 1,
  out_time: 2,
  created_at: '2026-01-01T00:00:00Z',
  replies: [
    { id: 'r-1', created_by: 'user-b', text: 'Agreed', created_at: '2026-01-01T00:01:00Z' },
  ],
}

beforeEach(() => {
  useSelectionStore.getState().clear()
  useCommentsStore.setState({ openIds: new Set(), selectedId: null })
})

function renderPanel(comments: Comment[] | undefined, onLocate = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CommentsPanel
          transcriptId={TRANSCRIPT_ID}
          comments={comments}
          isLoading={false}
          onLocate={onLocate}
        />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { onLocate }
}

describe('CommentsPanel', () => {
  it('shows an empty state when there are no comments', () => {
    renderPanel([])
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument()
  })

  it('renders a comment thread with its timecode, text, and reply count', () => {
    renderPanel([COMMENT])
    expect(screen.getByText('Check this quote')).toBeInTheDocument()
    expect(screen.getByText('0:01 – 0:02')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 reply/ })).toBeInTheDocument()
    expect(screen.queryByText('Agreed')).not.toBeInTheDocument()
  })

  it('expands replies on click', async () => {
    renderPanel([COMMENT])
    await userEvent.click(screen.getByRole('button', { name: /1 reply/ }))
    expect(screen.getByText('Agreed')).toBeInTheDocument()
  })

  it('locates a comment: seeks, selects it, and sets the transcript selection range', async () => {
    const { onLocate } = renderPanel([COMMENT])
    await userEvent.click(screen.getByText('0:01 – 0:02'))

    expect(onLocate).toHaveBeenCalledWith(1)
    expect(useCommentsStore.getState().selectedId).toBe('c-1')
    expect(useSelectionStore.getState().range).toEqual({
      transcriptId: TRANSCRIPT_ID,
      anchorTokenId: 'tok-a',
      focusTokenId: 'tok-b',
    })
  })

  it('resolves a comment', async () => {
    let body: unknown
    server.use(
      http.patch('http://localhost:8000/comments/c-1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...COMMENT, resolved: true })
      }),
    )
    renderPanel([COMMENT])

    await userEvent.click(screen.getByText('Resolve'))
    await waitFor(() => expect(body).toEqual({ resolved: true }))
  })

  it('submits a reply', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost:8000/comments/c-1/replies', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...COMMENT, replies: [...COMMENT.replies] })
      }),
    )
    renderPanel([COMMENT])

    const input = screen.getByPlaceholderText('Reply…')
    fireEvent.change(input, { target: { value: 'Noted' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ text: 'Noted' }))
  })
})
