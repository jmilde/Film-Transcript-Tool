import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  useDeleteDocumentComment,
  useDocumentComments,
} from '../../api/hooks/useComments'
import type { Comment } from '../../api/hooks/useComments'
import { useCommentsStore } from '../../store/comments'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { ClipBlock, stripResolvedClipFields } from './clipBlockNode'
import type { ClipBlockNodeAttrs } from './clipBlockNode'
import { writeClipToClipboard } from './clipClipboard'
import { findOrphanedCommentIds } from './orphanedComments'
import { CommentMark } from './commentMark'
import { CommentResolvedDecoration, commentResolvedPluginKey } from './commentResolvedDecoration'
import { CommentHighlightDecoration, commentHighlightPluginKey } from './commentHighlightDecoration'
import { InsertMarker, insertMarkerPluginKey } from './insertMarker'
import { DocumentCommentsContext } from './documentCommentsContext'
import type { ClipCommentStatus } from './documentCommentsContext'
import { SelectionToolbar } from '../toolbar/SelectionToolbar'
import type { ToolbarAction } from '../toolbar/SelectionToolbar'
import {
  Bold as BoldIcon,
  List as BulletListIcon,
  MessageSquare as CommentIcon,
  Copy as CopyIcon,
  Heading1 as Heading1Icon,
  Heading2 as Heading2Icon,
  Italic as ItalicIcon,
  Play as PlayIcon,
  Trash2 as TrashIcon,
} from 'lucide-react'
import { formatTime } from '../player/format'
import type { Document } from '../../api/hooks/useDocuments'

const SAVE_DEBOUNCE_MS = 1000

/** What the shared `BubbleMenu` popup shows: either a plain-text selection
 * (copy + comment) or a `NodeSelection` over a `clipBlock` (play/comment/
 * remove) — formatting toggles live in the fixed toolbar above the document
 * instead (`FormattingState` below), not in this popup, since they apply
 * from a collapsed cursor too and shouldn't need a selection to reach.
 * `null` means no popup-worthy selection. Text-mode carries the live
 * selected text/range so the popup's summary line stays in sync as the user
 * drags to extend the selection — `useEditorState`'s equality check only
 * re-renders when this value actually changes. */
type BubbleSelection =
  | { kind: 'text'; from: number; to: number; text: string }
  | { kind: 'clip'; attrs: ClipBlockNodeAttrs }
  | null

/** Live formatting state for the fixed toolbar's active-button highlighting
 * — tracked independently of `BubbleSelection` since the toolbar works from
 * a collapsed cursor (no selection at all), unlike the floating popup. */
