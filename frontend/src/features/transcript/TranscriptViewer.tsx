import { useEffect, useMemo, useRef } from 'react'
import { usePlaybackStore } from '../../store/playback'
import { findActiveTokenId } from './activeToken'
import type { Speaker } from '../../api/hooks/useSpeakers'
import type { Transcript } from '../../api/hooks/useTranscripts'

interface TranscriptViewerProps {
  transcript: Transcript | undefined
  speakers: Speaker[] | undefined
  isLoading: boolean
  onSeekToken: (seconds: number) => void
}

/**
 * Renders a transcript's segments/speakers/tokens, highlighting the token
 * matching the current playback time and (when auto-follow is on) scrolling
 * it into view. Clicking a token seeks the video there.
 */
export function TranscriptViewer({
  transcript,
  speakers,
  isLoading,
  onSeekToken,
}: TranscriptViewerProps) {
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const autoFollow = usePlaybackStore((s) => s.autoFollow)
  const setAutoFollow = usePlaybackStore((s) => s.setAutoFollow)

  const speakerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const speaker of speakers ?? []) {
      map.set(speaker.id, speaker.name ?? 'Unknown speaker')
    }
    return map
  }, [speakers])

  const activeTokenId = useMemo(
    () => (transcript ? findActiveTokenId(transcript.segments, currentTime) : null),
    [transcript, currentTime],
  )

  const activeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (autoFollow) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeTokenId, autoFollow])

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading transcript…</div>
  }

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">No transcript available yet.</div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-slate-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => setAutoFollow(e.target.checked)}
          />
          Auto-follow
        </label>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {transcript.segments.map((segment) => (
          <div key={segment.id}>
            <div className="mb-1 text-xs font-semibold text-slate-500">
              {segment.speaker_id
                ? (speakerNames.get(segment.speaker_id) ?? 'Unknown speaker')
                : 'Unknown speaker'}
            </div>
            <p className="leading-relaxed text-slate-800">
              {segment.tokens.map((token) => (
                <span
                  key={token.id}
                  ref={token.id === activeTokenId ? activeRef : undefined}
                  onClick={() => onSeekToken(token.start_time)}
                  className={
                    token.id === activeTokenId
                      ? 'cursor-pointer rounded bg-amber-200 px-0.5'
                      : 'cursor-pointer rounded px-0.5 hover:bg-slate-100'
                  }
                >
                  {token.text}{' '}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
