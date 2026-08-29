"""merge heads

Revision ID: e4d53a25eb4a
Revises: 40c8f343b314, 1da165e0f316
Create Date: 2026-08-29 00:45:04.702175

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e4d53a25eb4a"
down_revision: str | Sequence[str] | None = ("40c8f343b314", "1da165e0f316")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
