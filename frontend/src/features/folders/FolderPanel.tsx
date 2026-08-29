import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { useFolderContents } from '../../api/hooks/useFolders'
import { useMoveVideo, useUploadVideo, useVideoProcessing } from '../../api/hooks/useVideos'
import { Folder as FolderIcon, Video as VideoIcon } from 'lucide-react'
import { VIDEO_DND_TYPE } from './FolderTree'

interface PanelProps {
  folderId: string | null
  onSelectFolder: (folderId: string) => void
}

/** Contents of the selected folder: subfolders and videos in one Explorer-style
 * list (folders first, alphabetical, then videos), plus the upload action.
 * Folder creation lives only in the folder tree to the left.
 */
export function FolderPanel({ folderId, onSelectFolder }: PanelProps) {
  if (folderId === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Select a folder to see its videos, or create a folder to get started.
      </div>
    )
  }
  // Remount on folder change so per-folder UI state (selection, upload tracking) resets.
  return <FolderPanelInner key={folderId} folderId={folderId} onSelectFolder={onSelectFolder} />
}

function FolderPanelInner({
  folderId,
  onSelectFolder,
}: {
  folderId: string
  onSelectFolder: (folderId: string) => void
}) {
  const { data, isPending, isError } = useFolderContents(folderId)
  const moveVideo = useMoveVideo()
  // Videos uploaded in this session, tracked for live processing status.
  const [uploaded, setUploaded] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const lastClickedRef = useRef<string | null>(null)
  const navigate = useNavigate()

  if (isPending) return <p className="text-slate-500">Loading…</p>
  if (isError) return <p className="text-red-600">Could not load this folder.</p>

  const videos = data.videos
  const folders = data.folders

  function handleVideoClick(e: MouseEvent, videoId: string) {
    if (e.shiftKey && lastClickedRef.current !== null) {
      const ids = videos.map((v) => v.id)
      const from = ids.indexOf(lastClickedRef.current as string)
      const to = ids.indexOf(videoId)
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        setSelected(new Set(ids.slice(lo, hi + 1)))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(videoId)) next.delete(videoId)
        else next.add(videoId)
        return next
      })
    } else {
      setSelected(new Set([videoId]))
    }
    lastClickedRef.current = videoId
  }

  function handleVideoDragStart(e: DragEvent, videoId: string) {
    // Dragging an item outside the current selection drags just that item,
    // matching Explorer/Finder: it becomes the new (single) selection.
    const ids = selected.has(videoId) ? Array.from(selected) : [videoId]
    if (!selected.has(videoId)) setSelected(new Set([videoId]))
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(
      VIDEO_DND_TYPE,
      JSON.stringify({ videoIds: ids, fromFolderId: folderId }),
    )
  }

  function handleVideoDrop(e: DragEvent) {
    // Dropping selected videos back onto their own folder's list is a no-op;
    // drops onto a subfolder row are handled by that row's own onDrop below.
    e.preventDefault()
  }

  function handleSubfolderDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(VIDEO_DND_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleSubfolderDrop(e: DragEvent, targetFolderId: string) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
    const raw = e.dataTransfer.getData(VIDEO_DND_TYPE)
    if (!raw) return
    const payload = JSON.parse(raw) as { videoIds: string[]; fromFolderId: string }
    if (payload.fromFolderId === targetFolderId) return
    for (const videoId of payload.videoIds) {
      moveVideo.mutate({ videoId, folderId: targetFolderId, fromFolderId: payload.fromFolderId })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">{data.folder.name}</h3>
        <UploadVideo folderId={folderId} onUploaded={(id) => setUploaded((v) => [...v, id])} />
      </div>

      {folders.length === 0 && videos.length === 0 ? (
        <p className="text-sm text-slate-500">This folder is empty.</p>
      ) : (
        <ul
          className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white"
          onClick={() => setSelected(new Set())}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(VIDEO_DND_TYPE)) e.preventDefault()
          }}
          onDrop={handleVideoDrop}
        >
          {folders.map((f) => (
            <li
              key={f.id}
              onDragOver={(e) => {
                handleSubfolderDragOver(e)
                setDragOverFolderId(f.id)
              }}
              onDragLeave={() => setDragOverFolderId((id) => (id === f.id ? null : id))}
              onDrop={(e) => handleSubfolderDrop(e, f.id)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectFolder(f.id)
                }}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-slate-700 ${
                  dragOverFolderId === f.id ? 'bg-slate-100 ring-1 ring-inset ring-slate-400' : 'hover:bg-slate-50'
                }`}
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
              </button>
            </li>
          ))}
          {videos.map((v) => (
            <li
              key={v.id}
              draggable
              onDragStart={(e) => handleVideoDragStart(e, v.id)}
              onClick={(e) => {
                e.stopPropagation()
                // Plain click opens the video, matching folder click-to-open;
                // a modifier click instead extends the selection for dragging.
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  handleVideoClick(e, v.id)
                } else {
                  void navigate(`/videos/${v.id}`)
                }
              }}
              className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 ${
                selected.has(v.id) ? 'bg-slate-200' : 'hover:bg-slate-50'
              }`}
            >
              <VideoIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1 truncate text-slate-800">{v.name}</span>
              {uploaded.includes(v.id) && <ProcessingBadge videoId={v.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UploadVideo({
  folderId,
  onUploaded,
}: {
  folderId: string
  onUploaded: (videoId: string) => void
}) {
  const uploadVideo = useUploadVideo(folderId)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file
    if (!file) return
    const result = await uploadVideo.mutateAsync(file)
    onUploaded(result.video_id)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        onChange={onChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploadVideo.isPending}
        className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {uploadVideo.isPending ? 'Uploading…' : 'Upload video'}
      </button>
    </>
  )
}

function ProcessingBadge({ videoId }: { videoId: string }) {
  const { data } = useVideoProcessing(videoId, true)
  const jobs = data?.jobs ?? []
  const failed = jobs.find((j) => j.status === 'failed')
  const active = jobs.find((j) => j.status === 'running' || j.status === 'pending')
  const allDone = jobs.length > 0 && jobs.every((j) => j.status === 'completed')

  let label = 'Processing…'
  let tone = 'bg-amber-100 text-amber-800'
  if (failed) {
    label = 'Failed'
    tone = 'bg-red-100 text-red-800'
  } else if (allDone) {
    label = 'Ready'
    tone = 'bg-green-100 text-green-800'
  } else if (active) {
    label = `Processing: ${active.type}`
  }

  return (
    <span
      title={failed?.error_message ?? undefined}
      className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  )
}
