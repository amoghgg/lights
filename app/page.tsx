"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import CueRail from "@/components/CueRail";
import EventLog from "@/components/EventLog";
import StageView from "@/components/StageView";
import Telemetry, { type Timing } from "@/components/Telemetry";
import Universe from "@/components/Universe";
import { CueEvent, CueId, EngineState, GestureEngine } from "@/lib/gestures";
import { INITIAL_STATE, LightingState, applyCue, resolve, toUniverse, COLOUR_STATES } from "@/lib/lighting";

type Phase = "idle" | "loading" | "running" | "error";

const REST: EngineState = {
  label: "rest",
  hold: 0,
  handCount: 0,
  clapArmed: true,
  clapsInWindow: 0,
  dimLevel: null,
  separation: null,
  flatness: null,
};

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const engineRef = useRef(new GestureEngine());
  const rafRef = useRef<number>(0);
  const armedRef = useRef(false);
  const lightingRef = useRef<LightingState>(INITIAL_STATE);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [armed, setArmed] = useState(false);
  const [lighting, setLighting] = useState<LightingState>(INITIAL_STATE);
  const [engineState, setEngineState] = useState<EngineState>(REST);
  const [timing, setTiming] = useState<Timing>({ fps: 0, capture: 0, landmark: 0, classify: 0, total: 0 });
  const [events, setEvents] = useState<CueEvent[]>([]);
  const [lastFired, setLastFired] = useState<{ cue: CueId; at: number } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const outputs = resolve(lighting);
  const dmx = toUniverse(outputs);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  // Light the interface from the rig it is driving.
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
    const root = document.documentElement.style;
    root.setProperty("--wash-r", String(Math.round(mix[0] / total)));
    root.setProperty("--wash-g", String(Math.round(mix[1] / total)));
    root.setProperty("--wash-b", String(Math.round(mix[2] / total)));
    root.setProperty("--wash-level", (lighting.blackout ? 0 : total / outputs.length).toFixed(3));
  }, [outputs, lighting.blackout]);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const start = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setStartedAt(Date.now());
      setPhase("running");
      loop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Permission") || msg.includes("denied")
          ? "Camera access was refused. Allow it in your browser's site settings, then start again."
          : `Could not start: ${msg}`,
      );
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    let lastTelemetry = 0;
    let lastFrameAt = performance.now();
    let fpsEma = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (video.readyState < 2) return;

      const t0 = performance.now();
      // Interval between frames — not true capture latency, which needs an
      // external clock to measure. Reported as-is rather than dressed up.
      const dt = t0 - lastFrameAt;
      lastFrameAt = t0;
      fpsEma = fpsEma ? fpsEma + (1000 / Math.max(dt, 1) - fpsEma) * 0.1 : 1000 / Math.max(dt, 1);

      const result = landmarker.detectForVideo(video, t0);
      const t1 = performance.now();

      // Mirror x so the engine works in the coordinates the operator sees:
      // a swipe that looks rightward on screen is a rightward swipe.
      const hands = (result.landmarks ?? []).map((h) => h.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));

      const { fired, dimLevel } = engineRef.current.update(hands, t0);
      const t2 = performance.now();

      draw(hands);

      if (armedRef.current) {
        if (dimLevel !== null) {
          const next = applyCue(lightingRef.current, "dim", dimLevel);
          lightingRef.current = next;
          setLighting(next);
        }
        for (const cue of fired) {
          const next = applyCue(lightingRef.current, cue, dimLevel);
          lightingRef.current = next;
          setLighting(next);
          setEvents((prev) => [...prev, { cue, at: Date.now() }]);
          setLastFired({ cue, at: Date.now() });
        }
      }

      if (t0 - lastTelemetry > 120) {
        lastTelemetry = t0;
        setEngineState({ ...engineRef.current.state });
        setTiming({
          fps: fpsEma,
          capture: Math.min(dt, 100),
          landmark: t1 - t0,
          classify: t2 - t1,
          total: t2 - t0,
        });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(hands: { x: number; y: number; z: number }[][]) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = (canvas.width = video.videoWidth || 640);
    const h = (canvas.height = video.videoHeight || 480);
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

    for (const hand of hands) {
      ctx.strokeStyle = "rgba(255,165,61,0.75)";
      ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(hand[a].x * w, hand[a].y * h);
        ctx.lineTo(hand[b].x * w, hand[b].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = "#E8E4DC";
      for (const p of hand) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
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
    engineRef.current.reset();
  }

  const flagged = events.filter((e) => e.flagged).length;
  const gel = COLOUR_STATES[lighting.colour];

  return (
    <main className="min-h-screen">
      {/* production desk rail */}
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
                  {timing.fps.toFixed(0)} fps · {timing.total.toFixed(0)} ms
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
        {/* the thesis: what it sees, and what it does */}
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
                <div className="absolute bottom-2 left-2 right-2 px-2 py-1.5 bg-house/85 border border-house-edge">
                  <p className="font-mono text-[10px] text-plot-dim">
                    Tracking, but cues will not fire. Arm the system to take the rig live.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="panel p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="eyebrow">Output</span>
              <span className="font-mono text-[10px] text-plot-dim">
                {lighting.blackout ? "blackout" : lighting.look === "none" ? "open white" : lighting.look} ·{" "}
                {Math.round(lighting.master * 100)}% · {gel.gel}
              </span>
            </div>
            <StageView outputs={outputs} blackout={lighting.blackout} />
          </section>
        </div>

        <CueRail state={engineState} lastFired={lastFired} />

        <div className="grid lg:grid-cols-[1fr_260px_1fr] gap-4">
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
