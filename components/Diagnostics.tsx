"use client";

import { CUES, EngineState } from "@/lib/gestures";

/**
 * Live pass/fail on every condition each cue is waiting for.
 *
 * Debugging a gesture system by console log is hopeless — you cannot read a
 * console while holding a pose. Putting the failing condition on screen, with
 * the measured value next to the threshold it missed, is the difference between
 * "nothing happens" and "my wrists are 4cm too low".
 */
export default function Diagnostics({ state }: { state: EngineState }) {
  const byCue = CUES.map((cue) => ({
    cue,
    checks: state.checks.filter((c) => c.cue === cue.id),
  })).filter((g) => g.checks.length > 0);

  if (state.handCount === 0) {
    return (
      <p className="font-mono text-[10px] text-plot-dim leading-relaxed">
        No hand in frame. Hold a hand up, palm toward the camera, and the conditions each cue is waiting on
        will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] text-plot-faint leading-relaxed">
        {state.handCount === 2
          ? "Two hands visible — showing the two-handed cues."
          : "One hand visible — raise a second hand for blackout and general cover."}
      </p>
      {byCue.map(({ cue, checks }) => {
        const all = checks.every((c) => c.ok);
        return (
          <div key={cue.id}>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[10px] text-tungsten">{cue.n}</span>
              <span className={`font-mono text-[10px] ${all ? "text-live" : "text-plot-dim"}`}>{cue.name}</span>
            </div>
            <ul className="mt-0.5">
              {checks.map((c, i) => (
                <li key={i} className="flex items-baseline gap-1.5 leading-tight">
                  <span
                    className={`font-mono text-[10px] w-2.5 shrink-0 ${c.ok ? "text-live" : "text-plot-faint"}`}
                    aria-hidden
                  >
                    {c.ok ? "✓" : "·"}
                  </span>
                  <span className={`font-mono text-[9px] ${c.ok ? "text-plot-dim" : "text-plot-faint"}`}>
                    {c.label}
                  </span>
                  {!c.ok && (
                    <span className="font-mono text-[9px] text-plot-faint tnum ml-auto text-right">{c.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
