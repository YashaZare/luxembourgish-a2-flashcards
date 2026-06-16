export const meta = {
  name: 'flashcard-bugsweep',
  description: 'Review the flashcard web app from multiple lenses for bugs and inconsistencies',
  phases: [{ title: 'Review', detail: '5 lenses: logic, iPhone UX, a11y, data integrity, robustness/security' }],
}

const APP = "/Users/yashazare/Client/Live Production/Claude Code/Luxembourgish Learning app/app"

const LENSES = [
  { key: 'logic', focus: `FUNCTIONALITY & LOGIC. Trace the full flow in app.js: data load, deck filtering (page range, type groups↔individual sync, language selection, only-translated), study navigation (flip, next/prev, got/again, swipe, keyboard), done screen, review-missed, restart, persistence (localStorage save/restore). Hunt for: off-by-one, empty-deck / single-card / last-card edge cases, filters that can produce 0 cards with a confusing UI, state that doesn't reset between decks, group/individual type-chip desync, slider/number-input desync, restore overwriting valid state. Also verify the type GROUP→types mapping in app.js covers ALL 23 types present in the data (read app/data/flashcards.json "types").` },
  { key: 'iphone', focus: `iPHONE / MOBILE UX & CSS. Review index.html + styles.css. Check: viewport-fit=cover + safe-area insets used correctly (notch / home indicator), tap targets >=44px, no 300ms delay / double-tap zoom, inputs don't trigger iOS zoom (font-size>=16px on inputs), the .flash card 3D flip works on Safari (backface-visibility -webkit prefixes), card sizing on small screens (iPhone SE 375x667) and large (Pro Max), the empty vertical whitespace below the card, overscroll/bounce, sticky start-bar over content, dark AND light mode both legible. Flag any CSS that breaks on Safari.` },
  { key: 'a11y', focus: `ACCESSIBILITY. Review index.html + app.js. Check: color contrast (muted text on panels), interactive elements are real buttons / have aria-labels, the flashcard is operable by keyboard and announced, chips/toggles have pressed state exposed, focus visible, language/screen changes announced, the range inputs labelled, prefers-reduced-motion for the flip animation. List concrete fixes.` },
  { key: 'data', focus: `DATA INTEGRITY. Read app/data/flashcards.json (use head/python for size) and app/build_app_data.py and confirm the app.js consumer matches the producer: field names (w,f,pg,ty,ls,tr,pos,ip,ex), langs list, every type in cards.ty is mappable to a UI group, lessons order, page min/max, that "only translated" + language filter logic is correct, and that words with NO translation are handled on the card back. Flag any schema mismatch or words that would render blank/broken.` },
  { key: 'robust', focus: `ROBUSTNESS & SECURITY. Review app.js. Check: all user/data text inserted via innerHTML is escaped (XSS — esc()/escapeEmph usage; is escapeEmph safe?), fetch error handling (offline / 404 data), JSON parse failure, no crash if a card lacks tr/ex/ip/pos/ls/pg, localStorage in private mode (try/catch), regex built from word in escapeEmph is anchored/escaped, no console errors. Flag concrete issues.` },
]

function prompt(l) {
  return `You are reviewing a vanilla-JS flashcard web app (no framework, no build step) in this folder: ${APP}
Files: index.html, app.js, styles.css, build_app_data.py, data/flashcards.json.

Read the relevant files and review STRICTLY through this lens:
${l.focus}

Report ONLY real, concrete issues (not style opinions). For each: a severity (high/medium/low), the file + rough location, the problem, and a specific fix. If something is actually fine, don't pad the list. Be precise — these findings will be applied directly.`
}

const SCHEMA = {
  type: 'object', required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'object',
      required: ['severity', 'where', 'problem', 'fix'],
      properties: {
        severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
      } } },
    notes: { type: 'string' },
  },
}

log(`Bug-sweeping the flashcard app across ${LENSES.length} lenses.`)
const results = await parallel(LENSES.map(l => () =>
  agent(prompt(l), { label: `review:${l.key}`, phase: 'Review', schema: SCHEMA })
    .then(r => ({ ...r, lens: l.key }))))

const clean = results.filter(Boolean)
const all = []
for (const r of clean) for (const f of (r.findings||[])) all.push({ lens: r.lens, ...f })
const bySev = s => all.filter(f => f.severity === s)
return {
  lensesDone: clean.length,
  totalFindings: all.length,
  high: bySev('high'), medium: bySev('medium'), low: bySev('low'),
}
