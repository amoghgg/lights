/**
 * The five cues, detected from hand landmarks by rule.
 *
 * No model is trained here on purpose. Rules get all five working, and they
 * become the baseline a learned classifier has to beat — the comparison worth
 * reporting. What rules cannot give you is a calibrated "that was not a cue"
 * score, which is why `falseTriggerRisk` below is annotated per cue rather than
 * measured: cue 5 is the one that will need a null class first.
 */

import {
  Hand,
  extendedFingers,
  handSpan,
  isOpenPalm,
  isPointing,
  palmCenter,
  palmFlatness,
  palmSeparation,
} from "./landmarks";

export type CueId = "blackout" | "cover" | "special" | "dim" | "colour";

export type CueEvent = {
  cue: CueId;
  at: number;
  /** Set when the operator flagged the firing as unintended. Drives the FTR count. */
  flagged?: boolean;
};

export const CUES: {
  id: CueId;
  n: string;
  name: string;
  gesture: string;
  kind: "dynamic" | "static" | "continuous";
  hands: 1 | 2;
  falseTriggerRisk: "low" | "medium" | "high";
}[] = [
  {
    id: "blackout",
    n: "LX 1",
    name: "Blackout",
    gesture: "Clap twice",
    kind: "dynamic",
    hands: 2,
    falseTriggerRisk: "low",
  },
  {
    id: "cover",
    n: "LX 2",
    name: "General cover",
    gesture: "Both palms open, raised",
    kind: "static",
    hands: 2,
    falseTriggerRisk: "low",
  },
  {
    id: "special",
    n: "LX 3",
    name: "Centre special",
    gesture: "Point, hold",
    kind: "static",
    hands: 1,
    falseTriggerRisk: "medium",
  },
  {
    id: "dim",
    n: "LX 4",
    name: "Master dim",
    gesture: "Flat palm, move up or down",
    kind: "continuous",
    hands: 1,
    falseTriggerRisk: "medium",
  },
  {
    id: "colour",
    n: "LX 5",
    name: "Colour state",
    gesture: "Swipe sideways",
    kind: "dynamic",
    hands: 1,
    falseTriggerRisk: "high",
  },
];

// --- thresholds, all in hand-spans or normalised frame units -----------------

const CLAP_TOGETHER = 1.15;
const CLAP_APART = 2.2;
const CLAP_CLOSING_SPEED = 5.5; // spans per second
const CLAP_MIN_GAP = 120; // ms — below this it is one clap seen twice
const CLAP_MAX_GAP = 800; // ms — above this it is two separate claps

const COVER_HOLD = 400; // ms
const COVER_RAISED_Y = 0.55; // wrists must sit in the upper part of frame

const POINT_HOLD = 500; // ms
const POINT_STILLNESS = 0.035; // max palm travel per frame while "held"

const DIM_FLATNESS = 0.55;
const DIM_SMOOTHING = 0.25; // EMA on the output level

const SWIPE_WINDOW = 350; // ms
const SWIPE_TRAVEL = 0.22; // normalised frame widths
const SWIPE_COOLDOWN = 900; // ms

const GLOBAL_COOLDOWN = 450; // ms after any discrete cue

type Sample = { t: number; sep: number; x: number };

export type EngineState = {
  /** What the engine currently believes it is looking at. "rest" is the null class. */
  label: CueId | "rest";
  /** 0..1 progress toward firing, for hold gestures. */
  hold: number;
  handCount: number;
  clapArmed: boolean;
  clapsInWindow: number;
  dimLevel: number | null;
  /** Live diagnostics, surfaced in the telemetry panel. */
  separation: number | null;
  flatness: number | null;
};

