import { CircleUserRound } from 'lucide-react'
import { useAuth } from '../auth/context'
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover'
import { Button } from './ui/Button'

/**
 * Header account entry point: a compact icon button (not a loose email +
 * Sign out pair taking up header width) opens a popover with the signed-in
 * email and Sign out — room to grow with account settings later without
 * the header itself needing to change.
 */
export function UserMenu() {
  const { session, signOut } = useAuth()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-muted hover:text-text"
        >
          <CircleUserRound className="h-5 w-5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="truncate text-small text-text">{session?.user.email}</p>
        <Button variant="secondary" size="sm" onClick={() => void signOut()} className="w-full">
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  )
}
