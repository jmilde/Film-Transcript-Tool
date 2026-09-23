import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import poster from "@/assets/player-poster.jpg";

const DURATION = 86; // 1:26
const SPEEDS = [1, 1.5, 2];

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const WAVE = [
  40, 30, 55, 70, 45, 35, 60, 50, 25, 40, 65, 30, 45, 55, 75, 35, 50, 40, 30,
  45, 55, 60, 38, 52, 28, 48, 62, 42, 33, 58,
];

export function PlayerCard({
  seconds,
  onTimeChange,
}: {
  seconds: number;
  onTimeChange: (s: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = ((now - lastRef.current) / 1000) * (SPEEDS[speedIdx] ?? 1);
      lastRef.current = now;
      onTimeChange(Math.min(DURATION, seconds + dt));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speedIdx, seconds]);

  const skip = (delta: number) =>
    onTimeChange(Math.max(0, Math.min(DURATION, seconds + delta)));

  const progress = (seconds / DURATION) * 100;

  return (
    <div className="frost-glass-strong overflow-hidden rounded-2xl shadow-lg outline outline-frost-line">
      <div className="relative aspect-video w-full">
        <img
          src={poster}
          alt="Film still — a director's set in cool blue light"
          className="absolute inset-0 size-full object-cover"
          width={1024}
          height={576}
        />
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          className="absolute inset-0 grid place-items-center bg-black/10 transition-colors hover:bg-black/20"
        >
          <span className="grid size-12 place-items-center rounded-full bg-white/85 text-ink shadow-lg backdrop-blur transition-transform hover:scale-105">
            {playing ? (
              <Pause className="size-5" />
            ) : (
              <Play className="ml-0.5 size-5" />
            )}
          </span>
        </button>
        <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 font-display text-[10px] tracking-wider text-white">
          {fmt(seconds)} / {fmt(DURATION)}
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-15)}
            aria-label="Back 15 seconds"
            className="grid size-7 place-items-center rounded-md text-inkmuted outline outline-frost-line transition-colors hover:text-frost-accent"
          >
            <SkipBack className="size-3.5" />
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-8 place-items-center rounded-full bg-frost-accent text-white shadow-sm transition-transform hover:scale-105"
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="ml-0.5 size-4" />
            )}
          </button>
          <button
            onClick={() => skip(15)}
            aria-label="Forward 15 seconds"
            className="grid size-7 place-items-center rounded-md text-inkmuted outline outline-frost-line transition-colors hover:text-frost-accent"
          >
            <SkipForward className="size-3.5" />
          </button>
          <button
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-inkmuted outline outline-frost-line transition-colors hover:text-frost-accent"
          >
            {SPEEDS[speedIdx] ?? 1}×
          </button>
          <span className="ml-auto text-[12px] font-medium tabular-nums text-inkmuted">
            {fmt(seconds)} / {fmt(DURATION)}
          </span>
        </div>

        <button
          aria-label="Seek"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onTimeChange(
              ((e.clientX - rect.left) / rect.width) * DURATION,
            );
          }}
          className="block h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-frost-panel"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-frost-accent to-frost-accentsoft"
            style={{ width: `${progress}%` }}
          />
        </button>

        <div className="flex h-7 items-center gap-[2px]" aria-hidden="true">
          {WAVE.map((h, i) => {
            const played = (i / WAVE.length) * 100 <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${
                  played ? "bg-frost-accent" : "bg-inkmuted/30"
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
