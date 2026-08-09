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

/** Resolve the abstract state into a per-fixture output. */
export function resolve(s: LightingState): FixtureOutput[] {
  const colour = COLOUR_STATES[s.colour].rgb;
  const m = s.blackout ? 0 : s.master;

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

    return { fixture, intensity: intensity * m, rgb };
  });
}

/** Pack the resolved rig into a real 512-channel universe. */
export function toUniverse(outputs: FixtureOutput[]): Uint8Array {
  const dmx = new Uint8Array(512);
  for (const { fixture, intensity, rgb } of outputs) {
    const base = fixture.patch - 1;
    const level = Math.round(intensity * 255);
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
