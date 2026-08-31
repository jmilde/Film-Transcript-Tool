import { describe, expect, it } from 'vitest'
import { findOrphanedCommentIds } from './orphanedComments'
import type { Comment } from '../../api/hooks/useComments'

function textComment(id: string): Comment {
  return {
    id,
    created_by: 'user-a',
    text: 'note',
    resolved: false,
    anchor: { kind: 'document', document_id: 'doc-1', clip_node_id: null, excerpt: 'hi' },
    created_at: '2026-01-01T00:00:00Z',
    replies: [],
  }
}

function clipComment(id: string, nodeId: string): Comment {
  return {
    ...textComment(id),
    anchor: { kind: 'document', document_id: 'doc-1', clip_node_id: nodeId, excerpt: null },
  }
}

describe('findOrphanedCommentIds', () => {
  it('keeps a text-mark comment whose mark is still present', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi', marks: [{ type: 'comment', attrs: { commentId: 'c-1' } }] }],
        },
      ],
    }

    expect(findOrphanedCommentIds(content, [textComment('c-1')])).toEqual([])
  })

  it('orphans a text-mark comment whose mark was removed', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }

    expect(findOrphanedCommentIds(content, [textComment('c-1')])).toEqual(['c-1'])
  })

  it('keeps a clip comment whose clipBlock node is still present', () => {
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'clipBlock', attrs: { nodeId: 'n-1' } }] }],
    }

    expect(findOrphanedCommentIds(content, [clipComment('c-2', 'n-1')])).toEqual([])
  })

  it('orphans a clip comment whose clipBlock node was removed', () => {
    const content = { type: 'doc', content: [] }

    expect(findOrphanedCommentIds(content, [clipComment('c-2', 'n-1')])).toEqual(['c-2'])
  })

  it('excludes ids in the exclusion set even when orphaned', () => {
    const content = { type: 'doc', content: [] }

    expect(findOrphanedCommentIds(content, [textComment('c-1')], new Set(['c-1']))).toEqual([])
  })
})
