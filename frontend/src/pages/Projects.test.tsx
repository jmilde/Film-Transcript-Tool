import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { server } from '../test/server'
import { Projects } from './Projects'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Projects', () => {
  it('shows the empty state when the API returns no projects', async () => {
    server.use(http.get('http://localhost:8000/projects', () => HttpResponse.json([])))

    renderWithClient(<Projects />)

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
  })

  it('lists projects returned by the API', async () => {
    server.use(
      http.get('http://localhost:8000/projects', () =>
        HttpResponse.json([
          {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Documentary One',
            description: null,
            archived_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    )

    renderWithClient(<Projects />)

    expect(await screen.findByText('Documentary One')).toBeInTheDocument()
  })
})
