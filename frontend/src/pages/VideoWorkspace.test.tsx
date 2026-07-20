import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { AuthProvider } from '../auth/AuthProvider'
import { useSelectionStore } from '../store/selection'
import { VideoWorkspace } from './VideoWorkspace'
import type { SearchResult } from '../api/hooks/useSearch'

const VIDEO_ID = '00000000-0000-0000-0000-0000000000v1'
const TRANSCRIPT_ID = '00000000-0000-0000-0000-0000000000t1'
const SPEAKER_ID = '00000000-0000-0000-0000-0000000000s1'

beforeEach(() => {
  useSelectionStore.getState().clear()
})

function renderWorkspace(searchResult?: SearchResult) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/videos/:videoId', element: <VideoWorkspace /> }], {
    initialEntries: [{ pathname: `/videos/${VIDEO_ID}`, state: searchResult ?? null }],
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function handlers() {
  server.use(
    http.get(`http://localhost:8000/videos/${VIDEO_ID}`, () =>
      HttpResponse.json({
        id: VIDEO_ID,
        folder_id: '00000000-0000-0000-0000-0000000000f1',
        name: 'Interview A',
        original_filename: 'a.mp4',
        duration: 12.5,
        frame_rate: 25,
        width: 1920,
        height: 1080,
        assets: [],
        jobs: [],
      }),
    ),
    http.get(`http://localhost:8000/videos/${VIDEO_ID}/media-token`, () =>
      HttpResponse.json({ token: 'signed.123.sig', expires_in: 3600 }),
    ),
    // No waveform generated yet.
    http.get(`http://localhost:8000/videos/${VIDEO_ID}/waveform`, () =>
      HttpResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }),
    ),
    http.get(`http://localhost:8000/videos/${VIDEO_ID}/transcripts`, () =>
      HttpResponse.json([
        {
          id: TRANSCRIPT_ID,
          video_id: VIDEO_ID,
          language: 'en',
          type: 'original',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]),
    ),
    http.get(`http://localhost:8000/videos/${VIDEO_ID}/speakers`, () =>
      HttpResponse.json([
        {
          id: SPEAKER_ID,
          video_id: VIDEO_ID,
          provider_identifier: 'spk_0',
          name: 'Jordan',
          color: null,
        },
      ]),
    ),
    http.get(`http://localhost:8000/transcripts/${TRANSCRIPT_ID}`, () =>
      HttpResponse.json({
        id: TRANSCRIPT_ID,
        video_id: VIDEO_ID,
        language: 'en',
        type: 'original',
        created_at: '2026-01-01T00:00:00Z',
        segments: [
          {
            id: '00000000-0000-0000-0000-0000000000g1',
            speaker_id: SPEAKER_ID,
            tokens: [
              {
                id: '00000000-0000-0000-0000-0000000000k1',
                segment_id: '00000000-0000-0000-0000-0000000000g1',
                original_text: 'Hello',
                edited_text: null,
                text: 'Hello',
                start_time: 0,
                end_time: 1,
              },
              {
                id: '00000000-0000-0000-0000-0000000000k2',
                segment_id: '00000000-0000-0000-0000-0000000000g1',
                original_text: 'world',
                edited_text: null,
                text: 'world',
                start_time: 1,
                end_time: 2,
              },
            ],
          },
        ],
      }),
    ),
    http.get(`http://localhost:8000/transcripts/${TRANSCRIPT_ID}/comments`, () =>
      HttpResponse.json([]),
    ),
  )
}

