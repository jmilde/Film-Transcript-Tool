import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: TooltipPrimitive.TooltipContentProps['side']
  delayDuration?: number
}

/** Self-contained (own `Provider`) rather than requiring one wired at the app
 * root — this is a small project, and letting each `Tooltip` stand alone
 * avoids a hidden ordering dependency for no real cost at this scale. */
export function Tooltip({ content, children, side = 'top', delayDuration = 300 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded-md bg-text px-2.5 py-1.5 text-small text-text-inverted shadow-lg data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-text" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
