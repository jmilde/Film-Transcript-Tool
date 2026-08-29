import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { ReactNode } from 'react'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close

export interface PopoverContentProps {
  children: ReactNode
  className?: string
  align?: PopoverPrimitive.PopoverContentProps['align']
  sideOffset?: number
}

export function PopoverContent({
  children,
  className = '',
  align = 'center',
  sideOffset = 6,
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={`z-40 rounded-lg border border-border bg-surface-raised p-3 shadow-lg outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in ${className}`}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}
