/**
 * Geometry helpers over MediaPipe hand landmarks.
 *
 * MediaPipe returns 21 landmarks per hand in normalised image coordinates
 * (x,y in [0,1], origin top-left; z roughly in the same unit, relative to the wrist).
 *
 *   0        wrist
 *   1  – 4   thumb   (cmc, mcp, ip, tip)
 *   5  – 8   index   (mcp, pip, dip, tip)
 *   9  – 12  middle
 *   13 – 16  ring
 *   17 – 20  pinky
 *
 * Everything below is scale-invariant: distances are divided by the hand span
 * (wrist → middle MCP) so a hand near the camera and a hand across the room
 * produce the same numbers.
 */

export type Landmark = { x: number; y: number; z: number };
export type Hand = Landmark[];

export const WRIST = 0;
export const THUMB_MCP = 2;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_TIP = 12;
export const RING_PIP = 14;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_PIP = 18;
export const PINKY_TIP = 20;

export function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Wrist → middle-finger MCP. The unit we normalise every other length by. */
export function handSpan(hand: Hand): number {
  return Math.max(dist(hand[WRIST], hand[MIDDLE_MCP]), 1e-6);
}

/** Midpoint of wrist and middle MCP — steadier than the wrist alone. */
export function palmCenter(hand: Hand): Landmark {
  const w = hand[WRIST];
  const m = hand[MIDDLE_MCP];
  return { x: (w.x + m.x) / 2, y: (w.y + m.y) / 2, z: (w.z + m.z) / 2 };
}

/**
 * A finger is extended when its tip sits further from the wrist than its PIP
 * joint. Comparing distances-from-wrist (rather than raw y) keeps this true
 * whichever way the hand is rotated, which matters because cue 4 asks for a
 * flat palm held horizontally.
 */
export function fingerExtended(hand: Hand, tip: number, pip: number, margin = 1.15): boolean {
  const w = hand[WRIST];
  return dist(w, hand[tip]) > dist(w, hand[pip]) * margin;
}

export function extendedFingers(hand: Hand): {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  count: number;
} {
  const index = fingerExtended(hand, INDEX_TIP, INDEX_PIP);
  const middle = fingerExtended(hand, MIDDLE_TIP, MIDDLE_PIP);
  const ring = fingerExtended(hand, RING_TIP, RING_PIP);
  const pinky = fingerExtended(hand, PINKY_TIP, PINKY_PIP);
  return {
    index,
    middle,
    ring,
    pinky,
    count: [index, middle, ring, pinky].filter(Boolean).length,
  };
}

/** All four fingers out — an open palm, however it happens to be oriented. */
export function isOpenPalm(hand: Hand): boolean {
  return extendedFingers(hand).count === 4;
}

/** Index out, the other three curled. */
export function isPointing(hand: Hand): boolean {
  const f = extendedFingers(hand);
  return f.index && !f.middle && !f.ring && !f.pinky;
}

/**
 * How close the palm is to horizontal, as 0..1.
 *
 * With the palm flat and facing down, wrist and fingertips sit at roughly the
 * same height while the hand still has width — so the vertical extent of the
 * hand collapses relative to its span. Straightforward, and it survives the
 * z-axis noise that a true surface normal would inherit.
 */
export function palmFlatness(hand: Hand): number {
  const span = handSpan(hand);
  const rise = Math.abs(hand[MIDDLE_TIP].y - hand[WRIST].y) / span;
  return Math.max(0, 1 - rise / 0.9);
}

/** Separation of two palms, in hand-spans. Scale-invariant, so distance-invariant. */
export function palmSeparation(a: Hand, b: Hand): number {
  const unit = (handSpan(a) + handSpan(b)) / 2;
  return dist(palmCenter(a), palmCenter(b)) / unit;
}
