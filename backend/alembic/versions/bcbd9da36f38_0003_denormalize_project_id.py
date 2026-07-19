"""0003 denormalize project_id

Revision ID: bcbd9da36f38
Revises: e4354408f955
Create Date: 2026-07-19 14:52:37.477227

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bcbd9da36f38"
down_revision: str | Sequence[str] | None = "e4354408f955"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # videos.project_id: add nullable, backfill from the owning folder, then
    # enforce NOT NULL (a video always belongs to a project).
    op.add_column("videos", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE videos SET project_id = folders.project_id "
        "FROM folders WHERE videos.folder_id = folders.id"
    )
    op.alter_column("videos", "project_id", nullable=False)
    op.create_index(op.f("ix_videos_project_id"), "videos", ["project_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_videos_project_id_projects"),
        "videos",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # processing_jobs.project_id: nullable (matches video_id), backfilled from
    # the job's video where one exists.
    op.add_column("processing_jobs", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE processing_jobs SET project_id = videos.project_id "
        "FROM videos WHERE processing_jobs.video_id = videos.id"
    )
    op.create_index(
        op.f("ix_processing_jobs_project_id"), "processing_jobs", ["project_id"], unique=False
    )
    op.create_foreign_key(
        op.f("fk_processing_jobs_project_id_projects"),
        "processing_jobs",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("fk_videos_project_id_projects"), "videos", type_="foreignkey")
    op.drop_index(op.f("ix_videos_project_id"), table_name="videos")
    op.drop_column("videos", "project_id")
    op.drop_constraint(
        op.f("fk_processing_jobs_project_id_projects"), "processing_jobs", type_="foreignkey"
    )
    op.drop_index(op.f("ix_processing_jobs_project_id"), table_name="processing_jobs")
    op.drop_column("processing_jobs", "project_id")
