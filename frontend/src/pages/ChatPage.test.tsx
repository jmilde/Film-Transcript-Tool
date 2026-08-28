import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation, useParams } from 'react-router'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { ChatPage } from './ChatPage'

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa'
const CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c1'
const VIDEO_ID = '00000000-0000-0000-0000-0000000000v1'
const CHUNK_ID = '00000000-0000-0000-0000-0000000000ch'
const TRANSCRIPT_ID = '00000000-0000-0000-0000-0000000000t1'
const START_TOKEN_ID = '00000000-0000-0000-0000-0000000000k1'
const END_TOKEN_ID = '00000000-0000-0000-0000-0000000000k2'

function VideoRouteStub() {
  const { videoId } = useParams<{ videoId: string }>()
  const location = useLocation()
  const state = location.state as {
    kind: string
    id: string
    transcriptId: string | null
    startTime: number | null
    endTokenId?: string | null
    returnTo: string
  } | null
  return (
    <div>
      <span>video:{videoId}</span>
      {state && (
        <span>
          via chat: {state.kind}/{state.id}/{state.transcriptId}/{state.startTime}/
          {state.endTokenId}/{state.returnTo}
        </span>
      )}
    </div>
  )
}

interface ConversationSummary {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

function renderChatPage(
  initialPath = `/projects/${PROJECT_ID}/chat`,
  { conversations = [] as ConversationSummary[] } = {},
) {
  // The history menu always fetches the conversation list.
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/chat`, () =>
      HttpResponse.json(conversations),
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/chat', element: <ChatPage /> },
      { path: '/projects/:projectId/chat/:conversationId', element: <ChatPage /> },
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

function citation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    marker: 1,
    chunk_id: CHUNK_ID,
    transcript_id: TRANSCRIPT_ID,
    video_id: VIDEO_ID,
    video_name: 'Interview A',
    segment_id: '00000000-0000-0000-0000-0000000000g1',
    start_token_id: START_TOKEN_ID,
    end_token_id: END_TOKEN_ID,
    start_time: 12.5,
    end_time: 14,
    speaker_name: 'Jordan',
    language: 'en',
    excerpt: 'The keeper lit the lamp at dusk.',
    thumbnail_token: 'thumb.123.sig',
    folder_path: ['Season 1'],
    ...overrides,
  }
}

describe('ChatPage', () => {
  it('asks a question and renders the answer with an interleaved citation card', async () => {
    server.use(
      http.post(`http://localhost:8000/projects/${PROJECT_ID}/chat`, async ({ request }) => {
        const body = (await request.json()) as { question: string; conversation_id: unknown }
        expect(body.question).toBe('What did the keeper do?')
        expect(body.conversation_id).toBeNull()
        return HttpResponse.json({
          conversation_id: CONVERSATION_ID,
          message: {
            id: 'msg-2',
            role: 'assistant',
            content: 'The keeper lit the lamp at dusk [1].',
            citations: [citation()],
            created_at: '2026-01-01T00:00:00Z',
          },
        })
      }),
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`, () =>
        HttpResponse.json([
          {
            id: 'msg-1',
            role: 'user',
            content: 'What did the keeper do?',
            citations: null,
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'The keeper lit the lamp at dusk [1].',
            citations: [citation()],
            created_at: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    )
    const { router } = renderChatPage()

    await userEvent.type(
      screen.getByPlaceholderText("Ask about this project's videos…"),
      'What did the keeper do?',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Interview A')).toBeInTheDocument()
    expect(screen.getByText('The keeper lit the lamp at dusk.')).toBeInTheDocument()
    expect(screen.getByText('Season 1')).toBeInTheDocument()

    // The URL picked up the new conversation id so a reload re-reads instead
    // of re-asking.
    expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`)
  })

  it('clicking a citation navigates to the video with the right nav-state', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`, () =>
        HttpResponse.json([
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'The keeper lit the lamp at dusk [1].',
            citations: [citation()],
            created_at: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    )
    renderChatPage(`/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`)

    await userEvent.click(await screen.findByText('Interview A'))

    expect(await screen.findByText(`video:${VIDEO_ID}`)).toBeInTheDocument()
    expect(
      await screen.findByText(
        `via chat: transcript/${START_TOKEN_ID}/${TRANSCRIPT_ID}/12.5/${END_TOKEN_ID}/` +
          `/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`,
      ),
    ).toBeInTheDocument()
  })

  it('renders an orphan marker as plain text instead of crashing', async () => {
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`, () =>
        HttpResponse.json([
          {
            id: 'msg-2',
            role: 'assistant',
            // The hallucination guard dropped whatever chunk_id [1] pointed to.
            content: 'Something happened [1] at dusk.',
            citations: [],
            created_at: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    )
    renderChatPage(`/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`)

    expect(await screen.findByText('at dusk.', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('[1]', { exact: false })).toBeInTheDocument()
  })

  it('shows the question and a typing indicator immediately, before the answer arrives', async () => {
    server.use(
      http.post(`http://localhost:8000/projects/${PROJECT_ID}/chat`, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderChatPage()

    await userEvent.type(
      screen.getByPlaceholderText("Ask about this project's videos…"),
      'What did the keeper do?',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('What did the keeper do?')).toBeInTheDocument()
    expect(screen.getByLabelText('Assistant is answering')).toBeInTheDocument()
  })

  it('lists past conversations in the history menu and navigates to the one clicked', async () => {
    const OTHER_CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c2'
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/chat/${OTHER_CONVERSATION_ID}`, () =>
        HttpResponse.json([]),
      ),
    )
    renderChatPage(`/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`, {
      conversations: [
        {
          id: CONVERSATION_ID,
          title: 'What did the keeper do?',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: OTHER_CONVERSATION_ID,
          title: 'Who else appears in the footage?',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })

    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('Who else appears in the footage?')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Who else appears in the footage?'))

    // Navigated to the other conversation's route (its GET has no handler
    // registered, so an empty message list renders) — the placeholder text
    // confirms we're not stuck showing the original conversation's messages.
    expect(
      await screen.findByText("Ask a question about this project's videos."),
    ).toBeInTheDocument()
  })

  it('starts a new chat from the history menu', async () => {
    renderChatPage(`/projects/${PROJECT_ID}/chat/${CONVERSATION_ID}`, {
      conversations: [
        {
          id: CONVERSATION_ID,
          title: 'What did the keeper do?',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })

    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    await userEvent.click(screen.getByText('+ New chat'))

    expect(
      await screen.findByText("Ask a question about this project's videos."),
    ).toBeInTheDocument()
  })
})
