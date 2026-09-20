// Streams real tool execution as NDJSON events. Falls back to a labelled
// recorded run when no provider key is configured or the provider fails.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { runTool, SYSTEM_PROMPT, TOOLS, type ToolContext } from "@/lib/agent/tools";
import { buildSiteInput } from "@/lib/analysis/site";
import { BriefSchema, EvidenceSchema, SiteSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(600),
  brief: BriefSchema,
  site: SiteSchema,
  centroid: z.tuple([z.number(), z.number()]),
  evidence: EvidenceSchema.default([]),
});

const MODEL = process.env.ANTHROPIC_MODEL_ID || "claude-sonnet-4-5";
const MAX_STEPS = 8;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { question, centroid, brief, site, evidence } = parsed.data;

  const built = buildSiteInput(site, centroid, evidence);
  const ctx: ToolContext = { brief, site: built.input, clientSite: site, centroid, context: built.context, evidence };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const key = process.env.ANTHROPIC_API_KEY;

      if (!key) {
        await recordedRun(ctx, question, send);
        controller.close();
        return;
      }

      try {
        send({ type: "mode", mode: "live", model: MODEL });
        const client = new Anthropic({ apiKey: key });
        const docs = ctx.evidence.filter((d) => d.siteId === ctx.site.id);
        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content:
              `Project brief: ${JSON.stringify(ctx.brief)}\n` +
              `Site: ${JSON.stringify({ id: ctx.site.id, name: ctx.site.name, kind: ctx.site.kind, areaHectares: ctx.site.areaHectares })}\n` +
              `Ingested documents for this site: ${docs.length ? docs.map((d) => `${d.id} (${d.title})`).join(", ") : "none"}\n` +
              `Other prepared parcels available to compareSites: A, B, C.\n\n` +
              `Analyst question: ${question}`,
          },
        ];

        for (let step = 0; step < MAX_STEPS; step++) {
          const res = await client.messages.create({
            model: MODEL,
            max_tokens: 1400,
            system: SYSTEM_PROMPT,
            tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool["input_schema"] })),
            messages,
          });

          for (const block of res.content) {
            if (block.type === "text" && block.text.trim()) send({ type: "text", text: block.text });
          }

          const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          if (!calls.length) break;

          messages.push({ role: "assistant", content: res.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const call of calls) {
            send({ type: "tool", name: call.name, status: "running", input: call.input });
            const out = runTool(call.name, ctx, call.input);
            send({ type: "tool", name: call.name, status: out.ok ? "ok" : "error", input: call.input, result: out });
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              // The UI gets the full result; the model gets a trimmed one so large payloads do not crowd the context.
              content: JSON.stringify(out.ok ? trimForModel(call.name, out.data) : { error: out.error }),
              is_error: !out.ok,
            });
          }
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "notice", text: `Provider unavailable (${err instanceof Error ? err.message : "error"}). Continuing with the recorded run.` });
        await recordedRun(ctx, question, send);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

function trimForModel(name: string, data: unknown): unknown {
  if (name === "testScenario" && data && typeof data === "object") {
    const { scenarioAssessment: _drop, ...rest } = data as Record<string, unknown>;
    return rest;
  }
  if (name === "compareSites" && data && typeof data === "object") {
    const { rows: _drop, ...rest } = data as Record<string, unknown>;
    return rest;
  }
  return data;
}

/** Executes the same real tools, with deterministic narration instead of a model. Always labelled. */
async function recordedRun(ctx: ToolContext, question: string, send: (e: unknown) => void) {
  send({ type: "mode", mode: "recorded" });
  const pause = () => new Promise((r) => setTimeout(r, 420));
  const hasDocs = ctx.evidence.some((d) => d.siteId === ctx.site.id);
  const plan: Array<[string, unknown]> = [
    ["evaluateConstraints", {}],
    ...(hasDocs ? ([["inspectEvidence", {}]] as Array<[string, unknown]>) : []),
    ["getPowerContext", {}],
    ["getClimateProfile", {}],
    ["getConnectivityContext", {}],
    ["prioritizeChecks", {}],
  ];
  const outputs: Record<string, unknown> = {};

  for (const [name, input] of plan) {
    send({ type: "tool", name, status: "running", input });
    await pause();
    const out = runTool(name, ctx, input);
    if (out.ok) outputs[name] = out.data;
    send({ type: "tool", name, status: out.ok ? "ok" : "error", input, result: out });
  }

  const a = outputs["evaluateConstraints"] as { criteria: Array<{ label: string; state: string; observed: string; disagreement?: { claim: string; counterClaim: string } }>; status: string } | undefined;
  const checks = (outputs["prioritizeChecks"] as { checks: Array<{ criterion: string; evidence: string }> } | undefined)?.checks ?? [];
  const ev = outputs["inspectEvidence"] as { instructionLikeText?: Array<{ document: string; paragraph: number }> } | undefined;
  const conflicts = a?.criteria.filter((c) => c.state === "conflict") ?? [];
  const unknown = a?.criteria.filter((c) => c.state === "unknown") ?? [];
  const failed = a?.criteria.filter((c) => c.state === "fail") ?? [];

  const lines = [
    `Deterministic screening returned **${a?.status ?? "no result"}**.`,
    failed.length ? `Supplied requirements not met: ${failed.map((c) => `${c.label} (${c.observed})`).join("; ")}.` : ``,
    ...conflicts.map((c) => `${c.label}: two sources disagree. ${c.disagreement?.claim ?? ""} against ${c.disagreement?.counterClaim ?? ""}. Neither is preferred.`),
    unknown.length ? `${unknown.length} criteria have no sourced evidence: ${unknown.map((c) => c.label).join(", ")}.` : ``,
    ev?.instructionLikeText?.length ? `A document contains instruction-like text (${ev.instructionLikeText.map((x) => `${x.document} ¶${x.paragraph}`).join(", ")}). It was read as content and changed nothing.` : ``,
    ``,
    checks.length ? `Most valuable next check: ${checks[0].criterion} — obtain ${checks[0].evidence.toLowerCase()}.` : ``,
  ].filter(Boolean);

  send({ type: "text", text: lines.join("\n") });
  send({ type: "done" });
}
