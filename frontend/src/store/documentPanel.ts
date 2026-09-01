import { create } from 'zustand'

/** Reference ids needed to insert a clip block — resolved into display fields
 * (excerpt/thumbnail/etc.) once the editor calls `useResolveClipBlock`. */
export interface ClipInsertPayload {
  transcriptId: string
  videoId: string
  startTokenId: string
  endTokenId: string
}

/** A clip the panel should preview with its own player — set when a clip
 * block's play button is clicked for a video that isn't already open in
 * `VideoWorkspace` (see `store/playback.ts`'s `activeVideoId`). */
export interface ClipPreview {
  videoId: string
  startTime: number
  endTime: number
}

/**
 * Global state (§17-equivalent "Document Panel State") for the persistent
 * document-builder panel docked in `AppShell`. Unlike page-scoped stores, this
 * one must survive navigation between ProjectView/ChatPage/VideoWorkspace
 * (and the global search overlay staying open across all of them), since the
 * whole point of the panel is to stay open while browsing. `pendingInsert`
 * bridges an "Add to Document" click to the editor:
 * if the panel/editor isn't mounted yet, the payload is queued here and
 * consumed once `DocumentEditor` mounts (see `consumePendingInsert`).
 *
 * Documents open as tabs: `openDocumentIds` is the tab strip (in open order),
 * `activeDocumentId` which one is showing. Both are scoped to whichever
 * project is active — switching projects clears them, since a tab from one
 * project's document has no meaning once a different project's panel is showing.
 */
interface DocumentPanelState {
  isOpen: boolean
  activeProjectId: string | null
  openDocumentIds: string[]
  activeDocumentId: string | null
  pendingInsert: ClipInsertPayload | null
  previewClip: ClipPreview | null
  // Thin flag only — *whether* the active document has an insert point
  // marked, not the position itself (that lives in `insertMarker.ts`'s
  // ProseMirror plugin state, the only thing that can keep it correctly
  // mapped through edits). Lets other components render "a marker is set"
  // without reaching into the editor instance.
  insertMarkerDocumentId: string | null
  open: (projectId: string) => void
  close: () => void
  setActiveProject: (projectId: string | null) => void
  /** Opens a document as a tab (if not already open) and makes it active —
   * used both for "New document"/the existing-document picker and for
   * clicking an already-open tab (a no-op on `openDocumentIds` there). */
  openTab: (documentId: string) => void
  /** Closes a tab. If it was active, activates its former right-hand
   * neighbor (or left-hand, if it was the last tab), matching common
   * browser-tab-close behavior. Also safe to call for a document that was
   * never opened as a tab (e.g. deleting one from the picker) — a no-op. */
  closeTab: (documentId: string) => void
  queueInsert: (payload: ClipInsertPayload) => void
  consumePendingInsert: () => ClipInsertPayload | null
  setPreviewClip: (clip: ClipPreview | null) => void
  setInsertMarkerDocumentId: (documentId: string | null) => void
}

export const useDocumentPanelStore = create<DocumentPanelState>((set, get) => ({
  isOpen: false,
  activeProjectId: null,
  openDocumentIds: [],
  activeDocumentId: null,
  pendingInsert: null,
  previewClip: null,
  insertMarkerDocumentId: null,
  open: (projectId) =>
    set((s) => ({
      isOpen: true,
      activeProjectId: projectId,
      ...(s.activeProjectId !== projectId && {
        openDocumentIds: [],
        activeDocumentId: null,
        insertMarkerDocumentId: null,
      }),
    })),
  close: () => set({ isOpen: false }),
  setActiveProject: (projectId) =>
    set((s) => ({
      activeProjectId: projectId,
      ...(s.activeProjectId !== projectId && {
        openDocumentIds: [],
        activeDocumentId: null,
        insertMarkerDocumentId: null,
      }),
    })),
  // Switching documents always leaves the old marker behind — it's plugin
  // state on an editor instance that's about to be torn down/rebuilt.
  openTab: (documentId) =>
    set((s) => ({
      openDocumentIds: s.openDocumentIds.includes(documentId)
        ? s.openDocumentIds
        : [...s.openDocumentIds, documentId],
      activeDocumentId: documentId,
      insertMarkerDocumentId: null,
    })),
  closeTab: (documentId) =>
    set((s) => {
      const idx = s.openDocumentIds.indexOf(documentId)
      if (idx === -1) return {}
      const openDocumentIds = s.openDocumentIds.filter((id) => id !== documentId)
      const activeDocumentId =
        s.activeDocumentId !== documentId
          ? s.activeDocumentId
          : (openDocumentIds[idx] ?? openDocumentIds[idx - 1] ?? null)
      return {
        openDocumentIds,
        activeDocumentId,
        insertMarkerDocumentId:
          s.insertMarkerDocumentId === documentId ? null : s.insertMarkerDocumentId,
      }
    }),
  queueInsert: (payload) => set({ pendingInsert: payload, isOpen: true }),
  consumePendingInsert: () => {
    const payload = get().pendingInsert
    if (payload !== null) set({ pendingInsert: null })
    return payload
  },
  setPreviewClip: (clip) => set({ previewClip: clip }),
  setInsertMarkerDocumentId: (documentId) => set({ insertMarkerDocumentId: documentId }),
}))
