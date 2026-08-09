"use client";

import { COACH_STEPS } from "@/lib/coach";

/**
 * The walkthrough card, sitting over the camera feed — where the person is
 * already looking. It never blocks the panels below, because watching the stage
 * react is half of what the step is teaching.
 */
export default function Coach({
  step,
  satisfied,
  onSkip,
  onExit,
}: {
  step: number;
  satisfied: boolean;
  onSkip: () => void;
  onExit: () => void;
}) {
  const done = step >= COACH_STEPS.length;
  const s = COACH_STEPS[step];

  return (
    <div className="absolute inset-x-0 bottom-0 p-2.5">
      <div className="bg-house/95 border border-house-edge backdrop-blur-sm">
        {/* progress: one segment per cue you are about to learn */}
        <div className="flex gap-px">
          {COACH_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-0.5 flex-1 transition-colors duration-300"
              style={{ background: i < step ? "#FFA53D" : i === step ? "#5A4423" : "#1C1C22" }}
            />
          ))}
        </div>

        <div className="p-3">
          {done ? (
            <>
              <h2 className="font-display text-2xl leading-none text-plot">You are running the rig</h2>
              <p className="font-mono text-[10px] text-plot-dim mt-1.5 leading-relaxed">
                All five cues are live. Everything you do is logged below — flag anything that fires by
                accident, and export the session as CSV when you are done.
              </p>
              <button
                onClick={onExit}
                className="mt-2.5 font-mono text-[10px] tracking-cue uppercase px-3 py-1.5 border border-tungsten text-tungsten hover:bg-tungsten/15 transition-colors"
              >
                Start working
              </button>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] tnum text-tungsten">
                  {step + 1}/{COACH_STEPS.length}
                </span>
                <h2 className="font-display text-2xl leading-none text-plot">{s.title}</h2>
              </div>

              <p className="font-mono text-[10px] text-plot-dim mt-1.5 leading-relaxed">{s.body}</p>

              <div className="flex items-center gap-3 mt-2.5">
                <span
                  className="font-mono text-[10px] flex-1 leading-snug transition-colors"
                  style={{ color: satisfied ? "#5BD98A" : "#4A4A52" }}
                >
                  {satisfied ? `✓ ${s.praise}` : "Waiting…"}
                </span>
                <button
                  onClick={onSkip}
                  className="font-mono text-[9px] tracking-cue uppercase text-plot-faint hover:text-plot transition-colors shrink-0"
                >
                  {satisfied ? "Next" : "Skip"}
                </button>
                <button
                  onClick={onExit}
                  className="font-mono text-[9px] tracking-cue uppercase text-plot-faint hover:text-plot transition-colors shrink-0"
                >
                  Exit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
