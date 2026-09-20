"use client";

import { useEffect, useRef } from "react";

export type Evt =
  | { type: "mode"; mode: "live" | "recorded"; model?: string }
  | { type: "tool"; name: string; status: "running" | "ok" | "error"; result?: unknown }
  | { type: "text"; text: string }
  | { type: "notice"; text: string }
  | { type: "done" };

const TOOL_COPY: Record<string, string> = {
  evaluateConstraints: "Running deterministic screening",
  getClimateProfile: "Reading climate normals",
  getConnectivityContext: "Locating carrier facilities",
  inspectEvidence: "Extracting document claims",
  prioritizeChecks: "Ranking unresolved checks",
};

function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) =>
        line.trim() === "" ? (
          <div key={i} className="h-1.5" />
        ) : (
          <p key={i} className="text-[12.5px] leading-relaxed text-ink/90">
            {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
              part.startsWith("**") ? (
                <strong key={j} className="font-semibold text-active">{part.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        )
      )}
    </>
  );
}

export default function Investigation({
  events, busy, mode, onAsk, onCancel, disabled,
}: {
  events: Evt[];
  busy: boolean;
  mode: "live" | "recorded" | null;
  onAsk: (q: string) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (events.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events]);

  const prompts = [
    "What would stop this site from opening on time?",
    "Do the documents contradict each other?",
    "What should we check first, and who owns it?",
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b hairline border-b px-4 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">Investigation</h3>
        {mode && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
              mode === "live" ? "text-active ring-active/30" : "text-caution ring-caution/30"
            }`}
          >
            {mode === "live" ? "Live model" : "Recorded run"}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {events.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] leading-relaxed text-muted">
              The agent calls real server tools. It cannot invent an observation, and it cannot turn an{" "}
              <span className="text-caution">unknown</span> into a pass.
            </p>
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => onAsk(p)}
                disabled={disabled}
                className="w-full rounded-control bg-white/[.03] px-3 py-2 text-left text-[12px] text-ink/90 ring-1 ring-white/[.06] transition hover:bg-white/[.06] disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {events.map((e, i) => {
          if (e.type === "tool") {
            const ok = e.status === "ok";
            const err = e.status === "error";
            return (
              <div key={i} className="flex items-center gap-2.5 rounded-control bg-white/[.02] px-2.5 py-1.5 ring-1 ring-white/[.04] animate-rise">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    err ? "bg-danger" : ok ? "bg-active" : "bg-info animate-pulseline"
                  }`}
                />
                <span className="flex-1 text-[11.5px] text-ink/85">{TOOL_COPY[e.name] ?? e.name}</span>
                <span className={`font-mono text-[10px] ${err ? "text-danger" : ok ? "text-active/70" : "text-info/70"}`}>
                  {e.status}
                </span>
              </div>
            );
          }
          if (e.type === "text") {
            return (
              <div key={i} className="rounded-panel bg-white/[.03] p-3 ring-1 ring-white/[.05] animate-rise">
                <Markdownish text={e.text} />
              </div>
            );
          }
          if (e.type === "notice") {
            return (
              <p key={i} className="rounded-control bg-caution/[.07] px-2.5 py-1.5 text-[11px] text-caution ring-1 ring-caution/20">
                {e.text}
              </p>
            );
          }
          return null;
        })}
        <div ref={endRef} />
      </div>

      <form
        className="border-t hairline border-t p-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const input = (ev.currentTarget.elements.namedItem("q") as HTMLInputElement);
          if (input.value.trim()) { onAsk(input.value.trim()); input.value = ""; }
        }}
      >
        <div className="flex gap-2">
          <input
            name="q"
            autoComplete="off"
            disabled={disabled}
            placeholder={disabled ? "Select a site first" : "Ask about this site…"}
            className="flex-1 rounded-control bg-bg/60 px-3 py-2 text-[12px] text-ink placeholder:text-muted/60 ring-1 ring-white/10 focus:ring-active/50 disabled:opacity-40"
          />
          {busy ? (
            <button type="button" onClick={onCancel} className="rounded-control px-3 py-2 text-[12px] font-semibold text-danger ring-1 ring-danger/30 transition hover:bg-danger/10">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={disabled} className="rounded-control bg-white/10 px-3 py-2 text-[12px] font-semibold text-ink transition hover:bg-white/20 disabled:opacity-40">
              Ask
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
