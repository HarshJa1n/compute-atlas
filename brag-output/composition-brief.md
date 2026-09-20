# Hyperframes Composition Brief: Compute Atlas

## Objective
Create a short, polished launch video for Compute Atlas, an evidence-backed site-screening workspace for Indian AI data centres.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 22 seconds

## Source Material
- Project root: `/Users/appointy/code/Compute Atlas`
- Primary files read: `README.md`, `AGENTS.md`, `lib/analysis/evaluate.ts`, `lib/agent/tools.ts`, `components/atlas/Atlas.tsx`, `tailwind.config.ts`, live screenshots in `presentations/shots/`
- Product name: Compute Atlas
- Tagline / strongest claim: "Before you build an AI factory, prove the site can support it." · "Absent evidence is unknown, never a pass."
- Key UI or visual moment to recreate: the compare tray row "Grid capacity at full load · Conflict · two sources disagree" and its footer "No overall score is produced."
- Copy that must appear verbatim:
  - Every AI prompt has a physical address.
  - Prove the site can support it.
  - 26.0 MW at full load
  - 1,92,000 litres of water a day
  - Fails a supplied requirement
  - Two sources disagree.
  - No overall score is produced.
  - Compute Atlas
  - Absent evidence is unknown, never a pass.

## Creative Direction
- Tone preset: polished
- Creative direction: an instrument, not a pitch. Restraint as confidence.
- Interpretation: five scenes, long holds, slow crossfades (0.6–0.8 s), one line at a time, no stat-card spam, no exclamation marks.
- Angle: every other siting tool gives you a score; Compute Atlas refuses to. The video is built around the one moment that proves it, two documents about the same parcel that disagree, shown as a conflict instead of hidden in a number.
- Hook: "Every AI prompt has a physical address." then "Prove the site can support it."
- Outro / punchline: "Compute Atlas" with "Absent evidence is unknown, never a pass."
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals, waveforms, particles
  - Restyling the product; use its own palette

## Visual Identity
- Background: #09131C
- Surface: #122330
- Text: #F0F5F7 · muted #A8BAC7
- Accent: #43DFC3 (teal)
- Semantic: #FFCC75 (unknown), #FF8E91 (fail), #7EBBFF (conflict/info)
- Display font: system sans stack (Inter if present, else -apple-system / Helvetica Neue / Arial); no remote font load
- Body font: same family, weight 400
- Visual references from the project: `assets/img/india.png` (national map, 203 facility points), `assets/img/parcel.png` (Bhopal dossier with derived demand), `assets/img/compare.png` (compare tray with Conflict row)

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 4 s — two lines of copy, dark frame, soft radial teal glow.
2. The map — 5 s — full-bleed India screenshot with slow push, label strip, punch-in begins on the 8.74 s cue.
3. The parcel — 5 s — dossier screenshot framed right; three captions arrive on alternate beats (~9.8, 10.9, 12.0 s) and hold.
4. The conflict — 5 s — compare tray punched in; Conflict row spotlit on the 17.47 s cue; footer quoted in teal.
5. Outro — 3 s — name and sub-line; music fades.

## Audio
- Audio role: warm, steady bed under a restrained edit
- Audio arc: bed in at 0, constant at 0.30, three soft drops in scene 3, one soft bell in scene 4, fade out over the final 1.5 s
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: volume 0.30, fade out 20.5–22.0 s via a volume automation lane
- Music cue guidance: bundled preset read (`happy-beats-business-moves-vol-12…music-cues.md`); tempo ~110 BPM; strong cues 8.74, 13.11, 17.47, 18.56 s; beat grid ~0.55 s. Lock the map punch-in to 8.74 s and the Conflict spotlight to 17.47 s. Captions in scene 3 on alternate beats.
- Audio-reactive treatment: subtle; music RMS/bass modulates the hero glow opacity and the teal outline glow. No waveform or equaliser visuals.
- Audio-coupled moments:
  - Scene 3 captions — beat-grid reveal with `interface/drop_001` / `drop_002` at 0.6
  - Scene 4 Conflict spotlight — `impact/impactBell_heavy_000` at 0.55 on the 17.47 s cue
  - Scene 5 — music fade only
- SFX selection guidance: soft, low high-frequency-risk cues only; sound and motion land together.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md`
- Exact SFX choice: chosen above after the visual plan; volumes 0.55–0.65.
- Audio files: copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Follow `hyperframes-core` (single paused timeline, `data-*` timing, media rules), `hyperframes-animation` (fromTo entrances, finite repeats), `hyperframes-keyframes` (punch-in on a non-timed wrapper), `hyperframes-cli` (`check` before render).

Requirements:
- Show at least one real UI element from the project (three screenshots are used).
- Keep all text readable; captions hold ≥1.1 s.
- 22 seconds total.
- Include music and the planned sparse SFX.
- Run `npx hyperframes check` before render.
