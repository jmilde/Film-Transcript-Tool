import { useState } from "react";
import { Search } from "lucide-react";
import type { TranscriptEntry } from "@/lib/demo-data";

export function TranscriptPane({
  title,
  langTag,
  entries,
  activeSeconds,
  activeFilled,
  onSeek,
}: {
  title: string;
  langTag: string;
  entries: TranscriptEntry[];
  activeSeconds: number;
  /** true for the translation pane (solid accent tag) */
  activeFilled?: boolean;
  onSeek?: (seconds: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [autoFollow, setAutoFollow] = useState(true);

  const activeIndex = entries.reduce(
    (acc, e, i) => (e.seconds <= activeSeconds ? i : acc),
    0,
  );

  const visible = entries.filter((e) =>
    e.text.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="frost-glass flex min-w-0 flex-col border-r border-frost-line last:border-r-0">
      <div className="flex items-center justify-between border-b border-frost-line px-5 py-3">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-inkmuted">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-inkmuted">
            Auto-follow
            <button
              role="switch"
              aria-checked={autoFollow}
              onClick={() => setAutoFollow((v) => !v)}
              className={`relative h-4 w-7 rounded-full transition-colors ${
                autoFollow ? "bg-frost-accent" : "bg-inkmuted/30"
              }`}
            >
              <span
                className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-transform ${
                  autoFollow ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              activeFilled
                ? "bg-frost-accent text-white"
                : "bg-frost-panel-strong text-inkmuted outline outline-frost-line"
            }`}
          >
            {langTag}
          </span>
        </div>
      </div>

      <div className="px-5 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-inkmuted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="w-full rounded-lg bg-frost-panel py-1.5 pl-8 pr-3 text-[12px] text-ink shadow-sm outline outline-frost-line placeholder:text-inkmuted/70 focus:outline-frost-accent/50"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {visible.map((entry) => {
          const isActive = entries[activeIndex] === entry;
          return (
            <button
              key={entry.time + entry.text.slice(0, 8)}
              onClick={() => onSeek?.(entry.seconds)}
              className={`block w-full rounded-lg p-3 text-left transition-colors ${
                isActive
                  ? "bg-frost-accent/10 outline outline-frost-accent/25"
                  : "hover:bg-frost-panel-strong"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={`text-[11px] font-semibold tabular-nums ${
                    isActive ? "text-frost-accent" : "text-inkmuted"
                  }`}
                >
                  {entry.time}
                </p>
                <p className="text-[11px] text-inkmuted/80">{entry.speaker}</p>
              </div>
              <p
                className={`mt-1 text-[13px] leading-relaxed ${
                  isActive ? "font-medium text-ink" : "text-ink/85"
                }`}
              >
                {entry.text}
              </p>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="px-1 text-[12px] text-inkmuted">No matches.</p>
        )}
      </div>
    </section>
  );
}
