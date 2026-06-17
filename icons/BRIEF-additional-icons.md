# Icon brief — 8 additional icons (Lux Vocab pack, batch 2)

These extend the existing **Lux Vocab Icon Pack**. They must look like they belong
to the same family as the 24 icons already shipped. Match the existing pack exactly —
when in doubt, open an existing master (e.g. `light/known.svg`, `light/word-types.svg`)
and mirror its construction.

---

## Shared spec (identical to batch 1)

- **Artboard:** 24 × 24, `viewBox="0 0 24 24"`, transparent (`fill="none"`).
- **Style:** single-weight **stroke** icons. `stroke-width="2"`, `stroke-linecap="round"`,
  `stroke-linejoin="round"`. No fills except tiny accent dots.
- **Keep artwork inside ~3px padding** (live area roughly 3–21) so nothing clips when masked to a circle.
- **Two files per icon**, identical geometry — only the colours change:

| Role | Light (cream) | Dark (tactile) |
|------|---------------|----------------|
| **ink** (main strokes) | `#26312D` | `#F0E7D8` |
| **accent** (one highlight only) | `#73BDA6` (mint) | `#D86B3E` (orange) |
| secondary (optional, rare) | `#5F6C66` | `#A99A8A` |

- **Accent discipline:** the icon is drawn in **ink**; pick **one** small element per icon to
  paint in **accent** (a dot, a check, one bar, one underline). Never colour the whole icon accent.
  This is the pack's signature — see how `known.svg` keeps the ring in ink and only the checkmark is accent.
- **Deliverables per icon:** `light/<id>.svg` + `dark/<id>.svg` (and the matching PNG @1x/2x/3x if you
  regenerate the full pack). Include a `<title>` element with the label.
- **Naming:** kebab-case `id` exactly as listed below (the app references these strings).

### Worked example — copy this exactly

This is the real `due` icon already in the pack. Note: **light and dark are the same paths**;
only the three colour values change (ink + accent). Build every new icon the same way.

`light/due.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>Due</title>
  <g stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="7.6" stroke="#26312D" />
    <path d="M12 8v4.2l3 1.7" stroke="#26312D" />
    <path d="M17.8 6.8v3h-3" stroke="#73BDA6" />   <!-- the one accent element -->
  </g>
</svg>
```

`dark/due.svg` — identical geometry, ink `#26312D`→`#F0E7D8`, accent `#73BDA6`→`#D86B3E`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>Due</title>
  <g stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="7.6" stroke="#F0E7D8" />
    <path d="M12 8v4.2l3 1.7" stroke="#F0E7D8" />
    <path d="M17.8 6.8v3h-3" stroke="#D86B3E" />
  </g>
