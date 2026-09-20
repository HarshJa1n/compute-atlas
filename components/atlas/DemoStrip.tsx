"use client";

export type DemoAction = { key: string; label: string; hint?: string; run: () => void; disabled?: boolean; active?: boolean };

/**
 * Presenter controls. Every step of the stage script is a visible, numbered
 * button with a matching digit key, so nobody hunts for a slider mid-pitch.
 */
export default function DemoStrip({ actions }: { actions: DemoAction[] }) {
  return (
    <nav aria-label="Demo controls" className="glass zoomable pointer-events-auto flex items-center gap-1 rounded-panel p-1.5">
      {actions.map((a) => (
        <button
          key={a.key + a.label}
          onClick={a.run}
          disabled={a.disabled}
          title={a.hint}
          className={`flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[11.5px] font-medium transition disabled:opacity-30 ${
            a.active ? "bg-active/15 text-active ring-1 ring-active/30" : "text-ink hover:bg-white/[.07]"
          }`}
        >
          {a.key && <kbd className="rounded bg-white/10 px-1 font-mono text-[10px] text-muted">{a.key}</kbd>}
          {a.label}
        </button>
      ))}
    </nav>
  );
}
