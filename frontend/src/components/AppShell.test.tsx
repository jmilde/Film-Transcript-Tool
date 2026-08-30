import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { AuthProvider } from '../auth/AuthProvider'
import { useDocumentPanelStore } from '../store/documentPanel'
import { useSearchOverlayStore } from '../store/searchOverlay'
import { useThemeStore } from '../store/theme'
import { server } from '../test/server'

const PROJECT_ID = 'p-1'
const VIDEO_ID = 'v-1'

function PageA() {
  return <div>Page A</div>
}
function PageB() {
  return <div>Page B</div>
}

function projectHandler() {
  return http.get(`http://localhost:8000/projects/${PROJECT_ID}`, () =>
    HttpResponse.json({
      id: PROJECT_ID,
      name: 'Documentary One',
      description: null,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      my_role: 'editor',
    }),
  )
}

function videoHandler() {
  return http.get(`http://localhost:8000/videos/${VIDEO_ID}`, () =>
    HttpResponse.json({
      id: VIDEO_ID,
      folder_id: 'f-1',
      project_id: PROJECT_ID,
      name: 'Clip.mp4',
      original_filename: 'clip.mp4',
      folder_path: ['Season 1', 'Interviews'],
      duration: null,
      frame_rate: null,
      width: null,
      height: null,
      assets: [],
      jobs: [],
    }),
  )
}

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    activeDocumentId: null,
    pendingInsert: null,
  })
  useSearchOverlayStore.setState({ isOpen: false, query: '' })
  useThemeStore.setState({ isDark: false })
  document.documentElement.classList.remove('dark')
  localStorage.clear()
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () => HttpResponse.json([])),
  )
})

function renderShell(initialPath = '/a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: 'a', element: <PageA /> },
          { path: 'b', element: <PageB /> },
          { path: 'projects/:projectId', element: <PageA /> },
          { path: 'videos/:videoId', element: <PageA /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  return {
    router,
    ...render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('AppShell', () => {
  it('keeps the document panel open across a route change', async () => {
    useDocumentPanelStore.setState({ activeProjectId: PROJECT_ID })
    const { router } = renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Open document panel' }))
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)
    expect(screen.getByText('Page A')).toBeInTheDocument()

    await router.navigate('/b')

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)
    expect(screen.getByRole('button', { name: 'Close document panel' })).toBeInTheDocument()
  })

  it('renders just the project crumb on a project-only route', async () => {
    server.use(projectHandler())
    renderShell(`/projects/${PROJECT_ID}`)

    expect(await screen.findByText('Documentary One')).toBeInTheDocument()
    // The lone crumb is the current page, so it's plain text, not a link.
    expect(screen.queryByRole('link', { name: 'Documentary One' })).not.toBeInTheDocument()
  })

  it('renders the full Project > Folder > ... > Video trail on a video route', async () => {
    server.use(projectHandler(), videoHandler())
    renderShell(`/videos/${VIDEO_ID}`)

    const projectLink = await screen.findByRole('link', { name: 'Documentary One' })
    expect(projectLink).toHaveAttribute('href', `/projects/${PROJECT_ID}`)
    expect(screen.getByText('Season 1')).toBeInTheDocument()
    expect(screen.getByText('Interviews')).toBeInTheDocument()
    expect(screen.getByText('Clip.mp4')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Clip.mp4' })).not.toBeInTheDocument()
  })

  it('opens the search palette from the header Search trigger', async () => {
    server.use(projectHandler())
    renderShell(`/projects/${PROJECT_ID}`)
    await screen.findByText('Documentary One')

    await userEvent.click(screen.getByRole('button', { name: /Search/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Search transcripts, speakers, comments…'),
    ).toBeInTheDocument()
  })

  it('opens the search palette with ⌘F from a non-project-URL route (video)', async () => {
    server.use(projectHandler(), videoHandler())
    renderShell(`/videos/${VIDEO_ID}`)
    await screen.findByText('Documentary One')

    await userEvent.keyboard('{Meta>}f{/Meta}')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('disables Search and Ask when no project is in scope', async () => {
    renderShell('/a')

    expect(screen.getByRole('button', { name: /Search/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })

  it('navigates to the chat page via the Ask button', async () => {
    server.use(projectHandler())
    const { router } = renderShell(`/projects/${PROJECT_ID}`)
    await screen.findByText('Documentary One')

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/chat`),
    )
  })

  it('toggles the dark class and persists it across a remount', async () => {
    renderShell('/a')

    await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(useThemeStore.getState().isDark).toBe(true)

    // Simulate a fresh page load, where the DOM starts without `.dark` and
    // the persisted choice hasn't been re-applied yet. `setState` itself
    // would re-persist `false` and defeat the point of this test, so restore
    // the "on-disk" value directly afterward — this is exactly what the
    // persist middleware rehydrates from on a real module init.
    document.documentElement.classList.remove('dark')
    useThemeStore.setState({ isDark: false })
    localStorage.setItem('theme', JSON.stringify({ state: { isDark: true }, version: 0 }))
    await useThemeStore.persist.rehydrate()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(useThemeStore.getState().isDark).toBe(true)
  })
})
