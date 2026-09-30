import uuid

from pydantic import BaseModel


class TokenEdit(BaseModel):
    # Nullable so a client can clear an edit and fall back to original_text.
    edited_text: str | None


class TokenHighlightUpdate(BaseModel):
    is_highlighted: bool


class TokenMergeItem(BaseModel):
    token_id: uuid.UUID


class TokenMergeRequest(BaseModel):
    tokens: list[TokenMergeItem]
    text: str


class TokenSplitPiece(BaseModel):
    text: str


class TokenSplitRequest(BaseModel):
    tokens: list[TokenSplitPiece]
