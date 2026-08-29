import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import { isNodeSelection } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
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
import { CommentMark } from './commentMark'
import { CommentResolvedDecoration, commentResolvedPluginKey } from './commentResolvedDecoration'
import { DocumentCommentsContext } from './documentCommentsContext'
import type { ClipCommentStatus } from './documentCommentsContext'
import type { Document } from '../../api/hooks/useDocuments'

const SAVE_DEBOUNCE_MS = 1000

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
  const selectComment = useCommentsStore((s) => s.select)
  const client = useQueryClient()

  // The version to send with the next save; kept outside React state since
  // updating it must never itself trigger a re-render/editor reset.
  const versionRef = useRef(1)
  const [initialized, setInitialized] = useState(false)
  const [title, setTitle] = useState('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasTextSelection, setHasTextSelection] = useState(false)
  const [commentDraftOpen, setCommentDraftOpen] = useState(false)
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

  // Track whether the current selection is a non-empty text range (as
  // opposed to an empty caret or a NodeSelection over a clip), which is what
  // a document-wide selection toolbar would key off; this interim "Comment"
  // button is what E6's shared BubbleMenu/SelectionToolbar replaces.
  useEffect(() => {
    if (!editor) return
    function update() {
      const { selection } = editor.state
      setHasTextSelection(!selection.empty && !isNodeSelection(selection))
    }
    update()
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
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

  function createClipComment(nodeId: string, text: string) {
    createDocumentComment.mutate({ clipNodeId: nodeId, text })
  }

  async function submitTextComment() {
    if (!editor) return
    const text = commentDraftText.trim()
    const { from, to } = editor.state.selection
    if (!text || from === to) return
    const comment = await createDocumentComment.mutateAsync({ clipNodeId: null, text })
    pendingMarkSaveRef.current = { commentId: comment.id, from, to }
    editor
      .chain()
      .setTextSelection({ from, to })
      .setMark('comment', { commentId: comment.id })
      .run()
    setCommentDraftText('')
    setCommentDraftOpen(false)
  }

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
  // without waiting on a full document refetch.
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
          editor.commands.insertClipBlockAt(editor.state.doc.content.size, {
            nodeId: crypto.randomUUID(),
            transcriptId: payload.transcriptId,
            videoId: payload.videoId,
            startTokenId: payload.startTokenId,
            endTokenId: payload.endTokenId,
            ...clip,
          })
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
      {/* Interim selection trigger — Phase E6 replaces this with a BubbleMenu
          rendering the shared SelectionToolbar (Phase E5). */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-1.5">
        <button
          type="button"
          disabled={!hasTextSelection}
          onClick={() => setCommentDraftOpen((open) => !open)}
          className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Comment
        </button>
        {commentDraftOpen && (
          <>
            <input
              autoFocus
              value={commentDraftText}
              onChange={(e) => setCommentDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitTextComment()
                if (e.key === 'Escape') setCommentDraftOpen(false)
              }}
              placeholder="Add a comment…"
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void submitTextComment()}
              className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white hover:bg-slate-700"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setCommentDraftOpen(false)}
              className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
      <DocumentCommentsContext.Provider value={{ clipCommentStatus, createClipComment }}>
        <div className="flex-1 overflow-y-auto" onClick={handleContentClick}>
          <EditorContent editor={editor} className="prose prose-sm max-w-none px-4 py-3" />
        </div>
      </DocumentCommentsContext.Provider>
    </div>
  )
}
