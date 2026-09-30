import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { Transcript, Token } from './useTranscripts'

/** Replace any cached token whose id matches one in `tokens` with the
 * authoritative (server-returned) copy — folds a mutation's own response
 * straight into the cache the instant it succeeds, instead of waiting on a
 * separate `invalidateQueries` round-trip. */
function replaceTokens(transcript: Transcript, tokens: Token[]): Transcript {
  if (tokens.length === 0) return transcript
  const byId = new Map(tokens.map((t) => [t.id, t]))
  return {
    ...transcript,
    segments: transcript.segments.map((segment) => ({
      ...segment,
      tokens: segment.tokens.map((token) => byId.get(token.id) ?? token),
    })),
  }
}

/**
 * Applies an edit/delete/merge/split/highlight to the cached transcript
 * immediately (optimistic update). On success, `resultTokens` (when given)
 * folds the server's authoritative token(s) back into the cache right away;
 * `onSettled` still runs a full invalidation afterwards to reconcile any
 * other fields. On error it rolls back the optimistic change.
 */
function useOptimisticTranscriptMutation<TInput, TResult>(
  transcriptId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
  applyOptimistic: (transcript: Transcript, input: TInput) => Transcript,
  options: {
    resultTokens?: (result: TResult) => Token[]
  } = {},
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
    onSuccess: (result) => {
      if (!options.resultTokens) return
      const tokens = options.resultTokens(result)
      client.setQueryData<Transcript>(queryKey, (current) =>
        current ? replaceTokens(current, tokens) : current,
      )
    },
    onError: (_err, _input, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey })
    },
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
    { resultTokens: (result) => [result] },
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
            await api.DELETE('/tokens/{token_id}', {
              params: { path: { token_id: tokenId } },
            }),
          ),
        ),
      ),
    (transcript, input) => {
      const ids = new Set(input.tokenIds)
      return {
        ...transcript,
        segments: transcript.segments.map((segment) => ({
          ...segment,
          tokens: segment.tokens.filter((token) => !ids.has(token.id)),
        })),
      }
    },
  )
}

/** Toggle highlight on one or more tokens (`PATCH /tokens/{id}/highlight`) —
 * a display-only flag, so unlike delete/merge/split it never touches text,
 * timing, or the search vector. */
export function useHighlightTokens(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenIds: string[]; isHighlighted: boolean }, Token[]>(
    transcriptId,
    async (input) =>
      Promise.all(
        input.tokenIds.map(async (tokenId) =>
          unwrap(
            await api.PATCH('/tokens/{token_id}/highlight', {
              params: { path: { token_id: tokenId } },
              body: { is_highlighted: input.isHighlighted },
            }),
          ),
        ),
      ),
    (transcript, input) => {
      const ids = new Set(input.tokenIds)
      return {
        ...transcript,
        segments: transcript.segments.map((segment) => ({
          ...segment,
          tokens: segment.tokens.map((token) =>
            ids.has(token.id) ? { ...token, is_highlighted: input.isHighlighted } : token,
          ),
        })),
      }
    },
    { resultTokens: (result) => result },
  )
}

/** Merge contiguous same-segment tokens into one (`POST /tokens/merge`). */
export function useMergeTokens(transcriptId: string) {
  return useOptimisticTranscriptMutation<{ tokenIds: string[]; text: string }, Token>(
    transcriptId,
    async (input) =>
      unwrap(
        await api.POST('/tokens/merge', {
          body: {
            tokens: input.tokenIds.map((tokenId) => ({ token_id: tokenId })),
            text: input.text,
          },
        }),
      ),
    (transcript, input) => {
      const ids = input.tokenIds
      return {
        ...transcript,
        segments: transcript.segments.map((segment) => {
          const index = segment.tokens.findIndex((token) => ids.includes(token.id))
          if (index === -1) return segment
          const merged = segment.tokens.filter((token) => ids.includes(token.id))
          const kept = segment.tokens.filter((token) => !ids.includes(token.id))
          const placeholder: Token = {
            id: `optimistic-merge-${merged[0].id}`,
            segment_id: segment.id,
            original_text: input.text,
            edited_text: null,
            text: input.text,
            start_time: merged[0].start_time,
            end_time: merged[merged.length - 1].end_time,
            is_highlighted: false,
          }
          const tokens = [...kept]
          tokens.splice(index, 0, placeholder)
          return { ...segment, tokens }
        }),
      }
    },
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
          body: {
            tokens: input.texts.map((text) => ({ text })),
          },
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
          is_highlighted: false,
        }))
        const tokens = [...segment.tokens]
        tokens.splice(index, 1, ...placeholders)
        return { ...segment, tokens }
      }),
    }),
  )
}
