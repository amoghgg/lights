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

import {
  CLAP_APART, CLAP_CLOSING_SPEED, CLAP_LOST_GRACE, CLAP_LOST_SEP, CLAP_MAX_GAP,
  CLAP_MIN_GAP, CLAP_REARM_AFTER, CLAP_TOGETHER, COVER_HOLD, COVER_RAISED_Y,
  DIM_MIN_FINGERS, DIM_SMOOTHING, GLOBAL_COOLDOWN, HAND_COUNT_DEBOUNCE,
  POINT_HOLD, POINT_STILLNESS, SWIPE_COOLDOWN, SWIPE_MIN_SAMPLES, SWIPE_TRAVEL,
  SWIPE_TWO_HAND_LOCKOUT, SWIPE_WINDOW,
} from "./thresholds";

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
    gesture: "One open hand, move up or down",
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

type SepSample = { t: number; sep: number };
type XSample = { t: number; x: number };

/**
 * Per-cue condition readout. A cue fires only when every condition passes, so
 * showing them individually turns "nothing happened" into "my wrists were too
 * low" without anyone having to open a console.
 */
export type Check = { cue: CueId; label: string; ok: boolean; detail: string };

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
  checks: Check[];
};

export class GestureEngine {
  private sepHistory: SepSample[] = [];
  private xHistory: XSample[] = [];
  private lastTwoHandAt = 0;

  // clap
  private clapArmed = true;
  private lastClapAt = 0;
  private lastClapEventAt = 0;
  private lastPairSep: number | null = null;
  private lastPairAt = 0;
  private lastClosingSpeed = 0;

  // holds
  private coverSince = 0;
  private coverLatched = false;
  private pointSince = 0;
  private pointLatched = false;

  private lastSwipeAt = 0;
  private lastCueAt = 0;
  private dimEma: number | null = null;
  private prevPalmX: number | null = null;
  private prevPalmY: number | null = null;

  // hand-count debounce
  private stableCount = 0;
  private candidateCount = 0;
  private candidateSince = 0;

  state: EngineState = {
    label: "rest",
    hold: 0,
    handCount: 0,
    clapArmed: true,
    clapsInWindow: 0,
    dimLevel: null,
    separation: null,
    flatness: null,
    checks: [],
  };

