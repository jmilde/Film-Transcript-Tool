from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    MergeContext,
    require_merge_context,
    require_token_access,
)
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.transcript import TranscriptToken
from app.models.user import User
from app.schemas.token import TokenEdit, TokenSplitRequest
from app.schemas.transcript import TokenRead
from app.services.tokens import delete_token, edit_token, merge_tokens, split_token

router = APIRouter(tags=["tokens"])


def _token_read(token: TranscriptToken) -> TokenRead:
    return TokenRead(
        id=token.id,
        segment_id=token.segment_id,
        original_text=token.original_text,
        edited_text=token.edited_text,
        text=token.edited_text if token.edited_text is not None else token.original_text,
        start_time=token.start_time,
        end_time=token.end_time,
    )


@router.patch("/tokens/{token_id}", response_model=TokenRead)
def update_token(
    payload: TokenEdit,
    token: TranscriptToken = Depends(require_token_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TokenRead:
    edit_token(db, token, payload.edited_text, user_id=user.id)
    db.commit()
    db.refresh(token)
    return _token_read(token)


@router.delete("/tokens/{token_id}", response_model=TokenRead)
def remove_token(
    token: TranscriptToken = Depends(require_token_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TokenRead:
    delete_token(db, token, user_id=user.id)
    db.commit()
    db.refresh(token)
    return _token_read(token)


@router.post("/tokens/merge", response_model=TokenRead)
def merge(
    context: MergeContext = Depends(require_merge_context),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TokenRead:
    replacement = merge_tokens(db, context.tokens, context.text, user_id=user.id)
    db.commit()
    db.refresh(replacement)
    return _token_read(replacement)


@router.post("/tokens/{token_id}/split", response_model=list[TokenRead])
def split(
    payload: TokenSplitRequest,
    token: TranscriptToken = Depends(require_token_access),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TokenRead]:
    parts = split_token(db, token, [piece.text for piece in payload.tokens], user_id=user.id)
    db.commit()
    for part in parts:
        db.refresh(part)
    return [_token_read(part) for part in parts]
