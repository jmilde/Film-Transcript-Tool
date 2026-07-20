import { useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useVideo } from '../api/hooks/useVideos'
import { proxyUrl, useMediaToken, useWaveform } from '../api/hooks/useMedia'
import { useSpeakers } from '../api/hooks/useSpeakers'
import { useTranscript, useTranscripts } from '../api/hooks/useTranscripts'
import { usePlaybackStore } from '../store/playback'
import { VideoPlayer } from '../features/player/VideoPlayer'
import { Waveform } from '../features/player/Waveform'
import { TranscriptViewer } from '../features/transcript/TranscriptViewer'

export function VideoWorkspace() {
  const { videoId } = useParams<{ videoId: string }>()
  if (!videoId) return null
  return <VideoWorkspaceInner key={videoId} videoId={videoId} />
}

function VideoWorkspaceInner({ videoId }: { videoId: string }) {
  const { data: video } = useVideo(videoId)
  const { data: media } = useMediaToken(videoId)
  const waveform = useWaveform(videoId)
  const { data: transcripts } = useTranscripts(videoId)
  const { data: speakers } = useSpeakers(videoId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resetPlayback = usePlaybackStore((s) => s.reset)
  const currentTime = usePlaybackStore((s) => s.currentTime)

  // Reset playback state when switching videos.
  useEffect(() => resetPlayback, [videoId, resetPlayback])

  // Pauses playback once it reaches the end of a "play selection" request.
  const selectionEndRef = useRef<number | null>(null)
  useEffect(() => {
    if (selectionEndRef.current !== null && currentTime >= selectionEndRef.current) {
      videoRef.current?.pause()
      selectionEndRef.current = null
    }
  }, [currentTime])

  // F3 shows the original transcript; dual original/translation view is F8.
  const transcriptId = useMemo(() => {
    if (!transcripts || transcripts.length === 0) return null
    return (transcripts.find((t) => t.type === 'original') ?? transcripts[0]).id
  }, [transcripts])
  const { data: transcript, isLoading: transcriptLoading } = useTranscript(transcriptId)

  function seek(seconds: number) {
    if (videoRef.current) videoRef.current.currentTime = seconds
  }

  function playSelection(startTime: number, endTime: number) {
    if (!videoRef.current) return
    videoRef.current.currentTime = startTime
    selectionEndRef.current = endTime
    void videoRef.current.play()
  }

  const src = media ? proxyUrl(videoId, media.token) : undefined

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Projects
        </Link>
        <h2 className="truncate text-lg font-semibold text-slate-800">{video?.name ?? 'Video'}</h2>
      </div>

      {/* Numeric sizes are pixels in v4; strings without units are percentages. */}
      <Group
        orientation="horizontal"
        className="flex-1 overflow-hidden rounded-lg border border-slate-200"
      >
        <Panel defaultSize="55" minSize="30" className="bg-white">
          <TranscriptViewer
            transcript={transcript}
            speakers={speakers}
            isLoading={transcriptId !== null && transcriptLoading}
            onSeekToken={seek}
            onPlaySelection={playSelection}
          />
        </Panel>
        <Separator className="w-1.5 bg-slate-200 transition-colors hover:bg-slate-300" />
        <Panel defaultSize="45" minSize="25">
          <div className="space-y-3 p-4">
            {src ? (
              <VideoPlayer src={src} videoRef={videoRef} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded bg-slate-100 text-sm text-slate-400">
                Loading player…
              </div>
            )}
            {waveform.data && <Waveform peaks={waveform.data.peaks} onSeek={seek} />}
          </div>
        </Panel>
      </Group>
    </div>
  )
}
