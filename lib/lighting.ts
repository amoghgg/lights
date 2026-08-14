/**
 * Looks, fades, and the DMX universe they produce.
 *
 * A look is expressed as a level per rig *position* rather than per fixture,
 * which is how a designer thinks and writes: "booms at 60, cyc at full, front
 * of house out". Colour is assigned by position too, because the gel in a
 * backlight and the gel in a cyc flood are different decisions.
 */

import type { CueId } from "./gestures";
import { CHANNELS, COLOUR_STATES, Fixture, GELS, Gel, Position, RIG } from "./rig";

export { COLOUR_STATES, GELS, RIG } from "./rig";
export { PATCHED_CHANNELS } from "./rig";

export type LookId =
  | "preset"
  | "cover"
  | "special"
  | "gobo"
  | "cyconly"
  | "sidelight"
  | "silhouette"
  | "footlights";

export type LookDef = {
  id: LookId;
  name: string;
  note: string;
  levels: Partial<Record<Position, number>>;
  /** Breakup gobos in the beam — texture rather than flat wash. */
  gobo?: boolean;
};

/**
 * The look library. The five gestures reach three of these; the rest exist so
 * the whole rig can be inspected without performing a cue, which is what makes
 * this usable as a demonstration piece rather than only as a controller.
 */
export const LOOKS: LookDef[] = [
  {
    id: "preset",
    name: "Preset",
    note: "House half, stage warm. What the audience walks into.",
    levels: { foh: 0.35, overhead: 0.3, cyc: 0.3, back: 0.15, house: 0.55 },
  },
  {
    id: "cover",
    name: "General cover",
    note: "Everyone visible, everywhere. The workhorse state.",
    levels: { foh: 1, overhead: 0.9, back: 0.55, "boom-sl": 0.4, "boom-sr": 0.4, cyc: 0.5, foot: 0.2 },
  },
  {
    id: "special",
    name: "Centre special",
    note: "One performer isolated. Everything else falls away.",
    levels: { spot: 1, back: 0.2, cyc: 0.1, foh: 0.05 },
  },
  {
    id: "gobo",
    name: "Breakup",
    note: "Textured light — dappled leaves across the cyc.",
    levels: { gobo: 1, cyc: 0.45, back: 0.35, foh: 0.25, overhead: 0.2 },
    gobo: true,
  },
  {
    id: "cyconly",
    name: "Cyc wash",
    note: "The back wall alone, saturated. Colour as the whole statement.",
    levels: { cyc: 1, back: 0.15 },
  },
  {
    id: "sidelight",
    name: "Sidelight",
    note: "Booms only. The dance position — bodies modelled, floor dark.",
    levels: { "boom-sl": 1, "boom-sr": 1, cyc: 0.2 },
  },
  {
    id: "silhouette",
    name: "Silhouette",
    note: "Cyc up, everything front out. Shapes against colour.",
    levels: { cyc: 1, back: 0.75 },
  },
  {
    id: "footlights",
    name: "Footlights",
    note: "Lit from below. Period, and faintly sinister.",
    levels: { foot: 1, cyc: 0.35, back: 0.2 },
  },
];

export const LOOK = (id: LookId) => LOOKS.find((l) => l.id === id)!;

export type LightingState = {
  blackout: boolean;
  look: LookId;
  master: number; // 0..1
  colour: number; // index into COLOUR_STATES
  /** Movers swung out to the extremes, or parked centre. */
  moversOut: boolean;
};

export const INITIAL_STATE: LightingState = {
  blackout: false,
  look: "preset",
  master: 0.8,
  colour: 0,
  moversOut: false,
};

/** Below this the rig reads as off, so coming out of a blackout has to clear it. */
const VISIBLE_FLOOR = 0.15;

