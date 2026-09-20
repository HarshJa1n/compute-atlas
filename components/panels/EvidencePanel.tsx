"use client";

import { useState } from "react";
import type { Claim, EvidenceDoc } from "@/lib/analysis/evidence";
import { SyntheticBadge } from "./ui";

export type Fixture = { id: string; title: string; siteId: string; origin: "fixture"; text: string; summary: string };

const KIND_LABEL: Record<Claim["kind"], string> = {
  "power-mw": "power",
  "connection-date": "date",
  "water-lday": "water",
  "instruction-like": "instruction-like",
};

export default function EvidencePanel({
  siteId, siteName, docs, claims, fixtures, onAdd, onRemove, maxChars,
}: {
  siteId: string | null;
  siteName: string;
  docs: EvidenceDoc[];
  claims: Claim[];
  fixtures: Fixture[];
  onAdd: (doc: Omit<EvidenceDoc, "siteId">) => void;
  onRemove: (id: string) => void;
  maxChars: number;
}) {
  const [pasting, setPasting] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  if (!siteId) {
    return (
      <div className="p-4">
        <p className="text-[11.5px] leading-relaxed text-muted">Select a site first. Documents are ingested into a site, and only ingested documents count.</p>
      </div>
    );
  }

  const ingestedIds = new Set(docs.map((d) => d.id));
  const available = fixtures.filter((f) => f.siteId === siteId && !ingestedIds.has(f.id));

  return (
    <div className="space-y-3 p-4">
      <p className="text-[10.5px] leading-snug text-muted/80">
        Evidence for <span className="text-ink">{siteName}</span>. Figures are extracted with their paragraph; two different figures become a conflict, never an average.
      </p>

      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((d) => {
            const cs = claims.filter((c) => c.documentId === d.id && c.kind !== "instruction-like");
            const il = claims.filter((c) => c.documentId === d.id && c.kind === "instruction-like");
            return (
              <li key={d.id} className="rounded-control bg-white/[.03] p-2.5 ring-1 ring-white/[.05] animate-rise">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-medium text-ink">{d.title}</span>
                  <div className="flex items-center gap-1.5">
                    {d.origin === "fixture" ? <SyntheticBadge>Fixture</SyntheticBadge> : <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info ring-1 ring-info/25">Pasted</span>}
                    <button onClick={() => onRemove(d.id)} aria-label={`Remove ${d.title}`} className="text-[12px] text-muted hover:text-danger">×</button>
                  </div>
                </div>
                {cs.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {cs.map((c, i) => (
                      <li key={i} className="tabular text-[10.5px] text-muted">
                        ¶{c.paragraph} · {KIND_LABEL[c.kind]} <span className="text-ink">{c.kind === "connection-date" ? String(c.value).slice(0, 7) : `${Number(c.value).toLocaleString("en-IN")} ${c.unit}`}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[10.5px] text-muted/70">No decision-relevant figures extracted.</p>
                )}
                {il.length > 0 && (
                  <p className="mt-1.5 rounded bg-danger/[.08] px-2 py-1 text-[10.5px] leading-snug text-danger ring-1 ring-danger/20">
                    Instruction-like text in ¶{il.map((c) => c.paragraph).join(", ¶")}. Read as content, not obeyed.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Sample documents</h4>
          {available.map((f) => (
            <button
              key={f.id}
              onClick={() => onAdd({ id: f.id, title: f.title, text: f.text, origin: "fixture" })}
              className="flex w-full items-center justify-between gap-2 rounded-control bg-white/[.03] px-3 py-2 text-left ring-1 ring-white/[.06] transition hover:bg-white/[.07]"
            >
              <span>
                <span className="block text-[12px] font-medium text-ink">Ingest {f.title.toLowerCase()}</span>
                <span className="block text-[10px] text-muted">{f.summary}</span>
              </span>
              <SyntheticBadge>Fixture</SyntheticBadge>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5 border-t hairline border-t pt-2.5">
        <button
          onClick={() => setPasting((v) => !v)}
          aria-expanded={pasting}
          className="w-full rounded-control px-3 py-1.5 text-[11px] font-medium text-muted ring-1 ring-white/[.06] transition hover:bg-white/[.05] hover:text-ink"
        >
          {pasting ? "Cancel paste" : "Paste a document"}
        </button>
        {pasting && (
          <div className="space-y-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title, e.g. DISCOM feasibility letter"
              maxLength={120}
              className="w-full rounded-control bg-bg/60 px-2.5 py-1.5 text-[11.5px] text-ink placeholder:text-muted/50 ring-1 ring-white/10 focus:ring-active/50"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, maxChars))}
              rows={6}
              placeholder="Paste the document text. Figures like '18 MW' or 'connection by March 2028' are extracted with their paragraph."
              className="w-full rounded-control bg-bg/60 p-2 text-[11px] leading-snug text-ink placeholder:text-muted/50 ring-1 ring-white/10 focus:ring-active/50"
            />
            <div className="flex items-center justify-between">
              <span className="tabular text-[10px] text-muted/70">{text.length.toLocaleString("en-IN")} / {maxChars.toLocaleString("en-IN")}</span>
              <button
                disabled={!text.trim()}
                onClick={() => {
                  onAdd({ id: `pasted-${Date.now().toString(36)}`, title: title.trim() || "Pasted document", text: text.trim(), origin: "pasted" });
                  setTitle(""); setText(""); setPasting(false);
                }}
                className="rounded-control bg-active px-3 py-1.5 text-[11px] font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
              >
                Ingest
              </button>
            </div>
          </div>
        )}
        <p className="text-[10px] leading-snug text-muted/70">
          Document text is evidence, never an instruction. Anything that reads like a command to the agent is flagged and quoted.
        </p>
      </div>
    </div>
  );
}