  reset() {
    this.sepHistory = [];
    this.xHistory = [];
    this.coverSince = 0;
    this.pointSince = 0;
    this.coverLatched = false;
    this.pointLatched = false;
    this.dimEma = null;
    this.prevPalmX = null;
    this.prevPalmY = null;
    this.lastPairSep = null;
    this.clapArmed = true;
    this.lastClapAt = 0;
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
    this.state.checks = [];
    const check = (cue: CueId, label: string, ok: boolean, detail: string) =>
      this.state.checks.push({ cue, label, ok, detail });

    const cooling = t - this.lastCueAt < GLOBAL_COOLDOWN;

    if (hands.length === 2) this.lastTwoHandAt = t;
    // A single hand is the only thing that can be swiping, so the swipe track is
    // discarded the moment the hand count is anything else.
    if (hands.length !== 1) this.xHistory = [];

    // --- clap, on the raw hand count ----------------------------------------
    // Deliberately outside the global cooldown. Pairing and re-arming already
    // stop it running away, and gating it here meant any other cue could eat a
    // clap silently — which is how the blackout came to feel broken.
    if (this.detectClap(hands, t)) {
      const gap = t - this.lastClapAt;
      if (this.lastClapAt && gap > CLAP_MIN_GAP && gap < CLAP_MAX_GAP) {
        fired.push("blackout");
        this.lastCueAt = t;
        this.lastClapAt = 0;
      } else {
        this.lastClapAt = t;
      }
    }
    if (this.lastClapAt && t - this.lastClapAt > CLAP_MAX_GAP) this.lastClapAt = 0;
    this.state.clapArmed = this.clapArmed;
    this.state.clapsInWindow = this.lastClapAt ? 1 : 0;

    check(
      "blackout",
      "armed (palms apart)",
      this.clapArmed,
      this.clapArmed ? "ok" : "separate your hands to re-arm",
    );
    check(
      "blackout",
      "first clap seen",
      this.lastClapAt > 0,
      this.lastClapAt > 0 ? "waiting for the second" : "clap once, then again",
    );

    // --- debounced hand count decides which cue branch runs -----------------
    const raw = hands.length;
    if (raw !== this.candidateCount) {
      this.candidateCount = raw;
      this.candidateSince = t;
    }
    if (t - this.candidateSince >= HAND_COUNT_DEBOUNCE || this.stableCount === 0) {
      this.stableCount = this.candidateCount;
    }
    const count = Math.min(this.stableCount, hands.length);

    if (count === 0 || hands.length === 0) {
      this.clearHolds();
      this.state.label = fired.length ? "blackout" : "rest";
      this.state.hold = 0;
      this.state.dimLevel = null;
      this.dimEma = null;
      return { fired, dimLevel };
    }

    if (count === 2) {
      const [a, b] = hands;
      const sep = palmSeparation(a, b);
      this.state.separation = sep;

      const bothOpen = isOpenPalm(a) && isOpenPalm(b);
      const lowerWrist = Math.max(a[0].y, b[0].y);
      const bothRaised = lowerWrist < COVER_RAISED_Y;

      check(
        "cover",
        "both palms open",
        bothOpen,
        bothOpen ? "ok" : `${[isOpenPalm(a), isOpenPalm(b)].filter(Boolean).length}/2 open`,
      );
      check("cover", "wrists raised", bothRaised, `lower wrist y ${lowerWrist.toFixed(2)}, need < ${COVER_RAISED_Y}`);
      check("cover", "hands apart", sep > CLAP_APART, `sep ${sep.toFixed(2)}, need > ${CLAP_APART}`);

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
      this.state.dimLevel = null;
      if (!fired.length && this.state.label !== "cover") this.state.label = "rest";
      return { fired, dimLevel };
    }

    // --- single hand ---------------------------------------------------------
    const hand = hands[0];
    const centre = palmCenter(hand);
    this.xHistory.push({ t, x: centre.x });
    this.trimHistory(t);
    this.coverSince = 0;
    this.coverLatched = false;

    const travel =
      this.prevPalmX === null
        ? 0
        : Math.hypot(centre.x - this.prevPalmX, centre.y - (this.prevPalmY ?? centre.y));
    this.prevPalmX = centre.x;
    this.prevPalmY = centre.y;

    const flat = palmFlatness(hand);
    this.state.flatness = flat;

    const f0 = extendedFingers(hand);
    const pointing = isPointing(hand);
    const swipeTravel = this.swipeTravel(t);
    const swipeLocked = t - this.lastTwoHandAt < SWIPE_TWO_HAND_LOCKOUT;

    check("special", "index out, others curled", pointing, pointing ? "ok" : `${f0.count} fingers extended`);
    check("special", "hand still", travel < POINT_STILLNESS, `travel ${travel.toFixed(3)}, need < ${POINT_STILLNESS}`);
    check("dim", "palm open", f0.count >= DIM_MIN_FINGERS, `${f0.count} fingers, need ${DIM_MIN_FINGERS}+`);
    check(
      "colour",
      "sideways travel",
      Math.abs(swipeTravel) > SWIPE_TRAVEL,
      `moved ${Math.abs(swipeTravel).toFixed(2)}, need > ${SWIPE_TRAVEL} in ${SWIPE_WINDOW}ms`,
    );
    check("colour", "one hand only", !swipeLocked, swipeLocked ? "second hand seen just now" : "ok");

    if (!swipeLocked && this.detectSwipe(t) && !cooling && t - this.lastSwipeAt > SWIPE_COOLDOWN) {
      fired.push("colour");
      this.lastSwipeAt = t;
      this.lastCueAt = t;
      this.state.label = "colour";
      this.state.hold = 1;
      this.pointSince = 0;
      return { fired, dimLevel };
    }

    if (pointing && travel < POINT_STILLNESS) {
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

    if (f0.count >= DIM_MIN_FINGERS) {
      const rawLevel = 1 - Math.min(1, Math.max(0, (centre.y - 0.15) / 0.7));
      this.dimEma =
        this.dimEma === null ? rawLevel : this.dimEma + (rawLevel - this.dimEma) * DIM_SMOOTHING;
      dimLevel = this.dimEma;
      this.state.label = "dim";
      this.state.hold = 1;
      this.state.dimLevel = dimLevel;
      return { fired, dimLevel };
    }

    this.dimEma = null;
    this.state.label = fired.length ? "colour" : "rest";
    this.state.hold = 0;
    this.state.dimLevel = null;
    return { fired, dimLevel };
  }

  /**
   * A clap, detected without ever seeing the hands touch.
   *
   * MediaPipe routinely drops from two hands to one — or none — at the moment
   * two palms meet, because the merged blob stops looking like two hands. The
   * contact frame is exactly the frame the tracker loses. So contact is treated
   * as either "separation collapsed" *or* "the pair vanished while closing
   * fast", and the second case is the one that actually fires in practice.
   */
  private detectClap(hands: Hand[], t: number): boolean {
    // re-arm on time even if the pair is never cleanly re-acquired
    if (!this.clapArmed && t - this.lastClapEventAt > CLAP_REARM_AFTER) this.clapArmed = true;

    if (hands.length === 2) {
      const sep = palmSeparation(hands[0], hands[1]);
      this.sepHistory.push({ t, sep });
      this.trimHistory(t);

      const prior = this.sepHistory.filter((s) => t - s.t > 25 && t - s.t < 220);
      const speed = prior.length
        ? (prior[0].sep - sep) / Math.max((t - prior[0].t) / 1000, 1e-3)
        : 0;
      this.lastClosingSpeed = speed;
      this.lastPairSep = sep;
      this.lastPairAt = t;

      if (sep > CLAP_APART) this.clapArmed = true;

      if (this.clapArmed && sep < CLAP_TOGETHER && speed > CLAP_CLOSING_SPEED) {
        this.clapArmed = false;
        this.lastClapEventAt = t;
        return true;
      }
      return false;
    }

    // The pair just disappeared. If it was closing fast and was already close,
    // the hands met — the tracker simply could not see it happen.
    if (
      this.clapArmed &&
      this.lastPairSep !== null &&
      t - this.lastPairAt < CLAP_LOST_GRACE &&
      this.lastPairSep < CLAP_LOST_SEP &&
      this.lastClosingSpeed > CLAP_CLOSING_SPEED
    ) {
      this.clapArmed = false;
      this.lastClapEventAt = t;
      this.lastPairSep = null;
      return true;
    }
    return false;
  }

  /** Net sideways travel over the swipe window, signed. Read-only — for the readout. */
  private swipeTravel(t: number): number {
    const win = this.xHistory.filter((s) => t - s.t <= SWIPE_WINDOW);
    if (win.length < SWIPE_MIN_SAMPLES) return 0;
    return win[win.length - 1].x - win[0].x;
  }

  private detectSwipe(t: number): boolean {
    const win = this.xHistory.filter((s) => t - s.t <= SWIPE_WINDOW);
    if (win.length < SWIPE_MIN_SAMPLES) return false;
    const dx = win[win.length - 1].x - win[0].x;
    if (Math.abs(dx) < SWIPE_TRAVEL) return false;
    // Allow one reversal: at 20fps a single jittery landmark should not veto an
    // otherwise clean swipe.
    const sign = Math.sign(dx);
    let against = 0;
    for (let i = 1; i < win.length; i++) {
      if (Math.sign(win[i].x - win[i - 1].x) === -sign) against++;
    }
    return against <= 1;
  }

  private trimHistory(t: number) {
    const cutoff = t - 1200;
    while (this.sepHistory.length && this.sepHistory[0].t < cutoff) this.sepHistory.shift();
    while (this.xHistory.length && this.xHistory[0].t < cutoff) this.xHistory.shift();
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
export { THRESHOLDS } from "./thresholds";
