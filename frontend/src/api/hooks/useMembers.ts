import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Member = components['schemas']['MemberRead']
export type MembershipRole = components['schemas']['MembershipRole']

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: ['members', projectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/projects/{project_id}/members', {
          params: { path: { project_id: projectId } },
        }),
      ),
  })
}

export function useInviteMember(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: MembershipRole }) =>
      unwrap(
        await api.POST('/projects/{project_id}/members', {
          params: { path: { project_id: projectId } },
          body: { email: input.email, role: input.role },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}

export function useUpdateMemberRole(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; role: MembershipRole }) =>
      unwrap(
        await api.PATCH('/projects/{project_id}/members/{user_id}', {
          params: { path: { project_id: projectId, user_id: input.userId } },
          body: { role: input.role },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}

export function useRemoveMember(projectId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string }) =>
      unwrap(
        await api.DELETE('/projects/{project_id}/members/{user_id}', {
          params: { path: { project_id: projectId, user_id: input.userId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}
