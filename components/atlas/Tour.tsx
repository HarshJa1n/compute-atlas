"use client";

export type TourStep = 0 | 1 | 2 | 3;

const CAPTIONS: Record<TourStep, { title: string; sub: string }> = {
  0: { title: "Where can the next AI factory work?", sub: "Every AI interaction has a physical address: electricity, cooling and a network." },
  1: { title: "Recorded context, not guesses", sub: "State boundaries · 203 carrier facilities · 804 tagged substations and 2,226 lines · climate normals for six regions." },
  2: { title: "Draw land. State a workload. See what is proven.", sub: "A fictional parcel outside Bhopal, screened against a 20 MW campus brief." },
  3: { title: "", sub: "" },
};

/** Skippable opening. Pointer events pass through to the map except on the Skip control. */
export default function Tour({ step, onSkip }: { step: TourStep; onSkip: () => void }) {
  const c = CAPTIONS[step];
  if (!c.title) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-end pb-[18vh]">
      <div key={step} className="tour-title max-w-[820px] px-6 text-center">
        <h2 className="text-[clamp(28px,4.2vw,54px)] font-semibold leading-[1.05] tracking-tight text-ink [text-shadow:0_2px_24px_rgba(9,19,28,.9)]">{c.title}</h2>
        <p className="mt-3 text-[clamp(14px,1.3vw,19px)] text-muted [text-shadow:0_1px_12px_rgba(9,19,28,.9)]">{c.sub}</p>
      </div>
      <button
        onClick={onSkip}
        className="glass pointer-events-auto mt-6 rounded-control px-3.5 py-1.5 text-[12px] font-medium text-muted transition hover:text-ink"
      >
        Skip intro
      </button>
    </div>
  );
}
