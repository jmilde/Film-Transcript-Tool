import { useState } from "react";
import { Check } from "lucide-react";
import { initialComments, type Comment } from "@/lib/demo-data";

export function CommentsCard() {
  const [comments, setComments] = useState(initialComments);
  const [resolved, setResolved] = useState<Record<number, boolean>>({});
  const [reply, setReply] = useState("");

  const open = comments.filter((c) => !resolved[c.id]);

  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    setComments((c) => [
      ...c,
      {
        id: Date.now(),
        author: "You",
        initials: "JM",
        range: "now",
        text,
      } satisfies Comment,
    ]);
    setReply("");
  };

  return (
    <div className="frost-glass-strong rounded-2xl p-4 shadow-sm outline outline-frost-line">
      <div className="flex items-center justify-between">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-inkmuted">
          Comments
        </p>
        <span className="rounded-full bg-frost-accent/10 px-2 py-0.5 text-[10px] font-semibold text-frost-accent">
          {open.length} open
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {comments.map((c) => (
          <div
            key={c.id}
            className={`flex gap-2 ${resolved[c.id] ? "opacity-40" : ""}`}
          >
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-frost-accent/15 text-[10px] font-bold text-frost-accent">
              {c.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[11px] font-semibold tabular-nums text-frost-accent">
                  {c.range}
                </span>
                {!resolved[c.id] && (
                  <button
                    onClick={() =>
                      setResolved((r) => ({ ...r, [c.id]: true }))
                    }
                    className="flex items-center gap-1 rounded-md bg-frost-panel px-1.5 py-0.5 text-[10px] font-medium text-inkmuted outline outline-frost-line transition-colors hover:text-frost-accent"
                  >
                    <Check className="size-3" /> Resolve
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-ink">
                {c.text}
              </p>
              <p className="mt-0.5 text-[10px] text-inkmuted">{c.author}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendReply()}
          placeholder="Reply…"
          className="min-w-0 flex-1 rounded-lg bg-frost-panel px-3 py-1.5 text-[12px] text-ink shadow-sm outline outline-frost-line placeholder:text-inkmuted/70 focus:outline-frost-accent/50"
        />
        <button
          onClick={sendReply}
          className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-frost-50 shadow-sm transition-opacity hover:opacity-85 dark:bg-frost-accent dark:text-white"
        >
          Reply
        </button>
      </div>
    </div>
  );
}
