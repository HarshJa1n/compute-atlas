"use client";

import { STATE_META } from "./ui";
import type { Assessment } from "@/lib/analysis/evaluate";

export default function CompareTray({
  rows, onRemove, onClose,
}: {
  rows: Array<{ id: string; name: string; assessment: Assessment }>;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const ids = Array.from(new Set(rows.flatMap((r) => r.assessment.criteria.map((c) => c.id))));
  const labels = new Map(rows.flatMap((r) => r.assessment.criteria.map((c) => [c.id, c.label] as const)));

  return (
    <div className="glass rounded-panel animate-rise">
      <div className="flex items-center justify-between border-b hairline border-b px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">
          Comparison · identical criteria
        </h3>
        <button onClick={onClose} className="text-[11px] text-muted hover:text-ink">Close</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="px-3 py-1.5 font-medium">Criterion</th>
              {rows.map((r) => (
                <th key={r.id} className="px-3 py-1.5 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[130px] truncate text-ink normal-case">{r.name}</span>
                    <button onClick={() => onRemove(r.id)} className="text-muted hover:text-danger" aria-label={`Remove ${r.name}`}>×</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((cid) => (
              <tr key={cid} className="border-t hairline border-t">
                <td className="px-3 py-1.5 text-[11.5px] text-muted">{labels.get(cid)}</td>
                {rows.map((r) => {
                  const c = r.assessment.criteria.find((x) => x.id === cid);
                  if (!c) return <td key={r.id} className="px-3 py-1.5 text-[11px] text-muted/50">not assessed</td>;
                  const m = STATE_META[c.state];
                  return (
                    <td key={r.id} className="px-3 py-1.5">
                      <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${m.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />
                        {m.label}
                      </span>
                      <span className="tabular ml-1.5 text-[10.5px] text-muted">{c.observed}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t hairline border-t">
              <td className="px-3 py-1.5 text-[11.5px] font-medium text-muted">Unresolved</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular px-3 py-1.5 text-[11.5px] font-semibold text-caution">
                  {r.assessment.unknownCount}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-muted/75">
        No overall score is produced. Coverage differs between sites, so a single ranking number would hide the reason.
      </p>
    </div>
  );
}
