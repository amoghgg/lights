"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import CueRail from "@/components/CueRail";
import Diagnostics from "@/components/Diagnostics";
import EventLog from "@/components/EventLog";
import StageView from "@/components/StageView";
import Telemetry, { type Timing } from "@/components/Telemetry";
import Universe from "@/components/Universe";
import { CueEvent, CueId, EngineState, GestureEngine } from "@/lib/gestures";
import { INITIAL_STATE, LightingState, applyCue, resolve, toUniverse, COLOUR_STATES } from "@/lib/lighting";

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
  const washRef = useRef({ r: 255, g: 187, b: 122, level: 0.5 });
  const masterBarRef = useRef<HTMLDivElement>(null);
  const masterTextRef = useRef<HTMLSpanElement>(null);

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

  const outputs = resolve(lighting);
  const dmx = toUniverse(outputs, lighting.blackout ? 0 : masterUi);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  /** Recompute the ambient bounce whenever the *look* changes — not every frame. */
  useEffect(() => {
    const lit = outputs.filter((o) => o.intensity > 0.02);
    const total = lit.reduce((n, o) => n + o.intensity, 0) || 1;
    const mix = lit.reduce(
      (acc, o) => [
        acc[0] + o.rgb[0] * o.intensity,
        acc[1] + o.rgb[1] * o.intensity,
        acc[2] + o.rgb[2] * o.intensity,
      ],
      [0, 0, 0],
    );
    washRef.current = {
      r: Math.round(mix[0] / total),
      g: Math.round(mix[1] / total),
      b: Math.round(mix[2] / total),
      level: total / outputs.length,
    };
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lighting]);

  /** One cheap write per frame, no React involved. */
  const paint = useCallback(() => {
    const s = lightingRef.current;
    const eff = s.blackout ? 0 : s.master;
    const w = washRef.current;
    const root = document.documentElement.style;
    root.setProperty("--rig-master", eff.toFixed(3));
    root.setProperty("--wash-r", String(w.r));
    root.setProperty("--wash-g", String(w.g));
    root.setProperty("--wash-b", String(w.b));
    root.setProperty("--wash-level", (w.level * eff).toFixed(3));
    if (masterBarRef.current) masterBarRef.current.style.width = `${(eff * 100).toFixed(1)}%`;
    if (masterTextRef.current) masterTextRef.current.textContent = `${Math.round(eff * 100)}%`;
  }, []);

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
          lightingRef.current = applyCue(lightingRef.current, cue, dimLevel);
          setLighting(lightingRef.current);
          const at = Date.now();
          setEvents((prev) => [...prev, { cue, at }]);
          setLastFired({ cue, at });
        }
      }
      paint();

      if (t0 - lastTelemetry > 140) {
        lastTelemetry = t0;
        setEngineState({ ...engineRef.current.state });
        setMasterUi(lightingRef.current.master);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Permission") || msg.includes("denied")
          ? "Camera access was refused. Allow it in your browser's site settings, then start again."
          : `Could not start: ${msg}`,
      );
      setPhase("error");
    }
  }, [paint, runLoop]);

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
    engineRef.current.reset();
    paint();
  }

  const flagged = events.filter((e) => e.flagged).length;
  const gel = COLOUR_STATES[lighting.colour];

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
                  onClick={resetRig}
                  className="font-mono text-[10px] tracking-cue uppercase px-2.5 py-1.5 border border-house-edge text-plot-dim hover:text-plot hover:border-plot-faint transition-colors"
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
                      <p className="font-mono text-[11px] text-plot-dim max-w-xs leading-relaxed">
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

              {phase === "running" && !armed && (
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
              </span>
            </div>
            <StageView outputs={outputs} blackout={lighting.blackout} />

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
