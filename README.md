# Compute Atlas

**Before you build an AI factory, prove the site can support it.**

Evidence-backed site screening for Indian AI data-centre projects. Draw land, set a
workload, and see which requirements are supported, which fail, and which remain
unproven — with every number traced to an input and a source.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the two keys
npm run dev                  # http://localhost:3000
```

| Variable | Needed for | If missing |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox basemap | Falls back to the CARTO dark basemap |
| `NEXT_PUBLIC_MAPBOX_STYLE` | Style override | Defaults to `mapbox/dark-v11` |
| `ANTHROPIC_API_KEY` | Live investigation | Runs a labelled **recorded run** instead |
| `ANTHROPIC_MODEL_ID` | Model choice | Defaults to `claude-sonnet-4-5` |

Without `ANTHROPIC_API_KEY` the investigation still executes the same real tools
and narrates them deterministically. The badge in the panel always says which
mode is live, so a network failure mid-demo degrades visibly rather than silently.

Contributors: read [AGENTS.md](AGENTS.md) before changing the analysis or agent code.

```bash
npm run typecheck
npm test          # 9 tests over the screening arithmetic
npm run build
```

## What is real and what is not

| Real | Synthetic |
|---|---|
| NASA POWER climate normals (2001–2020, 6 cities) | The three demonstration parcels |
| PeeringDB India facilities (203 points) | The broker brief and utility note |
| geoBoundaries India ADM1 | Any "available MW" figure |
| Mapbox basemap | — |

Every synthetic element is labelled in the UI. A marker is not a development
opportunity, and proximity to a carrier facility is not available fibre.

## The rule that makes it useful

Absent evidence is **unknown**, never a pass. Contradictory evidence is **conflict**,
never a silent pick. The model chooses which tools to call and how to narrate; it
cannot supply an observation or overturn a verdict. That boundary lives in
`lib/analysis/evaluate.ts`, which is pure, versioned (`calculationVersion`) and tested.

## Using it

Pick a regional bookmark, or open the **Sites** panel and draw a polygon —
click corners, double-click to finish, Escape to cancel. Drawn and imported
shapes are validated for self-intersection, area and containment in India, and
a rejected shape stays on the map with the reason shown so you can edit it.
Every candidate is also listed in the Sites panel, so nothing needs a mouse.

## Demo path (about 3 minutes)

1. **Bhopal** bookmark — it frames Parcel A and selects it.
   Campus 20 MW → 26.0 MW full load, 1,92,000 L/day. Water **fails** (cap 1,50,000),
   power and energisation are **unknown**.
2. **Investigate** → real tools execute; NASA returns Bhopal's 34.9 °C May peak,
   PeeringDB returns NIXI Bhopal at 22 km. Before anything is ingested, the agent
   says plainly that there are no documents to weigh.
3. **Ingest broker brief + utility note** → power becomes **conflict**
   (30 MW claimed vs 12 MW conditional) and energisation **fails** (Dec 2027 vs Jun 2027).
   This is the point of the product: the contradiction is surfaced, not resolved.
4. **Modular** → 5.9 MW, 5,100 L/day. Water now passes; the contradiction does not go away.
5. **Compare** two parcels, then **Export** the JSON evidence pack.

Ask the room which constraint to tighten — the sliders recompute live.

## Architecture

```
app/api/assess        deterministic screening (server derives geography)
app/api/investigate   NDJSON stream of real tool execution; recorded fallback
lib/analysis          pure, tested arithmetic — the authority
lib/agent/tools.ts    five server-owned tools + the system prompt
lib/map/mapbox.ts     Mapbox style/sprite/glyph resolution for MapLibre
components/atlas      MapLibre canvas + mapbox-gl-draw
```

**MapLibre GL JS renders a Mapbox style.** Two things this requires, both handled in
`lib/map/mapbox.ts`: `mapbox://` URLs are rewritten to HTTP endpoints with the token,
and `projection`/`fog` are stripped from the style, because MapLibre's validator
rejects them and the map otherwise renders blank. Drawing uses
`@mapbox/mapbox-gl-draw` with its control classes shimmed onto MapLibre's.

## Known limits

- Power-network and water-stress layers are **unavailable**, not approximated.
- Climate is a coarse grid cell; beyond 400 km from a sample it reports unknown.
- Land area is gross polygon area, not net buildable.
- Screening only: no ownership, permitting, utility commitment or power-flow certification.
