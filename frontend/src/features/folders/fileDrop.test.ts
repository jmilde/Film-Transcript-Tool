import { describe, expect, it } from 'vitest'
import { collectDroppedFiles, filterVideoFiles, isAllowedVideoFile } from './fileDrop'

function makeFile(name: string): File {
  return new File(['x'], name)
}

describe('isAllowedVideoFile / filterVideoFiles', () => {
  it('allows .mp4 and .mov, case-insensitively', () => {
    expect(isAllowedVideoFile('clip.mp4')).toBe(true)
    expect(isAllowedVideoFile('CLIP.MOV')).toBe(true)
    expect(isAllowedVideoFile('notes.txt')).toBe(false)
    expect(isAllowedVideoFile('clip.mp4.txt')).toBe(false)
  })

  it('filters a mixed file list down to allowed video extensions', () => {
    const files = [makeFile('a.mp4'), makeFile('readme.txt'), makeFile('b.MOV'), makeFile('c.avi')]
    expect(filterVideoFiles(files).map((f) => f.name)).toEqual(['a.mp4', 'b.MOV'])
  })
})

// Minimal duck-typed stand-ins for the File System Entry API, which jsdom
// doesn't implement — real browsers hand these to `webkitGetAsEntry()`.
function fileEntry(file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (success) => success(file),
  } as unknown as FileSystemFileEntry
}

function directoryEntry(entries: FileSystemEntry[]): FileSystemDirectoryEntry {
  let read = false
  return {
    isFile: false,
    isDirectory: true,
    name: 'dir',
    createReader: () => ({
      // Real browsers paginate; a single batch then empty is enough to prove
      // the "call until empty" loop terminates and collects everything.
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        if (read) {
          success([])
        } else {
          read = true
          success(entries)
        }
      },
    }),
  } as unknown as FileSystemDirectoryEntry
}

function dataTransferItem(entry: FileSystemEntry | null, fallbackFile?: File): DataTransferItem {
  return {
    webkitGetAsEntry: () => entry,
    getAsFile: () => fallbackFile ?? null,
  } as unknown as DataTransferItem
}

describe('collectDroppedFiles', () => {
  it('collects plain file drops', async () => {
    const items = [
      dataTransferItem(fileEntry(makeFile('a.mp4'))),
    ] as unknown as DataTransferItemList
    const files = await collectDroppedFiles(items)
    expect(files.map((f) => f.name)).toEqual(['a.mp4'])
  })

  it('recursively walks a dropped folder into a flat file list', async () => {
    const nestedDir = directoryEntry([fileEntry(makeFile('nested.mp4'))])
    const topDir = directoryEntry([fileEntry(makeFile('top.mp4')), nestedDir])
    const items = [dataTransferItem(topDir)] as unknown as DataTransferItemList

    const files = await collectDroppedFiles(items)

    expect(files.map((f) => f.name).sort()).toEqual(['nested.mp4', 'top.mp4'])
  })

  it('falls back to getAsFile when webkitGetAsEntry is unavailable', async () => {
    const file = makeFile('firefox.mp4')
    const item = { getAsFile: () => file } as unknown as DataTransferItem
    const items = [item] as unknown as DataTransferItemList

    const files = await collectDroppedFiles(items)

    expect(files.map((f) => f.name)).toEqual(['firefox.mp4'])
  })
})
