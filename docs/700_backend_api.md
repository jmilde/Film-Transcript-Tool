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

Permissions are evaluated at the project level, via a member's role on that
project's `ProjectMembership`: `owner`, `editor`, or `viewer`.

- `viewer` MAY read: list/get projects, folders, videos, transcripts,
  comments, speakers, exports, and stream media.
- `editor` MAY additionally create/edit/delete content: folders, videos,
  transcript tokens (edit/delete/merge/split), comments (create/reply/
  resolve), exports, translations, and rename speakers.
- `owner` MAY additionally update the project itself and manage membership
  (invite members, change roles, remove members).

A request below the required role receives `403 FORBIDDEN`, same as a
non-member. A project always retains at least one `owner`.

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

Returns project details, including `my_role` — the requesting user's role
(`owner`/`editor`/`viewer`) on this project. `List Projects` and `Create
Project` responses include `my_role` too.

---

## Update Project

```
PATCH /projects/{project_id}
```

Updates project information. Requires `editor` or `owner`.

---

## Project Members

```
GET /projects/{project_id}/members
```

Lists members of a project: `user_id`, `email`, `display_name`, `role`.
Requires `viewer` or above (any member).

```
POST /projects/{project_id}/members
```

Adds an existing user to the project by email, with a given role. Requires
`owner`. The invitee MUST already have signed in at least once (which
provisions their local user record) — inviting an email with no such user
returns `404` telling the inviter the person needs to sign in first. There is
no pending-invite system in this version.

```
PATCH /projects/{project_id}/members/{user_id}
```

Changes a member's role. Requires `owner`. Rejected with `400 LAST_OWNER` if
it would demote the project's last remaining owner.

```
DELETE /projects/{project_id}/members/{user_id}
```

Removes a member. Requires `owner`, **except** a member MAY always remove
themselves (leave the project). Rejected with `400 LAST_OWNER` if it would
remove the project's last remaining owner, including on self-removal.

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

## Media Access Token

```
GET /videos/{video_id}/media-token
```

Mints a short-lived signed token authorizing playback of this video's media.
Requires project membership (Bearer auth). Returns `{ "token", "expires_in" }`.
Needed because a browser `<video>`/`<img>` element cannot send an
`Authorization` header, so the stream is authorized by a `?token=` instead.

---

## Stream Proxy

```
GET /videos/{video_id}/proxy?token={media_token}
```

Streams the playback proxy (falling back to the original) as `video/*` with HTTP
Range support (`206 Partial Content`) so seeking works. Authorized by the signed
`token` query parameter rather than a Bearer header.

---

## Waveform

```
GET /videos/{video_id}/waveform
```

Returns the precomputed waveform peaks JSON (`{ version, sample_rate, peaks }`)
for the timeline display. Fetched via the typed client, so it uses normal Bearer
auth. `404` until the waveform has been generated.

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

Every token response includes `version`. Every mutating request below MUST
include the `expected_version` the client last read for each token it is
modifying — a stale version is rejected (see Concurrency Conflicts below)
rather than applied.

## Update Token

```
PATCH /tokens/{token_id}
```

Used for editing text.

Request:

```json
{
	"edited_text": "there",
	"expected_version": 3
}
```

---

## Delete Token

```
DELETE /tokens/{token_id}?expected_version=3
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
	"tokens": [
		{ "token_id": "uuid1", "expected_version": 3 },
		{ "token_id": "uuid2", "expected_version": 1 }
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
	],
	"expected_version": 3
}
```

---

## Concurrency Conflicts

Any token write above returns `409 CONFLICT` if the supplied
`expected_version` no longer matches the token's current version:

```json
{
	"error": {
		"code": "CONFLICT",
		"message": "This token was edited by someone else",
		"current_tokens": [
			{
				"id": "uuid",
				"version": 4,
				"original_text": "...",
				"edited_text": "...",
				"is_deleted": false,
				"start_time": 1.2,
				"end_time": 1.6
			}
		]
	}
}
```

The write is rejected before anything is mutated. Clients MUST NOT silently
retry or overwrite on a conflict — surface it and let the user reload before
trying again.

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
