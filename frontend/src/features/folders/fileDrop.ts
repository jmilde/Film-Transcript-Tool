// Mirrors `backend/app/api/routes/videos.py`'s `ALLOWED_EXTENSIONS` — kept in
// sync by hand since the two sides have no shared source of truth for it.
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov']

export function isAllowedVideoFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return ALLOWED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function filterVideoFiles(files: File[]): File[] {
  return files.filter((file) => isAllowedVideoFile(file.name))
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

/** `readEntries` only returns up to ~100 entries per call and must be called
 * repeatedly until it returns empty to see the rest of a large directory. */
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch = await readEntryBatch(reader)
  while (batch.length > 0) {
    all.push(...batch)
    batch = await readEntryBatch(reader)
  }
  return all
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function walkEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await readEntryFile(entry as FileSystemFileEntry)]
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    const nested = await Promise.all(entries.map(walkEntry))
    return nested.flat()
  }
  return []
}

/**
 * Recursively walks a drop's `DataTransferItem`s — including OS folders,
 * which don't expose their nested files directly and must be traversed via
 * `webkitGetAsEntry()` — into a flat `File[]` (no app-Folder mirroring; see
 * the design spec's Non-goals). Falls back to `getAsFile()` for any item
 * without file-system-entry support (non-Chromium browsers dropping plain
 * files still work; they just can't have a folder dropped on them).
 */
export async function collectDroppedFiles(items: DataTransferItemList): Promise<File[]> {
  const results = await Promise.all(
    Array.from(items).map(async (item) => {
      const entry = item.webkitGetAsEntry?.()
      if (entry) return walkEntry(entry)
      const file = item.getAsFile()
      return file ? [file] : []
    }),
  )
  return results.flat()
}