describe('VideoWorkspace', () => {
  it('shows the video title and streams the proxy with a media token', async () => {
    handlers()
    const { container } = renderWorkspace()

    expect(await screen.findByRole('heading', { name: 'Interview A' })).toBeInTheDocument()

    await waitFor(() => {
      const src = container.querySelector('video')?.getAttribute('src')
      expect(src).toContain(`/videos/${VIDEO_ID}/proxy?token=signed.123.sig`)
    })

    expect(await screen.findByText('Jordan')).toBeInTheDocument()
    expect(await screen.findByText('Hello', { exact: false })).toBeInTheDocument()
  })

  it('optimistically shows an edited token before the PATCH settles', async () => {
    handlers()
    const tokenId = '00000000-0000-0000-0000-0000000000k2'
    const segmentId = '00000000-0000-0000-0000-0000000000g1'
    // Stateful so a post-mutation refetch (triggered by invalidateQueries)
    // reflects the edit too, instead of clobbering the optimistic update
    // with stale data.
    let currentText = 'world'
    server.use(
      http.get(`http://localhost:8000/transcripts/${TRANSCRIPT_ID}`, () =>
        HttpResponse.json({
          id: TRANSCRIPT_ID,
          video_id: VIDEO_ID,
          language: 'en',
          type: 'original',
          created_at: '2026-01-01T00:00:00Z',
          segments: [
            {
              id: segmentId,
              speaker_id: SPEAKER_ID,
              tokens: [
                {
                  id: '00000000-0000-0000-0000-0000000000k1',
                  segment_id: segmentId,
                  original_text: 'Hello',
                  edited_text: null,
                  text: 'Hello',
                  start_time: 0,
                  end_time: 1,
                },
                {
                  id: tokenId,
                  segment_id: segmentId,
                  original_text: 'world',
                  edited_text: currentText === 'world' ? null : currentText,
                  text: currentText,
                  start_time: 1,
                  end_time: 2,
                },
              ],
            },
          ],
        }),
      ),
      http.patch(`http://localhost:8000/tokens/${tokenId}`, async ({ request }) => {
        const body = (await request.json()) as { edited_text: string | null }
        currentText = body.edited_text ?? 'world'
        return HttpResponse.json({
          id: tokenId,
          segment_id: segmentId,
          original_text: 'world',
          edited_text: body.edited_text,
          text: currentText,
          start_time: 1,
          end_time: 2,
        })
      }),
    )
    renderWorkspace()

    const worldToken = await screen.findByText('world', { exact: false })
    fireEvent.dblClick(worldToken)
    const input = screen.getByDisplayValue('world')
    fireEvent.change(input, { target: { value: 'earth' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('earth', { exact: false })).toBeInTheDocument()
  })

  it('highlights the matched token for a pending transcript search result', async () => {
    handlers()
    const tokenId = '00000000-0000-0000-0000-0000000000k2'
    renderWorkspace({
      kind: 'transcript',
      id: tokenId,
      video_id: VIDEO_ID,
      transcript_id: TRANSCRIPT_ID,
      text: 'world',
      start_time: 1,
      rank: 1,
    })

    await screen.findByText('Hello', { exact: false })

    await waitFor(() => {
      expect(useSelectionStore.getState().range).toEqual({
        transcriptId: TRANSCRIPT_ID,
        anchorTokenId: tokenId,
        focusTokenId: tokenId,
      })
    })
  })

  it('resolves a pending comment search result against the loaded comment range', async () => {
    handlers()
    server.use(
      http.get(`http://localhost:8000/transcripts/${TRANSCRIPT_ID}/comments`, () =>
        HttpResponse.json([
          {
            id: 'comment-1',
            transcript_id: TRANSCRIPT_ID,
            created_by: 'user-a',
            text: 'Check this',
            resolved: false,
            start_token_id: '00000000-0000-0000-0000-0000000000k1',
            end_token_id: '00000000-0000-0000-0000-0000000000k2',
            in_time: 0,
            out_time: 2,
            created_at: '2026-01-01T00:00:00Z',
            replies: [],
          },
        ]),
      ),
    )
    renderWorkspace({
      kind: 'comment',
      id: 'comment-1',
      video_id: VIDEO_ID,
      transcript_id: TRANSCRIPT_ID,
      text: 'Check this',
      start_time: 0,
      rank: 1,
    })

    await screen.findByText('Hello')

    await waitFor(() => {
      expect(useSelectionStore.getState().range).toEqual({
        transcriptId: TRANSCRIPT_ID,
        anchorTokenId: '00000000-0000-0000-0000-0000000000k1',
        focusTokenId: '00000000-0000-0000-0000-0000000000k2',
      })
    })
  })
})
