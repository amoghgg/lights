"use client";

/**
 * The auditorium, seen from the back of the stalls.
 *
 * Every lit element is driven by a CSS variable written by the render loop, one
 * level and one colour per rig *position* rather than per fixture — eleven
 * groups instead of twenty-six, which keeps a three-second crossfade at zero
 * React renders.
 *
 * Softness comes from Gaussian blur rather than gradient fills, because a
 * blurred shape takes any fill colour: the cyc has to be able to go Congo blue
 * and the footlights amber in the same frame, from the same primitives.
 *
 * Light composites with `screen` — two washes on the same wall read brighter,
 * they do not average.
 */

const W = 900;
const H = 560;

const PX0 = 118, PX1 = 782, PY0 = 38, PY1 = 362; // proscenium opening
const CX0 = 142, CX1 = 758, CY0 = 54, CY1 = 322; // cyclorama
const US0 = 150, US1 = 750; // deck, upstage edge
const DS0 = 104, DS1 = 796; // deck, downstage edge
const DY0 = 322, DY1 = 404; // deck depth
const APRON = 440;

export type PositionKey =
  | "foh" | "overhead" | "boomsl" | "boomsr" | "back"
  | "cyc" | "gobo" | "mover" | "spot" | "foot" | "house";

const a = (p: PositionKey) => `var(--p-${p}-a, 0)`;
const c = (p: PositionKey) => `var(--p-${p}-c, #FFBB7A)`;
const lerp = (t: number, x0: number, x1: number) => x0 + (x1 - x0) * t;

