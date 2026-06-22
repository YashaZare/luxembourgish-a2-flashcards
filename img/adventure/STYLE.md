# Lëtzebuerg Vivid Flat-Shade Style Guide

Status: full regeneration style. Regenerate every asset from the milestone tables with this vivid palette; do not keep earlier dull/experimental artwork as final.

## Source References Reviewed

- `BOOK-MILESTONES.md`, including sections 1-14 and the full A1/A2 milestone tables.
- A1 scanned course book pages from the provided split PDFs: cover, chapter openers, vocabulary spreads, culture pages, restaurant, grammar/reference pages.
- A2 scanned course book pages from the provided PDF: station/city, housing/housework, clothing/dress code, travel, neighbourhood, and pharmacy/health spreads.

The books provide subject matter and Luxembourg flavour only. Their mixed photo/textbook rendering is not copied.

## Locked Design System

STYLE: vivid flat 2D vector illustration, friendly, chunky, geometric, one cohesive corporate-ID look. Use clean cell-shading with hard crisp edges: each color may have 2-3 discrete flat tonal steps only. Bright, saturated, cheerful, premium, and readable at small node size. No smooth gradients, no airbrush, no texture, no grain, no noise, no photographic detail. Avoid muted, muddy, beige-heavy, greyed-out, or dead colors.

## Emblem Constants

- Canvas: 1024x1024 square.
- Background: pure white `#FFFFFF` only outside the coin, especially in the corners.
- Coin: flat cream circular disc `#FFF6E9`, filling about 88% of the frame.
- Subject: exactly one iconic subject, optically centered, filling about 78% of frame.
- Shape language: circles, rounded rectangles, rounded-tip triangles; generous rounded corners; zero sharp points.
- Complexity: simplify to about 6-10 chunky shapes.
- View: head-on flat elevation. No 3/4 view, no isometric view, no perspective tilt.
- Shading: 2-3 discrete flat tonal steps per color, crisp edges between tones.
- Shadow: one simple horizontal pill contact-shadow on the cream coin, `#EAD7B8`; never grey/black and never spilling onto the white background.
- Outline: none, or a single thin ink keyline `#33312E` with rounded joins where needed.
- Interior whites: never use pure white inside the art; use cream instead so Illustrator Ignore White only removes the outside background.
- Forbidden: text, letters, numbers, words, logos, watermarks, UI, frames, borders, labels, signs, photographic detail, multiple unrelated objects.
- Vividness: choose bright, clean color blocks. Push contrast between subject and cream coin. Every emblem should feel lively, playful, and app-store polished.

## Hero Constants

- Canvas: 1536x1024 landscape.
- Same flat-shade style.
- A tiny 2-3 element scene on a soft cream field.
- Raster WebP output; vectorization optional.
- No text, letters, numbers, words, logos, watermarks, UI, frames, borders, labels, or readable signs.

## Palette

Use at most about five base hues per asset. Each base hue may use its discrete shade steps. Prefer saturated base colors over muted variants.

- Amber: `#FFB72C`
- Deep-Amber: `#F27A22`
- Teal: `#13B8A6`
- Cream: `#FFF6E9`
- Ink: `#33312E`
- Fresh Green: `#7ED957`
- Coral: `#FF5F4F`
- Sky Blue: `#39BDF8`
- Violet: `#8B5CF6`
- Rose: `#FF6FAE`
- Slate: `#4F7EA8`

Amber is the signature accent in every asset.

## Chapter Accents

### A1

- Kapitel 1, First Contact: sky-blue
- Kapitel 2, Numbers, Dates & Your ID: violet
- Kapitel 3, At Work: steel-blue
- Kapitel 4, Daily Routine & Free Time: green
- Kapitel 5, At the Supermarket: tomato-red
- Kapitel 6, Family & Friends: rose

### A2

- Kapitel 1, Downtown: teal
- Kapitel 2, Housing & Home: terracotta
- Kapitel 3, A Day in the Life: indigo
- Kapitel 4, Dress Up: magenta
- Kapitel 5, Travel Tales: turquoise
- Kapitel 6, The Neighbourhood: olive
- Kapitel 7, Healthy Living: mint
- Kapitel 8, Final Skills: slate

## Prompt Block

```
STYLE: vivid flat 2D vector illustration, friendly + chunky + geometric, ONE single subject, on a plain pure-white background. Bright, saturated, cheerful, premium mobile-game look. Avoid dead, muddy, greyed-out, beige-heavy, or washed-out colors.
CANVAS: 1024x1024. Subject optically centered, fills ~78% of frame - a tomato and a tall signpost must read as the SAME visual size every time.
COMPOSITION: the subject sits on a flat CREAM circular coin/disc (#FFF6E9) that fills ~88% of the frame. The coin is the only floor. Pure white (#FFFFFF) appears ONLY in the corners outside the coin.
SHADING: clean CELL-SHADING - each colour may use up to 3 DISCRETE flat tonal steps (base + a darker shade for form/shadow + an optional lighter plane), with crisp edges between tones. Rich, vivid, and vector-clean. NO smooth gradients, NO airbrush, NO texture, NO grain, NO noise, NO photographic detail.
SHADOW: simple shaped shadows are welcome, but keep them ON the cream coin, never spilling onto the white background. The unifying device is one soft horizontal pill contact-shadow on the coin (colour #EAD7B8) - never grey, never black.
OUTLINE: none, OR one uniform thin Ink keyline (#33312E, ~6px @1024, rounded joins) only where a shape would otherwise be lost. Never pure black.
PALETTE: max ~5 BASE hues per emblem (each may use its 2-3 discrete shade steps), chosen from {Amber #FFB72C, Deep-Amber #F27A22, Teal #13B8A6, Cream #FFF6E9, Ink #33312E, Fresh Green #7ED957, Coral #FF5F4F, Sky Blue #39BDF8, Violet #8B5CF6, Rose #FF6FAE, Slate #4F7EA8}. Amber is the constant signature accent; lean the rest toward this chapter's accent hue. Use vivid, clean, saturated colors.
SHAPE: built from circles, rounded rectangles, rounded-tip triangles. Generous rounded corners, ZERO sharp points. Simplify to ~6-10 shapes, chunky.
PERSPECTIVE: head-on flat elevation. No 3/4 view, no isometric, no perspective tilt.
PEOPLE (only if the subject needs them): simplified geometric faces (two dot eyes, simple smile), ~4 heads tall, diverse skin from {#F2C49B, #C68642, #8D5524}. Same face system every time.
NEVER: text, letters, numbers, words, logos, watermarks, UI, frames/borders, photographic detail, multiple unrelated objects.
```
