/**
 * The rig.
 *
 * Modelled on how a mid-size proscenium house is actually hung, rather than on
 * what is convenient to draw: front of house on a warm/cool split, an overhead
 * wash, sidelight on booms, backlight for separation, a cyclorama batten for
 * the big colour statements, breakup gobos, two movers, a followspot, footlights
 * and the house lights. Twenty-six fixtures over 119 DMX channels.
 *
 * Channel counts follow real personalities — an LED profile is four channels, a
 * moving head is eight — so the universe this produces is patchable as-is.
 */

export type FixtureType =
  | "profile" // ERS / leko — hard edge, gobo-capable
  | "par" // wash
  | "fresnel" // soft edge
  | "cyc" // asymmetric flood for the back wall
  | "moving" // moving head
  | "followspot"
  | "batten" // footlights
  | "house"; // auditorium

export type Position =
  | "foh" // front of house, out over the audience
  | "overhead"
  | "boom-sl" // side, stage left
  | "boom-sr"
  | "back"
  | "cyc"
  | "gobo"
  | "mover"
  | "spot"
  | "foot"
  | "house";

export type Fixture = {
  id: string;
  patch: number;
  type: FixtureType;
  position: Position;
  /** Where it hangs, 0..1 across the proscenium. */
  x: number;
  /** Beam half-angle in degrees. A profile is tight; a cyc flood is not. */
  beam: number;
  /** Human label as it would read on the plot. */
  label: string;
};

/** How many DMX channels each personality occupies. */
export const CHANNELS: Record<FixtureType, number> = {
  profile: 4, // dim, R, G, B
  par: 4,
  fresnel: 4,
  cyc: 4,
  moving: 8, // pan, tilt, dim, R, G, B, gobo, strobe
  followspot: 2, // dim, iris
  batten: 4,
  house: 1,
};

function patchRig(
  defs: Omit<Fixture, "patch">[],
): { rig: Fixture[]; total: number } {
  let next = 1;
  const rig = defs.map((d) => {
    const f = { ...d, patch: next } as Fixture;
    next += CHANNELS[d.type];
    return f;
  });
  return { rig, total: next - 1 };
}

const { rig: RIG_, total } = patchRig([
  // --- front of house: the warm/cool split that makes faces read -----------
  { id: "FOH-1", type: "profile", position: "foh", x: 0.2, beam: 13, label: "FOH warm SL" },
  { id: "FOH-2", type: "profile", position: "foh", x: 0.38, beam: 13, label: "FOH cool SL" },
  { id: "FOH-3", type: "profile", position: "foh", x: 0.62, beam: 13, label: "FOH cool SR" },
  { id: "FOH-4", type: "profile", position: "foh", x: 0.8, beam: 13, label: "FOH warm SR" },

  // --- overhead wash --------------------------------------------------------
  { id: "OH-1", type: "fresnel", position: "overhead", x: 0.18, beam: 26, label: "Overhead 1" },
  { id: "OH-2", type: "fresnel", position: "overhead", x: 0.39, beam: 26, label: "Overhead 2" },
  { id: "OH-3", type: "fresnel", position: "overhead", x: 0.61, beam: 26, label: "Overhead 3" },
  { id: "OH-4", type: "fresnel", position: "overhead", x: 0.82, beam: 26, label: "Overhead 4" },

  // --- booms: sidelight, the dance lighting position ------------------------
  { id: "BM-L1", type: "par", position: "boom-sl", x: 0.03, beam: 22, label: "Boom SL high" },
  { id: "BM-L2", type: "par", position: "boom-sl", x: 0.03, beam: 22, label: "Boom SL mid" },
  { id: "BM-L3", type: "par", position: "boom-sl", x: 0.03, beam: 22, label: "Boom SL shin" },
  { id: "BM-R1", type: "par", position: "boom-sr", x: 0.97, beam: 22, label: "Boom SR high" },
  { id: "BM-R2", type: "par", position: "boom-sr", x: 0.97, beam: 22, label: "Boom SR mid" },
  { id: "BM-R3", type: "par", position: "boom-sr", x: 0.97, beam: 22, label: "Boom SR shin" },

  // --- backlight: separation from the cyc -----------------------------------
  { id: "BK-1", type: "par", position: "back", x: 0.26, beam: 24, label: "Back 1" },
  { id: "BK-2", type: "par", position: "back", x: 0.45, beam: 24, label: "Back 2" },
  { id: "BK-3", type: "par", position: "back", x: 0.55, beam: 24, label: "Back 3" },
  { id: "BK-4", type: "par", position: "back", x: 0.74, beam: 24, label: "Back 4" },

  // --- cyclorama ------------------------------------------------------------
  { id: "CYC-1", type: "cyc", position: "cyc", x: 0.15, beam: 45, label: "Cyc 1" },
  { id: "CYC-2", type: "cyc", position: "cyc", x: 0.38, beam: 45, label: "Cyc 2" },
  { id: "CYC-3", type: "cyc", position: "cyc", x: 0.62, beam: 45, label: "Cyc 3" },
  { id: "CYC-4", type: "cyc", position: "cyc", x: 0.85, beam: 45, label: "Cyc 4" },

  // --- texture and specials -------------------------------------------------
  { id: "GOBO-L", type: "profile", position: "gobo", x: 0.32, beam: 20, label: "Breakup SL" },
  { id: "GOBO-R", type: "profile", position: "gobo", x: 0.68, beam: 20, label: "Breakup SR" },
  { id: "MH-L", type: "moving", position: "mover", x: 0.3, beam: 14, label: "Mover SL" },
  { id: "MH-R", type: "moving", position: "mover", x: 0.7, beam: 14, label: "Mover SR" },
  { id: "SPOT", type: "followspot", position: "spot", x: 0.5, beam: 8, label: "Followspot" },
  { id: "FOOT", type: "batten", position: "foot", x: 0.5, beam: 60, label: "Footlights" },
  { id: "HOUSE", type: "house", position: "house", x: 0.5, beam: 90, label: "House lights" },
]);

