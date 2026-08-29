import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipPreviewPlayer } from './ClipPreviewPlayer'
import { server } from '../../test/server'

const VIDEO_ID = '00000000-0000-0000-0000-0000000000v1'

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  server.use(
    http.get(`http://localhost:8000/videos/${VIDEO_ID}/media-token`, () =>
      HttpResponse.json({ token: 'signed.123.sig', expires_in: 3600 }),
    ),
  )
})

function renderPreview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/preview',
        element: <ClipPreviewPlayer videoId={VIDEO_ID} startTime={1} endTime={5} />,
      },
      { path: '/videos/:videoId', element: <p>Video workspace</p> },
    ],
    { initialEntries: ['/preview'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ClipPreviewPlayer', () => {
  it('renders the shared PlayerControls chrome instead of native video controls', async () => {
    renderPreview()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Skip back 5 seconds' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Skip forward 5 seconds' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle 2x speed' })).toBeInTheDocument()
    expect(document.querySelector('video')).not.toHaveAttribute('controls')
  })

  it('matches the workspace player’s pause/play toggle once playback starts', async () => {
    renderPreview()
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())

    // jsdom's mocked `play()` doesn't dispatch a real `play` event, so
    // simulate the browser firing it once playback actually starts —
    // exercises the same `onPlay` wiring `VideoPlayer` itself relies on.
    fireEvent.play(document.querySelector('video')!)

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('navigates to the video workspace via the open-in-workspace link', async () => {
    const router = renderPreview()
    const link = await screen.findByText('Open in workspace →')

    await userEvent.click(link)

    await waitFor(() => expect(router.state.location.pathname).toBe(`/videos/${VIDEO_ID}`))
  })
})
