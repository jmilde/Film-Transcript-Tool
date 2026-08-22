import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { MembersPanel } from './MembersPanel'
import { server } from '../../test/server'
import type { Member, MembershipRole } from '../../api/hooks/useMembers'

const PROJECT_ID = 'project-1'

const OWNER: Member = {
  user_id: 'user-owner',
  email: 'owner@example.com',
  display_name: 'Owner Person',
  role: 'owner',
}
const EDITOR: Member = {
  user_id: 'user-editor',
  email: 'editor@example.com',
  display_name: null,
  role: 'editor',
}

function renderPanel(myRole: MembershipRole = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MembersPanel projectId={PROJECT_ID} myRole={myRole} />
    </QueryClientProvider>,
  )
}

function mockMembers(members: Member[]) {
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/members`, () =>
      HttpResponse.json(members),
    ),
  )
}

describe('MembersPanel', () => {
  it('lists members with their roles', async () => {
    mockMembers([OWNER, EDITOR])
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))

    expect(await screen.findByText('owner@example.com')).toBeInTheDocument()
    // Editor has no display_name, so its email appears twice (name + email rows).
    expect(screen.getAllByText('editor@example.com')).toHaveLength(2)
  })

  it('lets an owner invite an existing user', async () => {
    mockMembers([OWNER])
    let body: unknown
    server.use(
      http.post(`http://localhost:8000/projects/${PROJECT_ID}/members`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          user_id: 'user-new',
          email: 'new@example.com',
          display_name: null,
          role: 'viewer',
        })
      }),
    )
    renderPanel('owner')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))
    await screen.findByText('owner@example.com')
    await userEvent.type(screen.getByLabelText('Email to invite'), 'new@example.com')
    await userEvent.selectOptions(screen.getByLabelText('Role to invite as'), 'viewer')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() => expect(body).toEqual({ email: 'new@example.com', role: 'viewer' }))
  })

  it('surfaces the unknown-email error from an invite', async () => {
    mockMembers([OWNER])
    server.use(
      http.post(`http://localhost:8000/projects/${PROJECT_ID}/members`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'No user found for this email; they must sign in at least once first',
            },
          },
          { status: 404 },
        ),
      ),
    )
    renderPanel('owner')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))
    await screen.findByText('owner@example.com')
    await userEvent.type(screen.getByLabelText('Email to invite'), 'ghost@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    expect(
      await screen.findByText(
        'No user found for this email; they must sign in at least once first',
      ),
    ).toBeInTheDocument()
  })

  it('lets an owner change a member role', async () => {
    mockMembers([OWNER, EDITOR])
    let body: unknown
    server.use(
      http.patch(
        `http://localhost:8000/projects/${PROJECT_ID}/members/${EDITOR.user_id}`,
        async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ ...EDITOR, role: 'viewer' })
        },
      ),
    )
    renderPanel('owner')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))
    const roleSelect = await screen.findByLabelText(`Role for ${EDITOR.email}`)
    await userEvent.selectOptions(roleSelect, 'viewer')

    await waitFor(() => expect(body).toEqual({ role: 'viewer' }))
  })

  it('lets an owner remove a member', async () => {
    mockMembers([OWNER, EDITOR])
    let removed = false
    server.use(
      http.delete(`http://localhost:8000/projects/${PROJECT_ID}/members/${EDITOR.user_id}`, () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPanel('owner')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))
    const removeButton = await screen.findByRole('button', { name: `Remove ${EDITOR.email}` })
    await userEvent.click(removeButton)

    await waitFor(() => expect(removed).toBe(true))
  })

  it('surfaces the last-owner-guard error from removing a member', async () => {
    mockMembers([OWNER])
    server.use(
      http.delete(`http://localhost:8000/projects/${PROJECT_ID}/members/${OWNER.user_id}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'LAST_OWNER',
              message: 'A project must always retain at least one owner',
            },
          },
          { status: 400 },
        ),
      ),
    )
    renderPanel('owner')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))
    await screen.findByText('owner@example.com')
    await userEvent.click(screen.getByRole('button', { name: `Remove ${OWNER.email}` }))

    expect(
      await screen.findByText('A project must always retain at least one owner'),
    ).toBeInTheDocument()
  })

  it('shows a read-only list for a non-owner, with no invite form or role/remove controls', async () => {
    mockMembers([OWNER, EDITOR])
    renderPanel('editor')

    await userEvent.click(screen.getByRole('button', { name: 'Members' }))

    await screen.findByText('owner@example.com')
    expect(screen.queryByLabelText('Email to invite')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`Role for ${OWNER.email}`)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Remove ${OWNER.email}` })).not.toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })
})