export function applyCue(s: LightingState, cue: CueId, dimLevel?: number | null): LightingState {
  switch (cue) {
    case "blackout":
      // Clapping back in must always put light on stage. If the master was left
      // low, restoring the previous value would clap into another blackout.
      return s.blackout
        ? { ...s, blackout: false, master: s.master < VISIBLE_FLOOR ? INITIAL_STATE.master : s.master }
        : { ...s, blackout: true };
    case "cover":
      return { ...s, blackout: false, look: "cover" };
    case "special":
      return { ...s, blackout: false, look: "special" };
    case "colour":
      return { ...s, colour: (s.colour + 1) % COLOUR_STATES.length, moversOut: !s.moversOut };
    case "dim":
      return { ...s, master: dimLevel ?? s.master };
    default:
      return s;
  }
}

export type FixtureOutput = {
  fixture: Fixture;
  intensity: number; // 0..1, before master
  rgb: readonly [number, number, number];
  /** Moving-head orientation, -1..1 across the stage. */
  pan: number;
};

/** Which gel a position carries, given the current colour state. */
function gelFor(f: Fixture, colour: number): Gel {
  const c = COLOUR_STATES[colour];
  switch (f.position) {
    case "foh":
      // warm outside, cool inside — the standard two-colour front wash
      return f.id === "FOH-1" || f.id === "FOH-4" ? GELS.tungsten : GELS.L202;
    case "overhead":
      return GELS.openWhite;
    case "boom-sl":
    case "boom-sr":
      return c.back;
    case "back":
      return c.back;
    case "cyc":
      return c.cyc;
    case "gobo":
      return GELS.L147;
    case "mover":
      return c.cyc;
    case "spot":
      return GELS.openWhite;
    case "foot":
      return GELS.tungsten;
    case "house":
      return GELS.tungsten;
  }
}

/**
 * Resolve the abstract state into a per-fixture output — *before* the master.
 *
 * The master is deliberately left out. It changes every frame while a hand is
 * moving, and folding it in here would mean re-rendering the whole stage at
 * frame rate. Instead it is applied as one group opacity in the SVG, driven by
 * a CSS variable the render loop writes directly.
 */
export function resolve(s: LightingState): FixtureOutput[] {
  const look = LOOK(s.look);
  return RIG.map((fixture) => {
    let intensity = look.levels[fixture.position] ?? 0;

    // Booms are hung in threes; the shin bust works harder than the high one.
    if (fixture.id.endsWith("3")) intensity *= 1.0;
    if (fixture.id.endsWith("1") && fixture.position.startsWith("boom")) intensity *= 0.75;

    // The followspot only lives in looks that call for it.
    if (fixture.position === "spot" && !look.levels.spot) intensity = 0;

    // Movers follow the colour cue rather than a level cue.
    if (fixture.position === "mover") intensity = look.levels.cyc ? 0.7 : 0.35;

    return {
      fixture,
      intensity,
      rgb: gelFor(fixture, s.colour).rgb,
      pan: fixture.position === "mover" ? (s.moversOut ? (fixture.x < 0.5 ? -1 : 1) : 0) : 0,
    };
  });
}

export const hasGobo = (s: LightingState) => Boolean(LOOK(s.look).gobo);

// --- fades -------------------------------------------------------------------

/**
 * Fade times, in milliseconds — the "count" a board operator would write on the
 * cue sheet. Nothing snaps except by choice: a hard cut between looks reads as a
 * fault on real fixtures, and on tungsten it is physically impossible anyway.
 *
 * The master is absent because it does not fade. It is the operator's hand, live.
 */
export const FADE_MS: Record<CueId, number> = {
  blackout: 1000,
  cover: 3000,
  special: 2500,
  colour: 2000,
  dim: 0,
};

/** Coming back in is slower than going out — a stage that snaps on blinds people. */
export const BLACKOUT_IN_MS = 1800;

type Frame = { intensity: number; rgb: [number, number, number]; pan: number }[];

const snapshot = (o: FixtureOutput[]): Frame =>
  o.map((f) => ({ intensity: f.intensity, rgb: [f.rgb[0], f.rgb[1], f.rgb[2]], pan: f.pan }));

