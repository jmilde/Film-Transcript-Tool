import { useMutation } from '@tanstack/react-query'
import { api, unwrap } from '../client'

/** Request a translation of a transcript (`POST /transcripts/{id}/translate`); returns a job id to poll. */
export function useCreateTranslation(transcriptId: string) {
  return useMutation({
    mutationFn: async (targetLanguage: string) =>
      unwrap(
        await api.POST('/transcripts/{transcript_id}/translate', {
          params: { path: { transcript_id: transcriptId } },
          body: { target_language: targetLanguage },
        }),
      ),
  })
}
