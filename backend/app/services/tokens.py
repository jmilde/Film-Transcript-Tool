"""Non-destructive token editing.

Implements the four editing operations from ``docs/500_transcript_model.md`` §8:
replace text, soft delete, merge, and split. Nothing is ever hard-deleted —
edits overlay ``edited_text``, deletion sets ``is_deleted``, and merge/split mark
the originals deleted while creating replacement tokens that preserve the timing
of the original range. Fractional ``NUMERIC`` positions let replacements slot in
between existing tokens without renumbering, so token order stays stable.
"""

import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.models.transcript import TranscriptToken


class TokenMergeInvalidSegmentError(BadRequestError):
    """Raised when a merge spans more than one segment.

    A segment boundary marks a speaker change or structural break, so tokens
    from different segments cannot be merged into one.
    """

    code = "TOKEN_MERGE_CROSS_SEGMENT"


def edit_token(
    session: Session,
    token: TranscriptToken,
    edited_text: str | None,
    *,
    user_id: uuid.UUID,
) -> TranscriptToken:
    """Replace a token's display text; timing and ``original_text`` are untouched."""
    token.edited_text = edited_text
    token.updated_by = user_id
    session.flush()
    return token


def delete_token(
    session: Session,
    token: TranscriptToken,
    *,
    user_id: uuid.UUID,
) -> TranscriptToken:
    """Soft-delete a token: it disappears from the transcript but is kept for history."""
    token.is_deleted = True
    token.updated_by = user_id
    session.flush()
    return token


def merge_tokens(
    session: Session,
    tokens: Sequence[TranscriptToken],
    text: str,
    *,
    user_id: uuid.UUID,
) -> TranscriptToken:
    """Replace several same-segment tokens with one spanning their combined timing."""
    if len(tokens) < 2:
        raise BadRequestError("A merge needs at least two tokens")
    if len({token.segment_id for token in tokens}) > 1:
        raise TokenMergeInvalidSegmentError("Tokens must belong to the same segment to merge")

    ordered = sorted(tokens, key=lambda token: token.position)
    for token in ordered:
        token.is_deleted = True
        token.updated_by = user_id

    template = ordered[0]
    replacement = TranscriptToken(
        transcript_id=template.transcript_id,
        segment_id=template.segment_id,
        project_id=template.project_id,
        # The merged token is synthetic; provenance stays on the soft-deleted
        # originals, so its own original_text is simply the provided text.
        original_text=text,
        edited_text=None,
        start_time=ordered[0].start_time,
        end_time=ordered[-1].end_time,
        is_deleted=False,
        # Take the first original's slot so surrounding order is preserved.
        position=ordered[0].position,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(replacement)
    session.flush()
    return replacement


def split_token(
    session: Session,
    token: TranscriptToken,
    texts: Sequence[str],
    *,
    user_id: uuid.UUID,
) -> list[TranscriptToken]:
    """Replace one token with several, interpolating timing evenly across its range."""
    count = len(texts)
    if count < 2:
        raise BadRequestError("A split needs at least two resulting tokens")

    token.is_deleted = True
    token.updated_by = user_id

    start, end = token.start_time, token.end_time
    span = end - start
    lower = token.position
    # Upper bound is the next surviving token in the segment; replacements are
    # spread across (lower, upper) so they stay ordered between their neighbours.
    next_position = session.execute(
        select(func.min(TranscriptToken.position)).where(
            TranscriptToken.segment_id == token.segment_id,
            TranscriptToken.position > token.position,
            TranscriptToken.is_deleted.is_(False),
        )
    ).scalar_one_or_none()
    upper = next_position if next_position is not None else lower + Decimal(1)

    parts: list[TranscriptToken] = []
    for index, part_text in enumerate(texts):
        part = TranscriptToken(
            transcript_id=token.transcript_id,
            segment_id=token.segment_id,
            project_id=token.project_id,
            original_text=part_text,
            edited_text=None,
            start_time=start + span * index / count,
            end_time=start + span * (index + 1) / count,
            is_deleted=False,
            position=lower + (upper - lower) * Decimal(index) / Decimal(count),
            created_by=user_id,
            updated_by=user_id,
        )
        session.add(part)
        parts.append(part)
    session.flush()
    return parts
