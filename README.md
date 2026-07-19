# Film Transcript Tool
> A local-first transcript management application for documentary filmmakers.
Film Transcript Tool helps filmmakers organize interview footage by combining automatic transcription, speaker diarization, transcript editing, comments, and synchronized video playback into a single application.
The application is designed to complement professional editing software such as DaVinci Resolve rather than replace it.

---

# Goals
The project focuses on providing a fast and intuitive transcript-first workflow.
Core goals include:
- Local-first development and deployment
- Automatic transcription using Deepgram
- Speaker diarization and speaker management
- Transcript editing
- Transcript comments
- Nested project organization
- Fast transcript search
- High-quality proxy generation
- Markdown and SRT export
- Docker-based deployment
- Cloud-ready architecture

---

# Non Goals (Version 1)
Version 1 intentionally excludes:
- AI assistants
- Semantic search
- Automatic summaries
- Topic extraction
- DaVinci Resolve integration
- Collaborative real-time editing
- Mobile applications

The architecture should make these features easy to add in later versions.

---

# Technology Stack

## Backend

- Python 3.13+
- FastAPI
- SQLAlchemy 2.x
- Pydantic v2
- Alembic
- uv

## Frontend

- React
- TypeScript
- Vite
- TailwindCSS
- TanStack Query
- React Router

## Database

- PostgreSQL
- Supabase (Database, Authentication and Storage)

## Media

- FFmpeg
- Deepgram API

## Deployment

- Docker
- Docker Compose

---

# Core Features

- Project management
- Nested folders
- Video uploads
- Automatic proxy generation
- Waveform generation
- Speaker diarization
- Transcript editing
- Transcript synchronization
- Comments
- Search
- Markdown export
- SRT export

---

# Documentation

Project documentation is located in `/docs`.

| Document | Description |
|-----------|-------------|
| 100_product_spec.md | Functional product specification |
| 200_user_workflows.md | User workflows |
| 300_architecture.md | System architecture |
| 400_database.md | Database schema |
| 500_transcript_model.md | Transcript editing model |
| 600_processing_pipeline.md | Processing pipeline |
| 700_backend_api.md | REST API |
| 800_frontend.md | Frontend architecture |
| 900_export.md | Export formats |
