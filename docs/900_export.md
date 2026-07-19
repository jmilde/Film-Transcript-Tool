# Export Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines transcript export behavior.

The export system converts edited transcripts into external formats suitable for:

- review
- sharing
- documentation
- subtitle workflows

Version 1 supports:

- Markdown
- SRT

---

# 2. Export Principles

## Use Edited Transcript

Exports MUST always use the current visible transcript.

The export system uses:

- edited token text where available
- original token text otherwise

Deleted tokens are excluded.

---

## Preserve Timing

All exported content MUST preserve timestamps.

---

## Preserve Speaker Information

Where supported, exports SHOULD include speaker information.

---

# 3. Export Workflow

1. User opens export dialog.
2. User selects format.
3. User starts export.
4. Backend creates export job.
5. Worker generates file.
6. User receives exported file.

---

# 4. Markdown Export

Markdown exports are intended for:

- Google Docs
- Notion
- writing workflows
- review documents

---

# 4.1 Markdown Structure

Example:

```markdown
# Interview Name

## Speaker: John

[00:00:12 - 00:00:18]

I think this is important because...

[00:00:19 - 00:00:25]

The next section discusses...
```

---

# 4.2 Markdown Rules

The export SHOULD include:

- video name
- transcript language
- speakers
- timestamps
- transcript text

---

# 4.3 Timestamp Format

Default format:

```
HH:MM:SS
```

Example:

```
00:12:35
```

---

# 5. SRT Export

SRT exports are intended for:

- subtitle workflows
- video platforms
- editing software

---

# 5.1 SRT Structure

Example:

```
1
00:00:12,000 --> 00:00:15,500
I think this is important.

2
00:00:15,500 --> 00:00:18,000
The next section discusses...
```

---

# 5.2 SRT Timing

SRT uses:

```
HH:MM:SS,mmm
```

Example:

```
00:01:02,500
```

Milliseconds are calculated from token timestamps.

---

# 5.3 SRT Segmentation

Subtitle blocks are generated from transcript segments.

The export SHOULD avoid:

- extremely short subtitles
- extremely long subtitles
- unreadable text density

Future versions MAY include configurable subtitle rules.

---

# 6. Speaker Handling

Markdown exports SHOULD include speaker names.

Example:

```
John:

I think this is important.
```

SRT exports MAY include speaker names.

Example:

```
<John>
I think this is important.
```

---

# 7. Translation Export

Translated transcripts export the same way as original transcripts.

A translation export contains:

- translated text
- translated transcript language
- translated timestamps

---

# 8. Export Jobs

Exports are asynchronous.

A job contains:

- transcript
- format
- status
- generated file

---

# 9. Future Extensions

Possible future formats:

- Final Cut Pro XML
- DaVinci Resolve markers
- Adobe Premiere formats
- CSV
- JSON
- AI analysis exports
