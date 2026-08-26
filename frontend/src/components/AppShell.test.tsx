import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { AuthProvider } from '../auth/AuthProvider'
import { useDocumentPanelStore } from '../store/documentPanel'
import { server } from '../test/server'

const PROJECT_ID = 'p-1'

function PageA() {
  return <div>Page A</div>
}
function PageB() {
  return <div>Page B</div>
}

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    activeDocumentId: null,
    pendingInsert: null,
  })
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () => HttpResponse.json([])),
  )
})

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: 'a', element: <PageA /> },
          { path: 'b', element: <PageB /> },
        ],
      },
    ],
    { initialEntries: ['/a'] },
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
})
