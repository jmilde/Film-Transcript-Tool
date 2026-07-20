import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { SearchOverlay } from './SearchOverlay'
import { server } from '../../test/server'

const PROJECT_ID = 'proj-1'

function renderOverlay(onSelect = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SearchOverlay projectId={PROJECT_ID} onClose={onClose} onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return { onSelect, onClose }
}

describe('SearchOverlay', () => {
  it('debounces typing and shows results with kind label and timecode', async () => {
    let receivedQuery: string | null = null
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams.get('q')
        return HttpResponse.json([
          {
            kind: 'transcript',
            id: 'tok-1',
            video_id: 'video-1',
            transcript_id: 'transcript-1',
            text: 'climate',
            start_time: 12.5,
            rank: 0.9,
          },
          {
            kind: 'speaker',
            id: 'spk-1',
            video_id: 'video-2',
            transcript_id: null,
            text: 'Jordan',
            start_time: null,
            rank: 0.5,
          },
        ])
      }),
    )
    renderOverlay()

    await userEvent.type(screen.getByPlaceholderText(/Search transcripts/), 'climate')

    await waitFor(() => expect(receivedQuery).toBe('climate'))
    expect(await screen.findByText('climate')).toBeInTheDocument()
    expect(screen.getByText('Transcript')).toBeInTheDocument()
    expect(screen.getByText('0:12')).toBeInTheDocument()
    expect(screen.getByText('Jordan')).toBeInTheDocument()
    expect(screen.getByText('Speaker')).toBeInTheDocument()
  })

  it('shows a no-results message when the search returns nothing', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () => HttpResponse.json([])),
    )
    renderOverlay()

    await userEvent.type(screen.getByPlaceholderText(/Search transcripts/), 'nothing')

    expect(await screen.findByText('No results.')).toBeInTheDocument()
  })

  it('calls onSelect with the clicked result', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json([
          {
            kind: 'comment',
            id: 'comment-1',
            video_id: 'video-1',
            transcript_id: 'transcript-1',
            text: 'Check this quote',
            start_time: 3,
            rank: 0.7,
          },
        ]),
      ),
    )
    const { onSelect } = renderOverlay()

    await userEvent.type(screen.getByPlaceholderText(/Search transcripts/), 'quote')
    await userEvent.click(await screen.findByText('Check this quote'))

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'comment', id: 'comment-1' }),
    )
  })

  it('closes on Escape', async () => {
    const { onClose } = renderOverlay()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
