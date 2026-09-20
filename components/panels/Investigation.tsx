"use client";

import { useEffect, useRef } from "react";

export type Evt =
  | { type: "mode"; mode: "live" | "recorded"; model?: string }
  | { type: "tool"; name: string; status: "running" | "ok" | "error"; input?: unknown; result?: unknown }
  | { type: "text"; text: string }
  | { type: "notice"; text: string }
  | { type: "done" };

const TOOL_COPY: Record<string, string> = {
  evaluateConstraints: "Running deterministic screening",
  getClimateProfile: "Reading climate normals",
  getConnectivityContext: "Locating carrier facilities",
  getPowerContext: "Reading grid infrastructure tags",
  inspectEvidence: "Extracting document claims",
  prioritizeChecks: "Ranking unresolved checks",
  testScenario: "Testing a scenario",
  compareSites: "Comparing sites",
  focusMap: "Focusing the map",
};

const CHANGE_LABEL: Record<string, string> = {
  itMW: "IT load", pue: "PUE", utilization: "utilisation", wueLitresPerITkWh: "WUE", waterCapLDay: "water cap",
  requiredHectares: "land", openingDate: "opening", mode: "mode",
};

/** One line describing the arguments the model chose, so the room sees the decision, not just the tool name. */
function describeInput(name: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  if (name === "testScenario" && i.changes && typeof i.changes === "object") {
    const ch = Object.entries(i.changes as Record<string, unknown>).map(([k, v]) => `${CHANGE_LABEL[k] ?? k} → ${v === null ? "none" : String(v)}`);
    return ch.join(", ") || null;
  }
  if (name === "compareSites" && Array.isArray(i.siteIds)) return `sites ${(i.siteIds as string[]).join(", ")}`;
  if (name === "focusMap" && typeof i.target === "string") return `${i.target}${typeof i.reason === "string" && i.reason ? ` · ${i.reason}` : ""}`;
  return null;
}

function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${key}-${j}`} className="font-semibold text-brand">{part.slice(2, -2)}</strong>;
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
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); return; }
    flush(String(i));
    if (!line.trim()) { out.push(<div key={i} className="h-1.5" />); return; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push(<hr key={i} className="my-2 border-white/10" />); return; }
    if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) return;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim()).filter(Boolean);
      if (cells.length) out.push(<p key={i} className="text-[12px] leading-relaxed text-ink/90">{inline(cells.join(" — "), `t${i}`)}</p>);
      return;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(<h4 key={i} className="mb-0.5 mt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-muted first:mt-0">{inline(heading[2], `h${i}`)}</h4>);
      return;
    }
    out.push(<p key={i} className="text-[12.5px] leading-relaxed text-ink/90">{inline(line, `p${i}`)}</p>);
  });
  flush("end");
  return <>{out}</>;
}

export default function Investigation({
  events, busy, mode, model, onAsk, onCancel, disabled, stale, onRerun, hasDocs, collapsed, onToggle,
}: {
  events: Evt[];
  busy: boolean;
  mode: "live" | "recorded" | null;
  model?: string | null;
  onAsk: (q: string) => void;
  onCancel: () => void;
  disabled: boolean;
  stale: boolean;
  onRerun: () => void;
  hasDocs: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (events.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events]);

  const prompts = [
    "What would stop this site from opening on time?",
    hasDocs ? "Do the documents contradict each other?" : "What if we cut IT load to 10 MW with dry cooling?",
    "How does this parcel compare with B and C?",
  ];

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center justify-between px-4 py-2.5 ${collapsed ? "" : "border-b hairline border-b"}`}>
        <button onClick={onToggle} aria-expanded={!collapsed} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted hover:text-ink">
          <span aria-hidden className="text-[9px]">{collapsed ? "▲" : "▼"}</span> Investigation
          {collapsed && events.length > 0 && <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[9.5px] normal-case tracking-normal text-ink/80">{events.filter((e) => e.type === "tool").length} tool calls</span>}
        </button>
        {mode && (
          <span
            title={mode === "live" && model ? model : undefined}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
              mode === "live" ? "text-active ring-active/30" : "text-caution ring-caution/30"
            }`}
          >
            {mode === "live" ? "Live model" : "Recorded run"}
          </span>
        )}
      </div>

      {collapsed ? null : (<>
      {stale && !busy && (
        <div className="flex items-center justify-between gap-2 border-b hairline border-b bg-caution/[.07] px-4 py-1.5">
          <span className="text-[11px] text-caution">Inputs changed since this investigation ran.</span>
          <button onClick={onRerun} className="rounded-control px-2 py-1 text-[11px] font-semibold text-caution ring-1 ring-caution/30 transition hover:bg-caution/10">
            Re-run
          </button>
        </div>
      )}

      <div className={`flex-1 space-y-2 overflow-y-auto px-4 py-3 ${stale ? "opacity-60" : ""}`}>
        {events.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] leading-relaxed text-muted">
              The agent calls real server tools, runs what-ifs and moves the map. It cannot invent an observation, and it cannot turn an{" "}
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
            const detail = describeInput(e.name, e.input);
            return (
              <div key={i} className="rounded-control bg-white/[.02] px-2.5 py-1.5 ring-1 ring-white/[.04] animate-rise">
                <div className="flex items-center gap-2.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${err ? "bg-danger" : ok ? "bg-active" : "bg-brand animate-pulseline"}`} />
                  <span className="flex-1 text-[11.5px] text-ink/85">{TOOL_COPY[e.name] ?? e.name}</span>
                  <span className={`font-mono text-[10px] ${err ? "text-danger" : ok ? "text-active/70" : "text-brand/70"}`}>{e.status}</span>
                </div>
                {detail ? <div className="tabular ml-4 mt-0.5 text-[10.5px] text-muted">{detail}</div> : null}
                {err && e.result !== null && typeof e.result === "object" && "error" in (e.result as object) ? (
                  <div className="ml-4 mt-0.5 text-[10.5px] text-danger/80">{String((e.result as { error: string }).error)}</div>
                ) : null}
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
          const input = ev.currentTarget.elements.namedItem("q") as HTMLInputElement;
          if (input.value.trim()) { onAsk(input.value.trim()); input.value = ""; }
        }}
      >
        <div className="flex gap-2">
          <input
            name="q"
            autoComplete="off"
            disabled={disabled}
            placeholder={disabled ? "Select a site first" : "Ask about this site, or try a what-if…"}
            className="flex-1 rounded-control bg-bg/60 px-3 py-2 text-[12px] text-ink placeholder:text-muted/60 ring-1 ring-white/10 focus:ring-brand/50 disabled:opacity-40"
          />
          {busy ? (
            <button type="button" onClick={onCancel} className="rounded-control px-3 py-2 text-[12px] font-semibold text-danger ring-1 ring-danger/30 transition hover:bg-danger/10">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={disabled} className="rounded-control bg-brand px-3 py-2 text-[12px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-40">
              Ask
            </button>
          )}
        </div>
      </form>
      </>)}
    </div>
  );
}
