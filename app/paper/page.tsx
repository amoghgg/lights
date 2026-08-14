import type { Metadata } from "next";
import Link from "next/link";
import { CUES, THRESHOLDS } from "@/lib/gestures";
import { CHANNELS, PATCHED_CHANNELS, POSITION_LABEL, POSITION_ORDER, RIG } from "@/lib/rig";

export const metadata: Metadata = {
  title: "Lights — the paper",
  description:
    "Seeing Through the Blackout: gesture-based theatrical lighting control under adversarial illumination.",
};

const FINDINGS = [
  {
    n: "01",
    title: "The tracker goes blind as the gesture completes",
    body:
      "A clap cannot be detected from contact, because contact is the moment tracking fails. When two palms meet the merged region stops resembling two hands and the landmark estimator drops the pair — the frame in which the gesture completes is the frame in which observation is lost. The detector reads the envelope instead: fast closing motion, then loss of the pair while separation was still small.",
    consequence:
      "Any gesture whose defining moment is self-occluding — contact, grasp, fist closure — is invisible at its own climax to a landmark tracker.",
    cue: "Clap twice on the demo and watch the hand count drop to zero at the instant it fires.",
  },
  {
    n: "02",
    title: "Cross-cue interference cascade",
    body:
      "A clap throws both hands laterally at speed, and at the moment the pair merges the tracker reports a single hand travelling fast — an exact match for a lateral swipe. Every clap fired a spurious colour cue. That cue then held the global cooldown open, and the cooldown suppressed the second clap that had caused it.",
    consequence:
      "Neither detector was wrong alone. Presenting gesture i and recording whether cue i fires reports every detector as correct; the cascade only appears under continuous operation with a false-trigger log.",
    cue: "This is the independent argument for false triggers per hour as the headline metric.",
  },
  {
    n: "03",
    title: "Cues must be performable without looking",
    body:
      "The master dim originally required a flat palm facing downward. It worked in isolation and failed in use, because an operator watches the stage, not their own hand. A gesture needing a specific orientation needs visual confirmation to perform reliably, and visual attention is the one resource an operator running a show does not have.",
    consequence:
      "In an operator context, a cue that must be looked at in order to be performed is not a usable cue. That eliminates most precision poses and anything depending on finger-level configuration.",
    cue: "Orientation testing was removed entirely — any open hand now drives the master.",
  },
  {
    n: "04",
    title: "Latency is epistemic, not computational",
    body:
      "Inference accounts for roughly 8% of the end-to-end budget. The dominant terms are temporal evidence accumulation — a classifier cannot commit until it has seen enough of the gesture — and fixture rise time, which is electromechanical.",
    consequence:
      "Faster hardware does not meaningfully help. Reducing inference cost to zero would recover under a tenth of the observed latency; the available lever is early classification from partial sequences.",
    cue: "The live telemetry panel reports each stage separately, and says which terms a browser cannot observe.",
  },
];