export class GestureEngine {
  private history: Sample[] = [];
  private lastClapAt = 0;
  private pendingClapAt = 0;
  private clapArmed = true;
  private coverSince = 0;
  private coverLatched = false;
  private pointSince = 0;
  private pointLatched = false;
  private lastSwipeAt = 0;
  private lastCueAt = 0;
  private dimEma: number | null = null;
  private prevPalmX: number | null = null;
  private prevPalmY: number | null = null;

  state: EngineState = {
    label: "rest",
    hold: 0,
    handCount: 0,
    clapArmed: true,
    clapsInWindow: 0,
    dimLevel: null,
    separation: null,
    flatness: null,
  };

  reset() {
    this.history = [];
    this.coverSince = 0;
    this.pointSince = 0;
    this.coverLatched = false;
    this.pointLatched = false;
    this.dimEma = null;
    this.prevPalmX = null;
    this.prevPalmY = null;
  }

  /**
   * Feed one frame. Returns the cues that fired on this frame — normally none,
   * at most one discrete cue, plus `dim` whenever the continuous mode is active.
   */
  update(hands: Hand[], t: number): { fired: CueId[]; dimLevel: number | null } {
    const fired: CueId[] = [];
    let dimLevel: number | null = null;

    this.state.handCount = hands.length;
    this.state.separation = null;
    this.state.flatness = null;

    if (hands.length === 0) {
      this.clearHolds();
      this.state.label = "rest";
      this.state.hold = 0;
      this.state.dimLevel = null;
      this.dimEma = null;
      return { fired, dimLevel };
    }

    const cooling = t - this.lastCueAt < GLOBAL_COOLDOWN;

    // --- two-handed cues take priority; they cannot be confused with the rest
    if (hands.length === 2) {
      const [a, b] = hands;
      const sep = palmSeparation(a, b);
      this.state.separation = sep;
      this.history.push({ t, sep, x: palmCenter(a).x });
      this.trimHistory(t);

      // cue 1 — double clap
      if (this.detectClap(t, sep) && !cooling) {
        const gap = t - this.lastClapAt;
        if (gap > CLAP_MIN_GAP && gap < CLAP_MAX_GAP) {
          fired.push("blackout");
          this.lastCueAt = t;
          this.lastClapAt = 0;
          this.pendingClapAt = 0;
        } else {
          this.lastClapAt = t;
          this.pendingClapAt = t;
        }
      }
      if (t - this.lastClapAt > CLAP_MAX_GAP) this.pendingClapAt = 0;

      // cue 2 — both palms open and raised
      const bothOpen = isOpenPalm(a) && isOpenPalm(b);
      const bothRaised = a[0].y < COVER_RAISED_Y && b[0].y < COVER_RAISED_Y;
      if (bothOpen && bothRaised && sep > CLAP_APART) {
        if (!this.coverSince) this.coverSince = t;
        const held = t - this.coverSince;
        this.state.label = "cover";
        this.state.hold = Math.min(1, held / COVER_HOLD);
        if (held >= COVER_HOLD && !this.coverLatched && !cooling) {
          fired.push("cover");
          this.coverLatched = true;
          this.lastCueAt = t;
        }
      } else {
        this.coverSince = 0;
        this.coverLatched = false;
        if (this.state.label === "cover") this.state.label = "rest";
      }

      this.pointSince = 0;
      this.pointLatched = false;
      this.state.clapsInWindow = this.pendingClapAt ? 1 : 0;
      this.state.dimLevel = null;
      if (fired.length === 0 && this.state.label !== "cover") this.state.label = "rest";
      return { fired, dimLevel };
    }

    // --- single hand ---------------------------------------------------------
    const hand = hands[0];
    const centre = palmCenter(hand);
    this.history.push({ t, sep: NaN, x: centre.x });
    this.trimHistory(t);
    this.coverSince = 0;
    this.coverLatched = false;
    this.state.clapsInWindow = this.pendingClapAt ? 1 : 0;

    const travel =
      this.prevPalmX === null
        ? 0
        : Math.hypot(centre.x - this.prevPalmX, centre.y - (this.prevPalmY ?? centre.y));
    this.prevPalmX = centre.x;
    this.prevPalmY = centre.y;

    const flat = palmFlatness(hand);
    this.state.flatness = flat;

    // cue 5 — lateral swipe. Checked before the static cues because a hand in
    // motion is never a held pose.
    const swipe = this.detectSwipe(t);
    if (swipe && !cooling && t - this.lastSwipeAt > SWIPE_COOLDOWN) {
      fired.push("colour");
      this.lastSwipeAt = t;
      this.lastCueAt = t;
      this.state.label = "colour";
      this.state.hold = 1;
      this.pointSince = 0;
      return { fired, dimLevel };
    }

    // cue 3 — point and hold
    if (isPointing(hand) && travel < POINT_STILLNESS) {
      if (!this.pointSince) this.pointSince = t;
      const held = t - this.pointSince;
      this.state.label = "special";
      this.state.hold = Math.min(1, held / POINT_HOLD);
      if (held >= POINT_HOLD && !this.pointLatched && !cooling) {
        fired.push("special");
        this.pointLatched = true;
        this.lastCueAt = t;
      }
      this.state.dimLevel = null;
      return { fired, dimLevel };
    }
    this.pointSince = 0;
    this.pointLatched = false;

    // cue 4 — flat palm drives the master, continuously
    const f = extendedFingers(hand);
    if (f.count === 4 && flat > DIM_FLATNESS) {
      // wrist near the top of frame is full, near the bottom is out
      const raw = 1 - Math.min(1, Math.max(0, (centre.y - 0.15) / 0.7));
      this.dimEma = this.dimEma === null ? raw : this.dimEma + (raw - this.dimEma) * DIM_SMOOTHING;
      dimLevel = this.dimEma;
      this.state.label = "dim";
      this.state.hold = 1;
      this.state.dimLevel = dimLevel;
      return { fired, dimLevel };
    }

    this.dimEma = null;
    this.state.label = "rest";
    this.state.hold = 0;
    this.state.dimLevel = null;
    return { fired, dimLevel };
  }

