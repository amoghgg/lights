"use client";

import { EngineState } from "@/lib/gestures";

export type Timing = {
  fps: number;
  capture: number;
  landmark: number;
  classify: number;
  total: number;
};

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-house-edge last:border-0">
      <span className="font-mono text-[10px] text-plot-dim">{label}</span>
      <span className={`font-mono text-[11px] tnum ${accent ? "text-tungsten" : "text-plot"}`}>{value}</span>
    </div>
  );
}

/**
 * The numbers the paper needs. Latency is split by stage rather than reported
 * as one figure, because the point of measuring it is to show that inference is
 * the small term and the evidence window is the large one.
 */
export default function Telemetry({
  timing,
  state,
  elapsed,
  cueCount,
  flagged,
}: {
  timing: Timing;
  state: EngineState;
  elapsed: number;
  cueCount: number;
  flagged: number;
}) {
  const hours = elapsed / 3_600_000;
  const ftr = hours > 0.0008 ? flagged / hours : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow mb-1.5">Latency, by stage</div>
        <Row label="frame interval" value={`${timing.capture.toFixed(1)} ms`} />
        <Row label="hand landmarks" value={`${timing.landmark.toFixed(1)} ms`} accent />
        <Row label="cue classify" value={`${timing.classify.toFixed(2)} ms`} />
        <Row label="frame total" value={`${timing.total.toFixed(1)} ms`} />
        <Row label="throughput" value={`${timing.fps.toFixed(0)} fps`} />
        <p className="font-mono text-[9px] text-plot-faint leading-relaxed pt-2">
          Camera exposure and USB transport sit upstream of anything measurable here — budget another
          10–33 ms, and measure it against an external clock before quoting an end-to-end figure.
        </p>
      </div>

      <div>
        <div className="eyebrow mb-1.5">Engine</div>
        <Row label="label" value={state.label.toUpperCase()} accent={state.label !== "rest"} />
        <Row label="hands" value={String(state.handCount)} />
        <Row
          label="palm separation"
          value={state.separation === null ? "—" : `${state.separation.toFixed(2)} span`}
        />
        <Row label="palm flatness" value={state.flatness === null ? "—" : state.flatness.toFixed(2)} />
        <Row label="clap armed" value={state.clapArmed ? "yes" : "no"} />
      </div>

      <div>
        <div className="eyebrow mb-1.5">Session</div>
        <Row label="running" value={formatClock(elapsed)} />
        <Row label="cues fired" value={String(cueCount)} />
        <Row label="flagged false" value={String(flagged)} />
        <Row label="false triggers / hr" value={ftr ? ftr.toFixed(1) : "—"} accent={ftr > 0} />
      </div>
    </div>
  );
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
