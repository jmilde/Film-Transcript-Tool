import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { Transcript, Token } from './useTranscripts'

/**
 * Applies an edit/delete/merge/split to the cached transcript immediately
 * (optimistic update), rolling back on error; the mutation is always
 * reconciled with the server response via an invalidation once it settles.
 */
function useOptimisticTranscriptMutation<TInput, TResult>(
  transcriptId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
  applyOptimistic: (transcript: Transcript, input: TInput) => Transcript,
) {
  const client = useQueryClient()
  const queryKey = ['transcript', transcriptId]
  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      await client.cancelQueries({ queryKey })
      const previous = client.getQueryData<Transcript>(queryKey)
      if (previous) client.setQueryData<Transcript>(queryKey, applyOptimistic(previous, input))
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous)
    },
    onSettled: () => void client.invalidateQueries({ queryKey }),
  })
}

/** Edit a single token's displayed text (`PATCH /tokens/{id}`). */
export function useEditToken(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenId: string; text: string }, Token>(
    transcriptId,
    async (input) =>
      unwrap(
        await api.PATCH('/tokens/{token_id}', {
          params: { path: { token_id: input.tokenId } },
          body: { edited_text: input.text },
        }),
      ),
    (transcript, input) => ({
      ...transcript,
      segments: transcript.segments.map((segment) => ({
        ...segment,
        tokens: segment.tokens.map((token) =>
          token.id === input.tokenId
            ? { ...token, edited_text: input.text, text: input.text }
            : token,
        ),
      })),
    }),
  )
}

/** Soft-delete one or more tokens (`DELETE /tokens/{id}`); deleted tokens drop out of the transcript. */
export function useDeleteTokens(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenIds: string[] }, Token[]>(
    transcriptId,
    async (input) =>
      Promise.all(
        input.tokenIds.map(async (tokenId) =>
          unwrap(
            await api.DELETE('/tokens/{token_id}', { params: { path: { token_id: tokenId } } }),
          ),
        ),
      ),
    (transcript, input) => ({
      ...transcript,
      segments: transcript.segments.map((segment) => ({
        ...segment,
        tokens: segment.tokens.filter((token) => !input.tokenIds.includes(token.id)),
      })),
    }),
  )
}

/** Merge contiguous same-segment tokens into one (`POST /tokens/merge`). */
export function useMergeTokens(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenIds: string[]; text: string }, Token>(
    transcriptId,
    async (input) =>
      unwrap(
        await api.POST('/tokens/merge', { body: { token_ids: input.tokenIds, text: input.text } }),
      ),
    (transcript, input) => ({
      ...transcript,
      segments: transcript.segments.map((segment) => {
        const index = segment.tokens.findIndex((token) => input.tokenIds.includes(token.id))
        if (index === -1) return segment
        const merged = segment.tokens.filter((token) => input.tokenIds.includes(token.id))
        const kept = segment.tokens.filter((token) => !input.tokenIds.includes(token.id))
        const placeholder: Token = {
          id: `optimistic-merge-${merged[0].id}`,
          segment_id: segment.id,
          original_text: input.text,
          edited_text: null,
          text: input.text,
          start_time: merged[0].start_time,
          end_time: merged[merged.length - 1].end_time,
        }
        const tokens = [...kept]
        tokens.splice(index, 0, placeholder)
        return { ...segment, tokens }
      }),
    }),
  )
}

/** Split one token into several (`POST /tokens/{id}/split`). */
export function useSplitToken(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenId: string; texts: string[] }, Token[]>(
    transcriptId,
    async (input) =>
      unwrap(
        await api.POST('/tokens/{token_id}/split', {
          params: { path: { token_id: input.tokenId } },
          body: { tokens: input.texts.map((text) => ({ text })) },
        }),
      ),
    (transcript, input) => ({
      ...transcript,
      segments: transcript.segments.map((segment) => {
        const index = segment.tokens.findIndex((token) => token.id === input.tokenId)
        if (index === -1) return segment
        const token = segment.tokens[index]
        const span = token.end_time - token.start_time
        const count = input.texts.length
        const placeholders: Token[] = input.texts.map((text, i) => ({
          id: `optimistic-split-${input.tokenId}-${i}`,
          segment_id: segment.id,
          original_text: text,
          edited_text: null,
          text,
          start_time: token.start_time + (span * i) / count,
          end_time: token.start_time + (span * (i + 1)) / count,
        }))
        const tokens = [...segment.tokens]
        tokens.splice(index, 1, ...placeholders)
        return { ...segment, tokens }
      }),
    }),
  )
}
