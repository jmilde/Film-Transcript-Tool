import { useState } from "react";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { initialDocs, type Doc } from "@/lib/demo-data";

export function DocumentsDrawer() {
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const visible = docs.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase()),
  );

  const addDoc = () => {
    const title = newTitle.trim();
    if (!title) return;
    setDocs((d) => [
      { id: Date.now(), title, meta: "Just now · 1 page" },
      ...d,
    ]);
    setNewTitle("");
  };

  return (
    <aside className="frost-glass-strong flex w-72 shrink-0 flex-col border-l border-frost-line">
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-inkmuted">
          <FileText className="size-3.5" /> Documents
        </span>
      </div>

      <div className="space-y-2 px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-inkmuted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
            className="w-full rounded-lg bg-frost-panel py-2 pl-8 pr-3 text-[12px] text-ink shadow-sm outline outline-frost-line placeholder:text-inkmuted/70 focus:outline-frost-accent/50"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDoc()}
            placeholder="New document title…"
            className="min-w-0 flex-1 rounded-lg bg-frost-panel px-3 py-2 text-[12px] text-ink shadow-sm outline outline-frost-line placeholder:text-inkmuted/70 focus:outline-frost-accent/50"
          />
          <button
            onClick={addDoc}
            className="flex items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[12px] font-medium text-frost-50 shadow-sm transition-opacity hover:opacity-85 dark:bg-frost-accent dark:text-white"
          >
            <Plus className="size-3.5" /> New
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {visible.map((doc) => (
          <div
            key={doc.id}
            className="group rounded-xl bg-frost-panel p-3 shadow-sm outline outline-frost-line transition-colors hover:bg-frost-panel-strong"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-ink">
                {doc.title}
              </p>
              <button
                aria-label={`Delete ${doc.title}`}
                onClick={() => setDocs((d) => d.filter((x) => x.id !== doc.id))}
                className="text-inkmuted opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <p className="mt-0.5 text-[11px] text-inkmuted">{doc.meta}</p>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-1 pt-2 text-[12px] text-inkmuted">
            No documents match your search.
          </p>
        )}
      </nav>

      <div className="border-t border-frost-line px-4 py-2.5 text-[11px] text-inkmuted">
        {docs.length} documents
      </div>
    </aside>
  );
}
