"use client";

export type TourStep = 0 | 1 | 2;

export const TOUR_STEPS: Array<{ ms: number; eyebrow: string; title: React.ReactNode; sub: string }> = [
  {
    ms: 4200,
    eyebrow: "Compute Atlas",
    title: (
      <>
        Every AI model has a <em className="italic text-brand">physical address</em>.
      </>
    ),
    sub: "Chips need electricity, cooling and a network. Before you build an AI factory, prove the site can support it.",
  },
  {
    ms: 4400,
    eyebrow: "Recorded context",
    title: (
      <>
        Real infrastructure, <em className="italic text-brand">not guesses</em>.
      </>
    ),
    sub: "804 substations and 2,226 lines from OpenStreetMap. 203 carrier facilities. Climate normals for six regions. Presence, never capacity.",
  },
  {
    ms: 4200,
    eyebrow: "The workflow",
    title: (
      <>
        Draw land. State a workload. <em className="italic text-brand">See what is proven</em>.
      </>
    ),
    sub: "A fictional 88 ha parcel outside Bhopal, screened against a 20 MW campus brief. Unknown stays unknown.",
  },
];

/**
 * Skippable opening. The instrument panels step back, the camera flies, and a
 * single caption card sits bottom-left with a progress bar per step. Pointer
 * events pass through to the map except on the Skip control.
 */
export default function Tour({ step, onSkip }: { step: TourStep; onSkip: () => void }) {
  const s = TOUR_STEPS[step];
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="vignette absolute inset-0" />

      <div key={step} className="absolute bottom-[7vh] left-[5vw] max-w-[min(760px,80vw)]">
        <div className="tour-in flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[.22em] text-brand">{s.eyebrow}</span>
          <span className="h-px w-8 bg-brand/50" />
          <span className="font-mono text-[11px] tracking-[.18em] text-muted">
            0{step + 1} <span className="text-muted/50">/ 03</span>
          </span>
        </div>
        <h2 className="tour-in mt-3 font-display text-[clamp(38px,5.4vw,72px)] leading-[0.98] tracking-[-0.015em] text-ink [text-shadow:0_2px_30px_rgba(10,13,18,.9)]">
          {s.title}
        </h2>
        <p className="tour-in-delay mt-4 max-w-[560px] text-[clamp(14px,1.25vw,18px)] leading-relaxed text-ink/75 [text-shadow:0_1px_12px_rgba(10,13,18,.9)]">
          {s.sub}
        </p>

        <div className="tour-in-delay mt-6 flex items-center gap-3">
          <div className="flex w-[180px] gap-1.5" aria-hidden>
            {TOUR_STEPS.map((t, i) => (
              <div key={i} className="tour-progress h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                {i < step ? <span style={{ animation: "none", transform: "none" }} /> : i === step ? <span style={{ ["--dur" as string]: `${t.ms}ms` }} /> : null}
              </div>
            ))}
          </div>
          <button
            onClick={onSkip}
            className="pointer-events-auto rounded-full border border-white/15 bg-bg/60 px-3.5 py-1.5 text-[12px] font-medium text-ink/80 backdrop-blur transition hover:border-white/30 hover:text-ink"
          >
            Skip intro
          </button>
          <span className="hidden text-[11px] text-muted/70 sm:inline">or drag the map</span>
        </div>
      </div>
    </div>
  );
}
