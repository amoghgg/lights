"use client";

import { RIG } from "@/lib/lighting";

/**
 * Plan view of the rig, the way a lighting plot draws it: fixtures as symbols
 * on the bar, beams falling onto the stage below. Pools composite additively
 * (`screen`) because that is what overlapping light actually does — two washes
 * on the same spot read brighter, they do not average.
 *
 * The markup is static. Every value that moves during a fade arrives as a CSS
 * variable written by the render loop, so a three-second crossfade costs no
 * React renders at all.
 */

const W = 420;
const H = 300;

/** Where each fixture's beam lands, given it is angled in at the acting area. */
function poolFor(kind: string, x: number, beam: number) {
  const targetY = kind === "wash" ? 0.46 : kind === "profile" ? 0.52 : 0.72;
  return { cx: x * W, cy: targetY * H, r: Math.tan((beam * Math.PI) / 180) * 190 };
}

export default function StageView({ blackout }: { blackout: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      // `screen` needs its own stacking context, or the pools blend with the
      // page behind the SVG instead of with each other.
      style={{ isolation: "isolate" }}
      role="img"
      aria-label="Plan view of the lighting rig showing which fixtures are lit"
    >
      <defs>
        {RIG.map((_, i) => (
          <radialGradient key={i} id={`pool-${i}`}>
            <stop offset="0%" style={{ stopColor: `var(--fx${i}-c)` }} stopOpacity={0.92} />
            <stop offset="55%" style={{ stopColor: `var(--fx${i}-c)` }} stopOpacity={0.34} />
            <stop offset="100%" style={{ stopColor: `var(--fx${i}-c)` }} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      {/* deck */}
      <rect x="18" y="26" width={W - 36} height={H - 62} fill="#0B0B0E" stroke="#1C1C22" />

      {/* centre line and setting line — the two references on every plot */}
      <line x1={W / 2} y1="26" x2={W / 2} y2={H - 36} stroke="#1C1C22" strokeDasharray="3 5" />
      <line x1="18" y1={H - 36} x2={W - 18} y2={H - 36} stroke="#25252C" />
      <text x="24" y={H - 24} className="fill-plot-faint font-mono" fontSize="8" letterSpacing="1.5">
        SETTING LINE
      </text>

      {/* Everything the rig lights scales by one group opacity, so the render
          loop can move the master without React re-rendering the stage. */}
      <g style={{ opacity: "var(--rig-master, 1)" }}>
        <g style={{ mixBlendMode: "screen" }}>
          {RIG.map((fixture, i) => {
            const p = poolFor(fixture.kind, fixture.x, fixture.beam);
            return (
              <circle
                key={i}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={`url(#pool-${i})`}
                style={{ opacity: `var(--fx${i}-a, 0)` }}
              />
            );
          })}
        </g>

        {/* performer, centre stage — the thing the special is for */}
        <g opacity={blackout ? 0.14 : 0.85}>
          <ellipse cx={W / 2} cy={H * 0.52} rx="7" ry="7" fill="#08080A" stroke="#3A3A44" />
          <circle cx={W / 2} cy={H * 0.52} r="2.5" fill="#5A5A66" />
        </g>

        {/* fixture symbols on their bars */}
        {RIG.map((fixture, i) => {
          const cx = fixture.x * W;
          const cy = 26 + fixture.y * (H - 62);
          const shared = {
            fill: `var(--fx${i}-c)`,
            fillOpacity: `var(--fx${i}-s, 1)`,
            stroke: "#4A4A52",
            strokeWidth: 0.6,
          };
          return (
            <g key={`f-${i}`}>
              {fixture.kind === "profile" ? (
                <polygon points={`${cx - 6},${cy + 5} ${cx + 6},${cy + 5} ${cx},${cy - 6}`} style={shared} />
              ) : (
                <rect x={cx - 6} y={cy - 5} width="12" height="10" rx="1.5" style={shared} />
              )}
              <text
                x={cx}
                y={fixture.y > 0.5 ? cy + 18 : cy - 10}
                textAnchor="middle"
                className="fill-plot-faint font-mono"
                fontSize="7"
                letterSpacing="0.8"
              >
                {fixture.patch}
              </text>
            </g>
          );
        })}
      </g>

      {blackout && (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          className="fill-plot-faint font-mono"
          fontSize="10"
          letterSpacing="4"
        >
          BLACKOUT
        </text>
      )}
    </svg>
  );
}
