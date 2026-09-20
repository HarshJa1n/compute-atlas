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

function inline(text: string, key: string) {
  // **bold** and *italic*, which the model uses to mark figures and caveats.
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${key}-${j}`} className="font-semibold text-active">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${key}-${j}`} className="text-muted">{part.slice(1, -1)}</em>;
    }
    return <span key={`${key}-${j}`}>{part}</span>;
  });
}

/** Minimal renderer for the subset of markdown the agent actually emits. */
function Markdownish({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${key}`} className="my-1 space-y-0.5 pl-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-ink/90">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span>{inline(b, `b${key}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); return; }
    flush(String(i));

    if (!line.trim()) { out.push(<div key={i} className="h-1.5" />); return; }

    // Horizontal rules and table separator rows carry no meaning in this panel.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push(<hr key={i} className="my-2 border-white/10" />); return; }
    if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) return;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim()).filter(Boolean);
      if (cells.length) {
        out.push(
          <p key={i} className="text-[12px] leading-relaxed text-ink/90">
            {inline(cells.join(" — "), `t${i}`)}
          </p>
        );
      }
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(
        <h4 key={i} className="mb-0.5 mt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-muted first:mt-0">
          {inline(heading[2], `h${i}`)}
        </h4>
      );
      return;
    }
    out.push(
      <p key={i} className="text-[12.5px] leading-relaxed text-ink/90">{inline(line, `p${i}`)}</p>
    );
  });
  flush("end");
  return <>{out}</>;
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