interface FormattingState {
  bold: boolean
  italic: boolean
  h1: boolean
  h2: boolean
  bulletList: boolean
}

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
  const deleteDocumentComment = useDeleteDocumentComment(documentId)
  const pendingInsert = useDocumentPanelStore((s) => s.pendingInsert)
  const consumePendingInsert = useDocumentPanelStore((s) => s.consumePendingInsert)
  const setPreviewClip = useDocumentPanelStore((s) => s.setPreviewClip)
  const setInsertMarkerDocumentId = useDocumentPanelStore((s) => s.setInsertMarkerDocumentId)
  const selectComment = useCommentsStore((s) => s.select)
  const hoverComment = useCommentsStore((s) => s.hover)
  const selectedCommentId = useCommentsStore((s) => s.selectedId)
  const hoveredCommentId = useCommentsStore((s) => s.hoveredId)
  const client = useQueryClient()

  // The version to send with the next save; kept outside React state since
  // updating it must never itself trigger a re-render/editor reset.
  const versionRef = useRef(1)
  const [initialized, setInitialized] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentDraft, setCommentDraft] = useState<CommentDraftTarget | null>(null)
  const [commentDraftText, setCommentDraftText] = useState('')
  // The comment currently under the pointer, plus where to float its preview
  // — `null` whenever the pointer isn't over a commented span/clip.
  const [hoverPreview, setHoverPreview] = useState<{ commentId: string; rect: DOMRect } | null>(
    null,
  )

  // Set right after applying a comment mark; cleared once that specific save
  // resolves. Scopes the 409-retry below to "the very next autosave" caused
  // by *this* mark-set, not any later unrelated conflict.
  const pendingMarkSaveRef = useRef<PendingCommentMark | null>(null)
  // Armed by that save's conflict handler, consumed by the reload effect
  // below — exactly one retry, per the design record.
  const markRetryRef = useRef<PendingCommentMark | null>(null)

  // Mirrors the latest `comments` into a ref for `onUpdate`'s orphan-comment
  // reconciliation below — that closure is captured once per `documentId`
  // (see `useEditor`'s deps array), so it would otherwise only ever see
  // whatever `comments` looked like when the editor was created.
  const commentsRef = useRef<Comment[]>([])
  useEffect(() => {
    commentsRef.current = comments ?? []
  }, [comments])

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
        CommentHighlightDecoration,
        InsertMarker,
      ],
      content: { type: 'doc', content: [] },
      onUpdate: ({ editor }) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        const savingMark = pendingMarkSaveRef.current
        saveTimeoutRef.current = setTimeout(() => {
          const content = stripResolvedClipFields(editor.getJSON()) as Document['content']
          updateDocument.mutate(
            { content, expectedVersion: versionRef.current },
            {
              onSuccess: (updated) => {
                versionRef.current = updated.version
                if (pendingMarkSaveRef.current === savingMark) pendingMarkSaveRef.current = null
                // Reconcile against exactly what was just persisted, not a
                // before/after diff — a comment whose mark/clip node isn't
                // in it anymore lost the text/clip it was attached to.
                // Anything still mid-flight through the mark-save/retry
                // dance below is excluded so this can't delete a comment
                // whose mark simply hasn't reached a saved snapshot yet.
                const excludeIds = new Set<string>()
                if (pendingMarkSaveRef.current) excludeIds.add(pendingMarkSaveRef.current.commentId)
                if (markRetryRef.current) excludeIds.add(markRetryRef.current.commentId)
                for (const id of findOrphanedCommentIds(content, commentsRef.current, excludeIds)) {
                  deleteDocumentComment.mutate(id)
                }
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
    setInitialized(true)
  }, [editor, doc, initialized])

  // Keeps `versionRef` current with the latest version this client has seen
  // for *any* field — not just this component's own saves. The document
  // panel's tab bar can rename this same document (a title-only PATCH) while
  // its editor is open; without this, a subsequent content autosave here
  // would still be carrying the pre-rename version and get rejected as a
  // stale-version conflict. Safe to run on every `doc` change since a ref
  // write never triggers a re-render.
  useEffect(() => {
    if (doc) versionRef.current = doc.version
  }, [doc])

  // One-shot retry: re-apply a comment mark that was lost to a conflicting
  // save, now that the document has reloaded fresh content. If the mapped
  // range no longer makes sense in the reloaded doc, there's nothing left to
  // re-mark — delete the comment rather than leaving it orphaned, same as
  // `findOrphanedCommentIds` would once caught by a later save.
  useEffect(() => {
    if (!editor || !initialized) return
    const pending = markRetryRef.current
    if (!pending) return
    markRetryRef.current = null
    const size = editor.state.doc.content.size
    const from = Math.min(pending.from, size)
    const to = Math.min(pending.to, size)
    if (from >= to) {
      deleteDocumentComment.mutate(pending.commentId)
      return
    }
    editor
      .chain()
      .setTextSelection({ from, to })
      .setMark('comment', { commentId: pending.commentId })
      .run()
  }, [editor, initialized, deleteDocumentComment])

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
      }
    },
  })

  // Drives the fixed toolbar's active-button highlighting from a collapsed
  // cursor too, not just a selection — a rich-text toolbar should show
  // "Bold" as active just from clicking into bold text, same as any editor.
  const formattingState = useEditorState<FormattingState>({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      h1: editor?.isActive('heading', { level: 1 }) ?? false,
      h2: editor?.isActive('heading', { level: 2 }) ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
    }),
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

  // Read reactively (rather than only at click-time) so the panel-store flag
  // stays in sync with the plugin's own state, including when it's cleared
  // by a document switch (the editor is torn down and rebuilt fresh for a
  // new `documentId`, so a new plugin instance starts at `null`).
  const insertMarkerPos = useEditorState<number | null>({
    editor,
    selector: ({ editor }) =>
      editor ? (insertMarkerPluginKey.getState(editor.state) ?? null) : null,
  })

  useEffect(() => {
    setInsertMarkerDocumentId(insertMarkerPos !== null ? documentId : null)
  }, [insertMarkerPos, documentId, setInsertMarkerDocumentId])

  // The insert point is tracked automatically from wherever the cursor last
  // was — no manual "mark insert point" action. `setInsertMarker` only sets
  // plugin-state meta (no doc change), so this never trips the autosave
  // debounce above. The marker's own decoration (insertMarker.ts) renders
  // regardless of focus, which is what keeps it visible after the user
  // clicks outside the editor (e.g. into the search or chat panel) instead
  // of disappearing along with the native selection.
  useEffect(() => {
    if (!editor) return
    function handleSelectionUpdate() {
      editor.commands.setInsertMarker(editor.state.selection.to)
    }
    editor.on('selectionUpdate', handleSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor])

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

  // Reverse of the above — which comment (if any) anchors to a given clip
  // node, needed to resolve a click/hover on a clip block back to a comment
  // id for selecting/highlighting it (text marks carry their commentId
  // directly via `data-comment-id`; clip nodes don't, so this is the lookup
  // path for those).
  const commentIdByNodeId = useMemo(() => {
    const map = new Map<string, string>()
    for (const comment of comments ?? []) {
      const nodeId = documentAnchor(comment)?.clip_node_id
      if (nodeId) map.set(nodeId, comment.id)
    }
    return map
  }, [comments])

  // What "hovering or clicking a commented section" should highlight right
  // now — hover takes precedence while active, falling back to whatever's
  // selected (e.g. from `DocumentCommentsPanel` on the fullscreen page).
  const highlightedCommentId = hoveredCommentId ?? selectedCommentId

  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(commentHighlightPluginKey, highlightedCommentId))
  }, [editor, highlightedCommentId])

  const highlightedNodeId = useMemo(() => {
    if (!highlightedCommentId) return null
    for (const [nodeId, commentId] of commentIdByNodeId) {
      if (commentId === highlightedCommentId) return nodeId
    }
    return null
  }, [commentIdByNodeId, highlightedCommentId])

  // Scrolls the selected comment's mark/clip into view — driven by
  // `selectedCommentId` specifically (not the hover-inclusive
  // `highlightedCommentId` above), so hovering a comment in
  // `DocumentCommentsPanel` highlights it without yanking the scroll
  // position, while clicking (which sets `selectedId`) does jump to it —
  // the same split TranscriptViewer makes between token hover and selection.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selectedCommentId) return
    const container = contentRef.current
    if (!container) return
    const escaped = CSS.escape(selectedCommentId)
    const markEl = container.querySelector(`[data-comment-id="${escaped}"]`)
    if (markEl) {
      markEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    let nodeId: string | null = null
    for (const [candidateNodeId, commentId] of commentIdByNodeId) {
      if (commentId === selectedCommentId) {
        nodeId = candidateNodeId
        break
      }
    }
    if (!nodeId) return
    container
      .querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedCommentId, commentIdByNodeId])

  function resolveCommentIdAt(target: HTMLElement): string | null {
    const markEl = target.closest('[data-comment-id]')
    if (markEl) return markEl.getAttribute('data-comment-id')
    const clipEl = target.closest('[data-node-id]')
    const nodeId = clipEl?.getAttribute('data-node-id')
    return nodeId ? (commentIdByNodeId.get(nodeId) ?? null) : null
  }

  function handleContentMouseOver(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const commentId = resolveCommentIdAt(target)
    hoverComment(commentId)
    if (!commentId) {
      setHoverPreview(null)
      return
    }
    const el = target.closest('[data-comment-id],[data-node-id]')
    if (el) setHoverPreview({ commentId, rect: el.getBoundingClientRect() })
  }

  function handleContentMouseLeave() {
    hoverComment(null)
    setHoverPreview(null)
  }

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

  // The fixed toolbar pinned above the document — unlike `bubbleActions`,
  // always rendered (not gated on a selection existing) and toggles from
  // wherever the cursor currently is, matching how a rich-text editor's
  // formatting toolbar normally works.
  const formattingActions: ToolbarAction[] = [
    {
      id: 'bold',
      icon: BoldIcon,
      label: 'Bold',
      active: formattingState.bold,
      onClick: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      id: 'italic',
      icon: ItalicIcon,
      label: 'Italic',
      active: formattingState.italic,
      onClick: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      id: 'h1',
      icon: Heading1Icon,
      label: 'Heading 1',
      active: formattingState.h1,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: 'h2',
      icon: Heading2Icon,
      label: 'Heading 2',
      active: formattingState.h2,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: 'bulletList',
      icon: BulletListIcon,
      label: 'Bullet list',
      active: formattingState.bulletList,
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
    },
  ]

  // Opens the comment thread for a clicked comment span — a stand-in for
  // E6's shared popup, reusing the same `useCommentsStore` selection state
  // `CommentsPanel` already renders for transcript comments (decision: one
  // shared comments UI for both contexts).
  function handleContentClick(event: React.MouseEvent<HTMLDivElement>) {
    const commentId = resolveCommentIdAt(event.target as HTMLElement)
    if (commentId) selectComment(commentId)
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
    return <div className="p-6 text-center text-body text-text-muted">Loading document…</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fixed above the document (not floating) — formatting applies from
          wherever the cursor is, so it doesn't need a selection to show,
          unlike the contextual BubbleMenu below. */}
      <div className="flex items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        {formattingActions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              aria-label={action.label}
              title={action.label}
              aria-pressed={action.active}
              onClick={action.onClick}
              className={`rounded-md p-1.5 hover:bg-surface-raised ${
                action.active ? 'bg-brand-subtle text-brand-text' : 'text-text-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
      {isDocumentConflict(updateDocument.error) && (
        <div className="flex items-center gap-3 border-b border-danger-subtle bg-danger-subtle px-4 py-2 text-small text-danger-text">
          <span>This document was edited by someone else. Your change was not saved.</span>
          <button
            type="button"
            onClick={reloadAfterConflict}
            className="ml-auto rounded-md bg-danger px-2 py-1 font-medium text-text-inverted hover:opacity-90"
          >
            Reload
          </button>
        </div>
      )}
      {updateDocument.isError && !isDocumentConflict(updateDocument.error) && (
        <div className="border-b border-danger-subtle bg-danger-subtle px-4 py-2 text-small text-danger-text">
          Your last change could not be saved. Check your connection and permissions, then try
          again.
        </div>
      )}
      <DocumentCommentsContext.Provider value={{ clipCommentStatus, highlightedNodeId }}>
        {/* A recessed backdrop behind a bounded "page" (rather than the
            editor just filling the panel edge-to-edge) is what actually
            reads as "a document" instead of plain panel content. */}
        <div
          ref={contentRef}
          className="relative flex-1 overflow-y-auto bg-page"
          onClick={handleContentClick}
          onMouseOver={handleContentMouseOver}
          onMouseLeave={handleContentMouseLeave}
        >
          {hoverPreview &&
            (() => {
              const comment = (comments ?? []).find((c) => c.id === hoverPreview.commentId)
              if (!comment) return null
              const enoughRoomAbove = hoverPreview.rect.top > 56
              return createPortal(
                <div
                  role="tooltip"
                  className="fixed z-50 max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-small text-text shadow-lg"
                  style={{
                    left: Math.max(8, hoverPreview.rect.left),
                    top: enoughRoomAbove ? hoverPreview.rect.top - 8 : hoverPreview.rect.bottom + 8,
                    transform: enoughRoomAbove ? 'translateY(-100%)' : undefined,
                  }}
                >
                  {comment.text}
                </div>,
                document.body,
              )
            })()}
          <BubbleMenu
            editor={editor}
            shouldShow={shouldShowBubble}
            // Fixed strategy + appending to <body> takes the menu out of the
            // narrow document panel's own clipped/scrolling box entirely, so
            // floating-ui's flip/shift middleware clamp it against the real
            // viewport edges instead of letting it run past the right edge
            // of the screen (the panel sits flush against it).
            options={{ strategy: 'fixed', shift: { padding: 8 } }}
            appendTo={() => document.body}
            className="overflow-hidden rounded-md border border-border bg-surface shadow-lg"
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
                  accentClass: 'border-warning-subtle bg-warning-subtle',
                  inputAccentClass: 'border-warning',
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
          <div className="mx-auto max-w-2xl px-4 py-6">
            <div className="rounded-md border border-border bg-surface px-8 py-8 shadow-sm">
              <EditorContent editor={editor} className="prose prose-sm max-w-none" />
            </div>
          </div>
        </div>
      </DocumentCommentsContext.Provider>
    </div>
  )
}
