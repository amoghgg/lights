"use client";

import { FixtureOutput } from "@/lib/lighting";

/**
 * Plan view of the rig, the way a lighting plot draws it: fixtures as symbols
 * on the bar, beams falling onto the stage below. Pools composite additively
 * (`screen`) because that is what overlapping light actually does — two washes
 * on the same spot read brighter, they do not average.
 */

const W = 420;
const H = 300;

/** Where each fixture's beam lands, given it is angled in at the acting area. */
function poolFor(o: FixtureOutput) {
  const { fixture } = o;
  const targetY = fixture.kind === "wash" ? 0.46 : fixture.kind === "profile" ? 0.52 : 0.72;
  const radius = Math.tan((fixture.beam * Math.PI) / 180) * 190;
  return {
    cx: fixture.x * W,
    cy: targetY * H,
    r: radius,
  };
}

export default function StageView({ outputs, blackout }: { outputs: FixtureOutput[]; blackout: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Plan view of the lighting rig showing which fixtures are lit"
    >
      <defs>
        {outputs.map((o, i) => {
          const [r, g, b] = o.rgb;
          return (
            <radialGradient key={i} id={`pool-${i}`}>
              <stop offset="0%" stopColor={`rgb(${r},${g},${b})`} stopOpacity={o.intensity * 0.92} />
              <stop offset="55%" stopColor={`rgb(${r},${g},${b})`} stopOpacity={o.intensity * 0.34} />
              <stop offset="100%" stopColor={`rgb(${r},${g},${b})`} stopOpacity={0} />
            </radialGradient>
          );
        })}
      </defs>

      {/* deck */}
      <rect x="18" y="26" width={W - 36} height={H - 62} fill="#0B0B0E" stroke="#1C1C22" />

      {/* centre line and setting line — the two references on every plot */}
      <line x1={W / 2} y1="26" x2={W / 2} y2={H - 36} stroke="#1C1C22" strokeDasharray="3 5" />
      <line x1="18" y1={H - 36} x2={W - 18} y2={H - 36} stroke="#25252C" />
      <text x="24" y={H - 24} className="fill-plot-faint font-mono" fontSize="8" letterSpacing="1.5">
        SETTING LINE
      </text>

      {/* beams */}
      <g style={{ mixBlendMode: "screen" }}>
        {outputs.map((o, i) => {
          const p = poolFor(o);
          if (o.intensity < 0.01) return null;
          return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={`url(#pool-${i})`} />;
        })}
      </g>

      {/* performer, centre stage — the thing the special is for */}
      <g opacity={blackout ? 0.14 : 0.85}>
        <ellipse cx={W / 2} cy={H * 0.52} rx="7" ry="7" fill="#08080A" stroke="#3A3A44" />
        <circle cx={W / 2} cy={H * 0.52} r="2.5" fill="#5A5A66" />
      </g>

      {/* fixture symbols on their bars */}
      {outputs.map((o, i) => {
        const { fixture } = o;
        const cx = fixture.x * W;
        const cy = 26 + fixture.y * (H - 62);
        const lit = o.intensity > 0.02;
        const [r, g, b] = o.rgb;
        const colour = lit ? `rgb(${r},${g},${b})` : "#33333C";
        return (
          <g key={`f-${i}`}>
            {fixture.kind === "profile" ? (
              <polygon
                points={`${cx - 6},${cy + 5} ${cx + 6},${cy + 5} ${cx},${cy - 6}`}
                fill={colour}
                fillOpacity={lit ? Math.max(0.35, o.intensity) : 1}
                stroke="#4A4A52"
                strokeWidth="0.6"
              />
            ) : (
              <rect
                x={cx - 6}
                y={cy - 5}
                width="12"
                height="10"
                rx="1.5"
                fill={colour}
                fillOpacity={lit ? Math.max(0.35, o.intensity) : 1}
                stroke="#4A4A52"
                strokeWidth="0.6"
              />
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
