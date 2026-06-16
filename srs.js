/* Local spaced-repetition engine for the Lëtzebuergesch flashcards.
 *
 * Algorithm: FSRS-4.5 (Free Spaced Repetition Scheduler) — the same modern
 * scheduler used by Anki/RemNote. Each word is modelled by Stability (days until
 * recall probability falls to the target) and Difficulty (1–10). After every
 * answer we update both and compute the next due date for the target retention.
 *
 * Everything runs on-device: per-word memory lives in localStorage, there is no
 * account, no network, and it works fully offline — matching the app's privacy model.
 *
 * Exposes a global `SRS` with the scheduler + a `store` (load/grade/dueWords/stats).
 */
(function (global) {
  'use strict';

  // ---- FSRS-4.5 core -------------------------------------------------------
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;        // = 19/81 ≈ 0.2345
  const DAY = 86400000;
  // FSRS-4.5 default parameters (a sensible prior; FSRS normally tunes these per user).
  const W = [0.4197, 1.1869, 3.0412, 15.2441, 7.1434, 0.6477, 1.0007, 0.0674,
             1.6597, 0.1712, 1.1178, 2.0225, 0.0904, 0.3025, 2.1214, 0.2498, 2.9466];
  let RETENTION = 0.9;                                 // desired recall probability

  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  // recall probability after `t` days given stability S
  function retrievability(t, S) { return Math.pow(1 + FACTOR * Math.max(t, 0) / S, DECAY); }

  function initStability(g) { return Math.max(W[g - 1], 0.1); }
  function initDifficulty(g) { return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10); }

  function nextDifficulty(D, g) {
    const dD = -W[6] * (g - 3);
    const Dp = D + dD * (10 - D) / 9;                  // linear damping
    return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * Dp, 1, 10); // mean reversion → Easy
  }
  function nextRecallStability(D, S, R, g) {
    const hard = g === 2 ? W[15] : 1;
    const easy = g === 4 ? W[16] : 1;
    return S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
      (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
  }
  function nextForgetStability(D, S, R) {
    return W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
  }

  // days until a card with stability S decays to the target retention
  function intervalDays(S) {
    const i = S / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1);
    return isFinite(i) && i > 0 ? i : 0;
  }

  // Schedule a review. `card` is the stored memory state (or null for a brand-new word),
  // `g` is the grade 1=Again 2=Hard 3=Good 4=Easy. Returns the new memory state.
  function schedule(card, g, now) {
    now = now || Date.now();
    let s, d, reps, lapses;
    if (!card || card.reps == null) {                 // first time we ever see this word
      s = initStability(g);
      d = initDifficulty(g);
      reps = 1;
      lapses = g === 1 ? 1 : 0;
    } else {
      const elapsed = (now - (card.last || now)) / DAY;
      const R = retrievability(elapsed, card.s);
      d = nextDifficulty(card.d, g);
      if (g === 1) { s = nextForgetStability(card.d, card.s, R); lapses = (card.lapses || 0) + 1; }
      else { s = nextRecallStability(card.d, card.s, R, g); lapses = card.lapses || 0; }
      reps = (card.reps || 0) + 1;
    }
    s = clamp(s, 0.1, 36500);
    d = clamp(d, 1, 10);
    const due = now + intervalDays(s) * DAY;
    return { s: +s.toFixed(4), d: +d.toFixed(3), due: Math.round(due), last: now, reps: reps, lapses: lapses };
  }

  const MATURE_DAYS = 21;                              // Anki's "mature card" threshold
  function isMature(card) { return !!card && intervalDays(card.s) >= MATURE_DAYS; }

  // ---- on-device store -----------------------------------------------------
  const KEY = 'lb_a2_srs_v1';
  let DB = { v: 1, cards: {} };
  let saveTimer = null;

  function load() {
    try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.cards) DB = r; } catch (e) {}
  }
  function save() {
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
  }
  function saveSoon() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

  function get(word) { return DB.cards[word] || null; }
  function grade(word, g, now) {
    const c = schedule(get(word), g, now);
    DB.cards[word] = c;
    saveSoon();
    return c;
  }
  // words (with a memory record) that are due now, most-overdue first
  function dueWords(now) {
    now = now || Date.now();
    return Object.keys(DB.cards)
      .filter(w => DB.cards[w].due <= now)
      .sort((a, b) => DB.cards[a].due - DB.cards[b].due);
  }
  // counts over a pool of word strings: new (unseen), learning, known (mature), due
  function stats(words, now) {
    now = now || Date.now();
    let neu = 0, learning = 0, known = 0, due = 0, seen = 0;
    for (const w of words) {
      const c = DB.cards[w];
      if (!c) { neu++; continue; }
      seen++;
      if (c.due <= now) due++;
      if (intervalDays(c.s) >= MATURE_DAYS) known++; else learning++;
    }
    return { total: words.length, new: neu, seen: seen, learning: learning, known: known, due: due };
  }
  function totals(now) {                               // global counts across everything seen
    now = now || Date.now();
    const all = Object.keys(DB.cards);
    return stats(all, now);
  }

  // flush pending writes if the page is being hidden/closed
  if (global.addEventListener) {
    global.addEventListener('pagehide', () => { if (saveTimer) save(); });
    global.addEventListener('visibilitychange', () => {
      if (global.document && global.document.visibilityState === 'hidden' && saveTimer) save();
    });
  }

  global.SRS = {
    schedule: schedule,
    intervalDays: intervalDays,
    isMature: isMature,
    retrievability: retrievability,
    setRetention: function (r) { RETENTION = clamp(r, 0.7, 0.99); },
    getRetention: function () { return RETENTION; },
    GRADE: { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 },
    MATURE_DAYS: MATURE_DAYS,
    store: { load, save, get, grade, dueWords, stats, totals, all: () => DB.cards }
  };
})(window);
