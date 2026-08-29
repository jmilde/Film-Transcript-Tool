import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  documentAnchor,
  transcriptAnchor,
  useCreateDocumentComment,
  useDocumentComments,
} from './useComments'
import { server } from '../../test/server'
import type { Comment } from './useComments'
import type { ReactNode } from 'react'

const DOCUMENT_ID = 'd-1'

const TRANSCRIPT_COMMENT: Comment = {
  id: 'c-1',
  created_by: 'user-a',
  text: 'Check this',
  resolved: false,
  anchor: {
    kind: 'transcript',
    transcript_id: 't-1',
    start_token_id: 'tok-a',
    end_token_id: 'tok-b',
    in_time: 0,
    out_time: 1,
  },
  created_at: '2026-01-01T00:00:00Z',
  replies: [],
}

const DOCUMENT_COMMENT: Comment = {
  id: 'c-2',
  created_by: 'user-a',
  text: 'Nice clip',
  resolved: false,
  anchor: {
    kind: 'document',
    document_id: DOCUMENT_ID,
    clip_node_id: 'node-1',
    excerpt: 'Hello there.',
  },
  created_at: '2026-01-01T00:00:00Z',
  replies: [],
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('transcriptAnchor / documentAnchor', () => {
  it('narrows to the matching anchor kind and returns null otherwise', () => {
    expect(transcriptAnchor(TRANSCRIPT_COMMENT)?.transcript_id).toBe('t-1')
    expect(transcriptAnchor(DOCUMENT_COMMENT)).toBeNull()
    expect(documentAnchor(DOCUMENT_COMMENT)?.clip_node_id).toBe('node-1')
    expect(documentAnchor(TRANSCRIPT_COMMENT)).toBeNull()
  })
})

describe('useDocumentComments', () => {
  it('fetches comments anchored to a document', async () => {
    server.use(
      http.get('http://localhost:8000/documents/d-1/comments', () =>
        HttpResponse.json([DOCUMENT_COMMENT]),
      ),
    )

    const { result } = renderHook(() => useDocumentComments(DOCUMENT_ID), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([DOCUMENT_COMMENT]))
  })
})

describe('useCreateDocumentComment', () => {
  it('posts clip_node_id and text, then invalidates the document comments query', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost:8000/documents/d-1/comments', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(DOCUMENT_COMMENT)
      }),
    )

    const { result } = renderHook(() => useCreateDocumentComment(DOCUMENT_ID), { wrapper })
    result.current.mutate({ clipNodeId: 'node-1', text: 'Nice clip' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(body).toEqual({ clip_node_id: 'node-1', text: 'Nice clip' })
  })
})
