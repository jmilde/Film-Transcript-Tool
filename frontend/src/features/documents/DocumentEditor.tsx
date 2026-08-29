import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { isNodeSelection } from '@tiptap/core'
import { DOMSerializer } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { shouldShowBubble } from './shouldShowBubble'
import {
  isDocumentConflict,
  useDocument,
  useResolveClipBlock,
  useUpdateDocument,
} from '../../api/hooks/useDocuments'
import {
  documentAnchor,
  useCreateDocumentComment,
  useDocumentComments,
} from '../../api/hooks/useComments'
import { useCommentsStore } from '../../store/comments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { ClipBlock, stripResolvedClipFields } from './clipBlockNode'
import type { ClipBlockNodeAttrs } from './clipBlockNode'
import { writeClipToClipboard } from './clipClipboard'
import { CommentMark } from './commentMark'
import { CommentResolvedDecoration, commentResolvedPluginKey } from './commentResolvedDecoration'
import { InsertMarker, insertMarkerPluginKey } from './insertMarker'
import { DocumentCommentsContext } from './documentCommentsContext'
import type { ClipCommentStatus } from './documentCommentsContext'
import { SelectionToolbar } from '../toolbar/SelectionToolbar'
import type { ToolbarAction } from '../toolbar/SelectionToolbar'
import {
  BoldIcon,
  BulletListIcon,
  CommentIcon,
  CopyIcon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  PinIcon,
  PlayIcon,
  TrashIcon,
} from '../../components/icons'
import { formatTime } from '../player/format'
import type { Document } from '../../api/hooks/useDocuments'

const SAVE_DEBOUNCE_MS = 1000

/** What the shared `BubbleMenu` popup shows: either a plain-text selection
 * (formatting + comment) or a `NodeSelection` over a `clipBlock` (play/
 * comment/remove). `null` means no popup-worthy selection. Text-mode carries
 * the live selected text/range so the popup's summary line stays in sync as
 * the user drags to extend the selection — `useEditorState`'s equality check
 * only re-renders when this value actually changes. */
type BubbleSelection =
  | {
      kind: 'text'
      from: number
      to: number
      text: string
      bold: boolean
      italic: boolean
      h1: boolean
      h2: boolean
      bulletList: boolean
    }
  | { kind: 'clip'; attrs: ClipBlockNodeAttrs }
  | null

/** A single-field comment draft can be opened from a text selection or a
 * selected clip node — the shared popup swaps to `SelectionToolbar`'s draft
 * mode either way; only where the resulting `Comment` gets anchored differs. */
type CommentDraftTarget = { kind: 'text' } | { kind: 'clip'; nodeId: string }

interface DocumentEditorProps {
  projectId: string
  documentId: string
}

interface PendingCommentMark {
  commentId: string
  from: number
  to: number
}

/**
 * Loads a document and mounts a TipTap editor over its content, debouncing
 * saves and surfacing a stale-`expected_version` conflict the same way
 * `TranscriptViewer` does for token edits (see its `reloadAfterConflict`).
 *
 * Also owns consuming the panel store's queued "Add to Document" insert
 * (rather than `DocumentPanel`, which doesn't have an editor instance to call
 * `insertClipBlockAt` on) once this document's editor has finished loading.
 */
