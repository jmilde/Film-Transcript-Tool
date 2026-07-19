# Backend API Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines the HTTP API provided by the Film Transcript Tool backend.

The API is responsible for:

- authentication
- authorization
- project management
- media management
- transcript access
- transcript editing
- comments
- exports
- processing status

---

# 2. API Principles

## REST API

The backend exposes a REST-based API.

Resources are represented as URLs.

Example:

```
/projects/{project_id}

/videos/{video_id}

/transcripts/{transcript_id}
```

---

## Authentication

All protected endpoints require authentication.

Authentication is provided through Supabase.

The backend validates the authenticated user before performing actions.

---

## Authorization

Every request MUST verify that the user has permission to access the requested resource.

Permissions are evaluated at the project level.

---

# 3. Response Format

Successful responses return JSON.

Errors return:

```
{
	"error": {
		"code": "ERROR_CODE",
		"message": "Human readable message"
	}
}
```

---

# 4. Projects

## Create Project

```
POST /projects
```

Creates a new project.

Request:

```json
{
	"name": "My Documentary",
	"description": "Optional description"
}
```

Response:

```json
{
	"id": "uuid",
	"name": "My Documentary"
}
```

---

## List Projects

```
GET /projects
```

Returns projects available to the user.

---

## Get Project

```
GET /projects/{project_id}
```

Returns project details.

---

## Update Project

```
PATCH /projects/{project_id}
```

Updates project information.

---

# 5. Folders

## Create Folder

```
POST /projects/{project_id}/folders
```

Request:

```json
{
	"name": "Interviews",
	"parent_folder_id": null
}
```

---

## List Folder Contents

```
GET /folders/{folder_id}
```

Returns:

- child folders
- videos

---

## Update Folder

```
PATCH /folders/{folder_id}
```

Allows:

- rename
- move

---

## Delete Folder

```
DELETE /folders/{folder_id}
```

---

# 6. Videos

## Upload Video

```
POST /folders/{folder_id}/videos
```

Uploads a video.

Supported formats:

- MP4
- MOV

Response:

```json
{
	"video_id": "uuid",
	"processing_job_id": "uuid"
}
```

---

## Get Video

```
GET /videos/{video_id}
```

Returns:

- metadata
- processing status
- available assets

---

## Delete Video

```
DELETE /videos/{video_id}
```

---

# 7. Processing Jobs

## Get Job Status

```
GET /jobs/{job_id}
```

Response:

```json
{
	"type": "transcription",
	"status": "running",
	"progress": 75
}
```

---

## Retry Job

```
POST /jobs/{job_id}/retry
```

Retries failed processing.

---

# 8. Speakers

## List Speakers

```
GET /videos/{video_id}/speakers
```

---

## Update Speaker

```
PATCH /speakers/{speaker_id}
```

Request:

```json
{
	"name": "John"
}
```

---

# 9. Transcripts

## List Transcripts

```
GET /videos/{video_id}/transcripts
```

Returns all available languages.

---

## Get Transcript

```
GET /transcripts/{transcript_id}
```

Returns:

- metadata
- segments
- tokens

---

## Create Translation

```
POST /transcripts/{transcript_id}/translate
```

Creates a translated transcript.

Response:

```json
{
	"job_id": "uuid"
}
```

---

# 10. Transcript Tokens

## Update Token

```
PATCH /tokens/{token_id}
```

Used for editing text.

Request:

```json
{
	"edited_text": "there"
}
```

---

## Delete Token

```
DELETE /tokens/{token_id}
```

Marks token as deleted.

---

## Merge Tokens

```
POST /tokens/merge
```

Request:

```json
{
	"token_ids": [
		"uuid1",
		"uuid2"
	],
	"text": "don't"
}
```

Creates replacement token.

---

## Split Token

```
POST /tokens/{token_id}/split
```

Request:

```json
{
	"tokens": [
		{
			"text": "do"
		},
		{
			"text": "not"
		}
	]
}
```

---

# 11. Comments

## Create Comment

```
POST /transcripts/{transcript_id}/comments
```

Request:

```json
{
	"start_token_id": "uuid",
	"end_token_id": "uuid",
	"text": "Check this quote"
}
```

---

## List Comments

```
GET /transcripts/{transcript_id}/comments
```

---

## Reply To Comment

```
POST /comments/{comment_id}/replies
```

---

## Resolve Comment

```
PATCH /comments/{comment_id}
```

---

# 12. Search

## Search Project

```
GET /projects/{project_id}/search
```

Query:

```
?q=climate
```

Searches:

- transcript text
- speakers
- comments

Returns matching locations.

---

# 13. Exports

## Create Export

```
POST /transcripts/{transcript_id}/exports
```

Request:

```json
{
	"format": "srt"
}
```

Response:

```json
{
	"job_id": "uuid"
}
```

---

## Get Export

```
GET /exports/{export_id}
```

An export only exists once its job has completed.

Returns the exported file location.

Use `GET /jobs/{job_id}` to track progress before completion.

---

# 14. Health

## Health Check

```
GET /health
```

Used for deployment monitoring.

Response:

```json
{
	"status": "ok"
}
```

---

# 15. Future API Extensions

The API should allow future additions:

- AI search
- transcript analysis
- Resolve exports
- batch processing
- collaboration features
