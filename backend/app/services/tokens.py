"""Non-destructive token editing.

Implements the four editing operations from ``docs/500_transcript_model.md`` §8:
replace text, soft delete, merge, and split. Nothing is ever hard-deleted —
edits overlay ``edited_text``, deletion sets ``is_deleted``, and merge/split mark
the originals deleted while creating replacement tokens that preserve the timing
of the original range. Fractional ``NUMERIC`` positions let replacements slot in
between existing tokens without renumbering, so token order stays stable.

Every mutating operation is optimistically locked: the caller supplies the
``version`` it last saw, the target row(s) are re-read with ``FOR UPDATE``
inside the same transaction (closing the gap between the request's initial
fetch and this write), and a mismatch raises ``ConflictError`` with the
row's current state *before* anything is mutated — never silently overwritten.
"""

import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError
from app.models.transcript import TranscriptToken


class TokenMergeInvalidSegmentError(BadRequestError):
    """Raised when a merge spans more than one segment.

    A segment boundary marks a speaker change or structural break, so tokens
    from different segments cannot be merged into one.
    """

    code = "TOKEN_MERGE_CROSS_SEGMENT"


def _snapshot(token: TranscriptToken) -> dict[str, object]:
    return {
        "id": str(token.id),
        "version": token.version,
        "original_text": token.original_text,
        "edited_text": token.edited_text,
        "is_deleted": token.is_deleted,
        "start_time": token.start_time,
        "end_time": token.end_time,
    }


def _lock(session: Session, token_id: uuid.UUID) -> TranscriptToken:
    """Re-read a token with ``FOR UPDATE``, serializing concurrent writers.

    ``populate_existing`` is required here: the caller (e.g. the token-edit
    route) typically already loaded this token earlier in the same session,
    so without it SQLAlchemy's identity map would return that stale, already
    in-memory object instead of refreshing it from the row this query just
    locked — silently defeating the ``expected_version`` conflict check for
    a concurrent writer that committed in between.
    """
    return session.execute(
        select(TranscriptToken)
        .where(TranscriptToken.id == token_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one()


def _check_version(tokens: Sequence[TranscriptToken], expected: dict[uuid.UUID, int]) -> None:
    stale = [token for token in tokens if token.version != expected[token.id]]
    if stale:
        raise ConflictError(
            "This token was edited by someone else",
            details={"current_tokens": [_snapshot(token) for token in stale]},
        )


def edit_token(
    session: Session,
    token: TranscriptToken,
    edited_text: str | None,
    *,
    user_id: uuid.UUID,
    expected_version: int,
) -> TranscriptToken:
    """Replace a token's display text; timing and ``original_text`` are untouched."""
    locked = _lock(session, token.id)
    _check_version([locked], {locked.id: expected_version})
    locked.edited_text = edited_text
    locked.updated_by = user_id
    locked.version += 1
    session.flush()
    return locked


def delete_token(
    session: Session,
    token: TranscriptToken,
    *,
    user_id: uuid.UUID,
    expected_version: int,
) -> TranscriptToken:
    """Soft-delete a token: it disappears from the transcript but is kept for history."""
    locked = _lock(session, token.id)
    _check_version([locked], {locked.id: expected_version})
    locked.is_deleted = True
    locked.updated_by = user_id
    locked.version += 1
    session.flush()
    return locked


def merge_tokens(
    session: Session,
    tokens: Sequence[TranscriptToken],
    text: str,
    *,
    user_id: uuid.UUID,
    expected_versions: dict[uuid.UUID, int],
) -> TranscriptToken:
    """Replace several same-segment tokens with one spanning their combined timing."""
    if len(tokens) < 2:
        raise BadRequestError("A merge needs at least two tokens")
    if len({token.segment_id for token in tokens}) > 1:
        raise TokenMergeInvalidSegmentError("Tokens must belong to the same segment to merge")

    locked = [_lock(session, token.id) for token in tokens]
    _check_version(locked, expected_versions)

    ordered = sorted(locked, key=lambda token: token.position)
    for token in ordered:
        token.is_deleted = True
        token.updated_by = user_id
        token.version += 1

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
    expected_version: int,
) -> list[TranscriptToken]:
    """Replace one token with several, interpolating timing evenly across its range."""
    count = len(texts)
    if count < 2:
        raise BadRequestError("A split needs at least two resulting tokens")

    locked = _lock(session, token.id)
    _check_version([locked], {locked.id: expected_version})

    locked.is_deleted = True
    locked.updated_by = user_id
    locked.version += 1

    start, end = locked.start_time, locked.end_time
    span = end - start
    lower = locked.position
    # Upper bound is the next surviving token in the segment; replacements are
    # spread across (lower, upper) so they stay ordered between their neighbours.
    next_position = session.execute(
        select(func.min(TranscriptToken.position)).where(
            TranscriptToken.segment_id == locked.segment_id,
            TranscriptToken.position > locked.position,
            TranscriptToken.is_deleted.is_(False),
        )
    ).scalar_one_or_none()
    upper = next_position if next_position is not None else lower + Decimal(1)

    parts: list[TranscriptToken] = []
    for index, part_text in enumerate(texts):
        part = TranscriptToken(
            transcript_id=locked.transcript_id,
            segment_id=locked.segment_id,
            project_id=locked.project_id,
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
