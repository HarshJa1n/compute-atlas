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
      // pdf.js reads the underlying ArrayBuffer and can ignore a view's offset.
      // On a pooled allocation that yields unrelated bytes and a spurious parse
      // error, so the payload is copied into an exactly-sized buffer first.
      const incoming = new Uint8Array(await file.arrayBuffer());
      const exact = new Uint8Array(incoming.byteLength);
      exact.set(incoming);
      const buf = Buffer.from(exact.buffer, 0, exact.byteLength);
      const isPdf = name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const isText = /\.(txt|md|csv)$/i.test(name) || file.type.startsWith("text/");
      if (!isPdf && !isText) {
        return NextResponse.json({ error: "Only .txt, .md and .csv are accepted." }, { status: 415 });
      }

      let text: string;
      if (isPdf) {
        // PDF extraction works in dev but not in a production build: the bundled
        // pdf.js misreads the same bytes there. Disabled rather than shipped as a
        // feature that fails only once deployed.
        return NextResponse.json(
          {
            error:
              "PDF extraction is not enabled in this build. Paste the relevant text, or upload a .txt or .md file.",
          },
          { status: 415 }
        );
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
