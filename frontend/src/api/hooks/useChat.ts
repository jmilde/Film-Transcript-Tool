import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type ChatMessage = components['schemas']['ChatMessageRead']
export type ChatCitation = components['schemas']['ChatCitation']
export type ChatConversationSummary = components['schemas']['ChatConversationSummary']

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

/**
 * Ask a question over the project's transcripts (`POST /projects/{id}/chat`).
 * Synchronous — no streaming, no job to poll. Invalidating (not manually
 * patching) the conversation's query on success means a reload always reads
 * the full persisted history via the plain `GET`, which never re-runs
 * retrieval — that only happens inside this `POST`.
 */
export function useAskChat(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { question: string; conversationId: string | null }) =>
      unwrap(
        await api.POST('/projects/{project_id}/chat', {
          params: { path: { project_id: projectId } },
          body: { question: input.question, conversation_id: input.conversationId },
        }),
      ),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: chatQueryKey(projectId, data.conversation_id) })
      // A new/continued conversation changes the header's history list (new
      // entry, or an existing one moving to the top of "most recent").
      void client.invalidateQueries({ queryKey: chatHistoryQueryKey(projectId) })
    },
  })
}
