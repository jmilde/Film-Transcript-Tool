import { useEffect, useRef, useState } from 'react'
import { useUpdateSpeaker } from '../../api/hooks/useSpeakers'
import type { Speaker } from '../../api/hooks/useSpeakers'

interface SpeakerBarProps {
  videoId: string
  speakers: Speaker[]
  /** Renaming is an edit action, same as token edits/comments — viewers see
   * the same chips but can't click into them. */
  canEdit: boolean
}

/** A row of speaker chips above the transcript — click one to rename it
 * inline. Speaker identity (diarization) itself isn't editable here, only
 * the display name, via the existing `PATCH /speakers/{id}`. */
export function SpeakerBar({ videoId, speakers, canEdit }: SpeakerBarProps) {
  const updateSpeaker = useUpdateSpeaker(videoId)
  if (speakers.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
      {speakers.map((speaker) => (
        <SpeakerChip
          key={speaker.id}
          speaker={speaker}
          canEdit={canEdit}
          onRename={(name) => updateSpeaker.mutate({ speakerId: speaker.id, name })}
        />
      ))}
    </div>
  )
}

function SpeakerChip({
  speaker,
  canEdit,
  onRename,
}: {
  speaker: Speaker
  canEdit: boolean
  onRename: (name: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(speaker.name ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) {
      setName(speaker.name ?? '')
      return
    }
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [speaker.name, renaming])

  function commit() {
    setRenaming(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === (speaker.name ?? '')) {
      setName(speaker.name ?? '')
      return
    }
    onRename(trimmed)
  }

  if (renaming) {
    return (
      <input
        ref={inputRef}
        aria-label={`Rename ${speaker.name ?? 'speaker'}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setName(speaker.name ?? '')
            setRenaming(false)
          }
        }}
        style={{ width: `${Math.max(name.length, 6)}ch` }}
        className="rounded-full border border-brand bg-surface px-2.5 py-1 text-small text-text"
      />
    )
  }

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => setRenaming(true)}
      title={canEdit ? 'Rename speaker' : undefined}
      className={`rounded-full border border-border bg-surface-raised px-2.5 py-1 text-small text-text ${
        canEdit ? 'hover:border-brand hover:bg-brand-subtle' : ''
      }`}
    >
      {speaker.name ?? 'Unnamed speaker'}
    </button>
  )
}
