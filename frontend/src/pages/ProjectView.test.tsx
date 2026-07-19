import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ProjectView } from './ProjectView'

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa'
const FOLDER_ID = '00000000-0000-0000-0000-0000000000f1'

function renderProjectView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/projects/:projectId', element: <ProjectView /> }], {
    initialEntries: [`/projects/${PROJECT_ID}`],
  })
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
})
