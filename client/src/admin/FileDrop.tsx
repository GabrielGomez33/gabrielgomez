import { useEffect, useRef, useState } from 'react'

// Recursively walk a dropped directory entry (webkitGetAsEntry) collecting
// every file, tagging each with its webkitRelativePath so the upload pipeline
// can preserve folder structure — exactly like a <input webkitdirectory> pick.
function readEntry(entry: FileSystemEntry, path: string): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (file) => {
          // Stamp the relative path so uploadAudio/uploadStems can group by folder.
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: path + file.name,
              configurable: true,
            })
          } catch {
            /* some browsers freeze File — the server also falls back to name */
          }
          resolve([file])
        },
        () => resolve([]),
      )
    })
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    return new Promise((resolve) => {
      const all: File[] = []
      const readBatch = () => {
        reader.readEntries(
          async (entries) => {
            if (entries.length === 0) {
              resolve(all)
              return
            }
            for (const e of entries) {
              all.push(...(await readEntry(e, `${path}${entry.name}/`)))
            }
            readBatch() // directories are read in batches until empty
          },
          () => resolve(all),
        )
      }
      readBatch()
    })
  }
  return Promise.resolve([])
}

// Extract dropped files. Uses the entry API (handles folders) when available,
// falling back to the flat items/files list otherwise.
export async function readDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const items = dt.items
  const entries: FileSystemEntry[] = []
  if (items && items.length) {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
  }
  if (entries.length) {
    const nested = await Promise.all(entries.map((e) => readEntry(e, '')))
    return nested.flat()
  }
  return Array.from(dt.files || [])
}

// A small spinning wheel for pending/processing states.
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="adm-spin-wrap" role="status" aria-live="polite">
      <span className="adm-spinner" aria-hidden />
      {label && <span className="adm-spin-label">{label}</span>}
    </span>
  )
}

interface FileDropProps {
  label: string
  accept?: string
  multiple?: boolean
  directory?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}

// A drag-and-drop-capable file chooser. Click to browse or drag files/folders
// onto it. When `directory` is set the browse dialog picks a whole folder
// (webkitdirectory) and drops recurse into sub-folders.
export function FileDrop({ label, accept, multiple, directory, disabled, onFiles }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // webkitdirectory is a non-standard attribute React won't render — set it on
  // the DOM node directly so the browse dialog offers folder selection.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    if (directory) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    } else {
      el.removeAttribute('webkitdirectory')
      el.removeAttribute('directory')
    }
  }, [directory])

  function pick(files: File[]) {
    if (disabled) return
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`adm-drop${over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setOver(false)
      }}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        if (disabled) return
        const files = await readDroppedFiles(e.dataTransfer)
        pick(files)
      }}
    >
      <span>{label}</span>
      <span className="adm-drop__hint">{directory ? 'Drag a folder or click to browse' : 'Drag & drop or click to browse'}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          pick(Array.from(e.target.files || []))
          e.target.value = '' // allow re-selecting the same file/folder
        }}
        style={{ display: 'none' }}
      />
    </div>
  )
}
