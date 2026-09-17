import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { FrostShell } from "@/components/frost-shell";
import { AppHeader } from "@/components/app-header";
import { TranscriptPane } from "@/components/transcript-pane";
import { PlayerCard } from "@/components/player-card";
import { CommentsCard } from "@/components/comments-card";
import { DocumentsDrawer } from "@/components/documents-drawer";
import {
  originalTranscript,
  translationTranscript,
  VIDEO_ID,
} from "@/lib/demo-data";

export const Route = createFileRoute("/project/$videoId")({
  head: () => ({
    meta: [
      { title: `${VIDEO_ID} — Film Transcript Tool` },
      {
        name: "description",
        content:
          "Review the original transcript and English translation side by side, with video playback, timecoded comments, and project documents.",
      },
      { property: "og:title", content: `${VIDEO_ID} — Film Transcript Tool` },
      {
        property: "og:description",
        content:
          "Side-by-side transcript and translation review with timecoded comments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VideoDetail,
});

function VideoDetail() {
  const { videoId } = Route.useParams();
  const [seconds, setSeconds] = useState(0);
  const [docsOpen, setDocsOpen] = useState(true);

  return (
    <FrostShell>
      <div className="flex h-screen flex-col">
        <AppHeader
          docsOpen={docsOpen}
          onToggleDocs={() => setDocsOpen((v) => !v)}
        />

        <div className="frost-glass flex h-11 shrink-0 items-center justify-between border-b border-frost-line px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="shrink-0 text-[13px] text-inkmuted transition-colors hover:text-frost-accent"
            >
              ← Projects
            </Link>
            <span className="text-inkmuted/40">/</span>
            <span className="truncate font-display text-[13px] font-medium tracking-tight">
              {videoId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg bg-frost-panel-strong px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-sm outline outline-frost-line transition-colors hover:text-frost-accent">
              English <ChevronDown className="size-3.5 text-inkmuted" />
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-frost-accent px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition-opacity hover:opacity-90">
              <Download className="size-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="grid min-w-0 flex-1 grid-cols-2">
            <TranscriptPane
              title="Original"
              langTag="ES"
              entries={originalTranscript}
              activeSeconds={seconds}
              onSeek={setSeconds}
            />
            <TranscriptPane
              title="Translation"
              langTag="EN"
              entries={translationTranscript}
              activeSeconds={seconds}
              activeFilled
              onSeek={setSeconds}
            />
          </div>

          <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-frost-line p-4">
            <PlayerCard seconds={seconds} onTimeChange={setSeconds} />
            <CommentsCard />
          </aside>

          {docsOpen && <DocumentsDrawer />}
        </div>
      </div>
    </FrostShell>
  );
}
