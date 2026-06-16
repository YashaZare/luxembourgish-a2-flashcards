/* Progress aggregation for the book heatmap.
 *
 * Turns the per-word SRS memory (srs.js) into per-page, per-lesson, per-word-type and
 * whole-book mastery scores. Pure, on-device, recomputed lazily and cached until the next
 * grade. Reads the globals `state` (flashcards data) and `SRS` defined by the other scripts.
 *
 * Mastery model (per word):
 *   depth = ln(1+interval) / ln(1+21)        durability, saturates at the 21-day mature gate
 *   base  = depth * (0.5 + 0.5*R)            R = current recall probability (overdue → weaker)
 *   leech = 1 - 0.4*(1 - e^(-lapses/4))      chronic forgetting drags the score down
 *   m     = clamp(base*leech, 0, 1)          unseen words have no m (null)
 * A group's score = mean of m over its words with unseen counted as 0 (so colour reflects
 * both coverage and strength).
 */
(function (global) {
  'use strict';
  const DAY = 86400000;
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
  const LN_MATURE = Math.log(1 + 21);
  const MIN_CONF = 4;            // pages with fewer words can't be scored confidently → grey

  function masteryOf(card, now) {
    if (!card) return null;                              // unseen
    const I = SRS.intervalDays(card.s);
    const depth = clamp(Math.log(1 + I) / LN_MATURE, 0, 1);
    const R = SRS.retrievability((now - (card.last || now)) / DAY, card.s);
    const base = depth * (0.5 + 0.5 * R);
    const leech = 1 - 0.4 * (1 - Math.exp(-(card.lapses || 0) / 4));
    return clamp(base * leech, 0, 1);
  }
  function classify(card, now) {
    if (!card) return { state: 'new', m: 0, seen: false, due: false, struggling: false };
    const known = SRS.intervalDays(card.s) >= SRS.MATURE_DAYS;
    return {
      state: known ? 'known' : 'learning', seen: true,
      m: masteryOf(card, now),
      due: card.due <= now,
      struggling: (card.lapses || 0) >= 3 && !known
    };
  }

  function emptyBucket() { return { total: 0, seen: 0, new: 0, learning: 0, known: 0, due: 0, struggling: 0, sumM: 0 }; }
  function bump(b, k) {
    b.total++;
    if (!k.seen) { b.new++; return; }
    b.seen++; b.sumM += k.m;
    if (k.state === 'known') b.known++; else b.learning++;
    if (k.due) b.due++;
    if (k.struggling) b.struggling++;
  }
  function finalize(b) {
    b.score = b.total ? b.sumM / b.total : null;         // unseen counted as 0
    b.coverage = b.total ? b.seen / b.total : 0;
    b.strength = b.seen ? b.sumM / b.seen : null;
    b.confident = b.total >= MIN_CONF;
    return b;
  }
  // bucket name for the colour scale (precedence: unseen → low-confidence → score tier)
  function bucketOf(b) {
    if (!b || b.total === 0 || b.coverage === 0) return 'unseen';
    if (!b.confident) return 'low';
    const s = b.score;
    if (s < 0.25) return 'started';
    if (s < 0.55) return 'learning';
    if (s < 0.82) return 'strong';
    return 'mastered';
  }

  // page → lesson index, built once from lessonRanges
  function pageToLesson() {
    const d = state.data;
    if (d._p2l) return d._p2l;
    const map = {}, lr = d.lessonRanges || [];
    lr.forEach((r, i) => { for (let p = r[0]; p <= r[1]; p++) map[p] = i; });
    d._p2l = map; return map;
  }

  function compute(now) {
    now = now || Date.now();
    const d = state.data, p2l = pageToLesson();
    const book = emptyBucket();
    const pages = {}, types = {};
    const lessons = (d.lessonRanges || []).map(r => Object.assign(emptyBucket(), { name: r[2], a: r[0], b: r[1] }));
    for (const c of d.cards) {
      const card = SRS.store.get(c.w);
      const k = classify(card, now);
      bump(book, k);                                     // distinct words
      for (const p of c.pg) { (pages[p] || (pages[p] = Object.assign(emptyBucket(), { page: p, lesson: p2l[p] }))); bump(pages[p], k); }
      const lset = new Set();                            // one card counts once per lesson
      for (const p of c.pg) { const li = p2l[p]; if (li != null) lset.add(li); }
      lset.forEach(li => bump(lessons[li], k));
      for (const t of (c.ty || [])) { (types[t] || (types[t] = Object.assign(emptyBucket(), { type: t }))); bump(types[t], k); }
    }
    finalize(book);
    for (const p in pages) finalize(pages[p]);
    lessons.forEach(finalize);
    for (const t in types) finalize(types[t]);
    return { computedAt: now, book, pages, lessons, types };
  }

  // aggregate an arbitrary subset of cards (drill-down scopes, word-type groups)
  function bucketFor(pred, now) {
    now = now || Date.now();
    const b = emptyBucket();
    for (const c of state.data.cards) { if (!pred(c)) continue; bump(b, classify(SRS.store.get(c.w), now)); }
    return finalize(b);
  }

  let _cache = null, _dirty = true;
  global.Progress = {
    get: function () { if (_dirty || !_cache) { _cache = compute(); _dirty = false; } return _cache; },
    invalidate: function () { _dirty = true; },
    masteryOf: masteryOf, classify: classify, bucketOf: bucketOf, finalize: finalize, emptyBucket: emptyBucket,
    bucketFor: bucketFor,
    BUCKETS: ['unseen', 'low', 'started', 'learning', 'strong', 'mastered']
  };
})(window);
