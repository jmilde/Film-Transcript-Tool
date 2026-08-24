import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ProjectView } from './ProjectView'

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa'
const FOLDER_ID = '00000000-0000-0000-0000-0000000000f1'

function SearchRouteStub() {
  const { projectId } = useParams<{ projectId: string }>()
  return <div>search page: {projectId}</div>
}

function ChatRouteStub() {
  const { projectId } = useParams<{ projectId: string }>()
  return <div>chat page: {projectId}</div>
}

function renderProjectView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId', element: <ProjectView /> },
      { path: '/projects/:projectId/search', element: <SearchRouteStub /> },
      { path: '/projects/:projectId/chat', element: <ChatRouteStub /> },
    ],
    { initialEntries: [`/projects/${PROJECT_ID}`] },
  )
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function baseHandlers() {
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}`, () =>
      HttpResponse.json({
        id: PROJECT_ID,
        name: 'Documentary One',
        description: 'A film',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/folders`, () =>
      HttpResponse.json([
        {
          id: FOLDER_ID,
          project_id: PROJECT_ID,
          parent_folder_id: null,
          name: 'Interviews',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]),
    ),
    http.get(`http://localhost:8000/folders/${FOLDER_ID}`, () =>
      HttpResponse.json({
        folder: {
          id: FOLDER_ID,
          project_id: PROJECT_ID,
          parent_folder_id: null,
          name: 'Interviews',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        folders: [],
        videos: [{ id: 'video-1', name: 'Clip One' }],
      }),
    ),
  )
}

describe('ProjectView', () => {
  it('shows the project and its folder tree', async () => {
    baseHandlers()
    renderProjectView()

    expect(await screen.findByRole('heading', { name: 'Documentary One' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Interviews' })).toBeInTheDocument()
  })

  it("loads a folder's videos when selected", async () => {
    baseHandlers()
    renderProjectView()

    const folderButton = await screen.findByRole('button', { name: 'Interviews' })
    await userEvent.click(folderButton)

    expect(await screen.findByText('Clip One')).toBeInTheDocument()
  })

  it('navigates to the search page with Ctrl/Cmd+F', async () => {
    baseHandlers()
    renderProjectView()
    await screen.findByRole('heading', { name: 'Documentary One' })

    await userEvent.keyboard('{Meta>}f{/Meta}')

    expect(await screen.findByText(`search page: ${PROJECT_ID}`)).toBeInTheDocument()
  })

  it('navigates to the search page via the Search button', async () => {
    baseHandlers()
    renderProjectView()
    await screen.findByRole('heading', { name: 'Documentary One' })

    await userEvent.click(screen.getByRole('button', { name: /Search/ }))

    expect(await screen.findByText(`search page: ${PROJECT_ID}`)).toBeInTheDocument()
  })

  it('navigates to the chat page via the Ask button', async () => {
    baseHandlers()
    renderProjectView()
    await screen.findByRole('heading', { name: 'Documentary One' })

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText(`chat page: ${PROJECT_ID}`)).toBeInTheDocument()
  })
})
