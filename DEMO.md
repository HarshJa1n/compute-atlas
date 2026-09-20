# Demo runbook

Three flows. Flow 1 alone is a complete story; add 2 and 3 as time allows.
Reset between runs with a page refresh.

**Before you start:** open at ≥1280px wide, confirm the panel rail is open
(**◀ Panel**), and check the investigation badge says **LIVE MODEL** on the
first run. If it says *recorded run*, `ANTHROPIC_API_KEY` is not loaded —
say so rather than implying the model is running.

---

## Flow 1 — The contradiction (about 3 minutes)

The core argument. Everything else is optional.

1. **Open on India.** Blue dots are real PeeringDB carrier facilities. Say the
   line: *"Before you build an AI factory, prove the site can support it."*
2. **Click "Bhopal".** The camera frames a candidate parcel and selects it.
   Point out the **SYNTHETIC FIXTURE** badge — nothing here pretends to be a
   real land offer.
3. **Read the dossier.** 20 MW IT becomes **26.0 MW** at full load (utilisation
   is excluded deliberately — the connection must carry peak) and
   **1,92,000 L/day**. Water says **Not met**. Power and energisation say
   **Unknown** — *not* a pass, and not an estimate.
4. **Investigate.** Tools execute live: NASA POWER returns Bhopal's 34.9 °C May
   peak, PeeringDB returns NIXI Bhopal at 22 km. The agent states plainly that
   no documents have been ingested, so those verdicts rest on parcel attributes.
   The button becomes **Reinvestigate** and shows what the run used.
5. **Docs tab → Load demo pair.** Two synthetic documents are extracted with
   paragraph references. The utility's figures are marked **qualified** because
   the document disclaims them.
6. **The point.** Power flips to **Conflict** — the broker's 30 MW against the
   utility's 12 MW. The system refuses to choose. *"A spreadsheet would have
   silently taken one of these numbers."* The banner now warns the narrative is
   stale; hit **Reinvestigate** and the agent names both figures, cites
   paragraphs, and declines to rank the sources.

## Flow 2 — The scenario that does not rescue you (1 minute)

7. **Project tab → Modular.** Demand drops to **5.9 MW** and **5,100 L/day**.
   Water flips to **Supported** — the Scenario runs panel logs it as a new
   version and lists the changed finding.
8. **Say the important part:** the water problem was solved by shrinking the
   project. The power contradiction and the December 2027 energisation date did
   not move. *Earlier runs are preserved, so nothing was quietly rewritten.*

**Audience prompt:** *"Which constraint should we tighten — water, power or the
opening date?"* Drag that slider live; every figure recomputes and versions.

## Flow 3 — Their site, their document (1–2 minutes)

9. **✎ Draw a site** on the map — click corners, double-click to finish. Draw a
   deliberately bad one first (a country-sized shape, or a crossing outline):
   it is rejected with the reason and stays editable.
10. Draw a sensible one. It is screened immediately, appears in the candidate
    list, and most criteria read **unknown** — which is the honest answer
    outside prepared coverage.
11. **Docs → Upload PDF or text.** Use a real utility or broker PDF if the
    audience offers one. Claims are extracted with paragraph numbers; two
    documents disagreeing produce a conflict automatically.
12. **Report** opens a printable evidence pack: criteria, unresolved checks with
    owners, extracted claims, scenario history and sources. **JSON** exports the
    same snapshot as data.

---

## Lines worth having ready

- **Why unknown matters:** *"Absent evidence is unknown, never a pass. That rule
  lives in tested code, not in the prompt, so the model cannot talk its way
  past it."*
- **What the model does:** *"It chooses which tools to call and how to explain
  the result. It cannot supply an observation or overturn a verdict."*
- **On the synthetic data:** *"The parcels and both documents are fictional and
  labelled. The climate, carrier facilities and boundaries are real."*
- **On scope:** *"This is screening that decides where diligence money goes. It
  is not a permitting opinion or a utility commitment."*

## If something breaks

- **Provider down:** the run falls back to a labelled **recorded run** using the
  same real tools. Say that out loud; it is designed behaviour, not a save.
- **Tiles fail:** candidate outlines, the dossier and all arithmetic still work.
- **Anything stalls:** Escape cancels drawing, then clears an error, then the
  comparison, then the selection. A refresh returns a clean state.

## Known limits, if asked

No persistence — a refresh clears the session. No presentation mode. Transmission
and water-stress layers are deliberately absent rather than approximated, and
they are named in the Layers tab so the gap is visible.
