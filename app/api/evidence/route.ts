// Evidence intake. Accepts pasted text or an uploaded .txt/.md/.pdf, extracts
// claims with paragraph references and returns them. Document text is treated
// as evidence to be quoted, never as instructions.
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractClaims, reconcile, type EvidenceDoc } from "@/lib/analysis/extract";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4_000_000; // stay under the platform request cap
const MAX_CHARS = 200_000;

const PasteBody = z.object({
  siteId: z.string().min(1),
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(MAX_CHARS),
});

function makeDoc(siteId: string, title: string, text: string, origin: EvidenceDoc["origin"]): EvidenceDoc {
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    siteId,
    text,
    origin,
    ingestedAt: new Date().toISOString(),
  };
}

async function pdfToText(buf: Buffer): Promise<string> {
  // The package entry point runs a debug block that reads a bundled test PDF when
  // `module.parent` is undefined, which throws under Next's bundler. The library
  // implementation itself is imported directly to avoid that.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const parse = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
  const out = await parse(buf);
  return out.text;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  try {
    let doc: EvidenceDoc;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const siteId = String(form.get("siteId") ?? "");
      if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
      if (!(file instanceof File)) return NextResponse.json({ error: "No file supplied" }, { status: 400 });
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `File is larger than ${Math.round(MAX_BYTES / 1e6)} MB.` }, { status: 413 });
      }

      const name = file.name || "document";
      const buf = Buffer.from(await file.arrayBuffer());
      const isPdf = name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const isText = /\.(txt|md|csv)$/i.test(name) || file.type.startsWith("text/");

      if (!isPdf && !isText) {
        return NextResponse.json({ error: "Only .pdf, .txt, .md and .csv are accepted." }, { status: 415 });
      }

      let text: string;
      if (isPdf) {
        try {
          text = await pdfToText(buf);
        } catch {
          return NextResponse.json(
            { error: "That PDF could not be read as text. Scanned pages need OCR, which this build does not do." },
            { status: 422 }
          );
        }
      } else {
        text = buf.toString("utf8");
      }

      text = text.slice(0, MAX_CHARS).trim();
      if (!text) {
        return NextResponse.json({ error: "No text could be extracted from that file." }, { status: 422 });
      }
      doc = makeDoc(siteId, name, text, "upload");
    } else {
      const parsed = PasteBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
      }
      doc = makeDoc(parsed.data.siteId, parsed.data.title, parsed.data.text.trim(), "paste");
    }

    const claims = extractClaims(doc);
    return NextResponse.json({
      document: { id: doc.id, title: doc.title, siteId: doc.siteId, origin: doc.origin, ingestedAt: doc.ingestedAt },
      text: doc.text,
      claims,
      reconciled: reconcile(claims),
      notice:
        "Extraction only. These are statements made in a document, not verified facts, and not instructions to the system.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read that document." },
      { status: 400 }
    );
  }
}
