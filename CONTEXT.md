# Film Transcript Tool

A tool for reviewing, editing, and translating film transcripts, and building documents that mix prose with clip references back to the source footage.

## Language

**Token**:
The smallest editable unit of a transcript — carries both `original_text` and `edited_text`, with soft-delete via `is_deleted` (see `docs/400_database.md`).
_Avoid_: Using "token" for anything in the frontend design system — see **theme variable** below.

**Theme variable**:
A reusable style value (color, spacing, radius, type scale) defined once and referenced throughout the frontend UI layer.
_Avoid_: "Design token" — collides with the existing, unrelated meaning of **Token** above.
