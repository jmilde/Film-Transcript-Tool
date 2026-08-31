import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation, useParams } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import { SearchCommandPalette } from './SearchCommandPalette'
import { useSearchOverlayStore } from '../../store/searchOverlay'

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa'
const VIDEO_ID_1 = '00000000-0000-0000-0000-0000000000v1'
const VIDEO_ID_2 = '00000000-0000-0000-0000-0000000000v2'

function VideoRouteStub() {
  const { videoId } = useParams<{ videoId: string }>()
  const location = useLocation()
  const state = location.state as {
    kind: string
    id: string
    transcriptId: string | null
    startTime: number | null
    origin: string
  } | null
  return (
    <div>
      <span>video:{videoId}</span>
      {state && (
        <span>
          via search: {state.kind}/{state.id}/{state.transcriptId}/{state.startTime}/{state.origin}
        </span>
      )}
    </div>
  )
}

function renderPalette(projectId: string | null = PROJECT_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/', element: <SearchCommandPalette projectId={projectId} /> },
      { path: '/videos/:videoId', element: <VideoRouteStub /> },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router }
}

function group(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    video_id: VIDEO_ID_1,
    video_name: 'Interview A',
    folder_path: ['Season 1', 'Interviews'],
    thumbnail_token: 'thumb.123.sig',
    hits: [
      {
        kind: 'transcript',
        id: 'tok-1',
        transcript_id: 'transcript-1',
        text: 'climate change',
        start_time: 12.5,
        rank: 0.9,
      },
    ],
    hit_count: 1,
    ...overrides,
  }
}

beforeEach(() => {
  useSearchOverlayStore.setState({ isOpen: true, query: '' })
})

describe('SearchCommandPalette', () => {
  it('debounces typed input into the stored query and fetches results', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        return HttpResponse.json({
          groups: q === 'climate' ? [group()] : [],
          total_videos: q === 'climate' ? 1 : 0,
          limit: 10,
          offset: 0,
        })
      }),
    )
    renderPalette()

    await userEvent.type(
      screen.getByPlaceholderText('Search transcripts, speakers, comments…'),
      'climate',
    )

    expect(await screen.findByText('climate change')).toBeInTheDocument()
    await waitFor(() => expect(useSearchOverlayStore.getState().query).toBe('climate'))
  })

  it('renders grouped hits with a folder breadcrumb and a placeholder when no thumbnail exists', async () => {
    useSearchOverlayStore.setState({ isOpen: true, query: 'climate' })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json({
          groups: [
            group(),
            group({
              video_id: VIDEO_ID_2,
              video_name: 'B-roll',
              thumbnail_token: null,
              folder_path: [],
              hits: [
                {
                  kind: 'speaker',
                  id: 'spk-1',
                  transcript_id: null,
                  text: 'Jordan',
                  start_time: null,
                  rank: 0.5,
                },
              ],
              hit_count: 1,
            }),
          ],
          total_videos: 2,
          limit: 10,
          offset: 0,
        }),
      ),
    )
    renderPalette()

    expect(await screen.findByText('Interview A')).toBeInTheDocument()
    expect(screen.getByText('Season 1 / Interviews')).toBeInTheDocument()
    expect(screen.getByText('climate change')).toBeInTheDocument()
    expect(screen.getByText('B-roll')).toBeInTheDocument()
    expect(screen.getByText('Jordan')).toBeInTheDocument()

    const thumb = document.querySelector('img')
    expect(thumb).toHaveAttribute(
      'src',
      expect.stringContaining('/videos/' + VIDEO_ID_1 + '/thumbnail'),
    )
  })

  it('shows a no-results message when the search returns no groups', async () => {
    useSearchOverlayStore.setState({ isOpen: true, query: 'nothing' })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json({ groups: [], total_videos: 0, limit: 10, offset: 0 }),
      ),
    )
    renderPalette()

    expect(await screen.findByText('No results.')).toBeInTheDocument()
  })

  it('navigates to the video with an origin: "search" nav payload and no returnTo', async () => {
    useSearchOverlayStore.setState({ isOpen: true, query: 'climate' })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json({ groups: [group()], total_videos: 1, limit: 10, offset: 0 }),
      ),
    )
    renderPalette()

    await userEvent.click(await screen.findByText('climate change'))

    expect(await screen.findByText(`video:${VIDEO_ID_1}`)).toBeInTheDocument()
    expect(
      await screen.findByText(`via search: transcript/tok-1/transcript-1/12.5/search`),
    ).toBeInTheDocument()
    expect(useSearchOverlayStore.getState().isOpen).toBe(false)
  })

  it('loads the next page of groups when "Load more" is clicked', async () => {
    useSearchOverlayStore.setState({ isOpen: true, query: 'climate' })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0')
        if (offset === 0) {
          return HttpResponse.json({ groups: [group()], total_videos: 2, limit: 1, offset: 0 })
        }
        return HttpResponse.json({
          groups: [group({ video_id: VIDEO_ID_2, video_name: 'B-roll', thumbnail_token: null })],
          total_videos: 2,
          limit: 1,
          offset: 1,
        })
      }),
    )
    renderPalette()

    expect(await screen.findByText('Interview A')).toBeInTheDocument()
    expect(screen.queryByText('B-roll')).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('B-roll')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('does not open when there is no project in scope', () => {
    useSearchOverlayStore.setState({ isOpen: true, query: '' })
    renderPalette(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
