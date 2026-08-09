"use client";

import { CueEvent, CUES } from "@/lib/gestures";

/**
 * Every firing, timestamped, with a way to mark it unintended.
 *
 * This is the instrument the evaluation runs on: arm the system, move about
 * normally for two hours, flag anything that fires, export. The flag count over
 * session time is the false-trigger rate — the number that decides whether this
 * is safe to put in front of an audience.
 */
export default function EventLog({
  events,
  onFlag,
  startedAt,
}: {
  events: CueEvent[];
  onFlag: (index: number) => void;
  startedAt: number;
}) {
  function exportCsv() {
    const rows = [
      "index,cue,t_ms_since_start,iso_time,flagged",
      ...events.map((e, i) =>
        [i, e.cue, Math.round(e.at - startedAt), new Date(e.at).toISOString(), e.flagged ? 1 : 0].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lights-session-${new Date(startedAt).toISOString().slice(0, 19).replace(/:/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow">Cue log</span>
        <button
          onClick={exportCsv}
          disabled={events.length === 0}
          className="font-mono text-[10px] tracking-cue uppercase px-2 py-1 border border-house-edge text-plot-dim hover:text-tungsten hover:border-tungsten/40 disabled:opacity-30 disabled:hover:text-plot-dim disabled:hover:border-house-edge transition-colors"
        >
          Export CSV
        </button>
      </div>

      {events.length === 0 ? (
        <p className="font-mono text-[10px] text-plot-faint leading-relaxed">
          Nothing fired yet. Arm the system and try a cue — every firing lands here with a timestamp.
        </p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto thin-scroll -mr-1 pr-1">
          {events
            .map((e, i) => ({ e, i }))
            .reverse()
            .map(({ e, i }) => {
              const cue = CUES.find((c) => c.id === e.cue);
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 py-1 border-b border-house-edge/60 last:border-0"
                >
                  <span className="font-mono text-[10px] text-plot-faint tnum w-14 shrink-0">
                    +{((e.at - startedAt) / 1000).toFixed(1)}s
                  </span>
                  <span className="font-mono text-[10px] text-tungsten w-10 shrink-0">{cue?.n}</span>
                  <span className={`font-mono text-[10px] flex-1 ${e.flagged ? "text-special line-through" : "text-plot"}`}>
                    {cue?.name}
                  </span>
                  <button
                    onClick={() => onFlag(i)}
                    className="font-mono text-[9px] tracking-cue uppercase text-plot-faint hover:text-special transition-colors shrink-0"
                    title="Mark this firing as unintended"
                  >
                    {e.flagged ? "flagged" : "flag"}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