export function DocumentEditor({ projectId, documentId }: DocumentEditorProps) {
  const { data: doc, isLoading } = useDocument(documentId)
  const updateDocument = useUpdateDocument(projectId, documentId)
  const resolveClipBlock = useResolveClipBlock(documentId)
  const { data: comments } = useDocumentComments(documentId)
  const createDocumentComment = useCreateDocumentComment(documentId)
  const pendingInsert = useDocumentPanelStore((s) => s.pendingInsert)
  const consumePendingInsert = useDocumentPanelStore((s) => s.consumePendingInsert)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)
  const setInsertMarkerDocumentId = useDocumentPanelStore((s) => s.setInsertMarkerDocumentId)
  const selectComment = useCommentsStore((s) => s.select)
  const client = useQueryClient()

  // The version to send with the next save; kept outside React state since
  // updating it must never itself trigger a re-render/editor reset.
  const versionRef = useRef(1)
  const [initialized, setInitialized] = useState(false)
  const [title, setTitle] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentDraft, setCommentDraft] = useState<CommentDraftTarget | null>(null)
  const [commentDraftText, setCommentDraftText] = useState('')

  // Set right after applying a comment mark; cleared once that specific save
  // resolves. Scopes the 409-retry below to "the very next autosave" caused
  // by *this* mark-set, not any later unrelated conflict.
  const pendingMarkSaveRef = useRef<PendingCommentMark | null>(null)
  // Armed by that save's conflict handler, consumed by the reload effect
  // below — exactly one retry, per the design record.
  const markRetryRef = useRef<PendingCommentMark | null>(null)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          link: false,
          underline: false,
        }),
        ClipBlock,
        CommentMark,
        CommentResolvedDecoration,
        InsertMarker,
      ],
      content: { type: 'doc', content: [] },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        const savingMark = pendingMarkSaveRef.current
        saveTimeoutRef.current = setTimeout(() => {
          updateDocument.mutate(
            {
              content: stripResolvedClipFields(editor.getJSON()) as Document['content'],
              expectedVersion: versionRef.current,
            },
            {
              onSuccess: (updated) => {
                versionRef.current = updated.version
                if (pendingMarkSaveRef.current === savingMark) pendingMarkSaveRef.current = null
              },
              onError: (error) => {
                if (pendingMarkSaveRef.current !== savingMark) return
                pendingMarkSaveRef.current = null
                if (isDocumentConflict(error) && savingMark) {
                  markRetryRef.current = savingMark
                  reloadAfterConflict()
                }
              },
            },
          )
        }, SAVE_DEBOUNCE_MS)
      },
    },
    [documentId],
  )

  // A document switch needs a fresh initial load even though `doc` itself
  // may briefly hold the previous document's data while the new one fetches.
  useEffect(() => {
    setInitialized(false)
  }, [documentId])

  useEffect(() => {
    if (!editor || !doc || initialized) return
    editor.commands.setContent(doc.content, { emitUpdate: false })
    versionRef.current = doc.version
    setTitle(doc.title)
    setInitialized(true)
  }, [editor, doc, initialized])

  // One-shot retry: re-apply a comment mark that was lost to a conflicting
  // save, now that the document has reloaded fresh content. If the mapped
  // range no longer makes sense in the reloaded doc, give up quietly — the
  // comment still exists and lists/functions via its `Comment` row.
  useEffect(() => {
    if (!editor || !initialized) return
    const pending = markRetryRef.current
    if (!pending) return
    markRetryRef.current = null
    const size = editor.state.doc.content.size
    const from = Math.min(pending.from, size)
    const to = Math.min(pending.to, size)
    if (from >= to) return
    editor
      .chain()
      .setTextSelection({ from, to })
      .setMark('comment', { commentId: pending.commentId })
      .run()
  }, [editor, initialized])

  // Derives what the shared BubbleMenu popup should show from the editor's
  // live selection. `useEditorState` only re-renders this component when the
  // selector's (deep-equal) output actually changes, so dragging to extend a
  // text selection re-renders on every character (the `text` field changes)
  // while toggling a mark elsewhere in an unrelated selection does not.
  const bubbleSelection = useEditorState<BubbleSelection>({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null
      const { selection } = editor.state
      if (selection.empty) return null
      if (isNodeSelection(selection)) {
        if (selection.node.type.name !== 'clipBlock') return null
        return { kind: 'clip', attrs: selection.node.attrs as ClipBlockNodeAttrs }
      }
      return {
        kind: 'text',
        from: selection.from,
        to: selection.to,
        text: editor.state.doc.textBetween(selection.from, selection.to, ' '),
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        h1: editor.isActive('heading', { level: 1 }),
        h2: editor.isActive('heading', { level: 2 }),
        bulletList: editor.isActive('bulletList'),
      }
    },
  })

  // Closing the popup's draft (e.g. Escape, or clicking elsewhere collapses
  // the selection) shouldn't leave a stale draft armed for whatever gets
  // selected next.
  useEffect(() => {
    if (!bubbleSelection) {
      setCommentDraft(null)
      setCommentDraftText('')
    }
  }, [bubbleSelection])

  // Read reactively (rather than only at click-time) so the "mark/clear
  // insert point" affordance and the panel-store flag stay in sync with the
  // plugin's own state, including when it's cleared by a document switch
  // (the editor is torn down and rebuilt fresh for a new `documentId`, so a
  // new plugin instance starts at `null`).
  const insertMarkerPos = useEditorState<number | null>({
    editor,
    selector: ({ editor }) =>
      editor ? (insertMarkerPluginKey.getState(editor.state) ?? null) : null,
  })

  useEffect(() => {
    setInsertMarkerDocumentId(insertMarkerPos !== null ? documentId : null)
  }, [insertMarkerPos, documentId, setInsertMarkerDocumentId])

  function markInsertPointHere() {
    if (!editor) return
    editor.commands.setInsertMarker(editor.state.selection.to)
  }

  function clearInsertPoint() {
    editor?.commands.clearInsertMarker()
  }

  // Push each comment's live resolved state into the decoration plugin's own
  // state via a transaction, rather than storing it redundantly on the mark
  // itself or poking the DOM directly (PM would silently wipe a DOM
  // attribute the next time it redraws a mark span from `renderHTML`) —
  // mirrors TranscriptViewer's commentedTokenInfo pattern, just PM-native.
  useEffect(() => {
    if (!editor) return
    const resolvedByCommentId = new Map((comments ?? []).map((c) => [c.id, c.resolved]))
    editor.view.dispatch(editor.state.tr.setMeta(commentResolvedPluginKey, resolvedByCommentId))
  }, [editor, comments])

  // Which clip nodes carry a comment, and whether the "strongest" (most
  // recently unresolved) one is resolved — same precedence rule as
  // TranscriptViewer's commentedTokenInfo.
  const clipCommentStatus = useMemo(() => {
    const map = new Map<string, ClipCommentStatus>()
    for (const comment of comments ?? []) {
      const anchor = documentAnchor(comment)
      if (!anchor?.clip_node_id) continue
      const existing = map.get(anchor.clip_node_id)
      if (!existing || (existing.resolved && !comment.resolved)) {
        map.set(anchor.clip_node_id, { resolved: comment.resolved })
      }
    }
    return map
  }, [comments])

  async function submitCommentDraft() {
    if (!editor || !commentDraft) return
    const text = commentDraftText.trim()
    if (!text) return
    if (commentDraft.kind === 'clip') {
      createDocumentComment.mutate({ clipNodeId: commentDraft.nodeId, text })
    } else {
      const { from, to } = editor.state.selection
      if (from === to) return
      const comment = await createDocumentComment.mutateAsync({ clipNodeId: null, text })
      pendingMarkSaveRef.current = { commentId: comment.id, from, to }
      editor
        .chain()
        .setTextSelection({ from, to })
        .setMark('comment', { commentId: comment.id })
        .run()
    }
    setCommentDraftText('')
    setCommentDraft(null)
  }

  // Always plays in the panel's own preview player — deliberately never the
  // video workspace's player, even when that page is already open on the
  // same video. Keeping the two fully separate means writing in the document
  // panel never hijacks or reseeks whatever the user has on screen in the
  // workspace.
  function playClip(attrs: ClipBlockNodeAttrs) {
    if (attrs.start_time === undefined || attrs.end_time === undefined) return
    setPreviewClip({
      videoId: attrs.videoId,
      startTime: attrs.start_time,
      endTime: attrs.end_time,
    })
  }

  // Writes both a plain-text and an HTML clipboard entry for a text
  // selection that may contain inline clip nodes — built from the schema's
  // own DOM serializer, so any embedded `clipBlock` node renders through its
  // `renderHTML` exactly as `clipBlockNode.ts`'s `parseHTML` expects back on
  // paste (same round-trip TipTap's own copy/paste already relies on
  // internally; see `clipClipboard.ts`). `textBetween`'s `leafText` callback
  // fills in each clip's excerpt for the plain-text entry, since an atom node
  // otherwise contributes nothing to the default text join.
  function copyTextSelection(from: number, to: number) {
    if (!editor) return
    const text = editor.state.doc.textBetween(from, to, ' ', (node) =>
      node.type.name === 'clipBlock' ? ((node.attrs as ClipBlockNodeAttrs).excerpt ?? '') : '',
    )
    const slice = editor.state.doc.slice(from, to)
    const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content)
    const container = document.createElement('div')
    container.appendChild(fragment)
    void writeClipToClipboard(text, container.innerHTML)
  }

  const bubbleActions: ToolbarAction[] = !bubbleSelection
    ? []
    : bubbleSelection.kind === 'clip'
      ? [
          {
            id: 'play',
            icon: PlayIcon,
            label: 'Play clip',
            variant: 'primary',
            onClick: () => playClip(bubbleSelection.attrs),
          },
          {
            id: 'comment',
            icon: CommentIcon,
            label: 'Comment',
            variant: 'highlight',
            onClick: () => {
              setCommentDraftText('')
              setCommentDraft({ kind: 'clip', nodeId: bubbleSelection.attrs.nodeId })
            },
          },
          {
            id: 'remove',
            icon: TrashIcon,
            label: 'Remove clip',
            variant: 'danger',
            onClick: () => editor?.chain().deleteSelection().run(),
          },
        ]
      : [
          {
            id: 'bold',
            icon: BoldIcon,
            label: 'Bold',
            active: bubbleSelection.bold,
            onClick: () => editor?.chain().focus().toggleBold().run(),
          },
          {
            id: 'italic',
            icon: ItalicIcon,
            label: 'Italic',
            active: bubbleSelection.italic,
            onClick: () => editor?.chain().focus().toggleItalic().run(),
          },
          {
            id: 'h1',
            icon: Heading1Icon,
            label: 'Heading 1',
            active: bubbleSelection.h1,
            onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
          },
          {
            id: 'h2',
            icon: Heading2Icon,
            label: 'Heading 2',
            active: bubbleSelection.h2,
            onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          },
          {
            id: 'bulletList',
            icon: BulletListIcon,
            label: 'Bullet list',
            active: bubbleSelection.bulletList,
            onClick: () => editor?.chain().focus().toggleBulletList().run(),
          },
          {
            id: 'copy',
            icon: CopyIcon,
            label: 'Copy',
            onClick: () => copyTextSelection(bubbleSelection.from, bubbleSelection.to),
          },
          {
            id: 'comment',
            icon: CommentIcon,
            label: 'Comment',
            variant: 'highlight',
            onClick: () => {
              setCommentDraftText('')
              setCommentDraft({ kind: 'text' })
            },
          },
        ]

  // Opens the comment thread for a clicked comment span — a stand-in for
  // E6's shared popup, reusing the same `useCommentsStore` selection state
  // `CommentsPanel` already renders for transcript comments (decision: one
  // shared comments UI for both contexts).
  function handleContentClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest('[data-comment-id]')
    const commentId = target?.getAttribute('data-comment-id')
    if (commentId) selectComment(commentId)
  }

  // Renames on blur, sharing this same version-tracking with content saves —
  // splitting title/content into separately-versioned mutations would let one
  // silently invalidate the other's `expected_version`.
  function saveTitle() {
    if (!initialized || title === doc?.title) return
    updateDocument.mutate(
      { title, expectedVersion: versionRef.current },
      { onSuccess: (updated) => (versionRef.current = updated.version) },
    )
  }

  // Insert a queued clip once there's an initialized editor to receive it —
  // resolve its display fields first so it renders correctly right away,
  // without waiting on a full document refetch. Targets the marked insert
  // point when one is set, falling back to document end otherwise; a used
  // marker then advances to just after the newly-inserted node (rather than
  // being cleared), so repeated inserts land in order at the marked spot
  // without the user having to re-mark it each time.
  useEffect(() => {
    if (!editor || !initialized || pendingInsert === null) return
    const payload = consumePendingInsert()
    if (!payload) return
    resolveClipBlock.mutate(
      {
        transcriptId: payload.transcriptId,
        startTokenId: payload.startTokenId,
        endTokenId: payload.endTokenId,
      },
      {
        onSuccess: (clip) => {
          // Read the marker fresh here, not before the round-trip above —
          // `resolveClipBlock` is a network call, and an edit landing while
          // it's in flight would map the plugin's own marker state forward
          // correctly but leave any earlier-captured position stale.
          const markerPos = insertMarkerPluginKey.getState(editor.state) ?? null
          const targetPos = markerPos ?? editor.state.doc.content.size
          editor.commands.insertClipBlockAt(targetPos, {
            nodeId: crypto.randomUUID(),
            transcriptId: payload.transcriptId,
            videoId: payload.videoId,
            startTokenId: payload.startTokenId,
            endTokenId: payload.endTokenId,
            ...clip,
          })
          if (markerPos !== null) {
            editor.commands.setInsertMarker(editor.state.selection.to)
          }
        },
      },
    )
  }, [editor, initialized, pendingInsert, consumePendingInsert, resolveClipBlock])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  function reloadAfterConflict() {
    updateDocument.reset()
    setInitialized(false)
    void client.invalidateQueries({ queryKey: ['document', documentId] })
  }

  if (isLoading || !editor) {
    return <div className="p-6 text-center text-sm text-slate-400">Loading document…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        aria-label="Document title"
        className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none"
      />
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-1.5 text-xs text-slate-500">
        <PinIcon
          className={`h-3.5 w-3.5 ${insertMarkerPos !== null ? 'text-sky-500' : 'text-slate-300'}`}
        />
        {insertMarkerPos !== null ? (
          <>
            <span>Insert point set</span>
            <button
              type="button"
              onClick={clearInsertPoint}
              className="ml-auto rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Clear insert point
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={markInsertPointHere}
            className="ml-auto rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Mark insert point here
          </button>
        )}
      </div>
      {isDocumentConflict(updateDocument.error) && (
        <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span>This document was edited by someone else. Your change was not saved.</span>
          <button
            type="button"
            onClick={reloadAfterConflict}
            className="ml-auto rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-500"
          >
            Reload
          </button>
        </div>
      )}
      {updateDocument.isError && !isDocumentConflict(updateDocument.error) && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          Your last change could not be saved. Check your connection and permissions, then try
          again.
        </div>
      )}
      <DocumentCommentsContext.Provider value={{ clipCommentStatus }}>
        <div className="relative flex-1 overflow-y-auto" onClick={handleContentClick}>
          <BubbleMenu
            editor={editor}
            shouldShow={shouldShowBubble}
            className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {commentDraft ? (
              <SelectionToolbar
                mode="draft"
                draft={{
                  label: 'Comment:',
                  value: commentDraftText,
                  placeholder: 'Add a comment…',
                  onChange: setCommentDraftText,
                  onConfirm: () => void submitCommentDraft(),
                  onCancel: () => setCommentDraft(null),
                  accentClass: 'border-violet-100 bg-violet-50',
                  inputAccentClass: 'border-violet-400',
                }}
              />
            ) : (
              bubbleSelection && (
                <SelectionToolbar
                  mode="actions"
                  summary={
                    bubbleSelection.kind === 'clip'
                      ? {
                          text: bubbleSelection.attrs.excerpt ?? 'Clip',
                          timecode:
                            bubbleSelection.attrs.start_time !== undefined &&
                            bubbleSelection.attrs.end_time !== undefined
                              ? `${formatTime(bubbleSelection.attrs.start_time)} – ${formatTime(bubbleSelection.attrs.end_time)}`
                              : undefined,
                        }
                      : { text: bubbleSelection.text }
                  }
                  actions={bubbleActions}
                />
              )
            )}
          </BubbleMenu>
          <EditorContent editor={editor} className="prose prose-sm max-w-none px-4 py-3" />
        </div>
      </DocumentCommentsContext.Provider>
    </div>
  )
}
