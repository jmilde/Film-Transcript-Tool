import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useVideo } from '../api/hooks/useVideos'
import { useProject } from '../api/hooks/useProjects'
import { proxyUrl, useMediaToken, useWaveform } from '../api/hooks/useMedia'
import { useSpeakers } from '../api/hooks/useSpeakers'
import { useTranscript, useTranscripts } from '../api/hooks/useTranscripts'
import { useComments } from '../api/hooks/useComments'
import { usePlaybackStore } from '../store/playback'
import { useSelectionStore } from '../store/selection'
import { useDocumentPanelStore } from '../store/documentPanel'
import { VideoPlayer } from '../features/player/VideoPlayer'
import { Waveform } from '../features/player/Waveform'
import { TranscriptViewer } from '../features/transcript/TranscriptViewer'
import { CommentsPanel } from '../features/comments/CommentsPanel'
import { TranslationControl } from '../features/translation/TranslationControl'
import { ExportControl } from '../features/export/ExportControl'
import { CloseIcon } from '../components/icons'
import type { PendingSearchNav } from '../features/search/types'

export function VideoWorkspace() {
  const { videoId } = useParams<{ videoId: string }>()
  if (!videoId) return null
  return <VideoWorkspaceInner key={videoId} videoId={videoId} />
}

function VideoWorkspaceInner({ videoId }: { videoId: string }) {
  const { data: video, isError: videoError } = useVideo(videoId)
  const { data: project } = useProject(video?.project_id)
  // Viewers can watch/read but not edit; default to false until the
  // project's role is known so edit controls don't flash on then off.
  const canEdit = project ? project.my_role !== 'viewer' : false
  const { data: media } = useMediaToken(videoId)
  const waveform = useWaveform(videoId)
  const { data: transcripts } = useTranscripts(videoId)
  const { data: speakers } = useSpeakers(videoId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resetPlayback = usePlaybackStore((s) => s.reset)
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const setSelectionRange = useSelectionStore((s) => s.setRange)

  // Set via navigate(..., { state }) when arriving from a search hit
  // (SearchPage). Applied once below, after the transcript/comments it
  // targets have loaded.
  const location = useLocation()
  const pendingSearch = location.state as PendingSearchNav | null
  const appliedSearchRef = useRef(false)

  // Reset playback state when switching videos.
  useEffect(() => resetPlayback, [videoId, resetPlayback])

  const setActiveProject = useDocumentPanelStore((s) => s.setActiveProject)
  useEffect(() => {
    if (project) setActiveProject(project.id)
  }, [project, setActiveProject])

  // Pauses playback once it reaches the end of a "play selection" request.
  const selectionEndRef = useRef<number | null>(null)
  useEffect(() => {
    if (selectionEndRef.current !== null && currentTime >= selectionEndRef.current) {
      videoRef.current?.pause()
      selectionEndRef.current = null
    }
  }, [currentTime])

  // The left pane always shows the original transcript.
  const transcriptId = useMemo(() => {
    if (!transcripts || transcripts.length === 0) return null
    return (transcripts.find((t) => t.type === 'original') ?? transcripts[0]).id
  }, [transcripts])
  const { data: transcript, isLoading: transcriptLoading } = useTranscript(transcriptId)
  const { data: comments, isLoading: commentsLoading } = useComments(transcriptId)

  // Optional right pane: a translation, chosen via TranslationControl (docs
  // §11 dual transcript view). Cleared if the video changes underneath it.
  const [secondTranscriptId, setSecondTranscriptId] = useState<string | null>(null)
  const { data: secondTranscript, isLoading: secondTranscriptLoading } =
    useTranscript(secondTranscriptId)
  const { data: secondComments } = useComments(secondTranscriptId)

  // Space toggles play/pause (docs §16), unless the user is typing or
  // interacting with a control that already uses Space itself (buttons,
  // checkboxes, text inputs).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      if (target?.isContentEditable) return
      e.preventDefault()
      const el = videoRef.current
      if (!el) return
      if (el.paused) void el.play()
      else el.pause()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function seek(seconds: number) {
    if (videoRef.current) videoRef.current.currentTime = seconds
  }

  function playSelection(startTime: number, endTime: number) {
    if (!videoRef.current) return
    videoRef.current.currentTime = startTime
    selectionEndRef.current = endTime
    void videoRef.current.play()
  }

  // Lets the document panel reuse this page's own player for a clip from
  // this video, instead of spawning a second one (see store/playback.ts).
  // `playSelection` only closes over refs, so capturing it once per video
  // (rather than re-setting every render) is safe — it always reads the
  // current ref values regardless of which render's closure gets stored.
  const setActiveVideo = usePlaybackStore((s) => s.setActiveVideo)
  useEffect(() => {
    setActiveVideo(videoId, playSelection)
    return () => setActiveVideo(null, null)
  }, [videoId, setActiveVideo])

  // Applies a pending search-result navigation: seek to it and highlight its
  // range. Transcript-kind results carry their own token id/time directly;
  // comment-kind results only carry the comment id, so its anchor range is
  // looked up from the loaded comments once they arrive. Speaker-kind results
  // have no timecode or range — arriving at the video is enough.
  useEffect(() => {
    if (!pendingSearch || appliedSearchRef.current) return
    if (
      pendingSearch.kind === 'transcript' &&
      pendingSearch.transcriptId &&
      pendingSearch.startTime !== null
    ) {
      appliedSearchRef.current = true
      seek(pendingSearch.startTime)
      setSelectionRange(
        pendingSearch.transcriptId,
        pendingSearch.id,
        pendingSearch.endTokenId ?? pendingSearch.id,
      )
    } else if (pendingSearch.kind === 'comment' && comments) {
      const comment = comments.find((c) => c.id === pendingSearch.id)
      if (comment) {
        appliedSearchRef.current = true
        seek(comment.in_time)
        setSelectionRange(comment.transcript_id, comment.start_token_id, comment.end_token_id)
      }
    } else if (pendingSearch.kind === 'speaker') {
      appliedSearchRef.current = true
    }
  }, [pendingSearch, comments, setSelectionRange])

  const src = media ? proxyUrl(videoId, media.token) : undefined

  if (videoError) {
    return (
      <div className="space-y-3">
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Projects
        </Link>
        <p className="text-red-600">Could not load this video.</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link
          to={video ? `/projects/${video.project_id}` : '/'}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Projects
        </Link>
        {pendingSearch?.returnTo && (
          <Link to={pendingSearch.returnTo} className="text-sm text-slate-500 hover:underline">
            ← Back
          </Link>
        )}
        <h2 className="truncate text-lg font-semibold text-slate-800">{video?.name ?? 'Video'}</h2>
        <div className="ml-auto flex items-center gap-2">
          <TranslationControl
            videoId={videoId}
            originalTranscriptId={transcriptId}
            transcripts={transcripts}
            secondTranscriptId={secondTranscriptId}
            onSelectSecond={setSecondTranscriptId}
          />
          <ExportControl
            videoName={video?.name}
            transcripts={transcripts}
            defaultTranscriptId={transcriptId}
          />
        </div>
      </div>

      {/* Numeric sizes are pixels in v4; strings without units are percentages. */}
      <Group
        orientation="horizontal"
        className="flex-1 overflow-hidden rounded-lg border border-slate-200"
      >
        <Panel defaultSize="55" minSize="30" className="bg-white">
          {secondTranscriptId ? (
            <Group orientation="horizontal" className="h-full">
              <Panel defaultSize="50" minSize="20" className="flex h-full flex-col">
                <div className="border-b border-slate-100 px-4 py-1.5 text-xs font-medium text-slate-400">
                  Original
                </div>
                <div className="min-h-0 flex-1">
                  <TranscriptViewer
                    transcript={transcript}
                    speakers={speakers}
                    comments={comments}
                    isLoading={transcriptId !== null && transcriptLoading}
                    onSeekToken={seek}
                    onPlaySelection={playSelection}
                    canEdit={canEdit}
                    videoId={videoId}
                  />
                </div>
              </Panel>
              <Separator className="w-1.5 bg-slate-200 transition-colors hover:bg-slate-300" />
              <Panel defaultSize="50" minSize="20" className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-1.5 text-xs font-medium text-slate-400">
                  Translation ({secondTranscript?.language ?? '…'})
                  <button
                    type="button"
                    aria-label="Close translation"
                    title="Close translation"
                    onClick={() => setSecondTranscriptId(null)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <TranscriptViewer
                    transcript={secondTranscript}
                    speakers={speakers}
                    comments={secondComments}
                    isLoading={secondTranscriptLoading}
                    onSeekToken={seek}
                    onPlaySelection={playSelection}
                    canEdit={canEdit}
                    videoId={videoId}
                  />
                </div>
              </Panel>
            </Group>
          ) : (
            <TranscriptViewer
              transcript={transcript}
              speakers={speakers}
              comments={comments}
              isLoading={transcriptId !== null && transcriptLoading}
              onSeekToken={seek}
              onPlaySelection={playSelection}
              canEdit={canEdit}
              videoId={videoId}
            />
          )}
        </Panel>
        <Separator className="w-1.5 bg-slate-200 transition-colors hover:bg-slate-300" />
        <Panel defaultSize="45" minSize="25">
          <div className="h-full space-y-3 overflow-y-auto p-4">
            {src ? (
              <VideoPlayer src={src} videoRef={videoRef} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded bg-slate-100 text-sm text-slate-400">
                Loading player…
              </div>
            )}
            {waveform.data && <Waveform peaks={waveform.data.peaks} onSeek={seek} />}
            <CommentsPanel
              transcriptId={transcriptId}
              comments={comments}
              isLoading={transcriptId !== null && commentsLoading}
              onLocate={seek}
            />
          </div>
        </Panel>
      </Group>
    </div>
  )
}