</svg>
```

---

## Where the final files go  📁

The app loads **SVG only** — no PNG needed (ignore the PNG sizes mentioned in `README.md`;
those were for the original archive). Deliver **2 SVG files per icon** into these two folders:

```
app/icons/
├── light/      ← all "light cream" variants go here   (ink #26312D, accent #73BDA6)
│   ├── progress.svg
│   ├── memory.svg
│   ├── type-text.svg
│   └── … (one .svg per icon)
└── dark/       ← all "dark tactile" variants go here   (ink #F0E7D8, accent #D86B3E)
    ├── progress.svg
    ├── memory.svg
    ├── type-text.svg
    └── … (one .svg per icon, SAME filenames as light/)
```

Full path on this machine:
`…/Luxembourgish Learning app/app/icons/light/` and `…/app/icons/dark/`

Rules for delivery:
- **Filename = the `id`** from the list below, lowercase kebab-case, `.svg` extension. Exact spelling matters — the app references these strings in code.
- The **same filename must exist in both `light/` and `dark/`** (e.g. `light/progress.svg` AND `dark/progress.svg`).
- One `<title>` per file with the human label.
- If you can't write into the project folder directly, deliver a single **`icons-batch2.zip`** containing two folders, `light/` and `dark/`, with the SVGs inside — I'll drop them into place.
- No need to touch `manifest.json` or `README.md`; I'll update those when wiring the icons in.

---

## The 8 icons

### Progress & memory (2)

**1. `progress` — "Progress"**
- *Used on:* the **Progress** button on the home screen (opens the mastery/heatmap page).
- *Depict:* a small **bar chart** — 3 rising bars (short, medium, tall) sitting on a baseline.
- *Accent:* the tallest (rightmost) bar.
- *Avoid:* pie charts, line graphs, percent signs. It must read as "how far I've come."

**2. `memory` — "Memory"**
- *Used on:* the "**X known · Y learning**" summary line (home, end-of-deck, and game screens).
- *Depict:* a simple **brain** in outline, OR a head silhouette with a small spark/star inside.
  Prefer whichever stays legible at 24px — the brain's folds should be 2–3 strokes max, not detailed.
- *Accent:* one small spark/dot representing the "remembered" idea.
- *Avoid:* anatomical detail, gears (that's `settings`), lightbulbs.

### Word-type categories (6)

These replace the emoji on the **"Word types"** filter chips on the setup screen. They sit
at ~16px next to a text label, so they must be **instantly distinct in silhouette** from each
other and from the existing `word-types` tag icon. Keep them bold and simple.

**3. `type-text` — "Text & dialogue"**
- *Depict:* a **speech bubble** with 1–2 short lines of text inside.
- *Accent:* the text lines (or one line).
- *Currently:* 💬

**4. `type-question` — "Questions & tasks"**
- *Depict:* a **question mark** inside a soft square/rounded tile, OR a clipboard with a "?".
  Prefer the question mark in a rounded square — cleanest at small size.
- *Accent:* the question mark.
- *Currently:* ❓

**5. `type-title` — "Titles & headings"**
- *Depict:* a bold **"T" / heading mark**, or two stacked lines where the **top line is short & bold**
  (a heading) and a thin line under it (body). The "big line over small line" metaphor reads best.
- *Accent:* the heading (top) line.
- *Currently:* 🔠

**6. `type-illustration` — "Illustrations"**
- *Depict:* the classic **picture frame** — a rounded square with a small mountain + sun (circle) inside.
- *Accent:* the sun (small circle).
- *Avoid:* clashing with `pages`/`flashcards` rectangles — the mountain+sun is what makes it "a picture."
- *Currently:* 🖼️

**7. `type-vocabulary` — "Vocabulary lists"**
- *Depict:* a **bulleted list** — 3 short horizontal lines each with a leading dot/bullet.
- *Accent:* the bullets (the dots).
- *Avoid:* looking identical to `type-text`; here the leading **bullets** are the key signal.
- *Currently:* 📋

**8. `type-grammar` — "Grammar"**
- *Depict:* a **set square / triangle ruler** (right-triangle drafting tool), or an "Aa" letterform.
  Prefer the set-square — it's already the metaphor the emoji 📐 used and stays unique in the set.
- *Accent:* the right-angle corner mark (a tiny square in the corner).
- *Currently:* 📐

---

## Optional 9th

**`type-other` — "Other"** — currently the chip uses a plain "···" ellipsis, which already
fits the minimalist look, so a custom icon is **optional**. If made: three dots in a row,
the middle dot in accent.

---

## Complete file manifest — 16 files (18 if you make `type-other`)

Every row = two files with the **same name**, one in `light/`, one in `dark/`.

| # | `id` (filename, no ext) | `<title>` | Replaces |
|---|---|---|---|
| 1 | `progress` | Progress | 📊 |
| 2 | `memory` | Memory | 🧠 |
| 3 | `type-text` | Text & dialogue | 💬 |
| 4 | `type-question` | Questions & tasks | ❓ |
| 5 | `type-title` | Titles & headings | 🔠 |
| 6 | `type-illustration` | Illustrations | 🖼️ |
| 7 | `type-vocabulary` | Vocabulary lists | 📋 |
| 8 | `type-grammar` | Grammar | 📐 |
| 9 *(optional)* | `type-other` | Other | ··· |

So the delivery is: `light/progress.svg`, `dark/progress.svg`, `light/memory.svg`,
`dark/memory.svg`, … through `type-grammar` — **16 SVG files** (each name appearing once in
`light/` and once in `dark/`).

---

## Acceptance checklist

- [ ] All 16 files present: every `id` exists in **both** `light/` and `dark/`.
- [ ] Filenames are exact, lowercase kebab-case, matching the manifest.
- [ ] Same geometry in light & dark; only ink/accent colours differ (see `due` example).
- [ ] Correct colours — light: ink `#26312D` / accent `#73BDA6`; dark: ink `#F0E7D8` / accent `#D86B3E`.
- [ ] Exactly **one** accent element per icon.
- [ ] Reads clearly at **16px** and inside a **circle mask** (artwork within ~3px padding).
- [ ] The 6 `type-*` icons are distinguishable by silhouette alone (squint test).
- [ ] `<title>` set in each file.

---

## Questions / handoff

Drop the SVGs into `app/icons/light/` and `app/icons/dark/` (or send `icons-batch2.zip`).
The developer wires them into the UI from there — no code knowledge needed on your side.
