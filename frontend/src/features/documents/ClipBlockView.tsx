import { NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { FolderIcon, PlayIcon, VideoIcon } from '../../components/icons'
import { thumbnailUrl } from '../../api/hooks/useMedia'
import { formatTime } from '../player/format'
import { usePlaybackStore } from '../../store/playback'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { ClipBlockAttrs } from './clipBlockNode'

/** Read-only display fields the backend injects into `attrs` on every read
 * (see `resolve_document_content`); absent until the node has been resolved
 * at least once (e.g. immediately after insert, before the first refetch). */
interface ResolvedClipFields {
  video_name?: string
  start_time?: number
  end_time?: number
  speaker_name?: string | null
  excerpt?: string
  thumbnail_token?: string | null
  folder_path?: string[]
}

type ClipBlockNodeAttrs = ClipBlockAttrs & ResolvedClipFields

/**
 * A clip block's card: thumbnail/video name/timecode/excerpt styled directly
 * off `ChatCitationCard`, plus an editable note (via `updateAttributes` —
 * never touches the excerpt) and a play button. The excerpt itself is
 * non-editable — it's read-only display data resolved fresh by the backend,
 * not part of the document's authored prose.
 */
export function ClipBlockView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const attrs = node.attrs as ClipBlockNodeAttrs
  const activeVideoId = usePlaybackStore((s) => s.activeVideoId)
  const playSelection = usePlaybackStore((s) => s.playSelection)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)

  // Reuses VideoWorkspace's own player when it's already open on this clip's
  // video (so there's never two players for the same video); otherwise asks
  // the panel to preview the clip in its own player (see ClipPreviewPlayer).
  function handlePlay() {
    if (attrs.start_time === undefined || attrs.end_time === undefined) return
    if (attrs.videoId === activeVideoId && playSelection) {
      playSelection(attrs.start_time, attrs.end_time)
    } else {
      setPreviewClip({
        videoId: attrs.videoId,
        startTime: attrs.start_time,
        endTime: attrs.end_time,
      })
    }
  }

  return (
    <NodeViewWrapper
      data-clip-block=""
      className={`my-2 rounded-lg border bg-white p-3 ${selected ? 'border-sky-400 ring-1 ring-sky-400' : 'border-slate-200'}`}
    >
      <div className="flex items-start gap-3">
        {attrs.thumbnail_token ? (
          <img
            src={thumbnailUrl(attrs.videoId, attrs.thumbnail_token)}
            alt=""
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-slate-100">
            <VideoIcon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-800">
              {attrs.video_name ?? 'Clip'}
            </span>
            {attrs.start_time !== undefined && attrs.end_time !== undefined && (
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {formatTime(attrs.start_time)} – {formatTime(attrs.end_time)}
              </span>
            )}
            <button
              type="button"
              aria-label="Play clip"
              title="Play clip"
              className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={handlePlay}
            >
              <PlayIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {attrs.folder_path && attrs.folder_path.length > 0 && (
            <div className="flex items-center gap-1 truncate text-xs text-slate-400">
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{attrs.folder_path.join(' / ')}</span>
            </div>
          )}
          {attrs.excerpt !== undefined && (
            <p className="truncate text-xs text-slate-500 italic">"{attrs.excerpt}"</p>
          )}
          <input
            value={attrs.note ?? ''}
            onChange={(e) => updateAttributes({ note: e.target.value || null })}
            placeholder="Add a note…"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
          />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
