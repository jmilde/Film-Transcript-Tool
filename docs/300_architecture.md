# Architecture Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document describes the high-level architecture of Film Transcript Tool.

The architecture is designed to support:

- local development
- local deployment
- future cloud deployment
- separation of concerns
- independent scaling of components

---

# 2. Architecture Principles

## Local First

The application SHOULD run locally using Docker Compose.

A developer or production user should be able to start the application without requiring cloud infrastructure.

External services such as transcription APIs are exceptions.

---

## Cloud Ready

The architecture SHOULD allow migration to hosted infrastructure later.

Components SHOULD avoid unnecessary coupling to:

- local filesystem paths
- specific hosting providers
- single-machine assumptions

---

## Separation of Responsibilities

Each component should have a clear responsibility.

The frontend handles:

- user interaction
- display
- client-side state

The backend handles:

- business logic
- authentication
- permissions
- data management

Workers handle:

- long-running processing tasks

External services handle:

- specialized processing such as transcription

---

# 3. High-Level Architecture

The application consists of the following components:

```
Frontend
   |
   |
Backend API
   |
   |
-------------------------
|           |           |
Database   Storage    Worker
|
|
External Services
```

---

# 4. Frontend

## Technology

The frontend uses:

- React
- TypeScript
- Vite
- TailwindCSS

---

## Responsibilities

The frontend is responsible for:

- rendering application views
- handling user interactions
- displaying video playback
- displaying transcript synchronization
- managing temporary UI state
- communicating with the backend API

---

## The frontend MUST NOT:

- directly access the database
- directly modify media files
- contain business logic for processing jobs

---

# 5. Backend API

## Technology

The backend uses:

- Python
- FastAPI
- SQLAlchemy
- Pydantic

---

## Responsibilities

The backend handles:

- authentication checks
- authorization
- project management
- folder management
- video metadata
- transcript management
- comments
- exports
- processing orchestration

---

## The backend MUST:

- validate incoming data
- enforce permissions
- expose typed API responses
- manage database transactions

---

# 6. Background Worker

Long-running tasks MUST NOT run inside API requests.

Examples:

- proxy generation
- waveform generation
- transcription
- translation
- exports

These tasks run asynchronously through workers.

---

## Worker Responsibilities

The worker:

- receives processing jobs
- executes long-running tasks
- updates processing status
- stores results

Version 1 uses a PostgreSQL-backed job queue.

Workers poll the database for pending jobs.

PostgreSQL row locking prevents multiple workers from processing the same job.

Additional queue systems MAY be introduced later.
---

# 7. Database

The application uses PostgreSQL.

Supabase provides:

- hosted PostgreSQL
- authentication integration
- storage integration

The database stores:

- users
- projects
- folders
- videos
- transcripts
- tokens
- comments
- processing state

---

# 8. Storage

Media files are stored separately from relational data.

Storage contains:

- original videos
- proxy videos
- waveforms
- exported files


Version 1 uses local filesystem storage.

The application MUST access storage through an abstraction layer.

The database stores storage identifiers, not absolute filesystem paths.

Future storage providers MAY include:

- Supabase Storage
- S3-compatible storage

---

# 9. Media Processing

Media processing uses FFmpeg.

Processing includes:

- proxy generation
- waveform extraction
- metadata extraction

Media processing runs in workers.

---

# 10. Transcription Service

Deepgram is used for:

- speech-to-text
- speaker diarization
- word timestamps

The backend communicates with Deepgram through an abstraction layer.

The application SHOULD avoid coupling the transcript model directly to Deepgram responses.

---

# 11. Translation Service

Translation is optional.

The translation layer SHOULD be independent from transcription.

Possible providers:

- external APIs
- self-hosted translation models
- local libraries

A transcript translation is stored separately from the original transcript.

---

# 12. Authentication

Authentication is provided by Supabase.

The application supports multiple users.

Authentication information is used by the backend for:

- identifying users
- checking project access
- recording edits

---

# 13. Docker Deployment

The development environment SHOULD run through Docker Compose.

Expected services:

```
frontend

backend

worker

database
```

External services:

```
Supabase

Deepgram
```

may be configured separately.

---

# 14. Future Deployment

The architecture SHOULD allow:

Local:

```
Docker Compose
+
local storage
+
Supabase
```

Future hosted:

```
Frontend hosting

Backend API service

Worker service

PostgreSQL

Object storage
```

without changing application behaviour.

---

# 15. Out of Scope

The architecture does not currently include:

- AI processing services
- vector databases
- real-time collaboration servers
- video editing integrations
- distributed processing