/**
 * Interpolates the rig from one look to the next over a cue's fade time.
 *
 * Interpolation is linear in DMX space, which is what a desk running a linear
 * fade profile actually does — easing here would look smoother on screen and be
 * wrong about the thing this is simulating.
 */
export class RigFader {
  private from: Frame;
  private to: Frame;
  private cur: Frame;
  private startedAt = 0;
  private duration = 1;

  constructor(initial: FixtureOutput[]) {
    this.cur = snapshot(initial);
    this.from = snapshot(initial);
    this.to = snapshot(initial);
  }

  setTarget(target: FixtureOutput[], durationMs: number, now: number) {
    this.from = this.cur.map((f) => ({ ...f, rgb: [...f.rgb] as [number, number, number] }));
    this.to = snapshot(target);
    this.startedAt = now;
    this.duration = Math.max(durationMs, 1);
  }

  /** Jump straight to a look, no fade — used by Reset. */
  snapTo(target: FixtureOutput[]) {
    this.cur = snapshot(target);
    this.from = snapshot(target);
    this.to = snapshot(target);
    this.duration = 1;
    this.startedAt = 0;
  }

  step(now: number): Frame {
    const p = Math.min(1, Math.max(0, (now - this.startedAt) / this.duration));
    this.cur = this.from.map((f, i) => {
      const t = this.to[i];
      return {
        intensity: f.intensity + (t.intensity - f.intensity) * p,
        rgb: [
          Math.round(f.rgb[0] + (t.rgb[0] - f.rgb[0]) * p),
          Math.round(f.rgb[1] + (t.rgb[1] - f.rgb[1]) * p),
          Math.round(f.rgb[2] + (t.rgb[2] - f.rgb[2]) * p),
        ] as [number, number, number],
        pan: f.pan + (t.pan - f.pan) * p,
      };
    });
    return this.cur;
  }
}

/** A one-dimensional fade, for the blackout multiplier. */
export class LevelFader {
  private from: number;
  private to: number;
  private cur: number;
  private startedAt = 0;
  private duration = 1;

  constructor(initial: number) {
    this.cur = this.from = this.to = initial;
  }

  setTarget(value: number, durationMs: number, now: number) {
    this.from = this.cur;
    this.to = value;
    this.startedAt = now;
    this.duration = Math.max(durationMs, 1);
  }

  step(now: number): number {
    const p = Math.min(1, Math.max(0, (now - this.startedAt) / this.duration));
    this.cur = this.from + (this.to - this.from) * p;
    return this.cur;
  }

  get value() {
    return this.cur;
  }
}

/**
 * Pack an interpolated frame into a universe, honouring each personality's real
 * channel layout. This is the output that would go out over sACN.
 */
export function frameToUniverse(frame: Frame, master: number): Uint8Array {
  const dmx = new Uint8Array(512);
  RIG.forEach((fixture, i) => {
    const f = frame[i];
    if (!f) return;
    const b = fixture.patch - 1;
    const level = Math.round(f.intensity * master * 255);

    if (fixture.type === "moving") {
      dmx[b] = Math.round((f.pan + 1) * 127.5); // pan
      dmx[b + 1] = 128; // tilt, parked
      dmx[b + 2] = level;
      dmx[b + 3] = f.rgb[0];
      dmx[b + 4] = f.rgb[1];
      dmx[b + 5] = f.rgb[2];
      dmx[b + 6] = 0; // gobo wheel
      dmx[b + 7] = 0; // strobe
      return;
    }
    if (fixture.type === "followspot") {
      dmx[b] = level;
      dmx[b + 1] = 200; // iris
      return;
    }
    if (fixture.type === "house") {
      dmx[b] = level;
      return;
    }
    dmx[b] = level;
    if (CHANNELS[fixture.type] >= 4) {
      dmx[b + 1] = f.rgb[0];
      dmx[b + 2] = f.rgb[1];
      dmx[b + 3] = f.rgb[2];
    }
  });
  return dmx;
}
