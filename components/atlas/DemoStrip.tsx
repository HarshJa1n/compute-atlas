"use client";

export type DemoAction = { key: string; label: string; hint?: string; run: () => void; disabled?: boolean; active?: boolean };

/**
 * Presenter controls. Every step of the stage script is a visible, numbered
 * button with a matching digit key, so nobody hunts for a slider mid-pitch.
 */
export default function DemoStrip({ actions }: { actions: DemoAction[] }) {
  return (
    <nav aria-label="Demo controls" className="glass zoomable pointer-events-auto flex items-center gap-0.5 rounded-panel p-1.5">
      {actions.map((a) => (
        <button
          key={a.key + a.label}
          onClick={a.run}
          disabled={a.disabled}
          title={a.hint}
          className={`flex items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-30 ${
            a.active ? "bg-brand/15 text-brand ring-1 ring-brand/30" : "text-ink hover:bg-white/[.07]"
          }`}
        >
          {a.key && (
            <kbd className={`rounded-[5px] px-1.5 font-mono text-[10px] leading-[16px] ${a.active ? "bg-brand/20 text-brand" : "bg-white/10 text-muted"}`}>
              {a.key}
            </kbd>
          )}
          {a.label}
        </button>
      ))}
    </nav>
  );
}
