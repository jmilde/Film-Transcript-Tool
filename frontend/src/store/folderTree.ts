import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FolderTreeState {
  /** Folders explicitly collapsed by the user. Absence means expanded — new
   * folders default open, matching "unfolded by default". Persisted so the
   * tree survives unmounting (e.g. opening a video and navigating back) and
   * full page reloads. */
  collapsedIds: string[]
  toggle: (folderId: string) => void
  /** Force a set of folders open, e.g. the ancestor chain of the currently
   * selected folder — never collapses anything, only expands. */
  expand: (folderIds: string[]) => void
}

export const useFolderTreeStore = create<FolderTreeState>()(
  persist(
    (set) => ({
      collapsedIds: [],
      toggle: (folderId) =>
        set((s) => ({
          collapsedIds: s.collapsedIds.includes(folderId)
            ? s.collapsedIds.filter((id) => id !== folderId)
            : [...s.collapsedIds, folderId],
        })),
      expand: (folderIds) =>
        set((s) => {
          const toRemove = new Set(folderIds)
          const next = s.collapsedIds.filter((id) => !toRemove.has(id))
          return next.length === s.collapsedIds.length ? s : { collapsedIds: next }
        }),
    }),
    { name: 'folder-tree' },
  ),
)
