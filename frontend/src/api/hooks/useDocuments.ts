import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, unwrap } from '../client'
import type { components } from '../schema'

export type Document = components['schemas']['DocumentRead']
export type DocumentSummary = components['schemas']['DocumentSummary']
export type ClipBlock = components['schemas']['ClipBlockRead']

/** True when a document save failed because someone else edited it since this
 * client last read it (`409 CONFLICT`) — mirrors `isTokenConflict`. */
export function isDocumentConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

/** A project's documents, list-view only (no `content` — keeps this cheap for the panel's switcher). */
export function useDocuments(projectId: string | null) {
  return useQuery({
    queryKey: ['documents', projectId],
    enabled: projectId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/documents', {
          params: { path: { project_id: projectId as string } },
        }),
      ),
  })
}

/** One document with its content, clip blocks resolved fresh. */
export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: ['document', documentId],
    enabled: documentId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/documents/{document_id}', {
          params: { path: { document_id: documentId as string } },
        }),
      ),
  })
}

/** Create a document (`POST /projects/{id}/documents`). */
export function useCreateDocument(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (title: string) =>
      unwrap(
        await api.POST('/projects/{project_id}/documents', {
          params: { path: { project_id: projectId } },
          body: { title },
        }),
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['documents', projectId] }),
  })
}

/** Save a document's title/content (`PATCH /documents/{id}`); a stale `expectedVersion`
 * fails with a 409 the caller can detect via `isDocumentConflict`. */
export function useUpdateDocument(projectId: string, documentId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title?: string
      content?: Document['content']
      expectedVersion: number
    }) =>
      unwrap(
        await api.PATCH('/documents/{document_id}', {
          params: { path: { document_id: documentId } },
          body: {
            title: input.title,
            content: input.content,
            expected_version: input.expectedVersion,
          },
        }),
      ),
    onSuccess: (data) => {
      client.setQueryData(['document', documentId], data)
      void client.invalidateQueries({ queryKey: ['documents', projectId] })
    },
  })
}

/** Delete a document (`DELETE /documents/{id}`). */
export function useDeleteDocument(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (documentId: string) =>
      unwrap(
        await api.DELETE('/documents/{document_id}', {
          params: { path: { document_id: documentId } },
        }),
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['documents', projectId] }),
  })
}

/** Resolve a clip's display fields immediately on insert, without a full document
 * round-trip (`POST /documents/{id}/clip-blocks/resolve`). */
export function useResolveClipBlock(documentId: string) {
  return useMutation({
    mutationFn: async (input: { transcriptId: string; startTokenId: string; endTokenId: string }) =>
      unwrap(
        await api.POST('/documents/{document_id}/clip-blocks/resolve', {
          params: { path: { document_id: documentId } },
          body: {
            transcript_id: input.transcriptId,
            start_token_id: input.startTokenId,
            end_token_id: input.endTokenId,
          },
        }),
      ),
  })
}
