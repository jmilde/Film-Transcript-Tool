import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuSeparator = () => (
  <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />
)

export interface DropdownMenuContentProps {
  children: ReactNode
  className?: string
  align?: DropdownMenuPrimitive.DropdownMenuContentProps['align']
  sideOffset?: number
  /** Escape hatch for a menu item whose `onSelect` hands focus to something
   * else (e.g. an inline rename input) — without `preventDefault()` here,
   * Radix's default "return focus to the trigger" on close steals it right
   * back, which (with `autoFocus`) fires that input's `onBlur` before the
   * user can type anything. */
  onCloseAutoFocus?: DropdownMenuPrimitive.DropdownMenuContentProps['onCloseAutoFocus']
}

export function DropdownMenuContent({
  children,
  className = '',
  align = 'start',
  sideOffset = 6,
  onCloseAutoFocus,
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        onCloseAutoFocus={onCloseAutoFocus}
        className={`z-40 min-w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in ${className}`}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

export interface DropdownMenuItemProps {
  children: ReactNode
  onSelect?: (event: Event) => void
  disabled?: boolean
  variant?: 'default' | 'destructive'
  className?: string
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  variant = 'default',
  className = '',
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-body outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface ${
        variant === 'destructive' ? 'text-danger-text' : 'text-text'
      } ${className}`}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  )
}
