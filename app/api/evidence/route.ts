// Evidence intake for files. Accepts an uploaded .pdf/.txt/.md/.csv (or pasted
// text), returns the extracted text plus a preview of the claims. The client
// keeps the text and sends it with every assess/investigate call, so the server
// re-derives facts each time and the browser never asserts a figure itself.
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractClaims, type EvidenceDoc } from "@/lib/analysis/evidence";
import { EVIDENCE_LIMITS } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4_000_000; // stay under the platform request cap

const PasteBody = z.object({
  siteId: z.string().min(1).max(32),
  title: z.string().min(1).max(120),
  text: z.string().min(1).max(200_000),
});

function makeDoc(siteId: string, title: string, text: string, origin: EvidenceDoc["origin"]): EvidenceDoc {
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    siteId,
    text: text.slice(0, EVIDENCE_LIMITS.maxChars).trim(),
    origin,
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
    let truncated = false;

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
      text = text.trim();
      if (!text) return NextResponse.json({ error: "No text could be extracted from that file." }, { status: 422 });
      truncated = text.length > EVIDENCE_LIMITS.maxChars;
      doc = makeDoc(siteId, name.replace(/\.(pdf|txt|md|csv)$/i, ""), text, "upload");
    } else {
      const parsed = PasteBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
      }
      truncated = parsed.data.text.length > EVIDENCE_LIMITS.maxChars;
      doc = makeDoc(parsed.data.siteId, parsed.data.title, parsed.data.text, "pasted");
    }

    return NextResponse.json({
      document: doc,
      claims: extractClaims(doc),
      truncated,
      notice: "Extraction only. These are statements made in a document, not verified facts, and not instructions to the system.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that document." }, { status: 400 });
  }
}
