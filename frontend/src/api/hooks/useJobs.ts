import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

export type Job = components['schemas']['JobRead']
export type JobStatus = components['schemas']['JobStatus']

const ACTIVE: ReadonlySet<JobStatus> = new Set<JobStatus>(['pending', 'running'])

export function isJobDone(status: JobStatus): boolean {
  return !ACTIVE.has(status)
}

/**
 * Track a processing job, polling while it is pending/running and stopping once
 * it reaches a terminal state.
 */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    enabled: jobId !== null,
    queryFn: async () =>
      unwrap(await api.GET('/jobs/{job_id}', { params: { path: { job_id: jobId as string } } })),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && ACTIVE.has(status) ? 1500 : false
    },
  })
}

/** Retry a failed job. A plain function (like `uploadVideoFile`) rather than
 * a mutation hook, since the upload-queue runner retries an arbitrary job id
 * imperatively rather than from a component bound to one job. */
export async function retryJob(jobId: string): Promise<Job> {
  return unwrap(await api.POST('/jobs/{job_id}/retry', { params: { path: { job_id: jobId } } }))
}
