// Request contracts shared by the assess and investigate routes.
import { z } from "zod";

export const BriefSchema = z.object({
  mode: z.enum(["campus", "modular"]),
  itMW: z.number().positive(),
  pue: z.number().min(1),
  utilization: z.number().min(0).max(1),
  wueLitresPerITkWh: z.number().min(0),
  tariffINRPerKWh: z.number().min(0),
  waterCapLDay: z.number().nullable(),
  requiredHectares: z.number().positive(),
  openingDate: z.string(),
  maxLatencyMs: z.number().positive(),
});

export const SiteSchema = z.object({
  id: z.string().max(32),
  name: z.string().max(120),
  kind: z.string().max(32),
  areaHectares: z.number().nullable(),
  availableMW: z.number().nullable(),
  waterCapLDay: z.number().nullable(),
});

/** Bounded: a handful of short documents, never a file upload through these routes. */
export const EvidenceSchema = z
  .array(
    z.object({
      id: z.string().max(64),
      title: z.string().max(120),
      text: z.string().max(8000),
      siteId: z.string().max(32),
      origin: z.enum(["fixture", "pasted"]),
    })
  )
  .max(12);

export const EVIDENCE_LIMITS = { maxDocs: 12, maxChars: 8000 } as const;
