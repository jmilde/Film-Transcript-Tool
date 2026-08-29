import { CloseIcon } from '../../components/icons'
import type { ComponentType } from 'react'

export interface ToolbarAction {
  id: string
  icon: ComponentType<{ className?: string }>
  label: string
  variant?: 'primary' | 'default' | 'highlight' | 'danger'
  active?: boolean
  onClick: () => void
}

/** A single-field "type then Confirm/Cancel" draft — the Comment button's
 * flow in `TranscriptViewer`, and identically the Edit-to-merge flow. */
export interface ToolbarDraft {
  label: string
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  /** Border/background accent for the draft row itself; defaults to amber. */
  accentClass?: string
  /** Border accent for the input field; defaults to sky. */
  inputAccentClass?: string
  placeholder?: string
}

type SelectionToolbarProps =
  | {
      mode: 'actions'
      summary: { text: string; timecode?: string }
      actions: ToolbarAction[]
      onClear?: () => void
    }
  | { mode: 'draft'; draft: ToolbarDraft }

const VARIANT_CLASSES: Record<NonNullable<ToolbarAction['variant']>, string> = {
  primary: 'bg-slate-800 text-white hover:bg-slate-700',
  default: 'border border-slate-300 text-slate-600 hover:bg-slate-100',
  highlight: 'border border-violet-300 text-violet-700 hover:bg-violet-50',
  danger: 'border border-red-300 text-red-600 hover:bg-red-50',
}

/**
 * The shared "what can I do with this selection" popup — one implementation
 * for a selected transcript range (`TranscriptViewer`), a document text
 * selection, and a selected clip node (both via `DocumentEditor`'s
 * `BubbleMenu`, Phase E6). Renders either an action-button row with a
 * one-line summary of what's selected, or (via `mode: 'draft'`) a single
 * inline text field with Confirm/Cancel — the same swap-to-draft-input
 * pattern the Comment/Edit actions already use.
 */
export function SelectionToolbar(props: SelectionToolbarProps) {
  if (props.mode === 'draft') {
    const { draft } = props
    return (
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-slate-600 ${
          draft.accentClass ?? 'border-amber-100 bg-amber-50'
        }`}
      >
        <span className="text-slate-500">{draft.label}</span>
        <input
          autoFocus
          value={draft.value}
          placeholder={draft.placeholder}
          onChange={(e) => draft.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') draft.onConfirm()
            if (e.key === 'Escape') draft.onCancel()
          }}
          className={`min-w-48 flex-1 rounded border px-1 py-0.5 ${
            draft.inputAccentClass ?? 'border-sky-400'
          }`}
        />
        <button
          type="button"
          className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
          onClick={draft.onConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          onClick={draft.onCancel}
        >
          Cancel
        </button>
      </div>
    )
  }

  const { summary, actions, onClear } = props
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-slate-600">
      {summary.timecode && <span className="font-mono">{summary.timecode}</span>}
      <span className="max-w-xs truncate italic">&quot;{summary.text}&quot;</span>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.label}
            title={action.label}
            aria-pressed={action.active}
            className={`rounded p-1.5 ${VARIANT_CLASSES[action.variant ?? 'default']} ${
              action.active ? 'ring-1 ring-sky-400' : ''
            }`}
            onClick={action.onClick}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
      {onClear && (
        <button
          type="button"
          aria-label="Clear selection"
          title="Clear selection"
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={onClear}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
