# Brag Plan: Compute Atlas

## What is this app?
A geographic workspace for screening Indian AI data-centre sites: draw land, state a workload, and get a verdict per requirement that says pass, fail, unknown or conflict, with an agent that investigates the gaps using real tools and never invents a number.

## The angle
Every other siting tool gives you a score. Compute Atlas refuses to. The video is built around the one moment that proves the point: two documents about the same parcel disagree (a broker says 30 MW, a utility says 12 MW conditional) and the product shows the contradiction instead of hiding it. The confidence of the video comes from what it will not say.

## Hook (first 2-3 seconds)
Dark frame. One line settles in: **"Every AI prompt has a physical address."** Then a beat: **"Prove the site can support it."** No logo yet.

## Key moments (the middle)
- The map of India with 203 carrier-facility points and three labelled synthetic parcels, then a punch-in on the Bhopal parcel.
- The dossier's derived-demand cards: 26.0 MW, 1,82,208 MWh, 1,92,000 L/day, arriving one by one from real screenshots.
- The verdict language: four state chips, Pass, Fail, Unknown, Conflict, then the compare tray where "Grid capacity at full load" reads **Conflict, two sources disagree** and the footer says "No overall score is produced."

## Outro / punchline
"Before you build an AI factory, prove the site can support it." Then the name: **Compute Atlas**, with a quiet sub-line: *Absent evidence is unknown, never a pass.*

## User flow worth showing
Pick the Bhopal parcel → read derived demand and the "Fails a supplied requirement" status → ingest two synthetic documents and see power flip to Conflict → compare two parcels on identical criteria with no overall score. Shown through real screenshots of the running prototype, punched in on the relevant panel.

## Tone
- Preset: polished
- Creative direction: an instrument, not a pitch. Charcoal map, teal selection, amber unknowns, red failures. Restraint as confidence.
- Interpretation: 5 scenes, longer holds, slow crossfades, one line of copy at a time, no exclamation marks, no stat-card spam.

## Format: landscape — 1920x1080
## Duration: 22 seconds

## Visual identity (from the project)
- Background: #09131C (tailwind `bg`)
- Surface: #122330
- Accent: #43DFC3 (teal, active selection)
- Text: #F0F5F7 · muted #A8BAC7
- Semantic: unknown/caution #FFCC75 · fail/conflict-red #FF8E91 · info/conflict-blue #7EBBFF
- Display font: Inter (project) → fall back to system sans (`-apple-system, Inter, Helvetica Neue, Arial`) with no remote font load
- Body font: same family, lighter weight
- Strongest visual element: the dark India map with facility points; the dossier's derived-demand cards; the compare tray's "Conflict · two sources disagree" row

Source screenshots (1600x900, live prototype): `presentations/shots/01-india.png`, `02-bhopal-campus.png`, `06-compare.png`, `09-modular.png`.

## Share copy (draft)
Compute Atlas: draw land in India, state the AI workload, and see which requirements the evidence supports. Unknown stays unknown. Two sources that disagree stay a conflict. No score.

## Audio direction
- Role: warm, steady bed under a restrained edit
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and clean; the polished pick)
- Music treatment: start at 0, volume 0.30, fade out over the final 1.5 s under the logo
- Music cue guidance: bundled preset read. Tempo ~110 BPM. Strong cues in window: 8.74 s, 13.11 s, 17.47 s, 18.56 s. Beat grid ~0.55 s apart. Target the map punch-in near 8.74 s and the Conflict reveal near 17.47 s. Sequential text (three demand cards) holds at every other beat, ~1.1 s apart, then the full set holds.
- Audio-reactive treatment: subtle; music RMS may make the map glow and the teal selection outline breathe slightly. No waveform or equaliser visuals.
- SFX posture: sparse. Two or three soft cues: a gentle drop on each demand card, one soft bell when Conflict lands, nothing on the outro.
- Audio-coupled moments: demand cards arriving in sequence; the Conflict chip landing; the final logo fade.
- Restraint rule: no punches, no glitches, no clicks on every element. Music never above 0.35.

## Storyboard

### Scene 1 — Hook — 4s (0.0–4.0)
Black-to-charcoal frame. "Every AI prompt has a physical address." fades up in large light type, holds ~1.6 s. Second line "Prove the site can support it." fades in beneath in teal. Both hold until 4.0.
Sequential/interaction: two lines, one after the other.
Audio intent: the bed enters softly; nothing else.
Audio-coupled idea: none.
Music: bed starts at 0, volume 0.30.
Transition mood: soft crossfade → Scene 2

### Scene 2 — The map — 5s (4.0–9.0)
Full-bleed screenshot of the India view (`01-india.png`), scaled to fill with a slow push-in. Facility points visible. Lower-left label: "203 carrier facilities · 6 regional anchors · 3 labelled synthetic parcels". At ~8.7 s (strong cue) a punch-in toward central India begins, carrying into Scene 3.
Sequential/interaction: slow camera push, then punch-in.
Audio intent: steady bed; the punch-in lands on the 8.74 s cue.
Audio-coupled idea: beat-locked punch-in start.
Transition mood: continuous camera move / crossfade → Scene 3

### Scene 3 — The parcel — 5s (9.0–14.0)
Screenshot of the Bhopal parcel dossier (`02-bhopal-campus.png`), framed on the right-hand dossier. Three demand cards are highlighted one by one with a teal underline as captions appear beneath: "26.0 MW at full load", "1,92,000 litres of water a day", "Fails a supplied requirement". Each caption holds ≥1.1 s.
Sequential/interaction: yes, three captions in sequence, every other beat (~9.8, 10.9, 12.0 s), then the set holds.
Audio intent: three soft drops matching the captions.
Audio-coupled idea: beat-grid captions with soft drop SFX.
Transition mood: soft crossfade → Scene 4

### Scene 4 — The conflict — 5s (14.0–19.0)
Screenshot of the compare tray (`06-compare.png`) punched in on the comparison rows. Row "Grid capacity at full load · Conflict · two sources disagree" is spotlighted with a soft dim on everything else. Caption above: "30 MW claimed. 12 MW conditional. Two sources disagree." Then the tray's own footer line is quoted verbatim in teal: "No overall score is produced."
Sequential/interaction: spotlight lands on the row, caption then footer quote.
Audio intent: one soft bell as Conflict lands on the 17.47 s cue.
Audio-coupled idea: beat-locked Conflict reveal.
Transition mood: soft crossfade → Scene 5

### Scene 5 — Outro — 3s (19.0–22.0)
Charcoal frame. "Compute Atlas" in large type, teal dot before the name as in the app header. Sub-line: "Absent evidence is unknown, never a pass." Hold. Music fades over the last 1.5 s.
Sequential/interaction: name, then sub-line.
Audio intent: bed fades out under the name.
Audio-coupled idea: none.
Transition mood: hold to end.

**Music mood for this video:** steady, clean, corporate-adjacent (vol-12), low.
**Audio summary:** a single warm bed at 0.30 with three soft drops for the demand captions and one bell on the Conflict reveal, fading out under the name.
