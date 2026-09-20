"use client";

import { useRef, useState } from "react";
import type { Claim, EvidenceDoc } from "@/lib/analysis/extract";
import { SyntheticBadge } from "./ui";

export type IngestedDoc = {
  meta: { id: string; title: string; siteId: string; origin: EvidenceDoc["origin"]; ingestedAt: string };
  claims: Claim[];
};

const KIND_LABEL: Record<string, string> = {
  "power-capacity": "capacity",
  "water-cap": "water",
  "connection-date": "date",
  unclassified: "",
};

export default function EvidencePanel({
  docs, siteId, siteName, busy, error, onUpload, onPaste, onRemove, onLoadFixtures, fixturesLoaded,
}: {
  docs: IngestedDoc[];
  siteId: string | null;
  siteName: string;
  busy: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onPaste: (title: string, text: string) => void;
  onRemove: (id: string) => void;
  onLoadFixtures: () => void;
  fixturesLoaded: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pasting, setPasting] = useState(false);

  if (!siteId) {
    return <p className="p-4 text-[11px] leading-relaxed text-muted">Select a site to ingest documents against it.</p>;
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-[10.5px] leading-snug text-muted">
        Documents are attached to <span className="text-ink">{siteName}</span>. Text is extracted with paragraph
        references and treated as evidence to quote, never as instructions.
      </p>

      <div className="space-y-1.5">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded-control bg-white/[.03] px-3 py-2 text-[12px] font-semibold text-ink ring-1 ring-white/[.06] transition hover:bg-white/[.07] disabled:opacity-40"
        >
          {busy ? "Reading…" : "Upload PDF or text"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,application/pdf,text/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setPasting((v) => !v)}
            className="flex-1 rounded-control px-3 py-1.5 text-[11px] font-medium text-muted ring-1 ring-white/[.06] transition hover:bg-white/[.05] hover:text-ink"
          >
            Paste text
          </button>
          <button
            onClick={onLoadFixtures}
            disabled={fixturesLoaded || busy}
            className="flex-1 rounded-control px-3 py-1.5 text-[11px] font-medium text-muted ring-1 ring-white/[.06] transition hover:bg-white/[.05] hover:text-ink disabled:opacity-30"
          >
            Load demo pair
          </button>
        </div>
      </div>

      {pasting && (
        <div className="space-y-1.5">
          <textarea
            ref={taRef}
            rows={5}
            placeholder={"Paragraph 1. Preliminary support for 12 MW…\nParagraph 2. Earliest connection December 2027."}
            className="w-full rounded-control bg-bg/60 p-2 text-[11px] text-ink placeholder:text-muted/50 ring-1 ring-white/10 focus:ring-active/50"
          />
          <button
            onClick={() => {
              const t = taRef.current?.value.trim();
              if (t) { onPaste("Pasted note", t); setPasting(false); }
            }}
            className="w-full rounded-control bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-white/20"
          >
            Extract claims
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger/[.08] px-2.5 py-2 text-[11px] leading-snug text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      <div className="border-t hairline border-t pt-2.5">
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">
          Ingested ({docs.length})
        </h4>
        {docs.length === 0 ? (
          <p className="text-[11px] text-muted/80">Nothing ingested. Criteria that need a document stay unknown.</p>
        ) : (
          <ul className="space-y-1.5">
            {docs.map((d) => {
              const values = d.claims.filter((c) => c.kind !== "unclassified");
              return (
                <li key={d.meta.id} className="rounded-control bg-white/[.02] p-2.5 ring-1 ring-white/[.04]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">{d.meta.title}</span>
                    <button
                      onClick={() => onRemove(d.meta.id)}
                      aria-label={`Remove ${d.meta.title}`}
                      className="text-[11px] text-muted transition hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted/80">{d.meta.origin}</span>
                    {d.meta.origin === "fixture" && <SyntheticBadge>Synthetic</SyntheticBadge>}
                  </div>
                  {values.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {values.map((c, i) => (
                        <li key={i} className="text-[10.5px] leading-snug text-muted">
                          <span className="tabular text-ink">
                            {c.value !== null ? `${c.value.toLocaleString("en-IN")} ${c.unit ?? ""}` : c.unit}
                          </span>
                          <span className="ml-1">
                            · para {c.paragraph} · {KIND_LABEL[c.kind]}
                            {c.qualified && <span className="text-caution"> · qualified</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
