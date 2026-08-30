import { X } from 'lucide-react'
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
  /** Border/background accent for the draft row itself; defaults to the
   * brand hue (an in-progress edit). Comment drafts override to warning
   * (an open note), matching the Comment button's `highlight` variant. */
  accentClass?: string
  /** Border accent for the input field; defaults to brand. */
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
  primary: 'bg-brand text-text-inverted hover:bg-brand-hover',
  default: 'border border-border text-text-muted hover:bg-surface-raised',
  highlight: 'border border-warning text-warning-text hover:bg-warning-subtle',
  danger: 'border border-danger text-danger-text hover:bg-danger-subtle',
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
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-small text-text-muted ${
          draft.accentClass ?? 'border-brand-subtle bg-brand-subtle'
        }`}
      >
        <span className="text-text-muted">{draft.label}</span>
        <input
          autoFocus
          value={draft.value}
          placeholder={draft.placeholder}
          onChange={(e) => draft.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') draft.onConfirm()
            if (e.key === 'Escape') draft.onCancel()
          }}
          className={`min-w-48 flex-1 rounded-md border bg-surface px-1 py-0.5 text-text ${
            draft.inputAccentClass ?? 'border-brand'
          }`}
        />
        <button
          type="button"
          className="rounded-md bg-brand px-2 py-1 text-text-inverted hover:bg-brand-hover"
          onClick={draft.onConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-text hover:bg-surface-raised"
          onClick={draft.onCancel}
        >
          Cancel
        </button>
      </div>
    )
  }

  const { summary, actions, onClear } = props
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-brand-subtle bg-brand-subtle px-4 py-2 text-small text-text-muted">
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
            className={`rounded-md p-1.5 ${VARIANT_CLASSES[action.variant ?? 'default']} ${
              action.active ? 'ring-1 ring-brand' : ''
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
          className="ml-auto rounded-md p-1 text-text-muted hover:bg-surface-raised hover:text-text"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
