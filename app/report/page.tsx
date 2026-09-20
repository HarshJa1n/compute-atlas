"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { readReport, type ReportSnapshot } from "@/lib/report";
import { nextChecks } from "@/lib/analysis/checks";

const STATE_WORD: Record<string, string> = {
  pass: "Supported", fail: "Not met", unknown: "Unknown", conflict: "Conflict",
};

function ReportBody() {
  const params = useSearchParams();
  const [snap, setSnap] = useState<ReportSnapshot | null | "missing">(null);

  useEffect(() => {
    const key = params.get("k");
    setSnap(key ? readReport(key) ?? "missing" : "missing");
  }, [params]);

  if (snap === null) return <p className="p-10 text-sm">Loading report…</p>;
  if (snap === "missing") {
    return (
      <div className="p-10">
        <h1 className="text-xl font-semibold">Report not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Reports are held in this browser only. Generate it again from the atlas.
        </p>
      </div>
    );
  }

  const q = snap.assessment.quantities;
  const checks = nextChecks(snap.assessment);
  const n = (v: number, d = 0) => v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });

  return (
    <main className="mx-auto max-w-[820px] px-8 py-10 print:px-0 print:py-0">
      <header className="border-b border-neutral-300 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">Site screening report</h1>
          <button
            onClick={() => window.print()}
            className="rounded border border-neutral-400 px-3 py-1 text-[12px] print:hidden"
          >
            Print / save as PDF
          </button>
        </div>
        <p className="mt-1 text-[13px] text-neutral-700">
          {snap.siteName}
          {snap.siteKind === "synthetic" && " — synthetic demonstration parcel"}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          Generated {new Date(snap.generatedAt).toLocaleString("en-IN")} · calculation {snap.assessment.calculationVersion}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Decision status</h2>
        <p className="mt-1 text-[16px] font-semibold">
          {snap.assessment.status.replace(/-/g, " ")}
          <span className="ml-2 text-[13px] font-normal text-neutral-600">
            {snap.assessment.unknownCount} unresolved
          </span>
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Project brief</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <tbody>
            {[
              ["Mode", snap.brief.mode],
              ["IT load", `${snap.brief.itMW} MW`],
              ["PUE", String(snap.brief.pue)],
              ["Utilisation", `${Math.round(snap.brief.utilization * 100)}%`],
              ["WUE", `${snap.brief.wueLitresPerITkWh} L/kWh`],
              ["Tariff", `₹${snap.brief.tariffINRPerKWh}/kWh`],
              ["Land required", `${snap.brief.requiredHectares} ha`],
              ["Water cap", snap.brief.waterCapLDay === null ? "not supplied" : `${n(snap.brief.waterCapLDay)} L/day`],
              ["Target opening", snap.brief.openingDate],
              ["Max latency", `${snap.brief.maxLatencyMs} ms`],
              ["Site area", snap.areaHectares === null ? "—" : `${n(snap.areaHectares, 2)} ha`],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-neutral-200">
                <td className="py-1 pr-4 text-neutral-600">{k}</td>
                <td className="py-1 font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Derived demand</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <tbody>
            {[
              ["Full-load facility", `${n(q.fullLoadFacilityMW, 1)} MW`],
              ["Average facility", `${n(q.averageFacilityMW, 1)} MW`],
              ["Annual energy", `${n(q.annualMWh)} MWh`],
              ["Annual energy cost", `₹${n(q.annualEnergyINR)}`],
              ["Water withdrawal", `${n(q.waterLDay)} L/day`],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-neutral-200">
                <td className="py-1 pr-4 text-neutral-600">{k}</td>
                <td className="py-1 font-medium tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 break-inside-avoid">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Criteria</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-neutral-400 text-left text-[11px] uppercase text-neutral-500">
              <th className="py-1">Criterion</th><th className="py-1">Verdict</th>
              <th className="py-1">Required</th><th className="py-1">Observed</th>
            </tr>
          </thead>
          <tbody>
            {snap.assessment.criteria.map((c) => (
              <tr key={c.id} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 pr-3">
                  {c.label}
                  <span className="block text-[10.5px] text-neutral-500">{c.basis}</span>
                </td>
                <td className="py-1.5 pr-3 font-semibold">{STATE_WORD[c.state]}</td>
                <td className="py-1.5 pr-3 tabular-nums">{c.required}</td>
                <td className="py-1.5 tabular-nums">{c.observed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {checks.length > 0 && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Unresolved — next investigations</h2>
          <ol className="mt-2 space-y-2">
            {checks.map((c, i) => (
              <li key={c.criterionId} className="text-[12.5px]">
                <span className="font-semibold">{i + 1}. {c.criterion}</span>
                <span className="ml-1 text-neutral-600">({STATE_WORD[c.state]})</span>
                <span className="block text-neutral-700">{c.why}</span>
                <span className="block">Obtain: {c.evidence} — <span className="text-neutral-600">{c.owner}</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {snap.documents.length > 0 && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Evidence</h2>
          {snap.documents.map((d) => (
            <div key={d.title} className="mt-2">
              <p className="text-[12.5px] font-semibold">{d.title} <span className="font-normal text-neutral-500">({d.origin})</span></p>
              <ul className="mt-1 space-y-0.5">
                {d.claims.filter((c) => c.kind !== "unclassified").map((c, i) => (
                  <li key={i} className="text-[11.5px] text-neutral-700">
                    para {c.paragraph}: {c.value !== null ? `${n(c.value)} ${c.unit ?? ""}` : c.unit}
                    {c.qualified && " — qualified by the document"}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {snap.history.length > 1 && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Scenario history</h2>
          <ol className="mt-2 space-y-0.5">
            {snap.history.map((r) => (
              <li key={r.version} className="text-[11.5px] text-neutral-700">
                v{r.version} — {r.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-6 break-inside-avoid">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Sources</h2>
        <ul className="mt-2 space-y-0.5">
          {snap.sources.map((s) => (
            <li key={s.id} className="text-[11.5px] text-neutral-700">
              {s.name} — {s.scale}
              {s.url && <span className="text-neutral-500"> · {s.url}</span>}
            </li>
          ))}
        </ul>
        {snap.context?.climate && (
          <p className="mt-1 text-[11.5px] text-neutral-700">
            Climate cell: {snap.context.climate.station} ({snap.context.climate.km} km) — {snap.context.climate.period}
          </p>
        )}
      </section>

      <footer className="mt-8 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-600">
        {snap.assessment.notice} Absent evidence is reported as unknown and contradictory evidence as conflict; neither
        is resolved by estimation.
      </footer>
    </main>
  );
}

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Suspense fallback={<p className="p-10 text-sm">Loading…</p>}>
        <ReportBody />
      </Suspense>
    </div>
  );
}
