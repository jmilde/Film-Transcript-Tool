import { useRef } from 'react'
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { api, ApiError, unwrap } from '../client'
import type { Transcript, Token } from './useTranscripts'

/** True when a mutation failed because the token(s) were edited by someone
 * else since the client last read them (`409 CONFLICT`). */
export function isTokenConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

/** Replace any cached token whose id matches one in `tokens` with the
 * authoritative (server-returned) copy — used to fold a mutation's own
 * response straight into the cache the instant it succeeds, instead of
 * waiting on a separate `invalidateQueries` round-trip. Without this, the
 * cached `version` for a just-edited token stays stale until that refetch
 * lands; touching the same token again inside that window sends a
 * now-outdated `expected_version` and 409s against the client's own prior
 * request, not a real other editor. */
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
 * folds the server's authoritative token(s) — including their bumped
 * `version` — back into the cache right away; `onSettled` still runs a full
 * invalidation afterwards to reconcile any other fields. On an ordinary error
 * it rolls back the optimistic change.
 *
 * On a 409 version conflict it does neither: the optimistic attempt is left
 * on screen (nothing to roll back to that's more correct than "a refetch is
 * already in flight"), and the caller may render a conflict banner (see
 * `isTokenConflict`) telling the user their change didn't save. But a version
 * conflict means the cached copy was stale *by definition* — so as soon as
 * the background refetch below lands fresh data, the conflict is resolved,
 * and this mutation's error is reset so the banner clears itself. Without
 * this, the error stayed on this mutation object until a manual "Reload"
 * click, which meant one stale conflict kept a banner showing indefinitely
 * across every later, unrelated action for the rest of the session (e.g.
 * still showing "someone else edited" while the user was just adding an
 * unrelated comment).
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
  const mutationRef = useRef<UseMutationResult<TResult, unknown, TInput> | null>(null)
  const mutation = useMutation({
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
    onError: (err, _input, context) => {
      if (!isTokenConflict(err) && context?.previous) {
        client.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: (_data, error) => {
      const refetched = client.invalidateQueries({ queryKey })
      if (isTokenConflict(error)) void refetched.then(() => mutationRef.current?.reset())
    },
  })
  mutationRef.current = mutation
  return mutation
}

/** Edit a single token's displayed text (`PATCH /tokens/{id}`). */
export function useEditToken(transcriptId: string) {
  return useOptimisticTranscriptMutation<
    { tokenId: string; text: string; expectedVersion: number },
    Token
  >(
    transcriptId,
    async (input) =>
      unwrap(
        await api.PATCH('/tokens/{token_id}', {
          params: { path: { token_id: input.tokenId } },
          body: { edited_text: input.text, expected_version: input.expectedVersion },
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
  return useOptimisticTranscriptMutation<
    { tokens: { tokenId: string; expectedVersion: number }[] },
    Token[]
  >(
    transcriptId,
    async (input) =>
      Promise.all(
        input.tokens.map(async ({ tokenId, expectedVersion }) =>
          unwrap(
            await api.DELETE('/tokens/{token_id}', {
              params: {
                path: { token_id: tokenId },
                query: { expected_version: expectedVersion },
              },
            }),
          ),
        ),
      ),
    (transcript, input) => {
      const ids = new Set(input.tokens.map((t) => t.tokenId))
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
 * timing, or the search vector. `TranscriptViewer` deliberately excludes this
 * mutation from the shared conflict banner (see there) — a 409 still
 * auto-resyncs (per `useOptimisticTranscriptMutation`) but never needs to
 * announce itself, since there's no unsaved draft to warn the user about. */
export function useHighlightTokens(transcriptId: string) {
  return useOptimisticTranscriptMutation<
    { tokens: { tokenId: string; expectedVersion: number }[]; isHighlighted: boolean },
    Token[]
  >(
    transcriptId,
    async (input) =>
      Promise.all(
        input.tokens.map(async ({ tokenId, expectedVersion }) =>
          unwrap(
            await api.PATCH('/tokens/{token_id}/highlight', {
              params: { path: { token_id: tokenId } },
              body: { is_highlighted: input.isHighlighted, expected_version: expectedVersion },
            }),
          ),
        ),
      ),
    (transcript, input) => {
      const ids = new Set(input.tokens.map((t) => t.tokenId))
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
  return useOptimisticTranscriptMutation<
    { tokens: { tokenId: string; expectedVersion: number }[]; text: string },
    Token
  >(
    transcriptId,
    async (input) =>
      unwrap(
        await api.POST('/tokens/merge', {
          body: {
            tokens: input.tokens.map((t) => ({
              token_id: t.tokenId,
              expected_version: t.expectedVersion,
            })),
            text: input.text,
          },
        }),
      ),
    (transcript, input) => {
      const ids = input.tokens.map((t) => t.tokenId)
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
            version: 1,
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
  return useOptimisticTranscriptMutation<
    { tokenId: string; expectedVersion: number; texts: string[] },
    Token[]
  >(
    transcriptId,
    async (input) =>
      unwrap(
        await api.POST('/tokens/{token_id}/split', {
          params: { path: { token_id: input.tokenId } },
          body: {
            tokens: input.texts.map((text) => ({ text })),
            expected_version: input.expectedVersion,
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
          version: 1,
          is_highlighted: false,
        }))
        const tokens = [...segment.tokens]
        tokens.splice(index, 1, ...placeholders)
        return { ...segment, tokens }
      }),
    }),
  )
}
