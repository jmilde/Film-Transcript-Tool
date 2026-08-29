import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Comment = components['schemas']['CommentRead']
export type TranscriptCommentAnchor = components['schemas']['TranscriptCommentAnchor']
export type DocumentCommentAnchor = components['schemas']['DocumentCommentAnchorRead']

/** Narrows a comment's polymorphic anchor to its transcript-range case. */
export function transcriptAnchor(comment: Comment): TranscriptCommentAnchor | null {
  return comment.anchor.kind === 'transcript' ? comment.anchor : null
}

/** Narrows a comment's polymorphic anchor to its document case. */
export function documentAnchor(comment: Comment): DocumentCommentAnchor | null {
  return comment.anchor.kind === 'document' ? comment.anchor : null
}

/** All comment threads (with replies) anchored to ranges in a transcript. */
export function useComments(transcriptId: string | null) {
  return useQuery({
    queryKey: ['comments', transcriptId],
    enabled: transcriptId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/transcripts/{transcript_id}/comments', {
          params: { path: { transcript_id: transcriptId as string } },
        }),
      ),
  })
}

function useInvalidateComments(transcriptId: string) {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: ['comments', transcriptId] })
}

/** Create a comment thread anchored to a token range (`POST /transcripts/{id}/comments`). */
export function useCreateComment(transcriptId: string) {
  const invalidate = useInvalidateComments(transcriptId)
  return useMutation({
    mutationFn: async (input: { startTokenId: string; endTokenId: string; text: string }) =>
      unwrap(
        await api.POST('/transcripts/{transcript_id}/comments', {
          params: { path: { transcript_id: transcriptId } },
          body: {
            start_token_id: input.startTokenId,
            end_token_id: input.endTokenId,
            text: input.text,
          },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** Reply to a comment thread (`POST /comments/{id}/replies`). */
export function useReplyToComment(transcriptId: string) {
  const invalidate = useInvalidateComments(transcriptId)
  return useMutation({
    mutationFn: async (input: { commentId: string; text: string }) =>
      unwrap(
        await api.POST('/comments/{comment_id}/replies', {
          params: { path: { comment_id: input.commentId } },
          body: { text: input.text },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** Resolve or reopen a comment thread (`PATCH /comments/{id}`). */
export function useResolveComment(transcriptId: string) {
  const invalidate = useInvalidateComments(transcriptId)
  return useMutation({
    mutationFn: async (input: { commentId: string; resolved: boolean }) =>
      unwrap(
        await api.PATCH('/comments/{comment_id}', {
          params: { path: { comment_id: input.commentId } },
          body: { resolved: input.resolved },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** All comment threads (with replies) anchored to a document. */
export function useDocumentComments(documentId: string | null) {
  return useQuery({
    queryKey: ['comments', 'document', documentId],
    enabled: documentId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/documents/{document_id}/comments', {
          params: { path: { document_id: documentId as string } },
        }),
      ),
  })
}

/** Create a comment anchored to a document (`POST /documents/{id}/comments`). */
export function useCreateDocumentComment(documentId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { clipNodeId?: string | null; text: string }) =>
      unwrap(
        await api.POST('/documents/{document_id}/comments', {
          params: { path: { document_id: documentId } },
          body: { clip_node_id: input.clipNodeId ?? null, text: input.text },
        }),
      ),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['comments', 'document', documentId] }),
  })
}