export const RIG = RIG_;
export const PATCHED_CHANNELS = total;

/**
 * Gel library, by real filter number. Colour on stage is named by the filter a
 * designer would actually put in the frame — the numbers are the vocabulary,
 * and using them is the difference between a lighting tool and a colour picker.
 */
export type Gel = { code: string; name: string; rgb: readonly [number, number, number] };

export const GELS: Record<string, Gel> = {
  openWhite: { code: "O/W", name: "Open white", rgb: [255, 250, 240] },
  tungsten: { code: "3200K", name: "Tungsten", rgb: [255, 187, 122] },
  L201: { code: "L201", name: "Full CT Blue", rgb: [126, 176, 232] },
  L202: { code: "L202", name: "Half CT Blue", rgb: [178, 209, 240] },
  L106: { code: "L106", name: "Primary Red", rgb: [222, 48, 52] },
  L104: { code: "L104", name: "Deep Amber", rgb: [255, 150, 40] },
  L119: { code: "L119", name: "Dark Blue", rgb: [40, 72, 176] },
  L124: { code: "L124", name: "Dark Green", rgb: [46, 168, 104] },
  L126: { code: "L126", name: "Mauve", rgb: [186, 92, 200] },
  L127: { code: "L127", name: "Smokey Pink", rgb: [236, 130, 158] },
  L132: { code: "L132", name: "Medium Blue", rgb: [56, 122, 208] },
  L147: { code: "L147", name: "Apricot", rgb: [255, 176, 116] },
  L181: { code: "L181", name: "Congo Blue", rgb: [72, 32, 168] },
  R80: { code: "R80", name: "Primary Blue", rgb: [40, 96, 200] },
};

/** The colour states LX 5 steps through, as a designer would cue them. */
export const COLOUR_STATES: { gel: string; name: string; cyc: Gel; back: Gel }[] = [
  { gel: "L201", name: "Cool", cyc: GELS.L201, back: GELS.L202 },
  { gel: "L104", name: "Warm", cyc: GELS.L104, back: GELS.L147 },
  { gel: "L106", name: "Blood", cyc: GELS.L106, back: GELS.L127 },
  { gel: "L124", name: "Forest", cyc: GELS.L124, back: GELS.L124 },
  { gel: "L181", name: "Midnight", cyc: GELS.L181, back: GELS.L119 },
  { gel: "L126", name: "Mauve", cyc: GELS.L126, back: GELS.L127 },
];

export const BY_POSITION = (p: Position) => RIG.filter((f) => f.position === p);

/** CSS-variable-safe form of a position name, e.g. "boom-sl" -> "boomsl". */
export const posKey = (p: Position) => p.replace("-", "");

/** Positions in the order a plot lists them, for the fixture readout. */
export const POSITION_ORDER: Position[] = [
  "foh", "overhead", "boom-sl", "boom-sr", "back",
  "cyc", "gobo", "mover", "spot", "foot", "house",
];

export const POSITION_LABEL: Record<Position, string> = {
  foh: "Front of house",
  overhead: "Overhead",
  "boom-sl": "Boom stage left",
  "boom-sr": "Boom stage right",
  back: "Backlight",
  cyc: "Cyclorama",
  gobo: "Breakup",
  mover: "Moving heads",
  spot: "Followspot",
  foot: "Footlights",
  house: "House lights",
};