export default function PaperPage() {
  const channelsByType = Object.entries(
    RIG.reduce<Record<string, number>>((acc, f) => {
      acc[f.type] = (acc[f.type] ?? 0) + 1;
      return acc;
    }, {}),
  );

  return (
    <main className="min-h-screen">
      <header className="border-b rule sticky top-0 z-20 bg-house/90 backdrop-blur-sm">
        <div className="max-w-[900px] mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="font-display text-3xl leading-none text-plot hover:text-tungsten transition-colors">
            LIGHTS
          </Link>
          <span className="font-mono text-[10px] tracking-cue uppercase text-plot-dim hidden sm:block">
            The paper
          </span>
          <Link
            href="/"
            className="ml-auto font-mono text-[10px] tracking-cue uppercase px-3 py-1.5 border border-house-edge text-plot-dim hover:text-tungsten hover:border-tungsten/40 transition-colors"
          >
            Run the system
          </Link>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-4 py-10 space-y-12">
        <section>
          <p className="eyebrow mb-3">Preprint · not yet submitted</p>
          <h1 className="font-display text-6xl sm:text-7xl leading-[0.92] text-plot max-w-3xl">
            Seeing Through the Blackout
          </h1>
          <p className="font-mono text-sm text-plot-dim mt-4 max-w-2xl leading-relaxed">
            Gesture-Based Theatrical Lighting Control Under Adversarial Illumination
          </p>
          <p className="font-mono text-[11px] text-plot-faint mt-2">Amogh Bajpai · Independent Researcher</p>

          <div className="flex flex-wrap gap-2 mt-6">
            <a
              href="/lights-paper.pdf"
              className="font-mono text-[10px] tracking-cue uppercase px-4 py-2 border border-tungsten text-tungsten hover:bg-tungsten/10 transition-colors"
            >
              Read the PDF
            </a>
            <a
              href="https://github.com/amoghgg/lights"
              className="font-mono text-[10px] tracking-cue uppercase px-4 py-2 border border-house-edge text-plot-dim hover:text-plot hover:border-plot-faint transition-colors"
            >
              Source
            </a>
          </div>
        </section>

        {/* the claim that separates this domain */}
        <section className="panel p-5">
          <h2 className="eyebrow mb-3">The constraint</h2>
          <p className="font-mono text-[13px] text-plot leading-relaxed max-w-2xl">
            The system&rsquo;s own output is an adversary to its own input. A blackout removes the
            illumination the camera depends on, and the system must stay controllable in the state it has
            just created. A saturated wash shifts skin tone outside the distribution the tracker was
            trained on. Haze scatters the image. In every case the disturbance is produced by the
            artistic intent of the production, so it is not something the system may ask to have reduced.
          </p>
          <p className="font-mono text-[11px] text-plot-dim leading-relaxed mt-3 max-w-2xl">
            We call this <em className="text-tungsten not-italic">adversarial illumination</em>, and argue
            it is what separates stage lighting from every adjacent gesture-control domain. The proposed
            resolution is spectral: near-infrared sensing places the control channel outside the visible
            band entirely. That is argued in the paper and{" "}
            <span className="text-plot">not yet demonstrated</span> — the prototype uses a visible-light
            webcam.
          </p>
        </section>

        {/* findings */}
        <section>
          <h2 className="eyebrow mb-5">Four findings from building it</h2>
          <div className="space-y-px bg-house-edge">
            {FINDINGS.map((f) => (
              <article key={f.n} className="bg-house-raised p-5">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-tungsten tnum">{f.n}</span>
                  <h3 className="font-display text-3xl leading-none text-plot">{f.title}</h3>
                </div>
                <p className="font-mono text-[12px] text-plot-dim leading-relaxed mt-3 max-w-2xl">{f.body}</p>
                <p className="font-mono text-[11px] text-plot leading-relaxed mt-3 max-w-2xl border-l border-tungsten/40 pl-3">
                  {f.consequence}
                </p>
                <p className="font-mono text-[10px] text-plot-faint leading-relaxed mt-3">{f.cue}</p>
              </article>
            ))}
          </div>
        </section>

        {/* live parameters — the reproducibility link */}
        <section>
          <h2 className="eyebrow mb-2">Table II, live</h2>
          <p className="font-mono text-[11px] text-plot-dim leading-relaxed mb-4 max-w-2xl">
            These are not transcribed from the paper. They are read at build time from the same constants
            the running system uses, so the table here, the table in the PDF and the deployed detectors
            cannot drift apart. A parameter table copied out by hand is wrong by the second revision.
          </p>
          <div className="panel p-4 overflow-x-auto">
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="text-plot-faint">
                  <th className="text-left font-normal pb-2 pr-4">Cue</th>
                  <th className="text-left font-normal pb-2 pr-4">Parameter</th>
                  <th className="text-left font-normal pb-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLDS.map((t, i) => (
                  <tr key={i} className="border-t border-house-edge">
                    <td className="py-1 pr-4 text-tungsten whitespace-nowrap">{t.cue}</td>
                    <td className="py-1 pr-4 text-plot-dim">{t.name}</td>
                    <td className="py-1 text-plot tnum whitespace-nowrap">{t.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* the rig */}
        <section>
          <h2 className="eyebrow mb-2">The rig under test</h2>
          <p className="font-mono text-[11px] text-plot-dim leading-relaxed mb-4 max-w-2xl">
            {RIG.length} fixtures across {PATCHED_CHANNELS} channels of a 512-channel universe, hung as a
            mid-size proscenium house actually is. Channel counts follow real personalities, so the
            universe the browser generates is patchable without translation.
          </p>
          <div className="grid sm:grid-cols-2 gap-px bg-house-edge">
            {POSITION_ORDER.map((pos) => {
              const fixtures = RIG.filter((f) => f.position === pos);
              if (!fixtures.length) return null;
              return (
                <div key={pos} className="bg-house-raised p-3">
                  <div className="font-mono text-[10px] text-plot">{POSITION_LABEL[pos]}</div>
                  <div className="font-mono text-[9px] text-plot-faint mt-1">
                    {fixtures.length} × {fixtures[0].type} · {CHANNELS[fixtures[0].type]} ch each · patch{" "}
                    {fixtures[0].patch}–{fixtures[fixtures.length - 1].patch + CHANNELS[fixtures[0].type] - 1}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="font-mono text-[9px] text-plot-faint mt-3">
            {channelsByType.map(([t, n]) => `${n} ${t}`).join(" · ")}
          </p>
        </section>

        {/* vocabulary */}
        <section>
          <h2 className="eyebrow mb-2">The five cues</h2>
          <p className="font-mono text-[11px] text-plot-dim leading-relaxed mb-4 max-w-2xl">
            Two static, two dynamic, one continuous; two two-handed against three one-handed. The axes are
            close to independent, which separates most pairs before any classifier is asked to. This is a
            design-time substitute for discriminative training, and it is what lets a purely rule-based
            implementation work at all.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-px bg-house-edge">
            {CUES.map((c) => (
              <div key={c.id} className="bg-house-raised p-3">
                <div className="font-mono text-[10px] text-tungsten">{c.n}</div>
                <div className="font-display text-2xl leading-none text-plot mt-1">{c.name}</div>
                <div className="font-mono text-[9px] text-plot-dim mt-1.5">{c.gesture}</div>
                <div className="font-mono text-[9px] text-plot-faint mt-1.5">
                  {c.kind} · {c.hands}H · FTR risk {c.falseTriggerRisk}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* status, stated plainly */}
        <section className="panel p-5">
          <h2 className="eyebrow mb-3">What this does not contain</h2>
          <ul className="font-mono text-[12px] text-plot-dim leading-relaxed space-y-1.5 max-w-2xl">
            <li>— The system has been built, deployed and operated by a single user.</li>
            <li>— It has not been evaluated with participants, and no FTR figure is reported.</li>
            <li>— The adversarial illumination argument is motivated but not demonstrated.</li>
            <li>
              — The thresholds above were set by iterative observation by one operator. They are a
              starting configuration, not a tuned one.
            </li>
            <li>
              — The vocabulary is five cues; a production cue stack is an order of magnitude larger, and
              whether the block-diagonal property survives that scaling is untested.
            </li>
          </ul>
          <p className="font-mono text-[11px] text-plot-faint leading-relaxed mt-4 max-w-2xl">
            The instrumentation exists to serve a protocol that has not yet been run: a two-hour armed
            idle recording for the FTR figure, a participant study for per-cue F1 and cross-user
            generalisation, a rules-versus-learned comparison on identical recorded sessions, and physical
            fixtures.
          </p>
        </section>

        <section>
          <h2 className="eyebrow mb-3">Cite the artefact</h2>
          <pre className="panel p-4 font-mono text-[10px] text-plot-dim leading-relaxed overflow-x-auto">
{`@misc{bajpai2026lights,
  author       = {Bajpai, Amogh},
  title        = {Lights: Gesture-Based Theatrical Lighting Control},
  year         = {2026},
  howpublished = {\\url{https://lights.amoghbajpai.com}},
  note         = {Source: https://github.com/amoghgg/lights}
}`}
          </pre>
        </section>

        <footer className="pb-10">
          <Link
            href="/"
            className="font-mono text-[11px] text-tungsten hover:underline"
          >
            ← Run the system
          </Link>
        </footer>
      </div>
    </main>
  );
}