export default function StageView({ blackout }: { blackout: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto select-none"
      style={{ isolation: "isolate" }}
      role="img"
      aria-label="Auditorium view: proscenium stage lit by the current cue state"
    >
      <defs>
        <filter id="s8" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id="s18" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18" /></filter>
        <filter id="s34" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="34" /></filter>

        {/* A gobo, not a flat wash. Turbulence gives the broken leaf pattern a
            steel pattern actually throws. */}
        <filter id="breakup" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.022" numOctaves="3" seed="11" result="n" />
          <feColorMatrix in="n" type="luminanceToAlpha" result="l" />
          <feComponentTransfer in="l" result="stencil">
            <feFuncA type="discrete" tableValues="0 0 0 0.4 0.8 1" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="stencil" operator="in" />
        </filter>

        {/* the cyc falls off top and bottom, as a real one does */}
        <linearGradient id="cycFall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="45%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.5" />
        </linearGradient>
        <mask id="cycMask">
          <rect x={CX0} y={CY0} width={CX1 - CX0} height={CY1 - CY0} fill="url(#cycFall)" />
        </mask>

        <linearGradient id="beamFall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="beamMask">
          <rect x="0" y={PY0} width={W} height={DY1 - PY0} fill="url(#beamFall)" />
        </mask>
      </defs>

      {/* ---------------- architecture ---------------- */}
      <rect width={W} height={H} fill="#070709" />
      <rect x="0" y="0" width={PX0} height={APRON} fill="#100E13" />
      <rect x={PX1} y="0" width={W - PX1} height={APRON} fill="#100E13" />
      <rect x="0" y="0" width={W} height={PY0} fill="#0C0B0F" />
      <rect x={PX0 - 9} y={PY0 - 7} width={PX1 - PX0 + 18} height={PY1 - PY0 + 14}
        fill="none" stroke="#1E1B22" strokeWidth="2" />
      <rect x={CX0} y={CY0} width={CX1 - CX0} height={CY1 - CY0} fill="#0B0A0D" />

      {/* ---------------- light on the cyclorama ---------------- */}
      <g style={{ mixBlendMode: "screen" }} mask="url(#cycMask)">
        <rect x={CX0} y={CY0} width={CX1 - CX0} height={CY1 - CY0} fill={c("cyc")} opacity={a("cyc")} />
        <g opacity={a("gobo")}>
          <rect x={CX0} y={CY0} width={CX1 - CX0} height={CY1 - CY0} fill={c("gobo")} filter="url(#breakup)" />
        </g>
        {[0.3, 0.7].map((x, i) => (
          <ellipse key={i} cx={lerp(x, CX0, CX1)} cy={CY0 + 86} rx="46" ry="42"
            fill={c("mover")} opacity={a("mover")} filter="url(#s18)" />
        ))}
      </g>

      {/* ---------------- deck ---------------- */}
      <path d={`M${US0} ${DY0} H${US1} L${DS1} ${DY1} H${DS0} Z`} fill="#141218" />

      <g style={{ mixBlendMode: "screen" }}>
        <g opacity={a("overhead")}>
          {[0.3, 0.5, 0.7].map((x, i) => (
            <ellipse key={i} cx={lerp(x, US0, US1)} cy={DY0 + 26} rx="118" ry="26"
              fill={c("overhead")} filter="url(#s34)" />
          ))}
        </g>
        <g opacity={a("foh")}>
          {[0.24, 0.41, 0.59, 0.76].map((x, i) => (
            <ellipse key={i} cx={lerp(x, DS0, DS1)} cy={DY1 - 24} rx="98" ry="28"
              fill={c("foh")} filter="url(#s34)" />
          ))}
        </g>
        <ellipse cx={W / 2} cy={DY0 + 50} rx="44" ry="18" fill={c("spot")} opacity={a("spot")} filter="url(#s8)" />
      </g>

      {/* ---------------- beams in the haze ---------------- */}
      <g style={{ mixBlendMode: "screen" }} mask="url(#beamMask)">
        <g opacity={a("foh")} filter="url(#s8)">
          {[0.24, 0.41, 0.59, 0.76].map((x, i) => {
            const bx = lerp(x, DS0, DS1);
            return (
              <path key={i} d={`M${bx - 13} ${PY0} H${bx + 13} L${bx + 84} ${DY1 - 18} H${bx - 84} Z`}
                fill={c("foh")} opacity="0.42" />
            );
          })}
        </g>
        <path d={`M${W / 2 - 10} ${PY0} H${W / 2 + 10} L${W / 2 + 46} ${DY0 + 50} H${W / 2 - 46} Z`}
          fill={c("spot")} opacity={a("spot")} filter="url(#s8)" />
      </g>

      {/* sidelight raking across from the booms */}
      <g style={{ mixBlendMode: "screen" }}>
        <path d={`M${PX0} ${DY0 + 4} L${PX0 + 250} ${DY0 + 28} L${PX0 + 250} ${DY1 - 4} L${PX0} ${DY1 - 32} Z`}
          fill={c("boomsl")} opacity={a("boomsl")} filter="url(#s18)" />
        <path d={`M${PX1} ${DY0 + 4} L${PX1 - 250} ${DY0 + 28} L${PX1 - 250} ${DY1 - 4} L${PX1} ${DY1 - 32} Z`}
          fill={c("boomsr")} opacity={a("boomsr")} filter="url(#s18)" />
      </g>

      {/* ---------------- performers ---------------- */}
      {[{ x: 0.5, s: 1 }, { x: 0.33, s: 0.88 }, { x: 0.67, s: 0.88 }].map((p, i) => {
        const px = lerp(p.x, US0, US1);
        const base = DY0 + 52;
        // Roughly seven heads tall. At four the figure reads as a chess piece,
        // which is exactly what the first attempt looked like.
        const head = 6.4 * p.s;
        const h = head * 13.5;
        const shoulder = head * 1.55;
        const hip = head * 1.15;
        const shoulderY = base - h + head * 2.5;
        return (
          <g key={i}>
            <ellipse cx={px} cy={base - h * 0.52} rx={shoulder * 1.8} ry={h * 0.56}
              fill={c("back")} opacity={a("back")} filter="url(#s8)" style={{ mixBlendMode: "screen" }} />
            <g fill="#08080A" opacity="0.95">
              <circle cx={px} cy={base - h + head} r={head} />
              <path
                d={`M${px - hip} ${base}
                    L${px - shoulder * 0.92} ${shoulderY + head * 2.2}
                    Q${px - shoulder} ${shoulderY} ${px - shoulder * 0.62} ${shoulderY - head * 0.35}
                    Q${px} ${shoulderY - head * 1.1} ${px + shoulder * 0.62} ${shoulderY - head * 0.35}
                    Q${px + shoulder} ${shoulderY} ${px + shoulder * 0.92} ${shoulderY + head * 2.2}
                    L${px + hip} ${base} Z`}
              />
            </g>
          </g>
        );
      })}

      {/* ---------------- footlights ---------------- */}
      <g style={{ mixBlendMode: "screen" }} opacity={a("foot")}>
        <ellipse cx={W / 2} cy={DY1 - 2} rx={(DS1 - DS0) / 2} ry="26" fill={c("foot")} filter="url(#s18)" opacity="0.6" />
        <rect x={DS0} y={DY1 - 3} width={DS1 - DS0} height="3" fill={c("foot")} />
      </g>

      {/* apron face and lit nosing */}
      <path d={`M${DS0} ${DY1} H${DS1} V${APRON} H${DS0} Z`} fill="#0C0B0F" />
      <rect x={DS0} y={DY1} width={DS1 - DS0} height="2.5" fill={c("foot")} opacity={a("foot")}
        style={{ mixBlendMode: "screen" }} />

      {/* ---------------- house ---------------- */}
      <g style={{ mixBlendMode: "screen" }} opacity={a("house")}>
        <ellipse cx={W / 2} cy={H} rx={W * 0.7} ry="150" fill={c("house")} filter="url(#s34)" opacity="0.34" />
        {[0.045, 0.955].map((x, i) => (
          <ellipse key={i} cx={W * x} cy={PY1 - 60} rx="22" ry="64" fill={c("house")} filter="url(#s18)" opacity="0.55" />
        ))}
      </g>

      {/* seating */}
      <g>
        {[0, 1, 2, 3, 4].map((row) => {
          const y = APRON + 12 + row * 25;
          const inset = 30 - row * 7;
          const n = 17;
          const span = W - inset * 2;
          return (
            <g key={row}>
              <rect x={inset} y={y} width={span} height="18" rx="8" fill="#100F14" />
              {Array.from({ length: n }, (_, i) => (
                <rect key={i} x={inset + 5 + i * (span / n)} y={y - 6} width={span / n - 5} height="21" rx="5"
                  fill="#09080B" />
              ))}
            </g>
          );
        })}
      </g>

      {blackout && (
        <text x={W / 2} y={DY0 - 44} textAnchor="middle" className="fill-plot-faint font-mono"
          fontSize="12" letterSpacing="6">BLACKOUT</text>
      )}
    </svg>
  );
}
