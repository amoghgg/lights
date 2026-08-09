"use client";

import { PATCHED_CHANNELS } from "@/lib/lighting";

/**
 * Live DMX readout. These are the real bytes the rig would receive — the same
 * array that would go out over sACN to physical fixtures. Shown because "it
 * produces a valid universe" is the claim that makes this more than an
 * animation.
 */
export default function Universe({ dmx }: { dmx: Uint8Array }) {
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-px">
        {Array.from({ length: PATCHED_CHANNELS }, (_, i) => {
          const v = dmx[i];
          const on = v > 0;
          return (
            <div
              key={i}
              className="relative h-9 bg-house flex flex-col items-center justify-center"
              style={on ? { background: `rgba(255,165,61,${0.06 + (v / 255) * 0.2})` } : undefined}
              title={`Channel ${i + 1}`}
            >
              <span className="font-mono text-[7px] text-plot-faint leading-none">{i + 1}</span>
              <span
                className={`font-mono text-[10px] tnum leading-none mt-0.5 ${on ? "text-tungsten" : "text-plot-faint"}`}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[9px] text-plot-faint mt-2">
        Channels 1–{PATCHED_CHANNELS} patched · 512 in universe · would transmit over sACN at 44 Hz
      </p>
    </div>
  );
}
