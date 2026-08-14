/**
 * Every detector parameter, in one dependency-free module.
 *
 * This file imports nothing on purpose. It is the single source of truth for
 * three things that would otherwise drift apart: the running detectors, the
 * "Table II, live" section of the site, and Table II of the paper — which is
 * generated from here by `npm run thresholds:latex` rather than transcribed.
 *
 * Units are hand-spans or milliseconds throughout. A hand-span is the wrist to
 * middle-finger MCP distance, so every spatial threshold is scale-invariant and
 * needs no per-operator or per-room calibration.
 */

// --- LX 1, blackout: double clap --------------------------------------------
export const CLAP_TOGETHER = 1.3; // palms this close counts as contact
export const CLAP_APART = 2.2; // palms this far apart re-arms the detector
export const CLAP_LOST_SEP = 2.4; // how close they must have been when tracking dropped
export const CLAP_CLOSING_SPEED = 4.5; // spans per second
export const CLAP_LOST_GRACE = 260; // ms after losing the pair that a clap still counts
export const CLAP_REARM_AFTER = 240; // ms — re-arm even if the pair is never re-acquired
export const CLAP_MIN_GAP = 120; // ms — below this it is one clap seen twice
export const CLAP_MAX_GAP = 900; // ms — above this it is two separate claps

// --- LX 2, general cover: both palms open, raised ----------------------------
export const COVER_HOLD = 400; // ms
// Generous, because a seated operator at a laptop frames head-and-shoulders and
// their hands never get near the top of frame.
export const COVER_RAISED_Y = 0.62;

// --- LX 3, centre special: point and hold ------------------------------------
export const POINT_HOLD = 500; // ms
export const POINT_STILLNESS = 0.035; // max palm travel per frame while "held"

// --- LX 4, master dim: an open hand ------------------------------------------
// Orientation is not tested at all. Asking an operator to hold a specific palm
// angle while also watching the stage was a design mistake: the gesture has to
// survive being performed without looking.
export const DIM_MIN_FINGERS = 3;
export const DIM_SMOOTHING = 0.4;

// --- LX 5, colour state: lateral swipe ---------------------------------------
export const SWIPE_WINDOW = 350; // ms
export const SWIPE_TRAVEL = 0.3; // normalised frame widths
export const SWIPE_MIN_SAMPLES = 4; // frames
export const SWIPE_COOLDOWN = 1500; // ms
/**
 * A clap throws both hands sideways through the frame, and the moment the pair
 * merges the tracker reports one hand travelling fast — which is exactly what a
 * swipe looks like. Swiping is one-handed by definition, so anything within this
 * window of seeing two hands cannot be a swipe.
 */
export const SWIPE_TWO_HAND_LOCKOUT = 800; // ms

// --- arbitration --------------------------------------------------------------
export const GLOBAL_COOLDOWN = 350; // ms after any discrete cue
/**
 * Hand count flickers between one and two constantly at the edge of detection.
 * Switching cue branch on every flicker resets every hold timer, so the branch
 * follows a debounced count while the clap detector reads the raw one.
 */
export const HAND_COUNT_DEBOUNCE = 110; // ms

/** The same rows as Table II of the paper, as data. */
export const THRESHOLDS: { cue: string; name: string; value: string }[] = [
  { cue: "LX 1", name: "Contact separation", value: `${CLAP_TOGETHER} spans` },
  { cue: "LX 1", name: "Re-arm separation", value: `${CLAP_APART} spans` },
  { cue: "LX 1", name: "Separation at track loss", value: `${CLAP_LOST_SEP} spans` },
  { cue: "LX 1", name: "Closing speed", value: `${CLAP_CLOSING_SPEED} spans/s` },
  { cue: "LX 1", name: "Grace after pair lost", value: `${CLAP_LOST_GRACE} ms` },
  { cue: "LX 1", name: "Re-arm timeout", value: `${CLAP_REARM_AFTER} ms` },
  { cue: "LX 1", name: "Inter-clap gap", value: `${CLAP_MIN_GAP}--${CLAP_MAX_GAP} ms` },
  { cue: "LX 2", name: "Hold", value: `${COVER_HOLD} ms` },
  { cue: "LX 2", name: "Wrist height", value: `${COVER_RAISED_Y}` },
  { cue: "LX 3", name: "Hold", value: `${POINT_HOLD} ms` },
  { cue: "LX 3", name: "Stillness per frame", value: `${POINT_STILLNESS}` },
  { cue: "LX 4", name: "Minimum extended fingers", value: `${DIM_MIN_FINGERS}` },
  { cue: "LX 4", name: "Smoothing coefficient", value: `${DIM_SMOOTHING}` },
  { cue: "LX 5", name: "Window", value: `${SWIPE_WINDOW} ms` },
  { cue: "LX 5", name: "Travel", value: `${SWIPE_TRAVEL} frame widths` },
  { cue: "LX 5", name: "Minimum samples", value: `${SWIPE_MIN_SAMPLES} frames` },
  { cue: "LX 5", name: "Cooldown", value: `${SWIPE_COOLDOWN} ms` },
  { cue: "LX 5", name: "Two-hand lockout", value: `${SWIPE_TWO_HAND_LOCKOUT} ms` },
  { cue: "---", name: "Global cooldown", value: `${GLOBAL_COOLDOWN} ms` },
  { cue: "---", name: "Hand-count debounce", value: `${HAND_COUNT_DEBOUNCE} ms` },
];
