# Transcript Model Specification

**Project:** Film Transcript Tool
---

# 1. Purpose

This document defines how transcripts are represented, edited, synchronized, and stored.

The transcript model is the foundation for:

- video synchronization
- transcript editing
- comments
- selection
- exports
- future search features

---

# 2. Core Concepts

A transcript consists of:

```
Transcript

	|
	|
	v

Segments

	|
	|
	v

Tokens
```

Each level has a different responsibility.

---

# 3. Transcript

A transcript represents the spoken content of one video in one language.

A video may contain multiple transcripts.

Examples:

```
Interview_01

	English original transcript

	German translation

	French translation
```

Each transcript is edited independently.

---

# 4. Segment

A segment represents a readable block of speech.

Segments are primarily used for:

- display
- speaker grouping
- export formatting

Segments are not the smallest editable unit.

A segment contains multiple tokens.

Example:

```
Segment

Speaker:
John

Tokens:

I
think
this
is
important
```

---

# 5. Token

A token is the smallest editable transcript unit.

Initially:

```
1 Deepgram word = 1 token
```

Example:

Deepgram output:

```
I      00:00.00 - 00:00.20
think  00:00.20 - 00:00.60
so     00:00.60 - 00:00.80
```

becomes:

```
Token 1

text:
I

start:
0.00

end:
0.20


Token 2

text:
think

start:
0.20

end:
0.60
```

---

# 6. Token Data

Every token MUST contain:

```
original_text

edited_text

start_time

end_time

is_deleted
```

---

# 7. Display Text

The visible transcript text is determined by:

```
edited_text

if edited_text exists

otherwise

original_text
```

Example:

```
original_text:

their


edited_text:

there
```

Displayed:

```
there
```

---

# 8. Editing Rules

Editing follows four main operations.

---

# 8.1 Replace Token Text

Most common operation.

Example:

Before:

```
their
```

After:

```
there
```

The token remains unchanged.

Only:

```
edited_text
```

is updated.

Timing remains unchanged.

---

# 8.2 Delete Token

Example:

Before:

```
Well I think...
```

User deletes:

```
Well
```

The token is marked:

```
is_deleted = true
```

The token is not physically removed.

Deleted tokens:

- do not appear in the transcript
- do not participate in playback
- remain available for history/debugging

---

# 8.3 Merge Tokens

Used when multiple tokens become one.

Tokens MUST belong to the same segment to be merged.

Merging tokens across segments is not supported, since a segment boundary represents a speaker change or a structural break.

The new token belongs to the same segment as the original tokens.

Example:

Before:

```
do

not
```

User edits:

```
don't
```

Process:

1. Original tokens are marked deleted.
2. A new token is created.

New token:

```
text:

don't


start:

start of first token


end:

end of last token
```

Example:

```
do

0.20 - 0.40


not

0.40 - 0.60
```

becomes:

```
don't

0.20 - 0.60
```

---

# 8.4 Split Token

Used when one token becomes multiple tokens.

Example:

Before:

```
don't
```

After:

```
do

not
```

Process:

1. Original token is marked deleted.
2. New tokens are created.

If exact timing is unavailable, timestamps are interpolated.

Example:

Original:

```
don't

0.20 - 0.60
```

New:

```
do

0.20 - 0.40


not

0.40 - 0.60
```

The new tokens belong to the same segment as the original token.

---

# 8.5 Concurrent Edits

Version 1 does not provide real-time collaborative editing.

Multiple users MAY still edit the same transcript at different times.

Token edits use last-write-wins:

- Each write updates `updated_by` and `updated_at`.
- A later write replaces an earlier write's `edited_text` without merging changes.

The application does not detect or warn about overwritten edits in version 1.

---

# 9. Token Ordering

Tokens have an ordering within a transcript.

The order is determined by:

1. Segment position
2. Token position

Token order MUST remain stable after edits.

---

# 10. Playback Synchronization

During playback:

1. Current video time is received.
2. The application finds the active token.
3. The active token is highlighted.
4. Optional auto-follow scrolls the transcript.

A token is active when:

```
start_time <= current_time <= end_time
```

---

# 11. Transcript Selection

Users can select a range of tokens.

A selection contains:

```
start_token

end_token
```

The application derives:

```
start_time

end_time
```

from the selected tokens.

Selections are temporary.

They are not stored unless converted into:

- comments
- exports
- future annotations

---

# 12. Comments

Comments attach to token ranges.

A comment stores:

```
start_token

end_token
```

rather than only timestamps.

Reason:

Tokens remain connected to transcript content.

The application calculates displayed timecodes dynamically.

---

# 13. Translation Model

Translations are separate transcripts.

Example:

```
Video

	Transcript EN

	Transcript DE

	Transcript FR
```

Each transcript has its own:

- segments
- tokens
- edits

The relationship between translations and original tokens is not required for version 1.

---

# 14. Speaker Association

Speakers belong to the video.

Segments reference speakers.

Tokens inherit their speaker through their segment.

Example:

```
Video

Speaker:
John


Transcript

Segment

Speaker:
John

Tokens:
Hello
there
```

---

# 15. Export Behavior

Exports always use:

- non-deleted tokens
- displayed token text
- stored timestamps

The export system does not use original_text if edited_text exists.

---

# 16. Future Extensions

The model should allow:

- transcript versioning
- AI annotations
- semantic search
- topic extraction
- editor integration
