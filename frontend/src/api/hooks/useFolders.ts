import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Folder = components['schemas']['FolderRead']
export type FolderContents = components['schemas']['FolderContents']

/** Top-level folders of a project — the folder tree's entry point. */
export function useRootFolders(projectId: string) {
  return useQuery({
    queryKey: ['folders', projectId, 'root'],
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/folders', {
          params: { path: { project_id: projectId } },
        }),
      ),
  })
}

/** Contents (child folders + videos) of a single folder. */
export function useFolderContents(folderId: string | null) {
  return useQuery({
    queryKey: ['folder', folderId],
    enabled: folderId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/folders/{folder_id}', {
          params: { path: { folder_id: folderId as string } },
        }),
      ),
  })
}

/**
 * Create a folder in a project. A null parent creates a root-level folder.
 * Invalidates the affected level so the tree refreshes.
 */
export function useCreateFolder(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; parentFolderId: string | null }) =>
      unwrap(
        await api.POST('/projects/{project_id}/folders', {
          params: { path: { project_id: projectId } },
          body: { name: input.name, parent_folder_id: input.parentFolderId },
        }),
      ),
    onSuccess: (_data, input) => {
      if (input.parentFolderId === null) {
        void client.invalidateQueries({ queryKey: ['folders', projectId, 'root'] })
      } else {
        void client.invalidateQueries({ queryKey: ['folder', input.parentFolderId] })
      }
    },
  })
}

/** Move (reparent) a folder, e.g. via drag-and-drop in the folder tree. */
export function useMoveFolder(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      folderId: string
      fromParentId: string | null
      toParentId: string | null
    }) =>
      unwrap(
        await api.PATCH('/folders/{folder_id}', {
          params: { path: { folder_id: input.folderId } },
          body: { parent_folder_id: input.toParentId },
        }),
      ),
    onSuccess: (_data, input) => {
      const invalidate = (parentId: string | null) =>
        parentId === null
          ? client.invalidateQueries({ queryKey: ['folders', projectId, 'root'] })
          : client.invalidateQueries({ queryKey: ['folder', parentId] })
      void invalidate(input.fromParentId)
      void invalidate(input.toParentId)
    },
  })
}
