import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation, useParams } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { SearchPage } from './SearchPage'

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
    returnTo: string
  } | null
  return (
    <div>
      <span>video:{videoId}</span>
      {state && (
        <span>
          via search: {state.kind}/{state.id}/{state.transcriptId}/{state.startTime}/
          {state.returnTo}
        </span>
      )}
    </div>
  )
}

function renderSearchPage(initialPath = `/projects/${PROJECT_ID}/search`) {
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}`, () =>
      HttpResponse.json({
        id: PROJECT_ID,
        name: 'Project',
        description: null,
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        my_role: 'editor',
      }),
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/search', element: <SearchPage /> },
      { path: '/videos/:videoId', element: <VideoRouteStub /> },
    ],
    { initialEntries: [initialPath] },
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

describe('SearchPage', () => {
  it('reads the initial query from the URL and syncs edits back to it', async () => {
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
    const { router } = renderSearchPage(`/projects/${PROJECT_ID}/search?q=climate`)

    expect(await screen.findByDisplayValue('climate')).toBeInTheDocument()
    expect(await screen.findByText('climate change')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('climate'), { target: { value: 'ocean' } })

    await waitFor(() => expect(router.state.location.search).toBe('?q=ocean'))
  })

  it('renders grouped hits with a folder breadcrumb and a placeholder when no thumbnail exists', async () => {
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
    renderSearchPage(`/projects/${PROJECT_ID}/search?q=climate`)

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
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json({ groups: [], total_videos: 0, limit: 10, offset: 0 }),
      ),
    )
    renderSearchPage(`/projects/${PROJECT_ID}/search?q=nothing`)

    expect(await screen.findByText('No results.')).toBeInTheDocument()
  })

  it('navigates to the video with a pending-search payload including returnTo', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, () =>
        HttpResponse.json({ groups: [group()], total_videos: 1, limit: 10, offset: 0 }),
      ),
    )
    renderSearchPage(`/projects/${PROJECT_ID}/search?q=climate`)

    await userEvent.click(await screen.findByText('climate change'))

    expect(await screen.findByText(`video:${VIDEO_ID_1}`)).toBeInTheDocument()
    expect(
      await screen.findByText(
        `via search: transcript/tok-1/transcript-1/12.5/` +
          `/projects/${PROJECT_ID}/search?q=climate`,
      ),
    ).toBeInTheDocument()
  })

  it('loads the next page of groups when "Load more" is clicked', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/search`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0')
        if (offset === 0) {
          return HttpResponse.json({
            groups: [group()],
            total_videos: 2,
            limit: 1,
            offset: 0,
          })
        }
        return HttpResponse.json({
          groups: [group({ video_id: VIDEO_ID_2, video_name: 'B-roll', thumbnail_token: null })],
          total_videos: 2,
          limit: 1,
          offset: 1,
        })
      }),
    )
    renderSearchPage(`/projects/${PROJECT_ID}/search?q=climate`)

    expect(await screen.findByText('Interview A')).toBeInTheDocument()
    expect(screen.queryByText('B-roll')).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('B-roll')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
