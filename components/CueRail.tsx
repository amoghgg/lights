"use client";

import { CUES, CueId, EngineState } from "@/lib/gestures";

/**
 * The cue sheet. Numbering is LX 1–5 because these really are a numbered cue
 * stack, not decoration — the order is the order a board operator would run.
 */
export default function CueRail({
  state,
  lastFired,
}: {
  state: EngineState;
  lastFired: { cue: CueId; at: number } | null;
}) {
  const now = Date.now();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-house-edge">
      {CUES.map((cue) => {
        const arming = state.label === cue.id;
        const justFired = lastFired?.cue === cue.id && now - lastFired.at < 700;
        return (
          <div
            key={cue.id}
            className="relative bg-house-raised p-3 overflow-hidden"
            style={
              justFired
                ? { boxShadow: "inset 0 0 0 1px #FFA53D, inset 0 0 24px rgba(255,165,61,0.18)" }
                : undefined
            }
          >
            {/* hold progress fills the card from the left as the pose is held */}
            {arming && state.hold > 0 && state.hold < 1 && (
              <div
                className="absolute inset-y-0 left-0 bg-tungsten/12 transition-[width] duration-75"
                style={{ width: `${state.hold * 100}%` }}
              />
            )}
            <div className="relative">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] tracking-cue text-tungsten">{cue.n}</span>
                <span
                  className="font-mono text-[9px] tracking-cue"
                  style={{
                    color:
                      cue.falseTriggerRisk === "high"
                        ? "#E0457B"
                        : cue.falseTriggerRisk === "medium"
                          ? "#8A8A93"
                          : "#4A4A52",
                  }}
                  title={`False-trigger risk: ${cue.falseTriggerRisk}`}
                >
                  {cue.kind === "continuous" ? "CONT" : cue.kind === "dynamic" ? "DYN" : "STAT"}
                  {" · "}
                  {cue.hands}H
                </span>
              </div>
              <h3 className="font-display text-2xl leading-none mt-1.5 text-plot">{cue.name}</h3>
              <p className="font-mono text-[10px] text-plot-dim mt-1.5 leading-snug">{cue.gesture}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
