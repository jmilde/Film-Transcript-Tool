import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Folder as FolderIcon, Plus, Film } from "lucide-react";
import { folders, VIDEO_ID } from "@/lib/demo-data";

export function FolderTree({ activeVideoId }: { activeVideoId?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ itv: true });

  return (
    <aside className="frost-glass flex w-60 shrink-0 flex-col border-r border-frost-line">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-inkmuted">
          Folders
        </span>
        <button
          aria-label="Add folder"
          className="grid size-6 place-items-center rounded-md bg-frost-panel-strong text-frost-accent shadow-sm outline outline-frost-line transition-colors hover:bg-frost-accent hover:text-white"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {folders.map((folder) => {
          const isOpen = open[folder.name] ?? false;
          return (
            <div key={folder.name}>
              <button
                onClick={() =>
                  setOpen((s) => ({ ...s, [folder.name]: !isOpen }))
                }
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  isOpen
                    ? "bg-frost-accent/10 font-semibold text-frost-accent"
                    : "text-inkmuted hover:bg-frost-panel-strong hover:text-ink"
                }`}
              >
                <ChevronRight
                  className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <FolderIcon className="size-3.5" />
                {folder.name}
                {folder.videos.length > 0 && (
                  <span className="ml-auto text-[11px] font-normal opacity-60">
                    {folder.videos.length}
                  </span>
                )}
              </button>
              {isOpen &&
                folder.videos.map((video) => (
                  <Link
                    key={video.id}
                    to="/project/$videoId"
                    params={{ videoId: video.id }}
                    className={`ml-4 flex items-center gap-2 rounded-lg px-3 py-2 pl-6 text-[12px] transition-colors ${
                      video.id === (activeVideoId ?? VIDEO_ID) &&
                      activeVideoId !== undefined
                        ? "bg-frost-accent/10 font-medium text-frost-accent"
                        : "text-inkmuted hover:bg-frost-panel-strong hover:text-ink"
                    }`}
                  >
                    <Film className="size-3.5 shrink-0" />
                    <span className="truncate">{video.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] opacity-60">
                      {video.duration}
                    </span>
                  </Link>
                ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-frost-line px-5 py-3 text-[11px] text-inkmuted">
        Archive · 142 clips
      </div>
    </aside>
  );
}
