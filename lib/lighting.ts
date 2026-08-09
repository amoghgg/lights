/**
 * The rig, and the state the cues drive it into.
 *
 * Seven fixtures, patched into a DMX universe exactly as they would be on a real
 * plot — four front wash, one centre profile, two colour backlight. The universe
 * is generated rather than decorative: swap the renderer for a sACN socket and
 * the same bytes drive real fixtures.
 */

import type { CueId } from "./gestures";

export type FixtureKind = "wash" | "profile" | "back";

export type Fixture = {
  id: string;
  /** Channel number as it would appear on the plot. */
  patch: number;
  kind: FixtureKind;
  /** Position on the plan, 0..1 across the stage and 0..1 upstage. */
  x: number;
  y: number;
  /** Beam half-angle, degrees — a profile is tight, a PAR is wide. */
  beam: number;
};

export const RIG: Fixture[] = [
  { id: "FOH 1", patch: 1, kind: "wash", x: 0.16, y: 0.06, beam: 30 },
  { id: "FOH 2", patch: 5, kind: "wash", x: 0.38, y: 0.06, beam: 30 },
  { id: "FOH 3", patch: 9, kind: "wash", x: 0.62, y: 0.06, beam: 30 },
  { id: "FOH 4", patch: 13, kind: "wash", x: 0.84, y: 0.06, beam: 30 },
  { id: "PROFILE", patch: 17, kind: "profile", x: 0.5, y: 0.3, beam: 12 },
  { id: "BACK L", patch: 18, kind: "back", x: 0.32, y: 0.92, beam: 34 },
  { id: "BACK R", patch: 22, kind: "back", x: 0.68, y: 0.92, beam: 34 },
];

/** Gel references, so the colour states name themselves the way a plot would. */
export const COLOUR_STATES = [
  { gel: "L201", name: "Full CT Blue", rgb: [77, 143, 214] as const },
  { gel: "L106", name: "Primary Red", rgb: [214, 58, 62] as const },
  { gel: "L104", name: "Deep Amber", rgb: [255, 146, 45] as const },
  { gel: "L124", name: "Dark Green", rgb: [64, 176, 116] as const },
  { gel: "L126", name: "Mauve", rgb: [176, 92, 196] as const },
];

/** 3200K tungsten — what an untinted theatre front wash actually looks like. */
const TUNGSTEN = [255, 187, 122] as const;

export type LightingState = {
  blackout: boolean;
  look: "cover" | "special" | "none";
  master: number; // 0..1
  colour: number; // index into COLOUR_STATES
};

export const INITIAL_STATE: LightingState = {
  blackout: false,
  look: "none",
  master: 0.8,
  colour: 0,
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
      return { ...s, colour: (s.colour + 1) % COLOUR_STATES.length };
    case "dim":
      return { ...s, master: dimLevel ?? s.master };
    default:
      return s;
  }
}

export type FixtureOutput = {
  fixture: Fixture;
  intensity: number; // 0..1
  rgb: readonly [number, number, number];
};

/**
 * Resolve the abstract state into a per-fixture output — *before* the master.
 *
 * The master is deliberately left out. It changes every frame while a hand is
 * moving, and folding it in here would mean re-rendering the whole stage at
 * frame rate. Instead it is applied as one group opacity in the SVG, driven by
 * a CSS variable the render loop writes directly.
 */
export function resolve(s: LightingState): FixtureOutput[] {
  const colour = COLOUR_STATES[s.colour].rgb;

  return RIG.map((fixture) => {
    let intensity = 0;
    let rgb: readonly [number, number, number] = TUNGSTEN;

    if (fixture.kind === "wash") {
      // Open white sits high, not half-up: the master is what takes the rig
      // from black to full, so the base state has to leave room to read as
      // "full" when a hand goes all the way up.
      intensity = s.look === "special" ? 0.08 : s.look === "cover" ? 1 : 0.85;
    } else if (fixture.kind === "profile") {
      intensity = s.look === "special" ? 1 : 0;
    } else {
      // Backlight never goes fully out, even under a special — it is the only
      // fixture carrying colour, and a colour cue you cannot see is not a cue.
      intensity = s.look === "special" ? 0.2 : s.look === "cover" ? 0.55 : 0.5;
      rgb = colour;
    }

    return { fixture, intensity, rgb };
  });
}

/** Pack the resolved rig into a real 512-channel universe, master applied. */
export function toUniverse(outputs: FixtureOutput[], master: number): Uint8Array {
  const dmx = new Uint8Array(512);
  for (const { fixture, intensity, rgb } of outputs) {
    const base = fixture.patch - 1;
    const level = Math.round(intensity * master * 255);
    dmx[base] = level;
    if (fixture.kind !== "profile") {
      dmx[base + 1] = rgb[0];
      dmx[base + 2] = rgb[1];
      dmx[base + 3] = rgb[2];
    }
  }
  return dmx;
}

/** Highest channel the rig touches — everything above is dead air on the plot. */
export const PATCHED_CHANNELS = 25;

/**
 * Fade times, in milliseconds — the "count" a board operator would write on the
 * cue sheet. Nothing snaps except by choice: a hard cut between looks reads as a
 * fault on real fixtures, and on tungsten it is physically impossible anyway.
 *
 * The master is absent because it does not fade. It is the operator's hand, live.
 */
export const FADE_MS: Record<CueId, number> = {
  blackout: 1000, // going out — quick, but still a fade
  cover: 3000, // a warm build to full
  special: 2500, // wash out as the profile comes in
  colour: 2000, // gels crossfade slowly or it reads as a glitch
  dim: 0, // tracks the hand, never interpolated
};

/** Coming back in is slower than going out — a stage that snaps on blinds people. */
export const BLACKOUT_IN_MS = 1800;

type Frame = { intensity: number; rgb: [number, number, number] }[];

const snapshot = (o: FixtureOutput[]): Frame =>
  o.map((f) => ({ intensity: f.intensity, rgb: [f.rgb[0], f.rgb[1], f.rgb[2]] }));

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
    this.from = this.cur.map((f) => ({ intensity: f.intensity, rgb: [...f.rgb] as [number, number, number] }));
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
      };
    });
    return this.cur;
  }

  progress(now: number): number {
    return Math.min(1, Math.max(0, (now - this.startedAt) / this.duration));
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

/** Pack an interpolated frame into a universe. */
export function frameToUniverse(frame: Frame, master: number): Uint8Array {
  const dmx = new Uint8Array(512);
  RIG.forEach((fixture, i) => {
    const f = frame[i];
    if (!f) return;
    const base = fixture.patch - 1;
    dmx[base] = Math.round(f.intensity * master * 255);
    if (fixture.kind !== "profile") {
      dmx[base + 1] = f.rgb[0];
      dmx[base + 2] = f.rgb[1];
      dmx[base + 3] = f.rgb[2];
    }
  });
  return dmx;
}
