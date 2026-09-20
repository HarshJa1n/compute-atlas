// Readable, printable evidence pack. Pure string building; runs in the browser.
import type { Assessment, ProjectBrief } from "@/lib/analysis/evaluate";
import type { Claim, EvidenceDoc } from "@/lib/analysis/evidence";

export type ReportInput = {
  brief: ProjectBrief;
  site: { id: string; name: string; kind: string; areaHectares: number | null };
  assessment: Assessment;
  evidence: EvidenceDoc[];
  claims: Claim[];
  narrative: string[];
  investigationMode: "live" | "recorded" | null;
  model?: string | null;
  sources: Array<{ id: string; name: string; url: string; scale: string; kind: string }>;
  context: {
    nearestFacility: { name: string; city: string; km: number } | null;
    climate: { station: string; km: number; period: string; peakMonth: string; inCoverage: boolean };
    power: { inCoverage: boolean; nearestSubstation: { name: string | null; kV: number | null; km: number } | null; linesWithinRadius: number; radiusKm: number };
  } | null;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const STATE_LABEL: Record<string, string> = { pass: "Supported", fail: "Not met", unknown: "Unknown", conflict: "Conflict" };

const NEEDS: Record<string, { evidence: string; owner: string }> = {
  power: { evidence: "A DISCOM connection study or sanctioned-load letter naming the parcel", owner: "Utility liaison" },
  water: { evidence: "A written municipal or groundwater withdrawal allocation", owner: "Civil lead" },
  land: { evidence: "A surveyed boundary with net buildable area after setbacks", owner: "Land advisor" },
  schedule: { evidence: "An energisation date tied to a signed connection agreement", owner: "Utility liaison" },
  connectivity: { evidence: "A carrier route quote with diversity and measured latency", owner: "Network lead" },
  climate: { evidence: "A local station design-day dry-bulb and wet-bulb record", owner: "Mechanical lead" },
};

const KIND: Record<string, string> = { "power-mw": "power", "connection-date": "connection date", "water-lday": "water allocation", "instruction-like": "instruction-like" };
const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} crore` : `₹${(n / 1e5).toFixed(1)} lakh`);
const num = (n: number, d = 1) => n.toLocaleString("en-IN", { maximumFractionDigits: d });

export function buildReportHtml(r: ReportInput): string {
  const a = r.assessment;
  const q = a.quantities;
  const rank: Record<string, number> = { conflict: 0, unknown: 1, fail: 2, pass: 9 };
  const unresolved = a.criteria.filter((c) => c.state !== "pass").sort((x, y) => rank[x.state] - rank[y.state]);
  const statusText: Record<Assessment["status"], string> = {
    "passes-modelled-criteria-only": "Passes modelled criteria only",
    "fails-supplied-requirement": "Fails a supplied requirement",
    "needs-investigation": "Needs investigation",
  };
  const generated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const instructionLike = r.claims.filter((c) => c.kind === "instruction-like");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Compute Atlas — ${esc(r.site.name)} — screening brief</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --ink:#0b1a24; --muted:#4f6b7a; --line:#d9e2e7; --paper:#f4f7f8; --pass:#0f8f74; --fail:#c2413f; --unknown:#9a6a00; --conflict:#2c6fb7; }
  * { box-sizing: border-box; }
  body { margin:0; background:#e9eef1; color:var(--ink); font:15px/1.5 Inter, system-ui, sans-serif; }
  .page { max-width: 880px; margin: 32px auto; background:#fff; padding: 48px 56px; box-shadow: 0 12px 40px -20px rgba(0,0,0,.35); }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing:-.01em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing:.14em; color: var(--muted); margin: 36px 0 12px; border-top:1px solid var(--line); padding-top: 18px; }
  .sub { color: var(--muted); margin: 0 0 8px; }
  .status { display:inline-block; font-weight: 700; padding: 4px 10px; border-radius: 6px; background: var(--paper); margin-top: 10px; }
  .status.fail { color: var(--fail);} .status.needs { color: var(--unknown);} .status.pass { color: var(--pass);}
  table { width:100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align:left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing:.08em; }
  .st { font-weight: 700; } .st.pass{color:var(--pass)} .st.fail{color:var(--fail)} .st.unknown{color:var(--unknown)} .st.conflict{color:var(--conflict)}
  .small { font-size: 12.5px; color: var(--muted); }
  .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat { background: var(--paper); border-radius: 8px; padding: 12px 14px; }
  .stat b { display:block; font-size: 20px; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 12px; color: var(--muted); }
  .badge { display:inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing:.06em; padding: 2px 6px; border-radius: 4px; background:#fff3d6; color:#7a5200; margin-left: 6px; vertical-align: middle; }
  .badge.live { background:#dff7f0; color:#0f6d58; } .badge.rec { background:#fff3d6; color:#7a5200; }
  .doc { border:1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
  .doc h3 { margin:0 0 6px; font-size: 15px; }
  .quote { border-left: 3px solid var(--line); padding-left: 10px; color:#334; margin: 6px 0; }
  .warn { background:#fdecec; border:1px solid #f3c2c2; color:#7d1e1e; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
  .narr p { margin: 8px 0; }
  .notice { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--muted); }
  @media print { body { background:#fff; } .page { box-shadow:none; margin:0; padding: 24px; } .noprint { display:none; } }
</style></head>
<body><div class="page">
  <p class="sub">Compute Atlas · screening brief · generated ${esc(generated)} · calculation ${esc(a.calculationVersion)}</p>
  <h1>${esc(r.site.name)}${r.site.kind === "synthetic" ? '<span class="badge">synthetic fixture</span>' : ""}</h1>
  <p class="sub">${esc(r.brief.mode === "campus" ? "Campus" : "Modular")} brief · ${esc(num(r.brief.itMW, 1))} MW IT · opening by ${esc(r.brief.openingDate)}${r.site.areaHectares !== null ? ` · ${esc(num(r.site.areaHectares, 2))} ha gross` : ""}</p>
  <span class="status ${a.status === "fails-supplied-requirement" ? "fail" : a.status === "needs-investigation" ? "needs" : "pass"}">${esc(statusText[a.status])}</span>
  <span class="small"> · ${a.unknownCount} criteria unresolved</span>
  <p class="noprint small" style="margin-top:14px"><a href="#" onclick="window.print();return false;">Print or save as PDF</a></p>

  <h2>Verdict by criterion</h2>
  <table><thead><tr><th>Criterion</th><th>State</th><th>Needs</th><th>Have</th><th>Source</th></tr></thead><tbody>
  ${a.criteria
    .map(
      (c) => `<tr><td><b>${esc(c.label)}</b><div class="small">${esc(c.basis)}</div></td>
      <td class="st ${c.state}">${esc(STATE_LABEL[c.state])}</td><td>${esc(c.required)}</td><td>${esc(c.observed)}${
        c.disagreement ? `<div class="small">${esc(c.disagreement.claim)}<br>vs ${esc(c.disagreement.counterClaim)}</div>` : ""
      }</td><td class="small">${c.sources.length ? c.sources.map(esc).join("<br>") : "—"}</td></tr>`
    )
    .join("")}
  </tbody></table>

  <h2>Derived demand</h2>
  <div class="grid">
    <div class="stat"><b>${esc(num(q.fullLoadFacilityMW))} MW</b><span>Full-load facility (IT × PUE)</span></div>
    <div class="stat"><b>${esc(num(q.averageFacilityMW))} MW</b><span>Average facility (× utilisation)</span></div>
    <div class="stat"><b>${esc(num(q.annualMWh, 0))} MWh</b><span>Annual energy</span></div>
    <div class="stat"><b>${esc(inr(q.annualEnergyINR))}</b><span>Energy cost / yr at ₹${esc(num(r.brief.tariffINRPerKWh, 2))}/kWh</span></div>
    <div class="stat"><b>${esc(num(q.waterLDay, 0))} L/day</b><span>Water draw at WUE ${esc(num(r.brief.wueLitresPerITkWh, 2))}</span></div>
    <div class="stat"><b>${esc(num(r.brief.requiredHectares, 2))} ha</b><span>Land required</span></div>
  </div>
  <p class="small">Inputs: IT ${esc(num(r.brief.itMW, 1))} MW, PUE ${esc(num(r.brief.pue, 2))}, utilisation ${esc(Math.round(r.brief.utilization * 100))}%, WUE ${esc(num(r.brief.wueLitresPerITkWh, 2))} L/IT-kWh, tariff ₹${esc(num(r.brief.tariffINRPerKWh, 2))}/kWh. All are assumptions supplied by the analyst, not quotations.</p>

  <h2>What to obtain next</h2>
  ${
    unresolved.length
      ? `<table><thead><tr><th>#</th><th>Criterion</th><th>State</th><th>Evidence that would close it</th><th>Owner</th></tr></thead><tbody>${unresolved
          .map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.label)}</td><td class="st ${c.state}">${esc(STATE_LABEL[c.state])}</td><td>${esc(NEEDS[c.id]?.evidence ?? "")}</td><td>${esc(NEEDS[c.id]?.owner ?? "")}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p>No criterion is unresolved on the current evidence.</p>`
  }

  <h2>Evidence ingested for this site</h2>
  ${
    r.evidence.length
      ? r.evidence
          .map((d) => {
            const cs = r.claims.filter((c) => c.documentId === d.id && c.kind !== "instruction-like");
            const il = r.claims.filter((c) => c.documentId === d.id && c.kind === "instruction-like");
            return `<div class="doc"><h3>${esc(d.title)}<span class="badge">${esc(d.origin === "fixture" ? "synthetic fixture" : "pasted by analyst")}</span></h3>
            ${cs.length ? `<ul class="small">${cs.map((c) => `<li>¶${c.paragraph} · ${esc(KIND[c.kind] ?? c.kind)} → <b>${esc(c.kind === "connection-date" ? String(c.value).slice(0, 7) : `${c.value} ${c.unit}`)}</b> <span>(extraction ${esc(c.confidence)})</span><div class="quote">${esc(c.statement)}</div></li>`).join("")}</ul>` : `<p class="small">No decision-relevant figures extracted.</p>`}
            ${il.length ? `<div class="warn"><b>Instruction-like text detected</b> (¶${il.map((c) => c.paragraph).join(", ¶")}). Quoted as document content; it changed no verdict.<div class="quote">${il.map((c) => esc(c.statement)).join("<br>")}</div></div>` : ""}
            </div>`;
          })
          .join("")
      : `<p class="small">No documents ingested. Every document-dependent criterion reads unknown.</p>`
  }
  ${instructionLike.length ? "" : ""}

  <h2>Geographic context (not commitments)</h2>
  ${
    r.context
      ? `<ul>
      <li>Climate: ${r.context.climate.inCoverage ? `NASA POWER cell near ${esc(r.context.climate.station)} (${esc(r.context.climate.km)} km), ${esc(r.context.climate.period)}, peak monthly mean in ${esc(r.context.climate.peakMonth)}.` : "no prepared climate sample within 400 km; unknown, not interpolated."}</li>
      <li>Grid presence: ${r.context.power.inCoverage ? `nearest tagged substation ${esc(r.context.power.nearestSubstation?.name ?? "unnamed")}${r.context.power.nearestSubstation?.kV ? ` (${esc(r.context.power.nearestSubstation.kV)} kV)` : ""} at ${esc(r.context.power.nearestSubstation?.km ?? "?")} km; ${esc(r.context.power.linesWithinRadius)} tagged lines within ${esc(r.context.power.radiusKm)} km (OpenStreetMap). Presence is not available capacity.` : "no prepared OpenStreetMap extract within 60 km."}</li>
      <li>Connectivity: ${r.context.nearestFacility ? `nearest PeeringDB facility ${esc(r.context.nearestFacility.name)}, ${esc(r.context.nearestFacility.city)}, ${esc(r.context.nearestFacility.km)} km. Proximity is not available fibre.` : "no facility record."}</li>
    </ul>`
      : `<p class="small">Context not computed.</p>`
  }

  <h2>Investigation narrative${r.investigationMode ? `<span class="badge ${r.investigationMode === "live" ? "live" : "rec"}">${r.investigationMode === "live" ? `live model${r.model ? ` · ${esc(r.model)}` : ""}` : "recorded run"}</span>` : ""}</h2>
  <div class="narr">${r.narrative.length ? r.narrative.map((t) => `<p>${esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")}</p>`).join("") : `<p class="small">No investigation was run for this state of the brief.</p>`}</div>

  <h2>Sources</h2>
  <table><tbody>${r.sources.map((s) => `<tr><td><b>${esc(s.id)}</b></td><td>${esc(s.name)}</td><td class="small">${esc(s.scale)} · ${esc(s.kind)}</td><td class="small">${s.url ? `<a href="${esc(s.url)}">${esc(s.url)}</a>` : "—"}</td></tr>`).join("")}</tbody></table>

  <p class="notice">${esc(a.notice)} Synthetic fixtures are fictional and labelled. Absent evidence is reported as unknown, never as a pass; contradictory evidence is reported as a conflict, never resolved silently.</p>
</div></body></html>`;
}
