"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import Coach from "@/components/Coach";
import CueRail from "@/components/CueRail";
import Diagnostics from "@/components/Diagnostics";
import EventLog from "@/components/EventLog";
import StageView from "@/components/StageView";
import Telemetry, { type Timing } from "@/components/Telemetry";
import Universe from "@/components/Universe";
import { COACH_STEPS, DIM_LEARN_RANGE } from "@/lib/coach";
import { CueEvent, CueId, EngineState, GestureEngine } from "@/lib/gestures";
import {
  BLACKOUT_IN_MS,
  COLOUR_STATES,
  FADE_MS,
  INITIAL_STATE,
  LevelFader,
  LightingState,
  RigFader,
  applyCue,
  frameToUniverse,
  resolve,
} from "@/lib/lighting";

type Phase = "idle" | "loading" | "running" | "error";

/** Chrome and Safari fire this once per decoded camera frame. Not in lib.dom yet. */
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const REST: EngineState = {
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

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const engineRef = useRef(new GestureEngine());
  const stopRef = useRef<(() => void) | null>(null);
  const armedRef = useRef(false);
  const lightingRef = useRef<LightingState>(INITIAL_STATE);

  // Master moves every frame while a hand is moving, so it is painted straight
  // to the DOM rather than held in React state. Re-rendering the page at frame
  // rate was the latency — React was competing with inference for the thread.
  const masterBarRef = useRef<HTMLDivElement>(null);
  const masterTextRef = useRef<HTMLSpanElement>(null);

  // Look changes fade over a cue's count; the master does not fade, because it
  // is the operator's hand. Blackout rides its own one-dimensional fade.
  const faderRef = useRef(new RigFader(resolve(INITIAL_STATE)));
  const blackoutFaderRef = useRef(new LevelFader(1));
  const liveFrameRef = useRef(
    resolve(INITIAL_STATE).map((o) => ({
      intensity: o.intensity,
      rgb: [...o.rgb] as [number, number, number],
    })),
  );
  const effMasterRef = useRef(INITIAL_STATE.master);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [armed, setArmed] = useState(false);
  const [lighting, setLighting] = useState<LightingState>(INITIAL_STATE);
  const [masterUi, setMasterUi] = useState(INITIAL_STATE.master);
  const [engineState, setEngineState] = useState<EngineState>(REST);
  const [timing, setTiming] = useState<Timing>({ fps: 0, capture: 0, landmark: 0, classify: 0, total: 0 });
  const [events, setEvents] = useState<CueEvent[]>([]);
  const [lastFired, setLastFired] = useState<{ cue: CueId; at: number } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [delegate, setDelegate] = useState<"GPU" | "CPU">("GPU");

  // walkthrough: -1 is off, COACH_STEPS.length is the closing card
  const [coachStep, setCoachStep] = useState(-1);
  const [coachSatisfied, setCoachSatisfied] = useState(false);
  const coachStepRef = useRef(-1);
  const coachSatisfiedRef = useRef(false);
  const dimRangeRef = useRef({ min: 1, max: 0 });

  const [dmx, setDmx] = useState<Uint8Array>(() =>
    frameToUniverse(
      resolve(INITIAL_STATE).map((o) => ({ intensity: o.intensity, rgb: [...o.rgb] as [number, number, number] })),
      INITIAL_STATE.master,
    ),
  );

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  /** Entering a step clears whatever the last one was measuring. */
  useEffect(() => {
    coachStepRef.current = coachStep;
    coachSatisfiedRef.current = false;
    dimRangeRef.current = { min: 1, max: 0 };
  }, [coachStep]);

  /** Let the confirmation land before moving on — advancing instantly reads as a glitch. */
  useEffect(() => {
    if (!coachSatisfied) return;
    const id = setTimeout(() => {
      setCoachSatisfied(false);
      setCoachStep((s) => s + 1);
    }, 1600);
    return () => clearTimeout(id);
  }, [coachSatisfied]);

  const startCoach = useCallback(() => {
    setCoachStep(0);
    setCoachSatisfied(false);
    setArmed(true); // a walkthrough where nothing fires teaches nothing
  }, []);

  const exitCoach = useCallback(() => {
    setCoachStep(-1);
    setCoachSatisfied(false);
    try {
      localStorage.setItem("lights.taught", "1");
    } catch {
      /* private mode — just show it again next time */
    }
  }, []);

  /**
   * Steps both fades and writes the result straight to CSS variables. Every
   * value that moves during a three-second crossfade moves here — no React.
   */
  const paint = useCallback((now = performance.now()) => {
    const frame = faderRef.current.step(now);
    const blackoutMul = blackoutFaderRef.current.step(now);
    const eff = lightingRef.current.master * blackoutMul;
    liveFrameRef.current = frame;
    effMasterRef.current = eff;

    const root = document.documentElement.style;
    root.setProperty("--rig-master", eff.toFixed(3));

    let wr = 0;
    let wg = 0;
    let wb = 0;
    let total = 0;
    frame.forEach((f, i) => {
      root.setProperty(`--fx${i}-a`, f.intensity.toFixed(3));
      root.setProperty(`--fx${i}-s`, (0.3 + f.intensity * 0.7).toFixed(3));
      root.setProperty(`--fx${i}-c`, `rgb(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]})`);
      wr += f.rgb[0] * f.intensity;
      wg += f.rgb[1] * f.intensity;
      wb += f.rgb[2] * f.intensity;
      total += f.intensity;
    });

    const d = total || 1;
    root.setProperty("--wash-r", String(Math.round(wr / d)));
    root.setProperty("--wash-g", String(Math.round(wg / d)));
    root.setProperty("--wash-b", String(Math.round(wb / d)));
    root.setProperty("--wash-level", ((total / frame.length) * eff).toFixed(3));

    if (masterBarRef.current) masterBarRef.current.style.width = `${(eff * 100).toFixed(1)}%`;
    if (masterTextRef.current) masterTextRef.current.textContent = `${Math.round(eff * 100)}%`;
  }, []);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const runLoop = useCallback(() => {
    const video = videoRef.current as FrameCallbackVideo | null;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    let lastTelemetry = 0;
    let lastFrameAt = performance.now();
    let fpsEma = 0;
    let stopped = false;
    let lastTimestamp = -1;

    const process = () => {
      if (stopped || video.readyState < 2) return;

      const t0 = performance.now();
      // detectForVideo rejects a repeated timestamp; guard rather than let it throw.
      if (t0 <= lastTimestamp) return;
      lastTimestamp = t0;

      const dt = t0 - lastFrameAt;
      lastFrameAt = t0;
      fpsEma = fpsEma ? fpsEma + (1000 / Math.max(dt, 1) - fpsEma) * 0.1 : 1000 / Math.max(dt, 1);

      let result;
      try {
        result = landmarker.detectForVideo(video, t0);
      } catch {
        return; // a dropped frame is not worth tearing the session down
      }
      const t1 = performance.now();

      // Mirror x so the engine works in the coordinates the operator sees:
      // a swipe that looks rightward on screen is a rightward swipe.
      const hands = (result.landmarks ?? []).map((h) => h.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));

      const { fired, dimLevel } = engineRef.current.update(hands, t0);
      const t2 = performance.now();

      draw(hands);

      if (armedRef.current) {
        if (dimLevel !== null && !lightingRef.current.blackout) {
          lightingRef.current = { ...lightingRef.current, master: dimLevel };
        }
        for (const cue of fired) {
          const prev = lightingRef.current;
          const next = applyCue(prev, cue, dimLevel);
          lightingRef.current = next;

          // Every look change is a timed crossfade. Snapping between looks
          // reads as a fault on real fixtures — and on tungsten it is not
          // physically possible anyway.
          faderRef.current.setTarget(resolve(next), FADE_MS[cue], t0);
          if (next.blackout !== prev.blackout) {
            blackoutFaderRef.current.setTarget(
              next.blackout ? 0 : 1,
              next.blackout ? FADE_MS.blackout : BLACKOUT_IN_MS,
              t0,
            );
          }

          setLighting(next);
          const at = Date.now();
          setEvents((prev2) => [...prev2, { cue, at }]);
          setLastFired({ cue, at });
        }
      }
      paint(t0);

      // Has the current walkthrough step been performed?
      const cs = coachStepRef.current;
      if (cs >= 0 && cs < COACH_STEPS.length && !coachSatisfiedRef.current) {
        const watch = COACH_STEPS[cs].watch;
        let ok = false;
        if (watch.kind === "hand") {
          ok = hands.length > 0;
        } else if (watch.kind === "dim") {
          const m = lightingRef.current.master;
          const r = dimRangeRef.current;
          r.min = Math.min(r.min, m);
          r.max = Math.max(r.max, m);
          ok = r.max - r.min > DIM_LEARN_RANGE;
        } else {
          ok = fired.includes(watch.cue);
        }
        if (ok) {
          coachSatisfiedRef.current = true;
          setCoachSatisfied(true);
        }
      }

      if (t0 - lastTelemetry > 140) {
        lastTelemetry = t0;
        setEngineState({ ...engineRef.current.state });
        setMasterUi(lightingRef.current.master);
        setDmx(frameToUniverse(liveFrameRef.current, effMasterRef.current));
        setTiming({
          fps: fpsEma,
          capture: Math.min(dt, 200),
          landmark: t1 - t0,
          classify: t2 - t1,
          total: t2 - t0,
        });
      }
    };

    // Drive off decoded camera frames where the browser offers it. rAF runs at
    // display rate — 120Hz on a ProMotion Mac — which would run inference three
    // or four times per camera frame for nothing.
    if (typeof video.requestVideoFrameCallback === "function") {
      const step = () => {
        if (stopped) return;
        process();
        video.requestVideoFrameCallback!(step);
      };
      video.requestVideoFrameCallback(step);
    } else {
      const MIN_INTERVAL = 30; // ms — cap at ~33fps
      let last = 0;
      const step = () => {
        if (stopped) return;
        requestAnimationFrame(step);
        const now = performance.now();
        if (now - last < MIN_INTERVAL) return;
        last = now;
        process();
      };
      requestAnimationFrame(step);
    }

    stopRef.current = () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  const start = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = {
        runningMode: "VIDEO" as const,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      };
      // GPU is faster where WebGL cooperates; plenty of machines and browsers
      // refuse it, and falling back beats failing to start.
      try {
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "GPU" },
          ...options,
        });
        setDelegate("GPU");
      } catch {
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "CPU" },
          ...options,
        });
        setDelegate("CPU");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setStartedAt(Date.now());
      setPhase("running");
      paint();
      runLoop();

      let taught = false;
      try {
        taught = localStorage.getItem("lights.taught") === "1";
      } catch {
        /* ignore */
      }
      if (!taught) startCoach();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Permission") || msg.includes("denied")
          ? "Camera access was refused. Allow it in your browser's site settings, then start again."
          : `Could not start: ${msg}`,
      );
      setPhase("error");
    }
  }, [paint, runLoop, startCoach]);

  function draw(hands: { x: number; y: number; z: number }[][]) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

    ctx.strokeStyle = "rgba(255,165,61,0.75)";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#E8E4DC";
    for (const hand of hands) {
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(hand[a].x * w, hand[a].y * h);
        ctx.lineTo(hand[b].x * w, hand[b].y * h);
      }
      ctx.stroke();
      for (const p of hand) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  useEffect(
    () => () => {
      stopRef.current?.();
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  function flag(index: number) {
    setEvents((prev) => prev.map((e, i) => (i === index ? { ...e, flagged: !e.flagged } : e)));
  }

  function resetRig() {
    lightingRef.current = INITIAL_STATE;
    setLighting(INITIAL_STATE);
    setMasterUi(INITIAL_STATE.master);
    faderRef.current.snapTo(resolve(INITIAL_STATE));
    blackoutFaderRef.current.setTarget(1, 1, performance.now());
    engineRef.current.reset();
    paint();
  }

  const flagged = events.filter((e) => e.flagged).length;
  const gel = COLOUR_STATES[lighting.colour];
  // The count the last cue ran on, the way a cue sheet would note it.
  const lastFade = lastFired ? FADE_MS[lastFired.cue] : null;

  return (
    <main className="min-h-screen">
      <header className="border-b rule sticky top-0 z-20 bg-house/90 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-display text-3xl leading-none tracking-tight text-plot">LIGHTS</h1>
            <span className="font-mono text-[10px] tracking-cue uppercase text-plot-dim hidden sm:block">
              Gesture cue control
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {phase === "running" && (
              <>
                <span className="font-mono text-[10px] tnum text-plot-dim hidden md:block">
                  {timing.fps.toFixed(0)} fps · {timing.total.toFixed(0)} ms · {delegate}
                </span>
                <button
                  onClick={startCoach}
                  className="font-mono text-[10px] tracking-cue uppercase px-2.5 py-1.5 border border-house-edge text-plot-dim hover:text-plot hover:border-plot-faint transition-colors"
                >
                  Walkthrough
                </button>
                <button
                  onClick={resetRig}
                  className="font-mono text-[10px] tracking-cue uppercase px-2.5 py-1.5 border border-house-edge text-plot-dim hover:text-plot hover:border-plot-faint transition-colors hidden sm:block"
                >
                  Reset rig
                </button>
                <button
                  onClick={() => setArmed((a) => !a)}
                  aria-pressed={armed}
                  className="font-mono text-[10px] tracking-cue uppercase px-3 py-1.5 border transition-colors"
                  style={
                    armed
                      ? { borderColor: "#5BD98A", color: "#5BD98A", background: "rgba(91,217,138,0.08)" }
                      : { borderColor: "#1C1C22", color: "#8A8A93" }
                  }
                >
                  {armed ? "● Armed" : "Disarmed"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-5 space-y-4">
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="panel p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="eyebrow">Perception</span>
              <span className="font-mono text-[10px] text-plot-dim">
                {engineState.handCount} hand{engineState.handCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="relative aspect-[4/3] bg-house overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover opacity-55"
                style={{ transform: "scaleX(-1)" }}
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

              {phase !== "running" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  {phase === "error" ? (
                    <>
                      <p className="font-mono text-[11px] text-special max-w-sm leading-relaxed">{error}</p>
                      <button
                        onClick={start}
                        className="font-mono text-[10px] tracking-cue uppercase px-4 py-2 border border-house-edge text-plot hover:border-tungsten hover:text-tungsten transition-colors"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <h2 className="font-display text-3xl leading-none text-plot">Five gestures, one rig</h2>
                      <p className="font-mono text-[11px] text-plot-dim max-w-sm leading-relaxed">
                        Your hands drive a theatrical lighting rig — blackout, wash, a centre special, the
                        master, and colour. A short walkthrough teaches you each cue.
                      </p>
                      <p className="font-mono text-[10px] text-plot-faint max-w-xs leading-relaxed">
                        Everything runs in this tab. The camera feed never leaves your machine.
                      </p>
                      <button
                        onClick={start}
                        disabled={phase === "loading"}
                        className="font-display text-2xl leading-none px-6 py-2.5 border border-tungsten/50 text-tungsten hover:bg-tungsten/10 disabled:opacity-40 transition-colors"
                      >
                        {phase === "loading" ? "Loading model…" : "Start camera"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {phase === "running" && coachStep >= 0 && (
                <Coach
                  step={coachStep}
                  satisfied={coachSatisfied}
                  onSkip={() => {
                    setCoachSatisfied(false);
                    setCoachStep((s) => s + 1);
                  }}
                  onExit={exitCoach}
                />
              )}

              {phase === "running" && coachStep < 0 && !armed && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 px-3 py-2 bg-house/95 border border-tungsten/50">
                  <p className="font-mono text-[10px] text-tungsten leading-snug flex-1">
                    Tracking, but cues will not fire. Arm the system to take the rig live.
                  </p>
                  <button
                    onClick={() => setArmed(true)}
                    className="font-mono text-[10px] tracking-cue uppercase px-3 py-1.5 border border-tungsten text-tungsten hover:bg-tungsten/15 transition-colors shrink-0"
                  >
                    Arm
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="panel p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="eyebrow">Output</span>
              <span className="font-mono text-[10px] text-plot-dim">
                {lighting.blackout ? "blackout" : lighting.look === "none" ? "open white" : lighting.look} ·{" "}
                {gel.gel}
                {lastFade && <span className="text-tungsten"> · {(lastFade / 1000).toFixed(1)}s count</span>}
              </span>
            </div>
            <StageView blackout={lighting.blackout} />

            {/* Master, as a fader. Painted directly by the render loop. */}
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-[9px] tracking-cue uppercase text-plot-faint shrink-0">Master</span>
              <div className="relative flex-1 h-1.5 bg-house overflow-hidden">
                <div ref={masterBarRef} className="absolute inset-y-0 left-0 bg-tungsten" style={{ width: "80%" }} />
              </div>
              <span ref={masterTextRef} className="font-mono text-[10px] tnum text-plot w-9 text-right shrink-0">
                80%
              </span>
            </div>
          </section>
        </div>

        <CueRail state={engineState} lastFired={lastFired} />

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <section className="panel p-3">
            <div className="eyebrow mb-2.5">Why a cue is not firing</div>
            <Diagnostics state={engineState} />
          </section>

          <section className="panel p-3">
            <div className="eyebrow mb-2.5">DMX universe</div>
            <Universe dmx={dmx} />
          </section>

          <section className="panel p-3">
            <Telemetry
              timing={timing}
              state={engineState}
              elapsed={elapsed}
              cueCount={events.length}
              flagged={flagged}
            />
          </section>

          <section className="panel p-3 flex flex-col max-h-[360px]">
            <EventLog events={events} onFlag={flag} startedAt={startedAt || Date.now()} />
          </section>
        </div>

        <footer className="pt-2 pb-8">
          <p className="font-mono text-[10px] text-plot-faint leading-relaxed max-w-3xl">
            Five rule-based detectors over MediaPipe hand landmarks — no trained model, by design. The rules
            are the baseline a learned classifier has to beat. Cue 5 will misfire on ordinary sideways
            movement; that is the measurement this page is built to take.
          </p>
        </footer>
      </div>
    </main>
  );
}
