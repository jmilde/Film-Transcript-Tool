import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { VideoWorkspace } from './VideoWorkspace'

const VIDEO_ID = '00000000-0000-0000-0000-0000000000v1'

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
  })
})
