# Lights

**Five hand gestures drive a theatrical lighting rig.** Markerless, browser-based, CPU-only.

→ **[lights.amoghbajpai.com](https://lights.amoghbajpai.com)** — needs a webcam, runs entirely in the tab

A research prototype for gesture-based theatrical lighting control. Hand landmarks come from
MediaPipe; the cue vocabulary, the detectors, the fade engine and the instrumentation are the
work here.

---

## The five cues

| | Cue | Gesture | Type | Fade |
|---|---|---|---|---|
| LX 1 | Blackout | Clap twice | dynamic, 2-hand | 1.0s out / 1.8s in |
| LX 2 | General cover | Both palms open, raised | static, 2-hand | 3.0s |
| LX 3 | Centre special | Point, hold | static, 1-hand | 2.5s |
| LX 4 | Master dim | One open hand, move up or down | continuous, 1-hand | none — tracks the hand |
| LX 5 | Colour state | Swipe sideways | dynamic, 1-hand | 2.0s |

The vocabulary is deliberately split — two static, two dynamic, one continuous; two two-handed,
three one-handed — so the confusion matrix is close to block-diagonal before any classifier is
involved. Static and dynamic gestures are separated by motion energy across the window;
two-handed and one-handed cues cannot collide at all.

Discrete cues run on a timed count. The master deliberately does not fade: it is the operator's
hand, live, and a fade there would be lag rather than craft.

## Why this exists

Theatrical lighting is called by a stage manager and executed by a board operator. Small,
student and community productions frequently have neither. The question is whether a cue stack
can be driven directly by hand, on commodity hardware, reliably enough to put in front of an
audience.

"Reliably enough" is the whole problem, and it is not measured by accuracy. One spurious blackout
ruins a show. The metric that matters is **false triggers per hour** under ordinary movement, so
the app logs every firing with a timestamp and lets you flag the unintended ones and export the
session as CSV.

## Findings so far

These came out of building it, and are the substance of the work.

**The tracker goes blind exactly when the gesture completes.** MediaPipe loses the hand pair at
the instant two palms meet — a merged blob stops looking like two hands, so the contact frame is
the frame tracking drops. A clap can never be detected from contact. It is inferred instead from
fast closing motion followed by loss of the pair.

**Cross-cue interference cascade.** Claps throw both hands laterally through the frame, which
generates the exact signature of a sideways swipe. The spurious swipe then held a global cooldown
open, and that cooldown suppressed the claps which had caused it. Neither detector is wrong in
isolation. **Per-gesture accuracy testing cannot see this failure** — it only appears in a
continuous session with a false-trigger log.

**Gestures must be performable blind.** The dim cue originally required a flat palm facing down.
It failed in use because an operator watches the stage, not their own hand. A cue you have to look
at to perform is unusable in a lighting box. Orientation testing was removed entirely.

**Latency is epistemic and electromechanical, not computational.** Inference is roughly 8% of the
end-to-end budget. The dominant terms are the temporal evidence a classifier needs before it can
commit, and fixture rise time. Faster hardware does not help — which is the argument for early
classification from partial sequences.

## How it works

```
camera ──▶ MediaPipe HandLandmarker ──▶ normalise (hand-span units)
                                            │
                                            ▼
                                   five rule-based detectors
                                            │
                                            ▼
                        cue ──▶ RigFader (timed crossfade) ──▶ 512-channel DMX universe
```

Landmark geometry is scale-invariant: every length is divided by the hand span (wrist → middle
MCP), so a hand near the camera and a hand across the room produce the same numbers.

**No model is trained here, by design.** Rules get all five cues working and become the baseline a
learned classifier has to beat — the comparison worth reporting. What rules cannot provide is a
calibrated "that was not a cue" score, which is why a null class and a small temporal model
(GRU/TCN over 30-frame windows) is the next step, driven by the measured FTR rather than by taste.

The DMX universe is real output, not decoration: seven fixtures patched across channels 1–25,
values generated exactly as they would be sent. Swapping the renderer for an sACN socket drives
physical fixtures.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
```

Requires Node 20+. The MediaPipe WASM runtime and the hand-landmarker model are **vendored into
`public/mediapipe/`** rather than loaded from a CDN — a live performance should not depend on
jsdelivr being reachable.

## Layout

```
app/page.tsx          camera, inference loop, cue → fade wiring
lib/landmarks.ts      scale-invariant hand geometry
lib/gestures.ts       the five detectors, thresholds, arbitration
lib/lighting.ts       rig, looks, DMX universe, fade engine
lib/coach.ts          walkthrough steps
components/           stage plot, cue rail, diagnostics, telemetry, cue log
```

Every threshold lives at the top of `lib/gestures.ts`, in hand-spans or milliseconds.

## Instrumentation

Built for taking measurements, not just for demoing:

- **Latency by stage** — frame interval, landmark inference, cue classification, reported
  separately. Camera exposure and USB transport sit upstream of anything measurable in a browser
  and need an external clock; the UI says so rather than quoting a flattering end-to-end number.
- **Cue log** — every firing timestamped, flaggable as unintended, exportable as CSV.
- **False triggers per hour** — computed live from flags over session time.
- **Per-cue condition readout** — shows exactly which condition a cue is waiting on, with the
  measured value beside the threshold it missed. Debugging a gesture system by console is hopeless;
  you cannot read a console while holding a pose.

## Status

Working prototype, single user. Not yet evaluated.

Still to do: a participant study for per-cue F1 and cross-user generalisation, a two-hour armed
idle recording for the FTR figure, the rules-versus-learned comparison, and physical fixtures —
without real light hitting a real lens there is no evidence for the closed-loop illumination
problem this is ultimately about.

## Prior work

Gesture control of lighting exists for operating theatres (surgical) and for architectural smart
lighting; neither addresses stage cueing. Commercial performer tracking — BlackTrax, zactrack,
Robe RoboSpot — is marker-based and tracks *position* to aim a followspot. This tracks *intent* to
call a cue, markerless, at roughly 1/100th the cost. Different problem.

## Licence

MIT.
