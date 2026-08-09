import type { CueId } from "./gestures";

/**
 * The walkthrough, ordered by how hard the gesture is to perform — not by cue
 * number. Someone meeting this for the first time needs a win in the first ten
 * seconds, so the continuous dim comes first: it responds to any open hand and
 * gives constant feedback. The double clap comes last because it is the only
 * cue that can feel like it is not working.
 */

export type CoachStep = {
  id: string;
  title: string;
  body: string;
  /** What advances the step. */
  watch: { kind: "hand" } | { kind: "dim" } | { kind: "cue"; cue: CueId };
  /** Shown once the step is satisfied. */
  praise: string;
};

export const COACH_STEPS: CoachStep[] = [
  {
    id: "hand",
    title: "Show a hand",
    body: "Hold either hand up, palm toward the camera. The skeleton should snap onto it.",
    watch: { kind: "hand" },
    praise: "Tracking. That skeleton is all the system ever sees.",
  },
  {
    id: "dim",
    title: "Take the stage up",
    body: "One open hand. Raise it to bring the lights up, lower it to take them out. The master follows your hand continuously.",
    watch: { kind: "dim" },
    praise: "That is the master fader, under your hand.",
  },
  {
    id: "cover",
    title: "Call a general cover",
    body: "Both palms open, both hands up, held for half a second. This is the everyone-can-see-the-stage state.",
    watch: { kind: "cue", cue: "cover" },
    praise: "LX 2 fired. Front wash to full.",
  },
  {
    id: "special",
    title: "Isolate centre stage",
    body: "Point with one finger and hold it still. The wash drops away and the profile picks out the performer.",
    watch: { kind: "cue", cue: "special" },
    praise: "LX 3. One performer, everything else out.",
  },
  {
    id: "colour",
    title: "Change the colour",
    body: "Swipe one hand sideways, right across the frame. Each swipe steps to the next gel on the backlight.",
    watch: { kind: "cue", cue: "colour" },
    praise: "LX 5. This is the cue most likely to fire by accident.",
  },
  {
    id: "blackout",
    title: "Kill the lights",
    body: "Clap twice, sharply. Clap twice again to bring them back. The detector reads how fast your palms close, not the sound.",
    watch: { kind: "cue", cue: "blackout" },
    praise: "LX 1. Clap twice again whenever you want them back.",
  },
];

/** How far the master must travel before the dim step counts as learned. */
export const DIM_LEARN_RANGE = 0.35;
