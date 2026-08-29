import { isNodeSelection } from '@tiptap/core'
import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu'

/** Distinguishes what the shared `BubbleMenu` popup should key off: a plain
 * text selection (formatting + comment) vs. a `NodeSelection` over a
 * `clipBlock` node (play/comment/remove) — anything else (an empty
 * selection, or a NodeSelection over some other node type) hides the popup. */
export function shouldShowBubble({
  state,
}: Parameters<NonNullable<BubbleMenuPluginProps['shouldShow']>>[0]) {
  const { selection } = state
  if (selection.empty) return false
  if (isNodeSelection(selection)) return selection.node.type.name === 'clipBlock'
  return true
}