  /**
   * A clap is the palms closing fast, not merely being close together — resting
   * hands sit near each other all the time. Requiring the closing *speed* is
   * what keeps this off the false-trigger list.
   */
  private detectClap(t: number, sep: number): boolean {
    if (sep > CLAP_APART) this.clapArmed = true;
    this.state.clapArmed = this.clapArmed;
    if (!this.clapArmed || sep > CLAP_TOGETHER) return false;

    const prior = this.history.filter((s) => t - s.t > 30 && t - s.t < 200 && !Number.isNaN(s.sep));
    if (prior.length === 0) return false;
    const oldest = prior[0];
    const speed = (oldest.sep - sep) / Math.max((t - oldest.t) / 1000, 1e-3);
    if (speed < CLAP_CLOSING_SPEED) return false;

    this.clapArmed = false;
    return true;
  }

  private detectSwipe(t: number): boolean {
    const win = this.history.filter((s) => t - s.t <= SWIPE_WINDOW);
    if (win.length < 4) return false;
    const dx = win[win.length - 1].x - win[0].x;
    if (Math.abs(dx) < SWIPE_TRAVEL) return false;
    // every step must move the same way, so a wave back and forth is not a swipe
    const sign = Math.sign(dx);
    for (let i = 1; i < win.length; i++) {
      if (Math.sign(win[i].x - win[i - 1].x) === -sign) return false;
    }
    return true;
  }

  private trimHistory(t: number) {
    const cutoff = t - 1200;
    while (this.history.length && this.history[0].t < cutoff) this.history.shift();
  }

  private clearHolds() {
    this.coverSince = 0;
    this.pointSince = 0;
    this.coverLatched = false;
    this.pointLatched = false;
    this.prevPalmX = null;
    this.prevPalmY = null;
  }
}

export { handSpan };
