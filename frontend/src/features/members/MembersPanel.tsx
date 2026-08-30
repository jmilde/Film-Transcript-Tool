import { useState, type FormEvent } from 'react'
import {
  useInviteMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
  type Member,
  type MembershipRole,
} from '../../api/hooks/useMembers'
import { ApiError } from '../../api/client'
import { Trash2 as TrashIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover'
import { Button } from '../../components/ui/Button'

interface MembersPanelProps {
  projectId: string
  myRole: MembershipRole
}

const ROLE_LABEL: Record<MembershipRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

/**
 * Project members entry point + panel (docs §700 "Project Members"): a
 * header button opens a popover listing members and their roles. An owner
 * additionally sees an invite form and per-row role-change/remove controls;
 * editors/viewers see a read-only list.
 */
export function MembersPanel({ projectId, myRole }: MembersPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          Members
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-small">
        <MembersPanelContent projectId={projectId} myRole={myRole} />
      </PopoverContent>
    </Popover>
  )
}

function MembersPanelContent({ projectId, myRole }: MembersPanelProps) {
  const { data: members, isPending, isError } = useMembers(projectId)
  const inviteMember = useInviteMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const removeMember = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MembershipRole>('editor')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const isOwner = myRole === 'owner'

  function submitInvite(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setInviteError(null)
    inviteMember.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => setEmail(''),
        onError: (err) => setInviteError(errorMessage(err, 'Could not invite this user')),
      },
    )
  }

  function changeRole(member: Member, newRole: MembershipRole) {
    setActionError(null)
    updateRole.mutate(
      { userId: member.user_id, role: newRole },
      { onError: (err) => setActionError(errorMessage(err, 'Could not change this role')) },
    )
  }

  function remove(member: Member) {
    setActionError(null)
    removeMember.mutate(
      { userId: member.user_id },
      { onError: (err) => setActionError(errorMessage(err, 'Could not remove this member')) },
    )
  }

  return (
    <div className="space-y-3">
      {isPending && <p className="text-text-muted">Loading members…</p>}
      {isError && <p className="text-danger-text">Could not load members.</p>}

      {members && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-2 px-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-text">{member.display_name ?? member.email}</p>
                <p className="truncate text-text-muted">{member.email}</p>
              </div>
              {isOwner ? (
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  disabled={updateRole.isPending}
                  onChange={(e) => changeRole(member, e.target.value as MembershipRole)}
                  className="shrink-0 rounded-md border border-border bg-surface px-1 py-0.5 text-text"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-text-muted">
                  {ROLE_LABEL[member.role]}
                </span>
              )}
              {isOwner && (
                <button
                  type="button"
                  aria-label={`Remove ${member.email}`}
                  title="Remove"
                  disabled={removeMember.isPending}
                  onClick={() => remove(member)}
                  className="shrink-0 rounded-md p-1 text-danger-text hover:bg-danger-subtle disabled:opacity-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && <p className="text-danger-text">{actionError}</p>}

      {isOwner && (
        <form onSubmit={submitInvite} className="space-y-2 border-t border-border pt-3">
          <p className="font-medium text-text-muted">Invite a member</p>
          <div className="flex gap-1">
            <input
              type="email"
              required
              aria-label="Email to invite"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-1.5 py-1 text-text"
            />
            <select
              aria-label="Role to invite as"
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="rounded-md border border-border bg-surface px-1 py-1 text-text"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <Button type="submit" disabled={inviteMember.isPending} className="w-full">
            {inviteMember.isPending ? 'Inviting…' : 'Invite'}
          </Button>
          {inviteError && <p className="text-danger-text">{inviteError}</p>}
        </form>
      )}
    </div>
  )
}
