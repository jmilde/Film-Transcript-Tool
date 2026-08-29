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
  const [open, setOpen] = useState(false)

  return (
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100"
      >
        Members
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-80 rounded border border-slate-200 bg-white p-3 shadow-lg">
          <MembersPanelContent projectId={projectId} myRole={myRole} />
        </div>
      )}
    </div>
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
      {isPending && <p className="text-slate-500">Loading members…</p>}
      {isError && <p className="text-red-600">Could not load members.</p>}

      {members && (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-2 px-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-800">{member.display_name ?? member.email}</p>
                <p className="truncate text-slate-400">{member.email}</p>
              </div>
              {isOwner ? (
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  disabled={updateRole.isPending}
                  onChange={(e) => changeRole(member, e.target.value as MembershipRole)}
                  className="shrink-0 rounded border border-slate-300 px-1 py-0.5"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
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
                  className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && <p className="text-red-600">{actionError}</p>}

      {isOwner && (
        <form onSubmit={submitInvite} className="space-y-2 border-t border-slate-100 pt-3">
          <p className="font-medium text-slate-500">Invite a member</p>
          <div className="flex gap-1">
            <input
              type="email"
              required
              aria-label="Email to invite"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1"
            />
            <select
              aria-label="Role to invite as"
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="rounded border border-slate-300 px-1 py-1"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteMember.isPending}
            className="w-full rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {inviteMember.isPending ? 'Inviting…' : 'Invite'}
          </button>
          {inviteError && <p className="text-red-600">{inviteError}</p>}
        </form>
      )}
    </div>
  )
}
