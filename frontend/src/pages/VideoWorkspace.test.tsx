import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { VideoWorkspace } from './VideoWorkspace'

const VIDEO_ID = '00000000-0000-0000-0000-0000000000v1'
const TRANSCRIPT_ID = '00000000-0000-0000-0000-0000000000t1'
const SPEAKER_ID = '00000000-0000-0000-0000-0000000000s1'

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/videos/:videoId', element: <VideoWorkspace /> }], {
    initialEntries: [`/videos/${VIDEO_ID}`],
  })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
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
})
