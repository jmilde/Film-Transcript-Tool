import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, unwrap } from '../client'
import type { components } from '../schema'
import { API_URL } from '../../env'
import { supabase } from '../../auth/supabase'

export type ChatMessage = components['schemas']['ChatMessageRead']
export type ChatCitation = components['schemas']['ChatCitation']
export type ChatConversationSummary = components['schemas']['ChatConversationSummary']

interface ChatStreamStatus {
  type: 'status'
  message: string
}

interface ChatStreamDone {
  type: 'done'
  conversation_id: string
  message: ChatMessage
}

interface ChatStreamError {
  type: 'error'
  message: string
}

type ChatStreamEvent = ChatStreamStatus | ChatStreamDone | ChatStreamError

function chatQueryKey(projectId: string, conversationId: string) {
  return ['chat', projectId, conversationId] as const
}

function chatHistoryQueryKey(projectId: string) {
  return ['chat-history', projectId] as const
}

/** A project's chat history for the header's conversation list, most recent first. */
export function useChatConversations(projectId: string) {
  return useQuery({
    queryKey: chatHistoryQueryKey(projectId),
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/chat', {
          params: { path: { project_id: projectId } },
        }),
      ),
  })
}

/** A conversation's full message history, in order (for reload — no re-ask). */
export function useChatConversation(projectId: string, conversationId: string | null) {
  return useQuery({
    queryKey: chatQueryKey(projectId, conversationId ?? ''),
    enabled: conversationId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/chat/{conversation_id}', {
          params: { path: { project_id: projectId, conversation_id: conversationId as string } },
        }),
      ),
  })
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => undefined)) as
    { error?: { code?: string; message?: string } } | undefined
  return new ApiError(
    response.status,
    body?.error?.message ?? 'Request failed',
    body?.error?.code,
    body?.error,
  )
}

/**
 * Ask a question over the project's transcripts (`POST /projects/{id}/chat`).
 *
 * The response is server-sent events, not a single JSON body, so this goes
 * around the typed `api` client (built for request/response JSON) and reads
 * the stream directly. `status` events update `statusMessage` as the agent
 * searches; the mutation resolves once the terminal `done` event arrives.
 * Invalidating (not manually patching) the conversation's query on success
 * means a reload always reads the full persisted history via the plain
 * `GET`, which never re-runs retrieval — that only happens inside this `POST`.
 */
export function useAskChat(projectId: string) {
  const client = useQueryClient()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (input: {
      question: string
      conversationId: string | null
    }): Promise<ChatStreamDone> => {
      setStatusMessage(null)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const response = await fetch(`${API_URL}/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: input.question,
          conversation_id: input.conversationId,
        }),
      })
      if (!response.ok) {
        throw await parseErrorResponse(response)
      }
      if (!response.body) {
        throw new ApiError(response.status, 'Empty response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let terminal: ChatStreamDone | null = null

      while (true) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })

        let separatorIndex: number
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          if (!rawEvent.startsWith('data: ')) continue

          const event = JSON.parse(rawEvent.slice('data: '.length)) as ChatStreamEvent
          if (event.type === 'status') {
            setStatusMessage(event.message)
          } else if (event.type === 'error') {
            throw new ApiError(response.status, event.message)
          } else {
            terminal = event
          }
        }
      }

      if (!terminal) {
        throw new ApiError(response.status, 'Chat stream ended without a response')
      }
      return terminal
    },
    onSuccess: (data) => {
      setStatusMessage(null)
      void client.invalidateQueries({ queryKey: chatQueryKey(projectId, data.conversation_id) })
      // A new/continued conversation changes the header's history list (new
      // entry, or an existing one moving to the top of "most recent").
      void client.invalidateQueries({ queryKey: chatHistoryQueryKey(projectId) })
    },
    onError: () => setStatusMessage(null),
  })

  return { ...mutation, statusMessage }
}
