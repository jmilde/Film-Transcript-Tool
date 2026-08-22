# User Workflows

**Project:** Film Transcript Tool

---

# Purpose

This document describes the primary user workflows supported by Film Transcript Tool.

The workflows define expected user interactions independently of implementation details.

---

# Workflow 1 – Create a Project

## Goal

Create a new project for a documentary or film production.

## Steps

1. Open the application.
2. Select **New Project**.
3. Enter a project name.
4. Optionally enter a description.
5. Create the project.

## Result

The project is created.

The user is taken to the project overview.

---

# Workflow 2 – Organize a Project

## Goal

Organize media before uploading.

## Steps

1. Open a project.
2. Create folders.
3. Create nested folders if required.
4. Rename folders.
5. Move folders.

## Result

The folder hierarchy represents the production structure.

Example:

Project

├── Interviews
│   ├── Director
│   ├── Producer
│   └── Cast
│
├── B-Roll
│   ├── City
│   └── Office
│
└── Archive

---

# Workflow 3 – Upload a Video

## Goal

Add footage to a project.

## Steps

1. Open a folder.
2. Select **Upload Video**.
3. Choose one or more MP4 or MOV files.
4. Confirm upload.

## Result

The uploaded videos appear immediately.

Each video displays its current processing state.

---

# Workflow 4 – Process a Video

## Goal

Automatically prepare uploaded footage.

## Processing

The application performs:

1. Store original media.
2. Generate proxy.
3. Generate waveform.
4. Request transcription.
5. Detect speakers.
6. Store transcript.
7. Optionally generate translations.

## Result

The video becomes available for review.

---

# Workflow 5 – Rename Speakers

## Goal

Replace automatically generated speaker labels.

## Steps

1. Open a processed video.
2. Open the speaker list.
3. Select a speaker.
4. Enter a display name.

Example

Speaker 0

↓

John

## Result

All transcripts belonging to the video display the new speaker name.

---

# Workflow 6 – Review a Transcript

## Goal

Review the transcript while watching the video.

## Steps

1. Open a video.
2. Play the video.
3. Observe transcript highlighting.
4. Enable or disable auto-follow.
5. Click transcript text to seek the video.
6. Select transcript text to play only that range.

## Result

Transcript and video remain synchronized.

---

# Workflow 7 – Correct a Transcript

## Goal

Correct transcription mistakes.

## Supported operations

- Edit token text.
- Delete tokens.
- Merge tokens.
- Split tokens.

## Result

The transcript reflects the user's corrections.

Timing remains valid.

---

# Workflow 8 – Review a Translation

## Goal

Compare translated transcripts with the original.

## Steps

1. Open a translated transcript.
2. Enable dual transcript view.
3. Display original and translated transcripts side by side.

## Result

Both transcripts remain synchronized with the video.

Users may edit either transcript independently.

---

# Workflow 9 – Comment on a Transcript

## Goal

Leave review notes for collaborators.

## Steps

1. Select one or more transcript tokens.
2. Create a comment.
3. Enter comment text.
4. Save.

Other users may:

- reply
- resolve the thread

## Result

The selected transcript range displays a comment indicator.

---

# Workflow 10 – Search

## Goal

Locate content quickly.

## Steps

1. Enter a search term.
2. Review matching results.
3. Select a result.

## Result

The video seeks to the matching location.

The matching transcript range is highlighted.

---

# Workflow 11 – Export

## Goal

Export the edited transcript.

## Steps

1. Open the export dialog.
2. Select a format.
3. Export.

Supported formats:

- Markdown
- SRT

## Result

The exported transcript reflects the edited transcript.

---

# Workflow 12 – Collaborate

## Goal

Allow multiple users to work on the same project, with permissions matched
to what each collaborator should be allowed to change.

## Roles

Each member holds one role on a project: `owner`, `editor`, or `viewer`. A
project's creator becomes its first `owner`.

- `viewer` can view everything but cannot make changes.
- `editor` can edit transcripts, rename speakers, leave/reply to comments,
  manage videos and folders, translate, and export.
- `owner` can additionally rename/archive the project and manage membership.

A project always keeps at least one `owner`.

## Inviting members

An `owner` invites a collaborator by email from the project's Members panel,
choosing their role. The invitee must have signed into the application at
least once already; inviting someone who hasn't yet is rejected with a
message asking the inviter to have them sign in first. There is no
pending-invite/email-notification system in Version 1.

An `owner` can change a member's role or remove them at any time (as long as
a project always keeps at least one owner). Any member can leave a project
themselves.

## Editing conflicts

If two collaborators edit the same transcript token at the same time,
whoever saves second sees a conflict notice showing the token's current
server state, with a manual option to reload before retrying — edits are
never silently overwritten or auto-merged.

The application records:

- creator
- last editor
- timestamps

The application does not provide real-time collaborative editing in Version 1.


# Workflow 12 – Select a Transcript Range

## Goal

Allow users to select a specific part of a transcript and perform actions on that section.

Transcript selection is a core interaction used by:

- playback
- comments
- editing
- copying text

## Steps

1. User clicks and drags across transcript text.
2. The application determines the selected token range.
3. The selected tokens become visually highlighted.
4. The application displays the selection boundaries.

The selection displays:

- start timecode
- end timecode

## Available Actions

After selecting a range, the user may:

- Play selected range
- Create a comment
- Copy selected text
- Edit selected text
- Cancel selection

## Result

The selected transcript range remains linked to the corresponding video position.

Any action performed on the selection uses the selected token range as its source.
