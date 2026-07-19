import uuid

from pydantic import BaseModel


class TokenEdit(BaseModel):
    # Nullable so a client can clear an edit and fall back to original_text.
    edited_text: str | None


class TokenMergeRequest(BaseModel):
    token_ids: list[uuid.UUID]
    text: str


class TokenSplitPiece(BaseModel):
    text: str


class TokenSplitRequest(BaseModel):
    tokens: list[TokenSplitPiece]
