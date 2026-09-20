import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluate } from "@/lib/analysis/evaluate";
import { buildSiteInput } from "@/lib/analysis/site";
import { BriefSchema, EvidenceSchema, SiteSchema } from "@/lib/contracts";

export const runtime = "nodejs";

const Body = z.object({
  brief: BriefSchema,
  site: SiteSchema,
  centroid: z.tuple([z.number(), z.number()]),
  evidence: EvidenceSchema.default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { brief, site, centroid, evidence } = parsed.data;

  // Server derives the geographic observations and the evidence facts; the client cannot assert them.
  const built = buildSiteInput(site, centroid, evidence);
  const assessment = evaluate(brief, built.input);

  return NextResponse.json({
    assessment,
    context: built.context,
    claims: built.claims,
  });
}
