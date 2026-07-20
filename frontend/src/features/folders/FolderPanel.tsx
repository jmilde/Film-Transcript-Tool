import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCreateFolder, useFolderContents } from '../../api/hooks/useFolders'
import { useUploadVideo, useVideoProcessing } from '../../api/hooks/useVideos'

interface PanelProps {
  projectId: string
  folderId: string | null
  onSelectFolder: (folderId: string) => void
}

/** Contents of the selected folder: subfolders, videos, and create/upload actions. */
export function FolderPanel({ projectId, folderId, onSelectFolder }: PanelProps) {
  if (folderId === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Select a folder to see its videos, or create a folder to get started.
      </div>
    )
  }
  // Remount on folder change so per-folder UI state (upload tracking) resets.
  return (
    <FolderPanelInner
      key={folderId}
      projectId={projectId}
      folderId={folderId}
      onSelectFolder={onSelectFolder}
    />
  )
}

function FolderPanelInner({
  projectId,
  folderId,
  onSelectFolder,
}: {
  projectId: string
  folderId: string
  onSelectFolder: (folderId: string) => void
}) {
  const { data, isPending, isError } = useFolderContents(folderId)
  // Videos uploaded in this session, tracked for live processing status.
  const [uploaded, setUploaded] = useState<string[]>([])

  if (isPending) return <p className="text-slate-500">Loading…</p>
  if (isError) return <p className="text-red-600">Could not load this folder.</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">{data.folder.name}</h3>
        <div className="flex items-center gap-2">
          <NewFolderForm projectId={projectId} parentFolderId={folderId} />
          <UploadVideo folderId={folderId} onUploaded={(id) => setUploaded((v) => [...v, id])} />
        </div>
      </div>

      {data.folders.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Folders
          </h4>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.folders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelectFolder(f.id)}
                  className="w-full px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50"
                >
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Videos</h4>
        {data.videos.length === 0 ? (
          <p className="text-sm text-slate-500">No videos in this folder yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.videos.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-4 py-2.5">
                <Link
                  to={`/videos/${v.id}`}
                  className="truncate text-slate-800 hover:text-slate-950 hover:underline"
                >
                  {v.name}
                </Link>
                {uploaded.includes(v.id) && <ProcessingBadge videoId={v.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewFolderForm({
  projectId,
  parentFolderId,
}: {
  projectId: string
  parentFolderId: string | null
}) {
  const createFolder = useCreateFolder(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createFolder.mutateAsync({ name: trimmed, parentFolderId })
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        New folder
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name"
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={createFolder.isPending}
        className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Add
      </button>
    </form>
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
