// Streams real tool execution as NDJSON events. Falls back to a labelled
// recorded run when no provider key is configured or the provider fails.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { runTool, SYSTEM_PROMPT, TOOLS, type ToolContext } from "@/lib/agent/tools";
import { nearestClimate, nearestFacility, peakTemp } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(600),
  brief: z.record(z.any()),
  site: z.record(z.any()),
  centroid: z.tuple([z.number(), z.number()]),
  documents: z
    .array(z.object({ id: z.string(), title: z.string(), origin: z.string(), claims: z.array(z.any()) }))
    .default([]),
});

const MODEL = process.env.ANTHROPIC_MODEL_ID || "claude-sonnet-4-5";

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { question, centroid } = parsed.data;

  const fac = nearestFacility(centroid);
  const clim = nearestClimate(centroid);
  const ctx: ToolContext = {
    brief: parsed.data.brief as ToolContext["brief"],
    site: {
      ...(parsed.data.site as ToolContext["site"]),
      nearestFacilityKm: fac ? Number(fac.km.toFixed(1)) : null,
      peakTempC: clim.km < 400 ? peakTemp(clim.record).value : null,
    },
    centroid,
    documents: parsed.data.documents as ToolContext["documents"],
  };

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
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: `Project brief: ${JSON.stringify(ctx.brief)}\nSite: ${JSON.stringify({ id: ctx.site.id, name: ctx.site.name, kind: ctx.site.kind })}\n\nAnalyst question: ${question}` },
        ];

        for (let step = 0; step < 6; step++) {
          const res = await client.messages.create({
            model: MODEL,
            max_tokens: 1400,
            system: SYSTEM_PROMPT,
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: { type: "object" as const, properties: {}, required: [] },
            })),
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
            send({ type: "tool", name: call.name, status: "running" });
            const out = runTool(call.name, ctx);
            send({ type: "tool", name: call.name, status: out.ok ? "ok" : "error", result: out });
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(out.ok ? out.data : { error: out.error }),
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

/** Executes the same real tools, with deterministic narration instead of a model. Always labelled. */
async function recordedRun(ctx: ToolContext, question: string, send: (e: unknown) => void) {
  send({ type: "mode", mode: "recorded" });
  const pause = () => new Promise((r) => setTimeout(r, 420));
  const plan = ["evaluateConstraints", "getClimateProfile", "getConnectivityContext", "inspectEvidence", "prioritizeChecks"];
  const outputs: Record<string, unknown> = {};

  for (const name of plan) {
    send({ type: "tool", name, status: "running" });
    await pause();
    const out = runTool(name, ctx);
    if (out.ok) outputs[name] = out.data;
    send({ type: "tool", name, status: out.ok ? "ok" : "error", result: out });
  }

  const a = outputs["evaluateConstraints"] as { criteria: Array<{ label: string; state: string; observed: string }>; status: string } | undefined;
  const checks = (outputs["prioritizeChecks"] as { checks: Array<{ criterion: string; evidence: string }> } | undefined)?.checks ?? [];
  const unresolved = a?.criteria.filter((c) => c.state === "unknown" || c.state === "conflict") ?? [];
  const failed = a?.criteria.filter((c) => c.state === "fail") ?? [];

  const lines = [
    `Question: ${question}`,
    ``,
    `Deterministic screening returned **${a?.status ?? "no result"}**.`,
    failed.length ? `Supplied requirements not met: ${failed.map((c) => `${c.label} (${c.observed})`).join("; ")}.` : ``,
    unresolved.length
      ? `${unresolved.length} criteria cannot be settled from available evidence: ${unresolved.map((c) => c.label).join(", ")}.`
      : `No criterion is unresolved on the current evidence.`,
    ``,
    checks.length ? `Most valuable next check: ${checks[0].criterion} — obtain ${checks[0].evidence.toLowerCase()}.` : ``,
  ].filter(Boolean);

  send({ type: "text", text: lines.join("\n") });
  send({ type: "done" });
}
