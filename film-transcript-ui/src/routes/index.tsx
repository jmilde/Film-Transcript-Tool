import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { FrostShell } from "@/components/frost-shell";
import { AppHeader } from "@/components/app-header";
import { FolderTree } from "@/components/folder-tree";
import { DocumentsDrawer } from "@/components/documents-drawer";
import { PROJECT_NAME } from "@/lib/demo-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Film Transcript Tool — Projects" },
      {
        name: "description",
        content:
          "Browse film projects, folders, and transcripts. Review original and translated transcripts side by side with timecoded comments.",
      },
      { property: "og:title", content: "Film Transcript Tool — Projects" },
      {
        property: "og:description",
        content:
          "Browse film projects, folders, and transcripts with side-by-side translation review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectOverview,
});

function ProjectOverview() {
  const [docsOpen, setDocsOpen] = useState(true);

  return (
    <FrostShell>
      <div className="flex h-screen flex-col">
        <AppHeader
          docsOpen={docsOpen}
          onToggleDocs={() => setDocsOpen((v) => !v)}
        />
        <div className="flex min-h-0 flex-1">
          <FolderTree />
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="px-8 pt-6">
              <p className="text-[13px] text-inkmuted">← Projects</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                {PROJECT_NAME}
              </h1>
            </div>
            <div className="flex flex-1 items-start justify-center px-8 pt-8">
              <div className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-frost-line px-8 py-14 text-center">
                <FolderOpen className="size-8 text-inkmuted/50" />
                <p className="text-[14px] text-inkmuted">
                  Select a folder to see its videos, or create a folder to get
                  started.
                </p>
              </div>
            </div>
          </main>
          {docsOpen && <DocumentsDrawer />}
        </div>
      </div>
    </FrostShell>
  );
}
