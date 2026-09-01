import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { server } from '../test/server'
import { Projects } from './Projects'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/projects/:projectId" element={<div>Project page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const PROJECT = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Documentary One',
  description: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  my_role: 'owner',
  video_count: 3,
  member_count: 2,
  document_count: 1,
}

describe('Projects', () => {
  it('shows the empty state when the API returns no projects', async () => {
    server.use(http.get('http://localhost:8000/projects', () => HttpResponse.json([])))

    renderWithClient(<Projects />)

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
  })

  it('lists projects with their stats', async () => {
    server.use(http.get('http://localhost:8000/projects', () => HttpResponse.json([PROJECT])))

    renderWithClient(<Projects />)

    expect(await screen.findByText('Documentary One')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('navigates to the project when the card is clicked anywhere', async () => {
    server.use(http.get('http://localhost:8000/projects', () => HttpResponse.json([PROJECT])))
    const user = userEvent.setup()

    renderWithClient(<Projects />)

    await user.click(await screen.findByText('Documentary One'))
    expect(await screen.findByText('Project page')).toBeInTheDocument()
  })

  it('creates a project via the New project dialog', async () => {
    server.use(
      http.get('http://localhost:8000/projects', () => HttpResponse.json([])),
      http.post('http://localhost:8000/projects', () =>
        HttpResponse.json(PROJECT, { status: 201 }),
      ),
    )
    const user = userEvent.setup()

    renderWithClient(<Projects />)

    await user.click(await screen.findByRole('button', { name: /new project/i }))
    await screen.findByRole('dialog')
    await user.type(screen.getByRole('textbox', { name: /project name/i }), 'Documentary One')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
