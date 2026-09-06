import { Users, Sparkles, Search, Clapperboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { USER_EMAIL } from "@/lib/demo-data";

export function AppHeader({
  onToggleDocs,
  docsOpen,
}: {
  onToggleDocs?: () => void;
  docsOpen?: boolean;
}) {
  return (
    <header className="frost-glass flex h-14 items-center justify-between border-b border-frost-line px-5">
      <div className="flex items-center gap-2.5">
        <div className="grid size-7 place-items-center rounded-lg bg-frost-accent text-white shadow-sm">
          <Clapperboard className="size-4" />
        </div>
        <span className="font-display text-[15px] font-semibold tracking-tight">
          Film Transcript Tool
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button className="hidden items-center gap-1.5 rounded-lg bg-frost-panel-strong px-3 py-1.5 text-[13px] font-medium text-ink shadow-sm outline outline-frost-line transition-colors hover:text-frost-accent sm:flex">
          <Users className="size-3.5" /> Members
        </button>
        <button className="hidden items-center gap-1.5 rounded-lg bg-frost-panel-strong px-3 py-1.5 text-[13px] font-medium text-ink shadow-sm outline outline-frost-line transition-colors hover:text-frost-accent sm:flex">
          <Sparkles className="size-3.5" /> Ask
        </button>
        <button className="flex items-center gap-1.5 rounded-lg bg-frost-accent/10 px-3 py-1.5 text-[13px] font-medium text-frost-accent shadow-sm outline outline-frost-line transition-colors hover:bg-frost-accent/20">
          <Search className="size-3.5" /> Search
          <kbd className="rounded bg-frost-panel-strong px-1 text-[11px] text-inkmuted">
            ⌘F
          </kbd>
        </button>
        {onToggleDocs && (
          <button
            onClick={onToggleDocs}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium shadow-sm outline outline-frost-line transition-colors ${
              docsOpen
                ? "bg-frost-accent text-white"
                : "bg-frost-panel-strong text-ink hover:text-frost-accent"
            }`}
          >
            Documents
          </button>
        )}
        <ThemeToggle />
        <div className="ml-1 hidden items-center gap-2.5 md:flex">
          <span className="text-[12px] text-inkmuted">{USER_EMAIL}</span>
          <button className="rounded-lg bg-frost-panel-strong px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-sm outline outline-frost-line transition-colors hover:text-frost-accent">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
