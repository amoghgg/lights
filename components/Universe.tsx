"use client";

import { CHANNELS, POSITION_LABEL, POSITION_ORDER, PATCHED_CHANNELS, RIG } from "@/lib/rig";

/**
 * Live DMX readout, grouped the way a patch sheet groups it.
 *
 * A flat grid of 119 numbers is data, not information. Listing fixtures under
 * their position, with the channel range and the level that is actually going
 * out, is what lets you check the rig against the plot — and makes it obvious
 * that this is real control data rather than an animation.
 */
export default function Universe({ dmx }: { dmx: Uint8Array }) {
  return (
    <div>
      <div className="space-y-2.5">
        {POSITION_ORDER.map((pos) => {
          const fixtures = RIG.filter((f) => f.position === pos);
          if (!fixtures.length) return null;
          return (
            <div key={pos}>
              <div className="font-mono text-[9px] tracking-cue uppercase text-plot-faint mb-1">
                {POSITION_LABEL[pos]}
              </div>
              <div className="space-y-px">
                {fixtures.map((f) => {
                  const n = CHANNELS[f.type];
                  const level = dmx[f.patch - 1];
                  const rgb = n >= 4 && f.type !== "moving"
                    ? [dmx[f.patch], dmx[f.patch + 1], dmx[f.patch + 2]]
                    : f.type === "moving"
                      ? [dmx[f.patch + 2], dmx[f.patch + 3], dmx[f.patch + 4]]
                      : null;
                  const lit = level > 2;
                  return (
                    <div key={f.id} className="flex items-center gap-2 h-[18px]">
                      <span className="font-mono text-[9px] text-plot-faint w-12 shrink-0 tnum">
                        {f.patch}–{f.patch + n - 1}
                      </span>
                      <span className="font-mono text-[9px] text-plot-dim w-[86px] shrink-0 truncate">
                        {f.label}
                      </span>
                      {/* level as a bar — the shape of the rig at a glance */}
                      <div className="relative flex-1 h-[7px] bg-house overflow-hidden min-w-[24px]">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${(level / 255) * 100}%`,
                            background: rgb && lit ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : "#FFA53D",
                            opacity: lit ? 0.9 : 0.25,
                          }}
                        />
                      </div>
                      <span
                        className={`font-mono text-[9px] tnum w-6 text-right shrink-0 ${lit ? "text-plot" : "text-plot-faint"}`}
                      >
                        {level}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[9px] text-plot-faint mt-3 leading-relaxed">
        {RIG.length} fixtures · channels 1–{PATCHED_CHANNELS} patched of 512 · real personalities
        (LED profile 4ch, moving head 8ch) · would transmit over sACN at 44 Hz
      </p>
    </div>
  );
}
