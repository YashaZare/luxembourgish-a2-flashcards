'use strict';
/* Lëtzebuergesch Flashcards — A2. Vanilla JS, no build step. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Group the 23 source types into friendly toggles.
const TYPE_GROUPS = [
  { key: 'text',    icon: 'type-text',         label: 'Text & dialogue', types: ['dialogue','narration','explanation','example'] },
  { key: 'q',       icon: 'type-question',     label: 'Questions & tasks', types: ['question','instruction'] },
  { key: 'title',   icon: 'type-title',        label: 'Titles & headings', types: ['title','subtitle','section-heading','topic-heading'] },
  { key: 'illus',   icon: 'type-illustration', label: 'Illustrations', types: ['illustration-text','label','caption'] },
  { key: 'vocab',   icon: 'type-vocabulary',   label: 'Vocabulary lists', types: ['vocabulary','word-list-item'] },
  { key: 'grammar', icon: 'type-grammar',      label: 'Grammar', types: ['grammar-term','grammar-example','table-cell','table-header'] },
  { key: 'other',   icon: null,                label: '⋯ Other', types: ['footnote','page-number-word','answer-key','other'] },
];

const state = {
  data: null,
  selTypes: new Set(),
  selLangs: new Set(['en']),
  deck: [], idx: 0, flipped: false,
  range: null, // {a,b} pages being studied
  results: {}, // word -> 'got' | 'miss'
  audioMode: 1, // audio mode: 0 = silent (tap to play) · 1 = auto-play · 2 = listening-first
  reverse: false, // reverse direction: meaning → Lëtzebuergesch
  theme: 'tactile', // visual theme: 'tactile' (default) | 'clay'
  gameMode: 'countdown', // match game: 'countdown' (beat the clock) | 'attack' (no losing, race for a best time)
  book: 'a2', // selected book/level: 'a2' (default) | 'a1'
};

// friendly labels for the occurrence types shown on a card
const TYPE_LABEL = {
  'dialogue':'dialogue','narration':'text','explanation':'text','example':'example',
  'question':'question','instruction':'task','title':'title','subtitle':'subtitle',
  'section-heading':'heading','topic-heading':'heading','illustration-text':'illustration',
  'label':'label','caption':'caption','vocabulary':'vocab list','word-list-item':'vocab list',
  'grammar-term':'grammar','grammar-example':'grammar','table-cell':'table','table-header':'table',
  'footnote':'footnote','page-number-word':'page number','answer-key':'answer key','other':'other',
};
function typeLabels(types){
  const seen=[]; types.forEach(t=>{ const l=TYPE_LABEL[t]||t; if(!seen.includes(l)) seen.push(l); });
  return seen;
}

const LS = 'lux-fc-settings';

const DATA_VERSION = '9';  // bump when flashcards.json changes (cache-busts the data URL)
// Selectable books (same language/dictionary; per-word SRS memory is shared, but
// adventure-map stars + match best-times are namespaced per book — see starsKey/bestKey).
const BOOKS = {
  a2: { file:'flashcards.json',    v:'9', label:'A2', tag:'Mëttelstuf' },
  a1: { file:'flashcards-a1.json', v:'1', label:'A1', tag:'Ufänger' },
};
function curBook(){ return BOOKS[state.book] || BOOKS.a2; }
function bestKey(n){ return 'lb_match_best_'+(state.book==='a1'?'a1_':'')+n; }   // A2 keeps original key

async function loadBook(book){
  const b = BOOKS[book] || BOOKS.a2;
  const res = await fetch('data/'+b.file+'?v='+b.v, {cache:'force-cache'});
  if(!res.ok) throw new Error('HTTP '+res.status);
  state.data = await res.json();
  state.book = (BOOKS[book] ? book : 'a2');
  state.cardByWord = {};
  for(const c of state.data.cards) state.cardByWord[c.w] = c;
}
async function boot(){
  let saved = {}; try{ saved = JSON.parse(localStorage.getItem(LS)) || {}; }catch(e){}
  const book = (saved.book==='a1' || saved.book==='a2') ? saved.book : 'a2';
  try{ await loadBook(book); }
  catch(e){ $('#loading').textContent = 'Could not load vocabulary data. Please refresh.'; return; }
  $('#loading').classList.add('hidden');
  if(global_SRS()) SRS.store.load();
  buildSetup();
  restoreSettings();
  reflectBook();
  recount();
  renderMemory();
}
// switch the active book/level: reload its data, reset the setup to the new book's
// bounds, recompute progress, and persist. SRS memory is shared; map stars are per-book.
async function switchBook(book){
  if(!BOOKS[book] || book===state.book) return;
  const keepLangs = [...state.selLangs];
  try{ await loadBook(book); }catch(e){ return; }
  if(window.Progress) Progress.invalidate();
  // keep the user's languages if they exist in the new book (both books share de/fr/en/pt/nl)
  state.selLangs = new Set(keepLangs.filter(l=>state.data.langs.includes(l)));
  if(!state.selLangs.size) state.selLangs = new Set([state.data.langs.includes('en') ? 'en' : state.data.langs[0]]);
  buildSetup();          // resets page range to the new book + rebuilds chips (page-specific)
  reflectBook();
  recount();
  renderMemory();
  persist();
  show('setup');
}
function reflectBook(){
  $$('.book-opt').forEach(b=>{ const on=b.dataset.book===state.book; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
  const lv=$('#bookLevel'); if(lv) lv.textContent = curBook().label;
}
// per-book memory counts (the shared SRS store, filtered to the current book's words)
function bookWordList(){ return state.data ? [...new Set(state.data.cards.map(c=>c.w))] : []; }
function bookStats(){ return global_SRS() ? SRS.store.stats(bookWordList()) : {seen:0,known:0,learning:0,due:0,new:0,total:0}; }
// SRS is optional (separate script); guard so the app still runs if it failed to load
function global_SRS(){ return typeof SRS !== 'undefined' && SRS; }

function buildSetup(){
  const d = state.data;
  const present = new Set(d.types);
  // pages
  $('#pageFrom').min = $('#pageTo').min = $('#pageFromR').min = $('#pageToR').min = d.pageMin;
  $('#pageFrom').max = $('#pageTo').max = $('#pageFromR').max = $('#pageToR').max = d.pageMax;
  $('#pageFrom').value = $('#pageFromR').value = d.pageMin;
  $('#pageTo').value = $('#pageToR').value = d.pageMax;
  $('#pageHint').textContent = `book pages ${d.pageMin}–${d.pageMax}`;
  syncSlider();

  // type groups (only show groups whose types exist in data) — all ON by default
  const tg = $('#typeGroups'); tg.innerHTML = '';
  TYPE_GROUPS.forEach(g=>{
    const has = g.types.filter(t=>present.has(t));
    if(!has.length) return;
    const el = chip(g.label, true, g.icon); el.dataset.group = g.key;
    el.onclick = ()=>{
      const on = el.classList.toggle('on'); el.setAttribute('aria-pressed', on);
      g.types.forEach(t=>{ if(present.has(t)){ on ? state.selTypes.add(t) : state.selTypes.delete(t); } });
      syncIndividual(); recount(); persist();
    };
    tg.appendChild(el);
    g.types.forEach(t=>{ if(present.has(t)) state.selTypes.add(t); });
  });
  // individual types (default reflects groups = all on)
  const ti = $('#typeIndividual'); ti.innerHTML='';
  d.types.forEach(t=>{
    const el = chip(t, true); el.dataset.type=t; el.classList.add('itype');
    el.onclick = ()=>{
      const on = el.classList.toggle('on'); el.setAttribute('aria-pressed', on);
      on ? state.selTypes.add(t) : state.selTypes.delete(t);
      syncGroupChips(); recount(); persist();
    };
    ti.appendChild(el);
  });

  // languages
  const lc = $('#langChips'); lc.innerHTML='';
  d.langs.forEach(l=>{
    const el = chip(`${d.langLabels[l]||l}`, state.selLangs.has(l)); el.classList.add('lang'); el.dataset.lang=l;
    el.onclick = ()=>{
      const on = el.classList.toggle('on');
      on ? state.selLangs.add(l) : state.selLangs.delete(l);
      if(state.selLangs.size===0){ state.selLangs.add(l); el.classList.add('on'); }
      $$('#langChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.classList.contains('on')));
      recount(); persist();
    };
    lc.appendChild(el);
  });

  // controls
  ['pageFrom','pageTo'].forEach(id=>$('#'+id).oninput = ()=>{clampPages(id);syncSlider(true);recount();persist();});
  ['pageFromR','pageToR'].forEach(id=>$('#'+id).oninput = ()=>{fromSlider();recount();persist();});
  $('#typeAll').onclick = ()=>{ $$('#typeGroups .chip').forEach(c=>{c.classList.add('on');c.setAttribute('aria-pressed','true');});
    state.data.types.forEach(t=>state.selTypes.add(t)); syncIndividual(); recount(); persist(); };
  $('#typeNone').onclick = ()=>{ $$('#typeGroups .chip').forEach(c=>{c.classList.remove('on');c.setAttribute('aria-pressed','false');});
    state.selTypes.clear(); syncIndividual(); recount(); persist(); };
  $('#onlyTranslated').onchange = ()=>{recount();persist();};
  $('#shuffle').onchange = persist;
  // setup toggle covers the common silent/auto choice; the top button adds listening-first
  if($('#autoPlay')) $('#autoPlay').onchange = ()=>{ state.audioMode = $('#autoPlay').checked?1:0; persist(); syncPlayFab(); };
  $('#startBtn').onclick = start;
  if($('#reviewDueBtn')) $('#reviewDueBtn').onclick = startReviewDue;
  $$('.theme-opt').forEach(b=> b.onclick = ()=>{ applyTheme(b.dataset.theme); persist(); });
  $$('.book-opt').forEach(b=> b.onclick = ()=> switchBook(b.dataset.book));
  applyTheme(state.theme);   // sync the picker highlight (data-theme already set in <head>)
  syncGroupChips();
}

function chip(label, on, icon){ const b=document.createElement('button'); b.type='button'; b.className='chip'+(on?' on':'');
  if(icon){ b.innerHTML=`<i class="ic ic-${icon}"></i>`; b.appendChild(document.createTextNode(label)); }
  else b.textContent=label;
  b.setAttribute('aria-pressed', !!on); return b; }

// ---- theme ----
function applyTheme(t){
  state.theme = t==='tactile' ? 'tactile' : 'clay';
  document.documentElement.setAttribute('data-theme', state.theme);
  const m=document.querySelector('meta[name="theme-color"]');
  if(m) m.setAttribute('content', state.theme==='tactile' ? '#252528' : '#efece4');
  $$('.theme-opt').forEach(b=>b.classList.toggle('on', b.dataset.theme===state.theme));
}

// ---- type group <-> individual sync ----
function syncIndividual(){ $$('#typeIndividual .chip').forEach(c=>{
  const on=state.selTypes.has(c.dataset.type); c.classList.toggle('on',on); c.setAttribute('aria-pressed',on); }); }
function syncGroupChips(){ $$('#typeGroups .chip').forEach(c=>{
  const g = TYPE_GROUPS.find(x=>x.key===c.dataset.group);
  const any = g.types.some(t=>state.selTypes.has(t));
  c.classList.toggle('on', any); c.setAttribute('aria-pressed', any); }); }

// ---- page range ----
function clampPages(which){
  const lo=+$('#pageFrom').value||state.data.pageMin, hi=+$('#pageTo').value||state.data.pageMax;
  if(which==='pageFrom' && lo>hi) $('#pageTo').value=lo;
  if(which==='pageTo' && hi<lo) $('#pageFrom').value=hi;
}
function syncSlider(fromInput){
  if(fromInput){ $('#pageFromR').value=$('#pageFrom').value; $('#pageToR').value=$('#pageTo').value; }
  paintSlider();
}
function fromSlider(){
  let a=+$('#pageFromR').value, b=+$('#pageToR').value;
  if(a>b){ [a,b]=[b,a]; }
  $('#pageFrom').value=a; $('#pageTo').value=b; paintSlider();
}
function paintSlider(){
  const d=state.data, a=+$('#pageFrom').value, b=+$('#pageTo').value, span=d.pageMax-d.pageMin||1;
  const l=(a-d.pageMin)/span*100, r=(b-d.pageMin)/span*100;
  $('#trackFill').style.left=l+'%'; $('#trackFill').style.width=(r-l)+'%';
}

// ---- deck building ----
function currentFilter(){
  const a=+$('#pageFrom').value, b=+$('#pageTo').value;
  const onlyTr=$('#onlyTranslated').checked;
  const langs=[...state.selLangs];
  return state.data.cards.filter(c=>{
    if(!c.pg.some(p=>p>=a && p<=b)) return false;
    // empty type selection => no cards (matches the empty UI)
    if(!c.ty.some(t=>state.selTypes.has(t))) return false;
    if(onlyTr && !langs.some(l=>c.tr && c.tr[l])) return false;
    return true;
  });
}
function recount(){
  const n=currentFilter().length;
  $('#deckCount').innerHTML = `<b>${n}</b> card${n===1?'':'s'} match`;
  $('#startBtn').disabled = n===0;
  $('#startBtn').style.opacity = n===0?.5:1;
}

// ---- study flow ----
// "Start learning" now leads to a mode chooser (flashcards or match game)
function start(){
  ensureCtx();   // unlock Web Audio within this tap so later autoplay/replay can sound
  const pool=currentFilter();
  if(!pool.length) return;
  state.gamePool=pool.slice();                       // for the match game
  let deck=pool.slice();
  if($('#shuffle').checked) deck=shuffle(deck);
  state.range={a:+$('#pageFrom').value, b:+$('#pageTo').value};
  state.reviewMode=false; state.returnTo=null;
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('choose');
}
function startFlashcards(){ syncPlayFab(); show('study'); render(); playTutorial(); }
// translation lines (DE/FR/EN…) for a card. `big` styles them larger (used as the
// reverse-direction prompt on the front).
function answerLinesHTML(c, langs, big){
  return langs.map(l=>{
    const tr=(c.tr&&c.tr[l])||null;
    let arr=Array.isArray(tr)?tr:(tr?[tr]:[]);
    if(big) arr=arr.slice(0,2);                      // reverse prompt: keep it to the primary meaning(s)
    const trv=arr.length?arr.join(', '):null;
    return `<div class="ln${big?' big':''}"><span class="flag">${l.toUpperCase()}</span>`+
      (trv?`<span class="tr">${esc(trv)}</span>`:`<span class="clar">— no translation —</span>`)+`</div>`;
  }).join('');
}
function render(skipPeek){
  const c=state.deck[state.idx]; if(!c) return done();
  const d=state.data;
  setReveal(false); resetSwipe();
  $('#frontWord').textContent = c.w;
  $('#frontIpa').textContent = c.ip?`/${c.ip}/`:'';
  // base/dictionary form: the IPA is the lemma's, so when the word is an inflected form show its base
  if(c.lemma){
    const label = c.pos==='VRB' ? 'infinitive' : 'base form';
    $('#frontBase').innerHTML = `<span class="bf-label">${label}:</span> ${esc(c.lemma)}`;
  } else { $('#frontBase').innerHTML = ''; }
  const hasAudio = !!audioId(c);
  $('#frontSay').hidden = !hasAudio; $('#backSay').hidden = !hasAudio;
  $('#flash').classList.toggle('no-audio', !hasAudio);   // listening mode falls back to text
  // listening-first / reverse: the spelling is revealed on the answer side. Include the
  // base/dictionary form too (the IPA is the lemma's), e.g. "infinitive: aneren".
  if($('#backWord')){
    let bwHTML = esc(c.w) + (c.ip?` <span class="bw-ipa">/${esc(c.ip)}/</span>`:'');
    if(c.lemma){ const lbl = c.pos==='VRB' ? 'infinitive' : 'base form';
      bwHTML += `<span class="bw-base"><span class="bf-label">${lbl}:</span> ${esc(c.lemma)}</span>`; }
    $('#backWord').innerHTML = bwHTML;
  }
  if($('#listenCue')) $('#listenCue').hidden = !hasAudio;
  // auto-play when a new card appears (auto-play or listening-first modes).
  // The deck is only reached via a tap/swipe gesture, so playback is already unlocked.
  // In reverse mode the front is the meaning, so we play the Lëtzebuergesch on reveal instead.
  if(hasAudio && state.audioMode>=1 && !state.reverse) playAudio(c);

  const r=state.range;
  // pages + types summary (hidden until the hint is opened)
  const PCAP=12;
  let pages=c.pg.slice();
  if(r){ const inR=pages.filter(p=>p>=r.a&&p<=r.b), out=pages.filter(p=>p<r.a||p>r.b); pages=inR.concat(out); }
  const shown=pages.slice(0,PCAP).map(p=>(r&&p>=r.a&&p<=r.b)?`<b>${p}</b>`:`${p}`);
  const moreP=pages.length>PCAP?` +${pages.length-PCAP}`:'';
  const types=typeLabels(c.ty);
  const tShown=types.slice(0,6).join(', ')+(types.length>6?`, +${types.length-6}`:'');
  const metaHTML =
    `<span class="m-pages"><i class="ic ic-pages"></i> ${c.pg.length} page${c.pg.length>1?'s':''}: ${shown.join(', ')}${moreP}</span>`+
    `<span class="m-types"><i class="ic ic-word-types"></i> ${esc(tShown)}</span>`;
  $('#backMeta').innerHTML = metaHTML;

  // ---- context drawer (revealed on tapping the bottom): the book sentences from the
  // pages the user is studying, then the LOD example(s) ----
  const lesson = relevantLesson(c);
  let h = lesson ? `<div class="h-sec">📍 ${esc(lesson)}</div>` : '';
  const bs = c.bs || [];
  const inRange = r ? bs.filter(o=>o.p>=r.a && o.p<=r.b) : bs;
  const bookList = (inRange.length?inRange:bs).slice(0,5);
  if(bookList.length){
    h += `<div class="h-grp">${r&&inRange.length?`used on your pages (${r.a}–${r.b})`:'used in the book'}</div>`;
    h += bookList.map(o=>`<p class="hx"><span class="pg">p.${o.p}</span> ${escapeEmph(o.s,c.w)}</p>`).join('');
  }
  const exs=(c.ex||[]).slice(0,2);
  if(exs.length){
    h += `<div class="h-grp">dictionary example</div>`;
    h += exs.map(it=>`<p class="hx"><span class="exl">e.g.</span> ${exItemHTML(it,c.w)}</p>`).join('');
  }
  h += `<div class="h-meta">${metaHTML}</div>`;
  $('#frontHints').innerHTML = h || `<p class="hnone">no extra context</p>`;
  collapseHints();
  // back
  $('#backPos').textContent = c.pos||'';
  const langs=[...state.selLangs].filter(l=>d.langs.includes(l));
  $('#backAnswer').innerHTML = answerLinesHTML(c, langs);
  // reverse direction: the meaning is the PROMPT (front), the Lëtzebuergesch is the answer (back)
  if($('#frontMeaning')) $('#frontMeaning').innerHTML =
    `<div class="fm-q">→ in Lëtzebuergesch?</div>` + answerLinesHTML(c, langs, true);
  const exBack = (c.ex && c.ex.length>1) ? c.ex[1] : (c.ex && c.ex[0]);
  $('#backEx').innerHTML = exBack ? `<span class="exl">e.g.</span> ${exItemHTML(exBack,c.w)}` : '';
  // homonym reminder: this word also exists with a different capitalisation + meaning
  if(c.homo && c.homo.length>1){
    const parts = c.homo.map(h=>{
      const f = h.form===c.w ? `<b>${esc(h.form)}</b>` : esc(h.form);
      return `${f} <span class="hg">(${esc(h.gloss)})</span>`;
    });
    $('#backHomo').innerHTML = `<span class="hwarn">⚠ same spelling, different word:</span> ${parts.join(' <span class="hne">≠</span> ')}`;
    $('#backHomo').style.display='';
  } else { $('#backHomo').innerHTML=''; $('#backHomo').style.display='none'; }
  // direct LOD dictionary link(s) at the bottom of the answer side
  $('#backLod').innerHTML = (c.lod && c.lod.length)
    ? c.lod.map(x=>`<a href="https://lod.lu/artikel/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">${esc(x.l)} on LOD ↗</a>`).join(' · ')
    : '';
  // progress
  $('#counter').textContent = `${state.idx+1}/${state.deck.length}`;
  $('#progBar').style.width = (state.idx/state.deck.length*100)+'%';
  renderLastWord();
  // a11y: announce front
  $('#flash').setAttribute('aria-label', `Card ${state.idx+1} of ${state.deck.length}: ${c.w}. Activate to reveal translation.`);
  // pre-render the NEXT card behind, so swiping reveals it instantly (no gap)
  if(!skipPeek) updatePeek(state.deck[state.idx+1]);
}
function setReveal(v){
  state.revealed=v;
  const f=$('#flash'); f.classList.toggle('revealed',v);
  f.querySelector('.front').setAttribute('aria-hidden', v);
  f.querySelector('.back').setAttribute('aria-hidden', !v);
  // reverse mode: hearing the Lëtzebuergesch is the payoff — play it on reveal
  if(v && state.reverse && state.audioMode>=1){ const c=state.deck[state.idx]; if(c && audioId(c)) playAudio(c); }
}
function reveal(){ setReveal(!state.revealed); }
function frontFace(){ return document.querySelector('#flash .face.front'); }
// confidence on a RIGHT swipe is read from where the card is dropped vertically:
// top of the card area = Easy (green), bottom = Hard (orange), middle = Good
function confFromY(y){
  const wrap=$('#flashWrap'); const r=wrap.getBoundingClientRect();
  let f = 1 - (y - r.top)/r.height; f = Math.min(Math.max(f,0),1);   // 1 = top/easy … 0 = bottom/hard
  // green = easy/good, amber = hard — kept theme-independent so "easy" never reads as the orange brand
  if(f>=0.6)  return {f, grade:4, label:'EASY', cls:'easy', color:'#3fc795'};
  if(f>=0.3)  return {f, grade:3, label:'GOOD', cls:'good', color:'#7bd88f'};
  return            {f, grade:2, label:'HARD', cls:'hard', color:'#e0a857'};
}
function showConfLine(on, cg, t){
  const line=$('#confLine'); if(!line) return;
  if(!on){ line.classList.remove('show'); line.style.opacity=''; return; }
  line.classList.add('show');
  // opacity follows how far the card has been dragged → grows in gradually, never pops
  line.style.opacity = Math.min(Math.max(t==null?1:t*1.2,0),1);
  const f=cg.f, top=((1-f)*100)+'%';
  // the EASY (top) and HARD (bottom) labels grow as you drop toward their end of the gauge
  const easy=line.querySelector('.conf-cap.easy'), hard=line.querySelector('.conf-cap.hard');
  if(easy){ easy.style.transform=`scale(${(0.7+f*0.85).toFixed(2)})`; easy.style.opacity=(0.4+f*0.6).toFixed(2); }
  if(hard){ hard.style.transform=`scale(${(0.7+(1-f)*0.85).toFixed(2)})`; hard.style.opacity=(0.4+(1-f)*0.6).toFixed(2); }
  const dot=$('#confDot'), lab=$('#confLabel');
  if(dot){ dot.style.top=top; dot.className='conf-dot '+cg.cls; }
  if(lab){ lab.style.top=top; lab.className='conf-label '+cg.cls; lab.textContent=cg.label; }
}
// brief centred flash on an up/down throw ("Perfected" / "No idea")
function flyMsg(text, kind){
  let el=$('#flyMsg');
  if(!el){ el=document.createElement('div'); el.id='flyMsg'; el.className='fly-msg';
    ($('#flashWrap')||document.body).appendChild(el); }
  el.textContent=text; el.className='fly-msg '+(kind||'')+' show';
  clearTimeout(state.flyT); state.flyT=setTimeout(()=>el.classList.remove('show'), 1000);
}
// when context opens, collapse the top row so the card grows up into its space (same timing)
function setContextOpen(open){ $('#study').classList.toggle('context-open', open); }
function collapseHints(){ const f=frontFace(); if(f) f.classList.remove('hints-open'); setContextOpen(false);
  const t=$('#frontHintToggle'); if(t) t.textContent='tap here for context ▾'; }
function toggleHints(){ if(state.reverse) return; const f=frontFace(); if(!f) return; const open=f.classList.toggle('hints-open'); setContextOpen(open);
  const t=$('#frontHintToggle'); if(t) t.textContent= open?'tap to hide ▴':'tap here for context ▾'; }
function resetSwipe(){
  const sw=$('#swipe'); if(!sw) return;
  sw.style.transition='none'; sw.style.transform=''; sw.style.opacity='';
  $('#tint').style.opacity=0; $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=0;
}
// the persistent top "last word" box shows the PREVIOUS card (the one you just graded):
// its word + your verdict + translation. Tapping it goes back to that card.
function renderLastWord(){
  const el=$('#lastWord'); if(!el) return;
  const prev=state.deck[state.idx-1];
  if(!prev){ el.className='last-word empty'; el.disabled=true; el.innerHTML='<span class="lw-empty">start of deck</span>'; return; }
  el.disabled=false;
  const verdict=state.results[prev.w];
  const langs=[...state.selLangs].filter(l=>state.data.langs.includes(l));
  const trs=langs.map(l=>{ const t=prev.tr&&prev.tr[l]; if(!t) return null;
    const arr=Array.isArray(t)?t:[t]; return arr.slice(0,2).join(', '); }).filter(Boolean);
  const tag = verdict==='got' ? '✓' : verdict==='miss' ? '↻' : '↩';
  el.className='last-word'+(verdict?' '+verdict:'');
  el.innerHTML=`<div class="lw-top"><span class="lw-w">${esc(prev.w)}</span><span class="lw-tag">${tag}</span></div>`+
    `<div class="lw-tr">${trs.length?esc(trs.join(' · ')):'—'}</div>`;
}
// verdict 'got'|'miss' drives the visual; srsGrade (1–4) feeds the scheduler;
// flyDir 'left'|'right'|'up'|'down' is the exit animation.
function grade(verdict, srsGrade, flyDir){
  if(state.animating) return;
  const c=state.deck[state.idx]; if(!c) return;
  state.results[c.w]=verdict;
  const g = srsGrade || (verdict==='got' ? 3 : 1);   // default right=Good, left=Again
  if(global_SRS()) SRS.store.grade(c.w, g);
  if(window.Progress) Progress.invalidate();
  state.animating=true;
  const sw=$('#swipe');
  $('#peek').classList.add('rise');     // the next card (already behind) rises to the front
  sw.style.transition='transform .34s ease-out, opacity .34s ease-out';
  if(flyDir==='up'){ sw.style.transform='translateY(-135%) scale(.86)'; }
  else if(flyDir==='down'){ sw.style.transform='translateY(135%) scale(.86)'; }
  else { const dir = verdict==='got'?1:-1; sw.style.transform=`translateX(${dir*140}%) rotate(${dir*18}deg)`; }
  sw.style.opacity='0';
  setTimeout(()=>{
    state.animating=false;
    if(state.idx>=state.deck.length-1){ $('#peek').classList.remove('rise'); done(); return; }
    state.idx++;
    render(true);                                  // render the now-current card into #swipe; keep peek for now
    // gently cross-fade the top card in over the (identical) risen peek — no instant brightness pop
    sw.style.transition='none'; sw.style.transform=''; sw.style.opacity='0';
    void sw.offsetWidth;
    sw.style.transition='opacity .26s ease';
    sw.style.opacity='1';
    setTimeout(()=>{ $('#peek').classList.remove('rise'); updatePeek(state.deck[state.idx+1]); }, 280);
  }, 340);
}
function updatePeek(card){
  const p=$('#peek'); if(!p) return;
  if(!card){ p.style.visibility='hidden'; return; }
  p.style.visibility='';
  $('#peekWord').textContent = card.w;
  $('#peekIpa').textContent = card.ip?`/${card.ip}/`:'';
  // mirror the listen button on the card behind so the layout doesn't shift when it
  // rises to the front (it's non-interactive here — purely for structural match)
  if($('#peekSay')) $('#peekSay').hidden = !audioId(card);
  if(card.lemma){ const label=card.pos==='VRB'?'infinitive':'base form';
    $('#peekBase').innerHTML = `<span class="bf-label">${label}:</span> ${esc(card.lemma)}`; }
  else $('#peekBase').innerHTML = '';
  // reverse mode: the card behind must already show the meaning, so the swap is seamless
  if($('#peekMeaning')){
    const langs=[...state.selLangs].filter(l=>state.data.langs.includes(l));
    $('#peekMeaning').innerHTML = `<div class="fm-q">→ in Lëtzebuergesch?</div>` + answerLinesHTML(card, langs, true);
  }
}
function next(){ if(state.idx<state.deck.length-1){state.idx++;render();} else done(); }
function prev(){ if(state.idx>0){state.idx--;render();} }
function playTutorial(){
  const tut=$('#tut'); if(!tut) return;
  stopTutorial();                       // clear any prior run
  tut.classList.remove('hidden','fade');
  state.tutorial=true;
  const sw=$('#swipe'), tint=$('#tint');
  const steps=[
    [250, ()=>{ sw.style.transition='transform .5s ease, opacity .3s'; sw.style.transform='translateX(72px) rotate(5deg)'; tint.style.background='var(--accent)'; tint.style.opacity=.26; $('#stampGot').style.opacity=.9; }],
    [850, ()=>{ sw.style.transform='translateX(-72px) rotate(-5deg)'; tint.style.background='var(--warn)'; tint.style.opacity=.26; $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=.9; }],
    [1450,()=>{ sw.style.transform='translateX(0) rotate(0)'; tint.style.opacity=0; $('#stampMiss').style.opacity=0; }],
    [1900,()=>{ tut.classList.add('fade'); }],
    [2250,()=>{ stopTutorial(); }],
  ];
  state.tutTimers=steps.map(([t,fn])=>setTimeout(fn,t));
}
function stopTutorial(){
  if(state.tutTimers){ state.tutTimers.forEach(clearTimeout); state.tutTimers=null; }
  const tut=$('#tut'); if(tut){ tut.classList.add('hidden'); tut.classList.remove('fade'); }
  resetSwipe(); state.tutorial=false;
}
function done(){
  const got=Object.values(state.results).filter(x=>x==='got').length;
  const miss=Object.values(state.results).filter(x=>x==='miss').length;
  $('#progBar').style.width='100%';
  let extra='';
  if(global_SRS()){ const t=bookStats();
    extra = `<br><span class="done-mem"><i class="ic ic-memory"></i> <b>${t.known}</b> known · <b>${t.learning}</b> learning`+
            (t.due?` · <i class="ic ic-due"></i> ${t.due} still due`:` · all reviews cleared ✓`)+`</span>`; }
  $('#doneStats').innerHTML = `You went through <b>${state.deck.length}</b> cards.<br>✓ ${got} got &nbsp; • &nbsp; ↻ ${miss} to review${extra}`;
  $('#reviewMissed').style.display = miss?'':'none';
  show('done');
}
// leave the study/done flow back to wherever we came from (monitor drill-down, else setup)
function exitStudy(){ const to=state.returnTo||'setup'; state.returnTo=null; show(to); }

// ---- nav wiring ----
function wireStudy(){
  const flash=$('#flash'), sw=$('#swipe'), tint=$('#tint');
  // tapping the previous-word box goes back a card
  if($('#lastWord')) $('#lastWord').onclick = ()=>{ stopTutorial(); prev(); };
  $('#backBtn').onclick = ()=>{ stopTutorial(); exitStudy(); };
  $('#restartDeck').onclick = ()=>{ state.idx=0; state.results={}; show('study'); render(); playTutorial(); };
  $('#newDeck').onclick = ()=>exitStudy();
  $('#reviewMissed').onclick = ()=>{
    const set=new Set(Object.keys(state.results).filter(w=>state.results[w]==='miss'));
    state.deck=state.deck.filter(c=>set.has(c.w)); state.idx=0; state.results={};
    if(state.deck.length){ show('study'); render(); playTutorial(); } else show('setup');
  };
  flash.onkeydown = e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); stopTutorial(); reveal(); } };

  // ---- swipe (pointer = touch + mouse) ----
  let dragging=false, deciding=false, axis=null, x0=0, y0=0, dx=0, dy=0, lastY=0, startedInHints=false;
  const THRESH=84, VTHRESH=74;
  function resetStamps(){ const s=$('#stampGot'), m=$('#stampMiss');
    s.style.opacity=0; s.className='stamp got'; s.textContent='KNOW IT ✓';
    m.style.opacity=0; m.className='stamp miss'; m.textContent='✗ AGAIN'; }
  // the hint toggle is the only thing that hides the drawer; tapping/scrolling the
  // hints body must NOT collapse it
  $('#frontHintToggle').onclick = (e)=>{ e.stopPropagation(); if(state.tutorial) stopTutorial(); toggleHints(); };
  $('#frontSay').onclick = (e)=>{ e.stopPropagation(); playAudio(state.deck[state.idx]); };
  $('#backSay').onclick = (e)=>{ e.stopPropagation(); playAudio(state.deck[state.idx]); };
  // listening-first cue (big speaker on the audio-only front) → (re)play the word
  if($('#listenCue')) $('#listenCue').onclick = (e)=>{ e.stopPropagation(); playAudio(state.deck[state.idx]); };
  // ---- settings sheet ----
  if($('#settingsBtn')) $('#settingsBtn').onclick = openStudySettings;
  if($('#settingsScrim')) $('#settingsScrim').onclick = closeSheets;
  $$('#audioSeg button').forEach(b=> b.onclick = ()=>{
    state.audioMode = +b.dataset.mode;
    if($('#autoPlay')) $('#autoPlay').checked = state.audioMode>=1;
    persist(); syncPlayFab();
    if(state.audioMode>=1) playAudio(state.deck[state.idx]);   // hear it right away on switch
  });
  if($('#reverseToggle')) $('#reverseToggle').onchange = ()=>{
    state.reverse = $('#reverseToggle').checked;
    if(state.reverse && state.audioMode===2){ state.audioMode = 1; }   // listening-first doesn't apply in reverse
    if($('#autoPlay')) $('#autoPlay').checked = state.audioMode>=1;
    persist(); syncPlayFab(); render();   // re-render the current card in the new direction
  };
  if($('#setReshuffle')) $('#setReshuffle').onclick = ()=>{
    closeSheets(); state.deck=shuffle(state.deck); state.idx=0; render(); playTutorial();
  };
  // example-sentence speakers are rendered into card HTML each turn → delegate
  flash.addEventListener('click', (e)=>{
    const b=e.target.closest && e.target.closest('.exsay');
    if(b){ e.stopPropagation(); playExampleAudio(b.dataset.h, b); }
  });

  function down(e){
    if(state.animating) return;
    deciding=false; dragging=false; axis=null;       // reset each gesture
    // interactive bits (speaker, example speaker, links, context toggle) handle themselves.
    // Mark the gesture 'ignore' so neither a swipe NOR the tap-to-reveal/context logic fires —
    // their own click handlers do the work. The speaker's hit area is enlarged in CSS so a
    // near-miss still lands here and plays sound instead of opening the context drawer.
    if(e.target.closest && (e.target.closest('a') || e.target.closest('.say') || e.target.closest('.exsay') || e.target.closest('.listen-cue') || e.target.closest('#frontHintToggle'))){ axis='ignore'; return; }
    if(state.tutorial) stopTutorial();
    // note whether the gesture began on the tips, so a *tap* there won't collapse them
    startedInHints = !!(e.target.closest && e.target.closest('.hints'));
    // start "deciding": don't claim the gesture or capture the pointer until we know it's a
    // horizontal swipe — that lets a vertical drag on the tips scroll the drawer natively
    deciding=true; x0=e.clientX; y0=e.clientY; dx=0; dy=0;
  }
  function engage(e){
    dragging=true; deciding=false;
    sw.style.transition='none'; sw.classList.add('dragging');
    try{ sw.setPointerCapture(e.pointerId); }catch(_){}
  }
  const DEAD=14;   // px of clear travel before a direction is intended
  // which gesture the current drag means. Horizontal wins on any clear sideways travel, so a
  // high diagonal to the RIGHT stays a confidence swipe (and keeps the gauge) rather than
  // flipping to "perfect". Up/down only when the drag is essentially vertical.
  function dragMode(){
    if(dx>=DEAD) return 'right';
    if(dx<=-DEAD) return 'left';
    if(dy<=-DEAD) return 'up';
    if(dy>=DEAD) return 'down';
    return 'none';
  }
  function move(e){
    if(!deciding && !dragging) return;
    const ddx=e.clientX-x0, ddy=e.clientY-y0; lastY=e.clientY;
    if(deciding){
      if(Math.abs(ddx)<6 && Math.abs(ddy)<6) return;          // tiny → still a tap
      // only hand the gesture to native scrolling when it starts on the tips and is vertical
      if(startedInHints && Math.abs(ddy) > Math.abs(ddx)){ axis='scroll'; deciding=false; return; }
      engage(e); axis='free';                                  // otherwise the card floats freely
    }
    if(!dragging) return;
    dx=ddx; dy=ddy;
    // the card floats with the finger in 2D the whole time — never snapped onto an axis.
    sw.style.transform=`translate(${dx}px, ${dy*0.92}px) rotate(${dx*0.035}deg)`;
    const s=$('#stampGot'), miss=$('#stampMiss'), mode=dragMode();
    if(mode==='right'){                       // confidence swipe — gauge always on while going right
      const t=Math.min(dx/THRESH,1), cg=confFromY(lastY);
      showConfLine(true, cg, t);
      tint.style.background=cg.color; tint.style.opacity=t*0.30;
      s.textContent=cg.label+' ✓'; s.className='stamp got '+cg.cls; s.style.opacity=t; miss.style.opacity=0;
    } else if(mode==='left'){                  // don't know
      const t=Math.min(-dx/THRESH,1); showConfLine(false);
      tint.style.background='var(--warn)'; tint.style.opacity=t*0.30;
      miss.textContent="DON'T KNOW"; miss.className='stamp miss'; miss.style.opacity=t; s.style.opacity=0;
    } else if(mode==='up'){                     // perfected
      const t=Math.min(-dy/VTHRESH,1); showConfLine(false);
      tint.style.background='var(--accent)'; tint.style.opacity=t*0.30;
      s.textContent='PERFECTED ✓'; s.className='stamp got easy'; s.style.opacity=t; miss.style.opacity=0;
    } else if(mode==='down'){                   // no idea
      const t=Math.min(dy/VTHRESH,1); showConfLine(false);
      tint.style.background='var(--warn)'; tint.style.opacity=t*0.30;
      miss.textContent='NO IDEA'; miss.className='stamp miss down'; miss.style.opacity=t; s.style.opacity=0;
    } else {                                    // floating near the centre — no commitment yet
      tint.style.opacity=0; s.style.opacity=0; miss.style.opacity=0; showConfLine(false);
    }
  }
  function up(){
    if(axis==='ignore'){ axis=null; return; }   // tap on speaker/link/toggle — leave it to them
    const wasDragging=dragging, ax=axis;
    deciding=false; dragging=false; sw.classList.remove('dragging'); showConfLine(false);
    if(wasDragging && ax==='free'){
      // resolve at release. A clear sideways throw always wins (so high-right = a graded swipe);
      // a vertical-only throw becomes perfected (up) / no idea (down).
      if(dx>=THRESH){ grade('got', confFromY(lastY).grade, 'right'); resetStamps(); return; }
      if(dx<=-THRESH){ grade('miss', 1, 'left'); resetStamps(); return; }
      if(Math.abs(dx)<THRESH && dy<=-VTHRESH){ flyMsg('Perfected ✓','good'); grade('got', 4, 'up'); resetStamps(); return; }
      if(Math.abs(dx)<THRESH && dy>=VTHRESH){ flyMsg('No idea — back soon ↻','bad'); grade('miss', 1, 'down'); resetStamps(); return; }
      // not committed enough → fall through and ease back to centre
    }
    if(!wasDragging && ax===null && !startedInHints){    // a genuine tap, not on the tips
      if(state.revealed){ reveal(); }             // on the answer side: tap flips back
      else {
        const f=frontFace(), open=f&&f.classList.contains('hints-open');
        const rect=flash.getBoundingClientRect();
        const inBottom = y0 > rect.top + rect.height*0.6;
        if(open){
          // drawer open: only the toggle/word area act — tapping the body does nothing
          if(!inBottom){ collapseHints(); reveal(); }   // upper tap → reveal the answer
        } else if(inBottom){ toggleHints(); }            // bottom tap → open hints
        else { reveal(); }                               // upper tap → reveal the answer
      }
    }
    sw.style.transition='transform .34s cubic-bezier(.2,.85,.25,1), opacity .25s'; sw.style.transform='';
    tint.style.opacity=0; resetStamps();
  }
  sw.addEventListener('pointerdown',down);
  sw.addEventListener('pointermove',move);
  sw.addEventListener('pointerup',up);
  sw.addEventListener('pointercancel',up);

  // keyboard (desktop)
  document.addEventListener('keydown',e=>{
    if($('#study').classList.contains('hidden')) return;
    if((e.key===' '||e.key==='Enter') && e.target.closest && e.target.closest('button')) return;
    if(state.tutorial) stopTutorial();
    if(e.key===' '||e.key==='Enter'){ e.preventDefault(); reveal(); }
    else if(e.key==='ArrowRight') grade('got', 3, 'right');             // Good
    else if(e.key==='ArrowLeft')  grade('miss', 1, 'left');             // Again
    else if(e.key==='ArrowUp'){ e.preventDefault(); grade('got', 4, 'up'); }  // Easy / perfect
    else if(e.key==='ArrowDown'){ e.preventDefault(); toggleHints(); }
    // number keys = explicit confidence: 1 Again · 2 Hard · 3 Good · 4 Easy
    else if(e.key==='1') grade('miss', 1, 'left');
    else if(e.key==='2') grade('got', 2, 'right');
    else if(e.key==='3') grade('got', 3, 'right');
    else if(e.key==='4') grade('got', 4, 'up');
  });
}

// ---- helpers ----
const SCREENS=['setup','choose','game','study','done','monitor','map'];
function show(id){
  if(id!=='game') stopGame();          // leaving the game stops its timer
  SCREENS.forEach(s=>$('#'+s).classList.toggle('hidden',s!==id));
  window.scrollTo(0,0);
  const sec=$('#'+id); sec.setAttribute('tabindex','-1');
  try{ sec.focus({preventScroll:true}); }catch(e){ sec.focus(); }
  if(id==='setup') renderMemory();
  if(id==='monitor') renderMonitor();
  if(id==='choose') updateGameBest();
  if(id==='map') renderMap();
}

// ============================ MATCH GAME ============================
// tiny synthesised sound effects (Web Audio — no files). A sequence of notes with
// a soft attack/decay envelope so there are no clicks.
function beep(freqs, opt){
  const ctx=ensureCtx(); if(!ctx) return; opt=opt||{};
  const type=opt.type||'sine', dur=opt.dur||0.12, gap=opt.gap!=null?opt.gap:dur*0.9, vol=opt.vol!=null?opt.vol:0.16;
  const t0=ctx.currentTime;
  (Array.isArray(freqs)?freqs:[freqs]).forEach((f,i)=>{
    const s=t0+i*gap, osc=ctx.createOscillator(), g=ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(f,s);
    if(opt.bend) osc.frequency.exponentialRampToValueAtTime(Math.max(40,f*opt.bend), s+dur);
    g.gain.setValueAtTime(0.0001,s); g.gain.exponentialRampToValueAtTime(vol,s+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,s+dur);
    osc.connect(g).connect(ctx.destination); osc.start(s); osc.stop(s+dur+0.03);
  });
}
// Tactile Dark gets a slightly brighter timbre; Soft Clay stays mellow.
function gameOsc(){ return state.theme==='tactile' ? 'triangle' : 'sine'; }
const SFX={
  select:   ()=>beep(680,            {type:'triangle', dur:0.07, vol:0.13}),
  unselect: ()=>beep(380,            {type:'triangle', dur:0.07, vol:0.09}),
  match:    ()=>beep([620,930],      {type:'sine',     dur:0.12, gap:0.07, vol:0.16}),
  fail:     ()=>beep([330,247],      {type:'sine',     dur:0.16, gap:0.10, vol:0.07}),  // gentle "uh", never a buzzer
  win:      ()=>beep([523,659,784,1047],{type:'sine',  dur:0.16, gap:0.11, vol:0.18}),
  lose:     ()=>beep([392,311,247],  {type:'sine',     dur:0.24, gap:0.16, vol:0.14})
};
// Rising-pitch "learning streak" stairs: each consecutive correct pair lifts the
// match-pop one semitone (cycling ~an octave). FSRS-hard words get a brighter, fuller pop.
function gameMatchSound(streak, hard){
  const k = Math.pow(2, ((Math.max(1,streak)-1)%13)/12);
  const notes = hard ? [620*k, 930*k, 1240*k] : [620*k, 930*k];
  beep(notes, {type:gameOsc(), dur:0.13, gap:0.055, vol: hard?0.2:0.15});
}
// "Sproochcrush" round-end flourish — a quick rising arpeggio.
function finaleSound(){
  beep([523,587,659,784,880,1047,1175,1319], {type:gameOsc(), dur:0.12, gap:0.075, vol:0.18});
}
// Was this word hard to recall (per FSRS)? Overdue / low-stability / lapsed → a "Divine"-worthy win.
function wordIsHard(word){
  if(!window.SRS) return false;
  const c = SRS.store.get(word); if(!c) return false;              // unseen → neutral
  return c.due <= Date.now() || SRS.intervalDays(c.s) < 7 || (c.lapses||0) >= 2;
}
// Luxembourgish praise ladder — fires only when a streak crosses a tier (passive vocab too).
const GAME_PRAISE = [[3,'Gutt!'],[5,'Flott!'],[7,'Super!'],[10,'Wonnerbar!'],[14,'Iwwerdeeglech!']];
function praiseFor(streak){ for(let i=GAME_PRAISE.length-1;i>=0;i--){ if(streak===GAME_PRAISE[i][0]) return GAME_PRAISE[i][1]; } return null; }
// ---- juice: particle burst, score/combo pop, praise banner (themed via CSS tokens) ----
function gameFx(a, bb, streak, hard){
  const host=$('#game'), fx=$('#fxLayer'); if(!host||!fx) return;
  const h=host.getBoundingClientRect(), r1=a.getBoundingClientRect(), r2=bb.getBoundingClientRect();
  const x=((r1.left+r1.right+r2.left+r2.right)/4)-h.left;
  const y=((r1.top+r1.bottom+r2.top+r2.bottom)/4)-h.top;
  const n = hard?14:8;
  for(let i=0;i<n;i++){
    const d=document.createElement('span'); d.className='fx-dot'+(hard?' hard':'');
    const ang=Math.random()*6.283, dist=18+Math.random()*(hard?48:30);
    d.style.left=x+'px'; d.style.top=y+'px';
    d.style.setProperty('--dx',(Math.cos(ang)*dist).toFixed(0)+'px');
    d.style.setProperty('--dy',(Math.sin(ang)*dist).toFixed(0)+'px');
    d.style.animationDelay=(Math.random()*40|0)+'ms';
    fx.appendChild(d); d.addEventListener('animationend',()=>d.remove());
  }
  if(streak>=2){ const p=document.createElement('div'); p.className='fx-pop'+(hard?' hard':''); p.textContent='×'+streak;
    p.style.left=x+'px'; p.style.top=y+'px'; fx.appendChild(p); p.addEventListener('animationend',()=>p.remove()); }
}
function praiseBanner(txt, big){
  const fx=$('#fxLayer'); if(!fx) return;
  const b=document.createElement('div'); b.className='fx-praise'+(big?' big':''); b.textContent=txt;
  fx.appendChild(b); b.addEventListener('animationend',()=>b.remove());
}
// Pick a column count that matches the container's shape AND keeps the board a sane
// rectangle: never a degenerate 2-columns-×-many-rows tower (which happens when the tile
// count is 2×prime, e.g. 38), never more than MAXROWS rows. Prefer an exact divisor so
// rows are full, but accept a non-divisor (the last row is centered) rather than go ugly.
function gridDims(n, H){
  const grid=$('#gameGrid');
  const W = (grid&&grid.clientWidth)  || Math.min(window.innerWidth,560);
  H = H || (grid&&grid.clientHeight) || Math.round(window.innerHeight*0.7);
  const aspect = W/Math.max(H,1);
  const maxCols = Math.max(3, Math.floor(W/64));     // tiles ≥ ~64px wide
  const MAXROWS = 10;                                // beyond this, tiles get too short / overflow
  let cols = Math.min(Math.max(Math.round(Math.sqrt(n*Math.max(aspect,0.18))), 2), maxCols);
  while(Math.ceil(n/cols) > MAXROWS && cols < maxCols) cols++;   // add columns until rows fit
  for(const c of [cols, cols+1, cols-1, cols+2]){    // prefer a nearby divisor → perfectly full rows
    if(c>=2 && c<=maxCols && n%c===0 && Math.ceil(n/c)<=MAXROWS){ cols=c; break; }
  }
  return { cols, rows:Math.ceil(n/cols) };
}
function layoutGameGrid(){
  const g=state.game, grid=$('#gameGrid'); if(!g||!grid||!g.tiles.length) return;
  const n=g.tiles.length;
  // Bound the board to the real viewport, deterministically (don't trust dvh / a grown clientHeight):
  // available height = viewport minus the grid's top offset (the game bar + padding) minus a small gutter.
  const top = grid.getBoundingClientRect().top;
  const availH = Math.max(200, window.innerHeight - top - 12);
  grid.style.flexGrow='0'; grid.style.height = availH+'px';   // never grow past the viewport → never scrolls
  const {cols,rows}=gridDims(n, availH);
  grid.dataset.cols=cols;
  // flex-wrap board: explicit per-tile size fills the space; a partial last row centers.
  const gap=parseFloat(getComputedStyle(grid).gap)||7;
  const W=grid.clientWidth||360;
  const tw=Math.floor((W-gap*(cols-1))/cols), th=Math.floor((availH-gap*(rows-1))/rows);
  grid.style.setProperty('--tile-w', tw+'px');
  grid.style.setProperty('--tile-h', th+'px');
  const fs=Math.max(9, Math.min(tw/6.2, th/2.4, 24));
  grid.style.setProperty('--tile-fs', fs.toFixed(1)+'px');
}
function firstTr(c,lang){ const t=c.tr&&c.tr[lang]; return (Array.isArray(t)?t[0]:t)||''; }
function updateGameBest(){
  const slider=$('#gameCount'); if(!slider) return;
  const n=+slider.value; if($('#gameCountVal')) $('#gameCountVal').textContent=n;
  const best=+localStorage.getItem(bestKey(n))||0;
  if($('#gameBest')) $('#gameBest').textContent = best ? `Best: ${best.toFixed(1)}s` : 'No best time yet';
  const dueEl=$('#gameDue');
  if(dueEl){
    let due=0;
    if(global_SRS()){ const lang=[...state.selLangs][0]||'en', now=Date.now();
      due=(state.gamePool||[]).reduce((m,c)=>{ if(!firstTr(c,lang)) return m; const k=SRS.store.get(c.w); return m+(k&&k.due<=now?1:0); },0); }
    dueEl.innerHTML = due ? `<i class="ic ic-due"></i> ${due} word${due>1?'s':''} due — this board reviews them first` : '';
  }
}
// Seed the board like a real review session: most-overdue words first, then unseen
// (new words to learn), then not-yet-due (already strong). Take a board's worth and
// shuffle only the final selection, so the *contents* are FSRS-prioritised but the
// *layout* is random. This is what turns "play a game" into "do your reviews".
function seedReviewPool(pool, pairs){
  const now=Date.now(), S=global_SRS();
  const scored = pool.map(c=>{
    const card = S ? SRS.store.get(c.w) : null;
    if(card && card.due<=now) return {c, bucket:0, key:card.due};      // due → most overdue first
    if(!card)                 return {c, bucket:1, key:Math.random()}; // unseen → learn new
    return {c, bucket:2, key:card.due};                                // not due → lowest priority
  });
  scored.sort((a,b)=> a.bucket-b.bucket || a.key-b.key);
  return shuffle(scored.slice(0, Math.min(pairs, scored.length)).map(x=>x.c));
}
function startGame(){
  ensureCtx();
  const n = +(($('#gameCount')&&$('#gameCount').value)||20);
  const pairs = Math.floor(n/2);
  const lang = [...state.selLangs][0] || 'en';
  let pool = (state.gamePool||[]).filter(c=> firstTr(c,lang));
  pool = seedReviewPool(pool, pairs);
  if(pool.length < 2){ return; }
  const tiles=[];
  pool.forEach((c,i)=>{ tiles.push({id:i,kind:'w',text:c.w,card:c}); tiles.push({id:i,kind:'t',text:firstTr(c,lang),card:c}); });
  show('game');                                  // stops any prior game timer
  const mode = state.gameMode==='attack' ? 'attack' : 'countdown';
  state.game = { tiles:shuffle(tiles), sel:null, selEl:null, matched:0, pairs:pool.length, streak:0,
    reviewed:0, newWords:0, fumbles:0, node:null, lang,
    budget:Math.max(20, pool.length*5), remaining:0, elapsed:0, start:0, raf:null, count:n, mode, done:false };
  // time-attack: bar shows progress (fills as you match) + a live clock, no losing
  const bar=$('#gameBar'); if(bar){ bar.classList.remove('low'); bar.classList.toggle('fill', mode==='attack'); bar.style.width = mode==='attack'?'0%':'100%'; }
  const clk=$('#gameClock'); if(clk){ clk.hidden = mode!=='attack'; clk.textContent='0.0s'; }
  renderGameGrid(); startGameTimer();
}
function renderGameGrid(){
  const g=state.game, grid=$('#gameGrid'); if(!grid) return;
  grid.innerHTML='';
  const tag = t=> t.kind==='w' ? 'LB' : ((g.lang||'').toUpperCase());
  g.tiles.forEach(t=>{
    const b=document.createElement('button');
    b.className='game-tile '+(t.kind==='w'?'tw':'tt');
    b.textContent=t.text; b._tile=t; b.dataset.tag=tag(t);
    b.addEventListener('pointerdown', e=>onTilePointerDown(e,t,b));
    t.el=b; grid.appendChild(b);
  });
  layoutGameGrid();
  requestAnimationFrame(layoutGameGrid);   // re-measure once the grid has its final size
  if($('#gameResult')){ $('#gameResult').classList.remove('show'); $('#gameResult').hidden=true; }
}
// re-flow the grid (columns + tile text) when the window resizes or rotates
let _gridResizeT=null;
window.addEventListener('resize', ()=>{
  const gs=$('#game'); if(!gs || gs.classList.contains('hidden') || !state.game) return;
  clearTimeout(_gridResizeT); _gridResizeT=setTimeout(layoutGameGrid, 80);   // setTimeout, not rAF (fires even when throttled)
});
// ---- tile interaction: tap-to-pick (tapping another same-side tile just SWITCHES the
//      pick, no penalty), plus drag-one-onto-its-pair as a faster alternative. ----
function selectTile(t,b){ const g=state.game; g.sel=t; g.selEl=b; b.classList.add('sel'); SFX.select(); }
function deselectTile(){ const g=state.game; if(g&&g.selEl) g.selEl.classList.remove('sel'); if(g){ g.sel=null; g.selEl=null; } }
function pickTile(t,b){
  const g=state.game; if(!g||g.done||t.matched) return;
  if(!g.sel){ selectTile(t,b); return; }
  if(g.sel===t){ deselectTile(); SFX.unselect(); return; }
  if(g.sel.kind===t.kind){ deselectTile(); selectTile(t,b); return; }   // same side → move the pick
  resolveMatch(g.sel, g.selEl, t, b);                                    // opposite sides → try the match
}
function resolveMatch(a, aEl, b, bEl){
  const g=state.game; if(!g||!a||!b||a.matched||b.matched) return;
  g.sel=null; g.selEl=null; aEl.classList.remove('sel'); bEl.classList.remove('sel');
  const card=a.card||b.card;
  if(a.id===b.id){                                     // correct pair (kinds already differ)
    const struggled=!!(a._struggled||b._struggled);
    a.matched=true; b.matched=true; aEl.classList.add('matched'); bEl.classList.add('matched');
    g.matched++; g.streak=(g.streak||0)+1;
    const hard = card?wordIsHard(card.w):false;
    if(global_SRS() && card){ const had=!!SRS.store.get(card.w); SRS.store.grade(card.w, struggled?SRS.GRADE.HARD:SRS.GRADE.GOOD); g.reviewed++; if(!had) g.newWords++; }
    gameFx(aEl, bEl, g.streak, hard);
    if(card){ try{ playAudio(card); }catch(e){} }
    if(g.matched>=g.pairs){ winGame(); }
    else { gameMatchSound(g.streak, hard); const pr=praiseFor(g.streak); if(pr) praiseBanner(pr); }
  } else {                                             // wrong → flash both; streak breaks
    g.streak=0; g.fumbles=(g.fumbles||0)+1; a._struggled=true; b._struggled=true;
    SFX.fail();
    aEl.classList.add('wrong'); bEl.classList.add('wrong');
    setTimeout(()=>{ aEl.classList.remove('wrong'); bEl.classList.remove('wrong'); }, 480);
  }
}
// drag-to-match: hold and drag a tile onto its pair. A plain tap (no movement) falls through to pickTile.
let _drag=null;
function onTilePointerDown(e,t,b){
  const g=state.game; if(!g||g.done||t.matched) return;
  _drag={t,b,x0:e.clientX,y0:e.clientY,moved:false,ghost:null,over:null};
  try{ b.setPointerCapture(e.pointerId); }catch(_){}
  b.addEventListener('pointermove', onTilePointerMove);
  b.addEventListener('pointerup', onTilePointerUp);
  b.addEventListener('pointercancel', onTilePointerUp);
}
function tileUnder(x,y,d){
  const el=document.elementFromPoint(x,y), tb=el&&el.closest&&el.closest('.game-tile');
  if(tb && tb!==d.b && tb._tile && !tb._tile.matched && tb._tile.kind!==d.t.kind) return tb;
  return null;
}
function onTilePointerMove(e){
  const d=_drag; if(!d) return;
  if(!d.moved){ if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<9) return;   // tap threshold
    d.moved=true; d.b.classList.add('dragging');
    const r=d.b.getBoundingClientRect(); d.hw=r.width/2; d.hh=r.height/2;
    const gh=document.createElement('div'); gh.className='tile-ghost '+(d.t.kind==='w'?'tw':'tt');
    gh.textContent=d.t.text; gh.style.width=r.width+'px'; gh.style.height=r.height+'px'; gh.style.setProperty('--tile-fs', getComputedStyle(d.b).fontSize);
    document.body.appendChild(gh); d.ghost=gh;
  }
  if(d.ghost){ d.ghost.style.left=(e.clientX-d.hw)+'px'; d.ghost.style.top=(e.clientY-d.hh)+'px'; }
  const tb=tileUnder(e.clientX,e.clientY,d);
  if(d.over && d.over!==tb) d.over.classList.remove('drop-target');
  if(tb) tb.classList.add('drop-target');
  d.over=tb;
}
function onTilePointerUp(e){
  const d=_drag; if(!d) return; _drag=null;
  d.b.removeEventListener('pointermove', onTilePointerMove);
  d.b.removeEventListener('pointerup', onTilePointerUp);
  d.b.removeEventListener('pointercancel', onTilePointerUp);
  if(d.ghost) d.ghost.remove();
  d.b.classList.remove('dragging');
  if(d.over) d.over.classList.remove('drop-target');
  if(!d.moved){ pickTile(d.t, d.b); return; }          // it was a tap
  const tb=tileUnder(e.clientX,e.clientY,d);            // dropped onto a valid opposite-side tile?
  if(tb) resolveMatch(d.t, d.b, tb._tile, tb);         // else: snap back, no penalty
}
function startGameTimer(){
  const g=state.game; g.start=performance.now();
  const bar=$('#gameBar'), clock=$('#gameClock');
  const tick=()=>{
    if(state.game!==g || g.done) return;
    g.elapsed=(performance.now()-g.start)/1000;
    if(g.mode==='attack'){                               // count up; never lose
      if(bar) bar.style.width=(g.pairs?g.matched/g.pairs*100:0)+'%';
      if(clock) clock.textContent=g.elapsed.toFixed(1)+'s';
    } else {                                             // count down; can time out
      g.remaining = g.budget - g.elapsed;
      const pct = Math.max(0, g.remaining/g.budget)*100;
      if(bar){ bar.style.width=pct+'%'; bar.classList.toggle('low', pct<25); }
      if(g.remaining<=0){ timeUp(); return; }
    }
    g.raf=requestAnimationFrame(tick);
  };
  g.raf=requestAnimationFrame(tick);
}
function stopGame(){ const g=state.game; if(g){ if(g.raf) cancelAnimationFrame(g.raf); g.raf=null; g.done=true; } }
function winGame(){
  const g=state.game; g.done=true; if(g.raf) cancelAnimationFrame(g.raf);
  const elapsed = g.mode==='attack' ? (performance.now()-g.start)/1000 : (g.budget - g.remaining);
  const bar=$('#gameBar'); if(bar && g.mode==='attack') bar.style.width='100%';
  const key=bestKey(g.count), prev=+localStorage.getItem(key)||0;
  const isBest = !prev || elapsed<prev;
  if(isBest){ try{ localStorage.setItem(key, elapsed.toFixed(1)); }catch(e){} }
  // adventure node: award stars (1=cleared, 2=flawless, 3=flawless+fast) and keep the best
  if(g.node!=null){
    const earned = (g.fumbles>0) ? 1 : (elapsed<=g.par ? 3 : 2);
    const stars=loadStars(); g.starsPrev=stars[g.node]||0; g.starsEarned=earned;
    if(earned>g.starsPrev){ stars[g.node]=earned; saveStars(stars); }
  }
  endReviewSession();
  finaleSound();                                   // rising "Sproochcrush" arpeggio
  praiseBanner('Sproochcrush!', true);
  setTimeout(()=>{ SFX.win(); showGameResult(true, elapsed, isBest); }, 480);  // let the flourish land first
}
function timeUp(){ const g=state.game; g.done=true; if(g.raf) cancelAnimationFrame(g.raf);
  endReviewSession();
  const bar=$('#gameBar'); if(bar) bar.style.width='0%'; SFX.lose(); showGameResult(false, g.matched); }
// a finished game is a finished review session — recompute mastery/progress
function endReviewSession(){ if(window.Progress) Progress.invalidate(); }
function showGameResult(won, val, isBest){
  const el=$('#gameResult'); if(!el) return; const g=state.game;
  const rev = g.reviewed ? `<div class="gr-review"><i class="ic ic-due"></i> ${g.reviewed} word${g.reviewed>1?'s':''} reviewed${g.newWords?` · ${g.newWords} new`:''}</div>` : '';
  if(g.node!=null && won){                              // adventure-node result: stars + map nav
    const e=g.starsEarned||1, adv=buildMap(), hasNext=g.node+1<adv.nodes.length;
    const starsHtml=[0,1,2].map(k=>`<span class="gr-star${k<e?' on':''}">★</span>`).join('');
    const blurb = e===3?'Perfekt! Allebot Wuert flott gemaach.' : e===2?'Flott — keng Feeler!' : 'Etapp fäerdeg!';
    el.innerHTML = `<div class="gr-card"><div class="gr-kicker">Sproochcrush!</div>`+
      `<div class="gr-stars">${starsHtml}</div>`+
      `<div class="gr-title">Etapp ${g.node+1} fäerdeg!</div>`+
      `<div class="gr-time">${blurb}</div>`+ rev+
      `<div class="gr-btns"><button class="primary" id="gameNext"${hasNext?'':' disabled'}>Nächst Etapp →</button>`+
      `<button class="ghost" id="gameMap">Zréck op d'Kaart</button></div></div>`;
    el.hidden=false; requestAnimationFrame(()=>el.classList.add('show'));
    $('#gameNext').onclick=()=>{ el.classList.remove('show'); el.hidden=true; if(hasNext) startNodeGame(g.node+1); };
    $('#gameMap').onclick=()=>{ el.classList.remove('show'); el.hidden=true; show('map'); };
    return;
  }
  el.innerHTML = `<div class="gr-card">${won?'<div class="gr-kicker">Sproochcrush!</div>':''}<div class="gr-emoji ic ${won?'ic-win-solved':'ic-times-up'}"></div>`+
    `<div class="gr-title">${won?'Solved!':"Time's up"}</div>`+
    `<div class="gr-time">${won?`${val.toFixed(1)}s${isBest?' <span class="gr-best">★ best!</span>':''}`:`${val} / ${g.pairs} matched`}</div>`+
    rev+
    `<div class="gr-btns"><button class="primary" id="gameAgain">${won?'Play again':'Try again'}</button>`+
    `<button class="ghost" id="gameQuit">Back</button></div></div>`;
  el.hidden=false; requestAnimationFrame(()=>el.classList.add('show'));
  $('#gameAgain').onclick=()=>{ el.classList.remove('show'); el.hidden=true; startGame(); };
  $('#gameQuit').onclick=()=>{ el.classList.remove('show'); el.hidden=true; show('choose'); };
}

// ============================ ADVENTURE MAP ============================
// The book IS the map: chapters (Kapitelen) are worlds, and each "Etapp" (node) is a
// board-sized cluster of consecutive book words. Playing a node is the same juicy,
// FSRS-grading match round — so climbing the path = doing your spaced reviews.
const NODE_TARGET = 20;          // ~words per node (tunable)
const PAR_PER_PAIR = 2.8;        // seconds/pair under which a flawless run earns the 3rd star
// per-book stars (A2 keeps its original key so existing progress survives)
function starsKey(){ return state.book==='a1' ? 'lb_map_stars_a1' : 'lb_map_stars_v1'; }
function loadStars(){ try{ return JSON.parse(localStorage.getItem(starsKey()))||{}; }catch(e){ return {}; } }
function saveStars(s){ try{ localStorage.setItem(starsKey(), JSON.stringify(s)); }catch(e){} }

// Build the node list once (cached on the dataset). Each distinct word lands in the node of
// its earliest book page; nodes are chunked to ~NODE_TARGET words and never cross a chapter.
function buildMap(){
  const d=state.data; if(d._adv) return d._adv;
  const lr=d.lessonRanges||[];
  const p2l={}; lr.forEach((r,i)=>{ for(let p=r[0];p<=r[1];p++) if(p2l[p]==null) p2l[p]=i; });
  const seen=new Map();
  for(const c of d.cards){
    if(!c.w) continue;
    let mn=Infinity; for(const p of (c.pg||[])) if(p<mn) mn=p; if(mn===Infinity) mn=d.pageMin;
    const prev=seen.get(c.w);
    if(!prev || mn<prev.page) seen.set(c.w, {w:c.w, card:c, page:mn});
  }
  const words=[...seen.values()].sort((a,b)=> a.page-b.page || a.w.localeCompare(b.w));
  const SKIP=/front matter|^index$|impressum|transkriptioun/i;   // not learning chapters
  const nodes=[]; let cur=null;
  for(const it of words){
    const li = p2l[it.page]!=null ? p2l[it.page] : (lr.length-1);
    if(SKIP.test((lr[li]&&lr[li][2])||'')) continue;            // skip TOC / imprint / transcripts
    if(!cur || cur.lesson!==li || cur.words.length>=NODE_TARGET){ cur={lesson:li,words:[],a:it.page,b:it.page}; nodes.push(cur); }
    cur.words.push(it); if(it.page<cur.a)cur.a=it.page; if(it.page>cur.b)cur.b=it.page;
  }
  for(let i=nodes.length-1;i>0;i--){                    // fold a tiny trailing node into its neighbour
    if(nodes[i].words.length<6 && nodes[i-1].lesson===nodes[i].lesson){
      nodes[i-1].words.push(...nodes[i].words); nodes[i-1].b=Math.max(nodes[i-1].b,nodes[i].b); nodes.splice(i,1);
    }
  }
  nodes.forEach((n,i)=>n.idx=i);
  d._adv={ nodes, lessons:lr };
  return d._adv;
}
// per-node mastery, reusing the heatmap's colour buckets
function nodeState(n){
  const now=Date.now(); let sum=0, seen=0, due=0; const total=n.words.length;
  for(const it of n.words){
    const card= global_SRS()? SRS.store.get(it.w):null;
    if(card){ seen++; sum+=(Progress.masteryOf(card, now)||0); if(card.due<=now) due++; }
  }
  const score= total? sum/total : 0, coverage= total? seen/total : 0;
  return { score, coverage, seen, total, due, bucket:Progress.bucketOf({total, coverage, score, confident: total>=4}) };
}
function chapterParts(name){
  const parts=(name||'').split('—');
  if(parts.length>1) return { eyebrow:parts[0].trim(), title:parts.slice(1).join('—').trim() };
  return { eyebrow:'', title:(name||'').trim() };
}
function renderMap(){
  const track=$('#mapTrack'); if(!track) return;
  const adv=buildMap(), stars=loadStars();
  const states=adv.nodes.map(nodeState);
  let curIdx=adv.nodes.findIndex(n=>!(stars[n.idx]>0)); if(curIdx<0) curIdx=adv.nodes.length-1;   // first un-cleared node
  // header progress: stars earned / total
  const totalStars=adv.nodes.length*3, gotStars=adv.nodes.reduce((m,n)=>m+(stars[n.idx]||0),0);
  const hdr=$('#mapProgress'); if(hdr) hdr.innerHTML=`<i class="ic ic-win-solved"></i> ${gotStars}/${totalStars}`;
  let html='', lastLesson=-1;
  adv.nodes.forEach((n,i)=>{
    if(n.lesson!==lastLesson){
      lastLesson=n.lesson;
      const ln=adv.lessons[n.lesson], cp=chapterParts(ln?ln[2]:'');
      const lessonNodes=adv.nodes.filter(x=>x.lesson===n.lesson);
      const done=lessonNodes.every(x=>states[x.idx].bucket==='mastered');
      const a=ln?ln[0]:n.a, b=ln?ln[1]:n.b;
      html+=`<div class="map-chapter${done?' done':''}">`+
        (cp.eyebrow?`<div class="mc-eyebrow">${esc(cp.eyebrow)}${done?' · ★':''}</div>`:'')+
        `<div class="mc-name">${esc(cp.title)}</div>`+
        `<div class="mc-sub">Säiten ${a}–${b} · ${lessonNodes.length} Etappen</div>`+
      `</div>`;
    }
    const st=states[i], side=i%2?'right':'left', earned=stars[n.idx]||0, cur=i===curIdx;
    const ahead = i>curIdx && st.bucket==='unseen';
    html+=`<button class="map-node ${side} b-${st.bucket}${cur?' current':''}${ahead?' ahead':''}" data-node="${n.idx}">`+
      `<span class="mn-circle b-${st.bucket}">${st.bucket==='mastered'?'<span class="mn-done">★</span>':`<span class="mn-num">${i+1}</span>`}</span>`+
      `<span class="mn-stars">${[0,1,2].map(k=>`<span class="mn-star${k<earned?' on':''}">★</span>`).join('')}</span>`+
      `<span class="mn-cap">Säit ${n.a===n.b?n.a:n.a+'–'+n.b}${st.due?` · ${st.due} fälleg`:''}</span>`+
      (cur?`<span class="mn-here">Dir sidd hei</span>`:'')+
    `</button>`;
  });
  track.innerHTML=html;
  $$('#mapTrack .map-node').forEach(b=> b.onclick=()=>startNodeGame(+b.dataset.node));
  const curEl=$('#mapTrack .map-node.current'); if(curEl) setTimeout(()=>curEl.scrollIntoView({block:'center'}),0);
}
function startNodeGame(idx){
  ensureCtx();
  const adv=buildMap(), n=adv.nodes[idx]; if(!n) return;
  const lang=[...state.selLangs][0]||'en';
  const cards=n.words.map(it=>it.card).filter(c=>firstTr(c,lang));
  const pool=seedReviewPool(cards, cards.length);       // all node words, due-first ordering
  if(pool.length<2){ return; }
  const tiles=[];
  pool.forEach((c,i)=>{ tiles.push({id:i,kind:'w',text:c.w,card:c}); tiles.push({id:i,kind:'t',text:firstTr(c,lang),card:c}); });
  show('game');
  state.game={ tiles:shuffle(tiles), sel:null, selEl:null, matched:0, pairs:pool.length, streak:0,
    reviewed:0, newWords:0, fumbles:0, node:idx, par:pool.length*PAR_PER_PAIR, lang,
    budget:Math.max(20,pool.length*5), remaining:0, elapsed:0, start:0, raf:null, count:pool.length*2, mode:'attack', done:false };
  const bar=$('#gameBar'); if(bar){ bar.classList.remove('low'); bar.classList.add('fill'); bar.style.width='0%'; }
  const clk=$('#gameClock'); if(clk){ clk.hidden=false; clk.textContent='0.0s'; }
  renderGameGrid(); startGameTimer();
}

// ---- spaced repetition: memory summary + "review due" ----
function renderMemory(){
  const bar=$('#memBar'); if(!bar || !global_SRS()) return;
  const t=bookStats();
  const btn=$('#reviewDueBtn'), stats=$('#memStats');
  bar.hidden=false;                       // always visible now (carries the Progress entry point)
  if(stats) stats.innerHTML = t.seen===0
    ? `<i class="ic ic-memory"></i> <span class="mem-empty">Nothing studied yet</span>`
    : `<i class="ic ic-memory"></i> <b>${t.known}</b> known · <b>${t.learning}</b> learning`+
      (t.due?` · <span class="due">${t.due} due</span>`:``);
  if(btn){ btn.hidden = !t.due; $('#dueCount').textContent = t.due; }
}
function startReviewDue(){
  if(!global_SRS()) return;
  const due=SRS.store.dueWords();                    // most-overdue first
  const deck=due.map(w=>state.cardByWord[w]).filter(Boolean).slice(0,120);
  if(!deck.length) return;
  ensureCtx();
  syncPlayFab();
  state.range=null;                                  // due review spans all pages
  state.reviewMode=true;
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('study'); render(); playTutorial();
}
// ============================ PROGRESS / HEATMAP SCREEN ============================
const BUCKET_LABEL={unseen:'unseen',low:'too few',started:'started',learning:'learning',strong:'strong',mastered:'mastered'};
function pct(x){ return Math.round((x||0)*100); }
function ringSVG(score, size, stroke, bucket){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-(score||0));
  const col = (score==null) ? 'var(--hm-unseen)' : `var(--hm-${bucket||Progress.bucketOf({total:1,coverage:1,score:score,confident:true})})`;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`+
    `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--hm-track)" stroke-width="${stroke}"/>`+
    `<circle class="ring-p" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"`+
    ` stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
}
function renderMonitor(){
  if(!window.Progress || !global_SRS()) return;
  if(!state.monView) state.monView='pages';
  const P=Progress.get();
  renderMonSummary(P);
  $$('#monSeg button').forEach(b=>b.classList.toggle('on', b.dataset.view===state.monView));
  renderMonLegend();
  const body=$('#monBody');
  if(state.monView==='pages') body.innerHTML=viewPages(P);
  else if(state.monView==='lessons') body.innerHTML=viewLessons(P);
  else body.innerHTML=viewTypes(P);
}
function renderMonSummary(P){
  const b=P.book, streak=SRS.store.streak ? SRS.store.streak() : 0;
  const bucket=Progress.bucketOf(b);
  $('#monSummary').innerHTML =
    `<div class="ms-ring">${ringSVG(b.score, 92, 9, bucket)}<div class="ms-pc"><b>${pct(b.score)}%</b><span>mastered</span></div></div>`+
    `<div class="ms-grid">`+
      `<div class="ms-stat"><b class="known">${b.known}</b><span>known</span></div>`+
      `<div class="ms-stat"><b class="due">${b.due}</b><span>due</span></div>`+
      `<div class="ms-stat"><b class="strug">${b.struggling}</b><span>struggling</span></div>`+
      `<div class="ms-stat"><b class="streak">${streak} <i class="ic ic-streak"></i></b><span>day streak</span></div>`+
    `</div>`;
}
function renderMonLegend(){
  $('#monLegend').innerHTML =
    ['unseen','started','learning','strong','mastered'].map(k=>`<span class="lg"><i class="sw b-${k}"></i>${BUCKET_LABEL[k]}</span>`).join('')+
    `<span class="lg"><i class="sw dot-strug"></i>struggling</span><span class="lg"><i class="sw bar-due"></i>due</span>`;
}
function cellFlags(b){
  return (b.struggling>0?' has-strug':'')+(b.due>0?' has-due':'');
}
function viewPages(P){
  if(P.book.seen===0) return emptyMonitor();
  let html='';
  P.lessons.forEach((L,li)=>{
    const pgs=[]; for(let p=L.a;p<=L.b;p++) if(P.pages[p]) pgs.push(p);
    if(!pgs.length) return;
    const bucket=Progress.bucketOf(L);
    html+=`<div class="kap"><button class="kap-head" data-lesson="${li}">`+
      `${ringSVG(L.score,26,4,bucket)}`+
      `<span class="kap-name">${esc(shortLesson(L.name))}</span>`+
      `<span class="kap-meta">${L.seen}/${L.total} · ${pct(L.score)}%</span><span class="chev">›</span></button>`+
      `<div class="hm-grid">`+
      pgs.map(p=>{ const b=P.pages[p], bk=Progress.bucketOf(b);
        return `<button class="hm-cell b-${bk}${cellFlags(b)}" data-page="${p}" aria-label="Page ${p}, ${pct(b.score)}% mastered"><span class="pn">${p}</span></button>`;
      }).join('')+`</div></div>`;
  });
  return html;
}
function viewLessons(P){
  if(P.book.seen===0) return emptyMonitor();
  return `<div class="lz-grid">`+P.lessons.map((L,li)=>{
    if(L.total===0) return '';
    const bk=Progress.bucketOf(L);
    return `<button class="lz-card b-${bk}${cellFlags(L)}" data-lesson="${li}">`+
      `${ringSVG(L.score,40,5,bk)}`+
      `<div class="lz-name">${esc(shortLesson(L.name))}</div>`+
      `<div class="lz-meta">${pct(L.score)}% · ${L.seen}/${L.total}${L.due?` · ${L.due} due`:''}</div></button>`;
  }).join('')+`</div>`;
}
function viewTypes(P){
  if(P.book.seen===0) return emptyMonitor();
  // aggregate raw types into the app's friendly groups, weakest first
  const rows=TYPE_GROUPS.map(g=>{
    const set=new Set(g.types);
    const b=Progress.bucketFor(c=>c.ty && c.ty.some(t=>set.has(t)));
    return {g, b};
  }).filter(r=>r.b.total>0).sort((a,b)=>(a.b.score||0)-(b.b.score||0));
  return rows.map(({g,b})=>{
    const seg=(n,cls)=> n>0?`<span class="seg ${cls}" style="flex:${n}"></span>`:'';
    return `<button class="ty-row" data-group="${g.key}">`+
      `<div class="ty-top"><span class="ty-name">${g.icon?`<i class="ic ic-${g.icon}"></i> `:''}${esc(g.label)}</span><span class="ty-pc">${pct(b.score)}% · ${b.seen}/${b.total}</span></div>`+
      `<div class="ty-bar">${seg(b.known,'k')}${seg(b.learning,'l')}${seg(b.new,'n')}</div></button>`;
  }).join('');
}
function emptyMonitor(){
  const L=state.data.lessons.length, pmin=state.data.pageMin, pmax=state.data.pageMax;
  return `<div class="mon-empty"><div class="me-glyph"><i class="ic ic-pages"></i></div>`+
    `<div class="me-t">Your book is waiting.</div>`+
    `<div class="me-s">${pmax-pmin+1} pages · ${L} lessons · 0 studied</div>`+
    `<button class="primary me-cta" id="monStartBtn">Start with page ${pmin} →</button></div>`;
}
function shortLesson(name){ return name.replace(/^Kapitel (\d+) — /,'K$1 · '); }

// ---- drill-down ----
function lessonWords(a,b){ return state.data.cards.filter(c=>c.pg.some(p=>p>=a&&p<=b)); }
function openDrill(scope){
  const now=Date.now();
  let title, sub, cards, resetBtn='';
  if(scope.kind==='page'){
    cards=state.data.cards.filter(c=>c.pg.includes(scope.p));
    const lp=lessonOfPage(scope.p);
    title=`Page ${scope.p}`; sub=lp?esc(shortLesson(lp)):'';
  } else { // lesson
    const L=Progress.get().lessons[scope.li]; scope.a=L.a; scope.b=L.b;
    cards=lessonWords(L.a,L.b);
    title=esc(shortLesson(L.name)); sub=`pages ${L.a}–${L.b}`;
    resetBtn=`<button class="drill-reset" id="drillReset">↺ reset this lesson</button>`;
  }
  const b=Progress.bucketFor(c=>cards.includes(c), now);
  const due=cards.filter(c=>{const r=SRS.store.get(c.w); return r&&r.due<=now;}).length;
  const strug=b.struggling;
  const sheet=$('#drillSheet');
  sheet.innerHTML=`<div class="sh-handle"></div>`+
    `<div class="sh-title">${title}<span class="sh-sub">${sub}</span></div>`+
    `<div class="sh-score b-${Progress.bucketOf(b)}">${pct(b.score)}% mastered</div>`+
    `<div class="sh-counts">`+
      `<span><i class="ic ic-known"></i> ${b.known} known</span><span>◐ ${b.learning} learning</span>`+
      `<span>· ${b.new} new</span>${strug?`<span class="strug"><i class="ic ic-struggling"></i> ${strug} struggling</span>`:''}</div>`+
    `<div class="sh-btns">`+
      `<button class="primary" id="drillStudy">Study ${b.total} word${b.total!==1?'s':''}</button>`+
      (due?`<button class="ghost" id="drillDue">Review ${due} due</button>`:'')+
    `</div>${resetBtn}`;
  state.drillScope=scope; state.drillCards=cards;
  openSheet('drillSheet','drillScrim');
}
function startScopedDeck(cards, mode, scope){
  ensureCtx();
  let deck=cards.slice();
  if(mode==='due'){ const now=Date.now(); deck=deck.filter(c=>{const r=SRS.store.get(c.w); return r&&r.due<=now;}); }
  if($('#shuffle') && $('#shuffle').checked) deck=shuffle(deck);
  if(!deck.length) return;
  closeSheets();
  state.range = scope && scope.kind==='page' ? {a:scope.p,b:scope.p}
              : scope && scope.kind==='lesson' ? {a:scope.a,b:scope.b} : null;
  syncPlayFab();
  state.reviewMode=(mode==='due'); state.returnTo='monitor';
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('study'); render(); playTutorial();
}

// ---- sheets / menu ----
function openSheet(id,scrim){ clearTimeout(state._sheetT); const s=$('#'+id), sc=$('#'+scrim);
  sc.hidden=false; s.hidden=false;
  void s.offsetWidth;                       // commit the off-screen state, then transition in
  sc.classList.add('show'); s.classList.add('show'); }
// close every open sheet/scrim, animating them out, then hide once the transition ends
function closeSheets(){
  $$('.sheet.show, .sheet-scrim.show').forEach(s=>s.classList.remove('show'));
  clearTimeout(state._sheetT);
  state._sheetT=setTimeout(()=>$$('.sheet, .sheet-scrim').forEach(s=>{ if(!s.classList.contains('show')) s.hidden=true; }), 280);
}
function openMenu(){
  const t=SRS.store.totals();
  $('#monMenu').innerHTML=`<div class="sh-handle"></div><div class="sh-title">Options</div>`+
    `<button class="menu-item" id="menuExport">⬇︎ Export backup (.json)</button>`+
    `<button class="menu-item" id="menuImport">⬆︎ Restore backup</button>`+
    `<button class="menu-item danger" id="menuReset">⚠︎ Reset all progress…</button>`+
    `<div class="menu-foot">${t.seen} words studied · stored only on this device</div>`;
  openSheet('monMenu','menuScrim');
}
function exportBackup(){
  const blob=new Blob([SRS.store.exportJSON()],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  const d=new Date(), ds=d.getFullYear()+''+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  a.href=url; a.download=`lux-progress-${ds}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importBackup(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const fr=new FileReader();
    fr.onload=()=>{ try{ if(SRS.store.importJSON(fr.result)){ Progress.invalidate(); closeSheets(); renderMonitor(); } }catch(e){ alert('Could not read that backup.'); } };
    fr.readAsText(f); };
  inp.click();
}
function confirmResetAll(){
  $('#monMenu').innerHTML=`<div class="sh-handle"></div><div class="sh-title danger-t">Reset everything?</div>`+
    `<p class="sh-warn">This permanently erases your learning progress for every word. This cannot be undone.</p>`+
    `<button class="menu-item" id="menuExport2">⬇︎ Download a backup first</button>`+
    `<label class="reset-confirm">Type <b>RESET</b> to confirm<input id="resetField" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`+
    `<div class="sh-btns"><button class="ghost" id="resetCancel">Cancel</button><button class="danger-btn" id="resetGo" disabled>Reset all</button></div>`;
  $('#menuExport2').onclick=exportBackup;
  $('#resetField').oninput=e=>{ $('#resetGo').disabled = e.target.value.trim().toUpperCase()!=='RESET'; };
  $('#resetCancel').onclick=closeSheets;
  $('#resetGo').onclick=()=>{ SRS.store.clearAll(); Progress.invalidate(); closeSheets(); renderMonitor(); renderMemory(); };
}
function resetLesson(li){
  const L=Progress.get().lessons[li]; const words=[...new Set(lessonWords(L.a,L.b).map(c=>c.w))];
  if(!confirm(`Reset progress for “${shortLesson(L.name)}” (${words.length} words)?\nWords shared with other lessons are affected too.`)) return;
  SRS.store.deleteWords(words); Progress.invalidate(); closeSheets(); renderMonitor(); renderMemory();
}

function lessonOfPage(p){
  const lr=state.data.lessonRanges||[];
  for(const [a,b,name] of lr) if(p>=a&&p<=b) return name;
  return null;
}
function relevantLesson(c){
  // the lesson of the earliest page within the studied range (what the learner is on), else earliest overall
  const r=state.range;
  const pages=c.pg.slice().sort((x,y)=>x-y);
  if(r){ const inR=pages.find(p=>p>=r.a&&p<=r.b); if(inR!=null){ const l=lessonOfPage(inR); if(l) return l; } }
  const l0=lessonOfPage(pages[0]); return l0||(c.ls&&c.ls[0])||'';
}
// ---- pronunciation audio ----
// Played through the Web Audio API (not an <audio> element) so iOS treats it as a
// short sound effect rather than media playback — no lock-screen "now playing" UI.
// LOD originals, self-hosted with a LOD stream fallback. Decoded buffers are cached.
let actx = null;
const bufCache = new Map();   // url -> AudioBuffer | Promise<AudioBuffer>
let curSrc = null;
function ensureCtx(){
  if(!actx){ const AC = window.AudioContext || window.webkitAudioContext;
    if(AC){ try{ actx = new AC(); }catch(e){} } }
  if(actx && actx.state === 'suspended') actx.resume().catch(()=>{});
  return actx;
}
async function loadBuf(url){
  const hit = bufCache.get(url);
  if(hit) return hit;
  const p = (async()=>{
    const r = await fetch(url); if(!r.ok) throw new Error('http '+r.status);
    const ab = await r.arrayBuffer();
    return await actx.decodeAudioData(ab);
  })();
  bufCache.set(url, p);
  try{ const b = await p; bufCache.set(url, b); return b; }
  catch(e){ bufCache.delete(url); throw e; }
}
// play the first URL that works (local first, then LOD); toggle playing state via callbacks
async function playUrls(urls, onStart, onEnd){
  const ctx = ensureCtx(); if(!ctx) return false;
  if(curSrc){ try{ curSrc.onended=null; curSrc.stop(); }catch(e){} curSrc=null; }
  for(const url of urls){
    try{
      const buf = await loadBuf(url);
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
      src.onended = ()=>{ if(curSrc===src){ curSrc=null; onEnd&&onEnd(); } };
      curSrc = src; onStart&&onStart(); src.start(0);
      return true;
    }catch(e){ /* try next URL */ }
  }
  onEnd&&onEnd(); return false;
}
function clearPlaying(){ $$('.say.playing,.exsay.playing').forEach(b=>b.classList.remove('playing')); }
// audio mode 2 ("listening-first") flips the study screen into an audio-only front.
const AUDIO_MODES = [
  { hint:'Silent — tap a speaker on the card to hear a word.' },
  { hint:'Auto-play — each new card speaks automatically.' },
  { hint:'Listening-first — the spelling is hidden and played; tap the card to reveal it.' }
];
function syncPlayFab(){   // keeps its name; now reflects mode + direction in the settings sheet
  const m = state.audioMode||0;
  const study=$('#study');
  if(study){
    study.classList.toggle('reverse-mode', !!state.reverse);
    study.classList.toggle('listen-mode', m===2 && !state.reverse);   // listening-first needs the LB front
  }
  $$('#audioSeg button').forEach(b=>{
    const mode=+b.dataset.mode;
    b.classList.toggle('on', mode===m);
    const dis = !!state.reverse && mode===2;   // listening-first makes no sense in reverse → grey out
    b.classList.toggle('disabled', dis);
    b.disabled = dis;
  });
  const hint=$('#audioHint'); if(hint) hint.textContent = AUDIO_MODES[m].hint;
  if($('#reverseToggle')) $('#reverseToggle').checked = !!state.reverse;
}
function openStudySettings(){ syncPlayFab(); openSheet('studySettings','settingsScrim'); }
function audioId(card){ return (card && card.lod && card.lod[0]) ? card.lod[0].id.toLowerCase() : null; }
function playAudio(card){
  const id = audioId(card); if(!id) return;
  clearPlaying();
  playUrls(['audio/'+id+'.m4a', 'https://lod.lu/uploads/AAC/'+id+'.m4a'],
    ()=>$$('.say').forEach(b=>b.classList.add('playing')),
    ()=>$$('.say').forEach(b=>b.classList.remove('playing')));
}
function playExampleAudio(hash, btn){
  if(!hash) return;
  clearPlaying();
  playUrls(['audio/ex/'+hash+'.m4a', `https://lod.lu/uploads/examples/AAC/${hash.slice(0,2)}/${hash}.m4a`],
    ()=>btn&&btn.classList.add('playing'),
    ()=>clearPlaying());
}
// render one LOD example (string or {s,a}) with an inline speaker when a recording exists
function exItemHTML(item, word){
  const s = (item && typeof item==='object') ? item.s : item;
  const a = (item && typeof item==='object') ? item.a : null;
  const spk = a ? ` <button class="exsay" type="button" data-h="${esc(a)}" aria-label="Play example sentence"><i class="ic ic-audio-auto-play"></i></button>` : '';
  return `${escapeEmph(s,word)}${spk}`;
}
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function esc(s){ return (s+'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
function escapeEmph(sentence,word){
  const e=esc(sentence); const ew=esc(word);
  try{
    const re=new RegExp(`(^|[^\\p{L}])(${ew.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})(?=[^\\p{L}]|$)`,'iu');
    return e.replace(re,(m,a,b)=>`${a}<b>${b}</b>`);
  }catch(err){ return e; }
}

// ---- persistence ----
function persist(){
  const s={ from:$('#pageFrom').value, to:$('#pageTo').value,
    types:[...state.selTypes], langs:[...state.selLangs],
    onlyTr:$('#onlyTranslated').checked, shuffle:$('#shuffle').checked,
    audioMode:state.audioMode, reverse:state.reverse, theme:state.theme, gameMode:state.gameMode, book:state.book };
  try{ localStorage.setItem(LS,JSON.stringify(s)); }catch(e){}
}
function restoreSettings(){
  let s; try{ s=JSON.parse(localStorage.getItem(LS)); }catch(e){}
  if(!s) return;
  const d=state.data;
  // page range — clamp into bounds and order
  let f = Math.min(Math.max(+s.from||d.pageMin, d.pageMin), d.pageMax);
  let t = Math.min(Math.max(+s.to||d.pageMax, d.pageMin), d.pageMax);
  if(f>t) [f,t]=[t,f];
  $('#pageFrom').value=$('#pageFromR').value=f; $('#pageTo').value=$('#pageToR').value=t;
  if(s.langs && s.langs.length){
    const valid=s.langs.filter(l=>d.langs.includes(l));
    if(valid.length){ state.selLangs=new Set(valid);
      $$('#langChips .chip').forEach(c=>{const on=state.selLangs.has(c.dataset.lang);c.classList.toggle('on',on);c.setAttribute('aria-pressed',on);}); }
  }
  if(Array.isArray(s.types)){ // explicit list (may be empty = none)
    state.selTypes=new Set(s.types.filter(t=>d.types.includes(t))); syncIndividual(); syncGroupChips();
  }
  if(typeof s.onlyTr==='boolean') $('#onlyTranslated').checked=s.onlyTr;
  if(typeof s.shuffle==='boolean') $('#shuffle').checked=s.shuffle;
  if(typeof s.theme==='string') applyTheme(s.theme);
  if(typeof s.reverse==='boolean') state.reverse = s.reverse;
  if(s.gameMode==='attack'||s.gameMode==='countdown'){ state.gameMode=s.gameMode; reflectGameMode(); }
  if(typeof s.audioMode==='number') state.audioMode = s.audioMode;
  else if(typeof s.autoplay==='boolean') state.audioMode = s.autoplay?1:0;   // migrate old setting
  if($('#autoPlay')) $('#autoPlay').checked = state.audioMode>=1;
  syncPlayFab();
  syncSlider(); paintSlider();
}

// ---- monitor screen wiring (elements exist at load) ----
function wireMonitor(){
  if($('#progressBtn')) $('#progressBtn').onclick = ()=>show('monitor');
  if($('#monBack')) $('#monBack').onclick = ()=>show('setup');
  if($('#monMenuBtn')) $('#monMenuBtn').onclick = openMenu;
  $$('#monSeg button').forEach(btn=>btn.onclick=()=>{ state.monView=btn.dataset.view; renderMonitor(); });
  // delegated taps inside the heatmap body
  const body=$('#monBody');
  if(body) body.addEventListener('click', e=>{
    const cell=e.target.closest('.hm-cell'); if(cell){ openDrill({kind:'page', p:+cell.dataset.page}); return; }
    const kap=e.target.closest('.kap-head'); if(kap){ openDrill({kind:'lesson', li:+kap.dataset.lesson}); return; }
    const lz=e.target.closest('.lz-card'); if(lz){ openDrill({kind:'lesson', li:+lz.dataset.lesson}); return; }
    const ty=e.target.closest('.ty-row'); if(ty){ const g=TYPE_GROUPS.find(x=>x.key===ty.dataset.group);
      const set=new Set(g.types); startScopedDeck(state.data.cards.filter(c=>c.ty&&c.ty.some(t=>set.has(t))), null, null); return; }
    const startB=e.target.closest('#monStartBtn'); if(startB){ show('setup'); }
  });
  // drill sheet actions (delegated — content is rebuilt each open)
  const sheet=$('#drillSheet');
  if(sheet) sheet.addEventListener('click', e=>{
    if(e.target.closest('#drillStudy')) startScopedDeck(state.drillCards, null, state.drillScope);
    else if(e.target.closest('#drillDue')) startScopedDeck(state.drillCards, 'due', state.drillScope);
    else if(e.target.closest('#drillReset')) resetLesson(state.drillScope.li);
  });
  // options menu actions
  const menu=$('#monMenu');
  if(menu) menu.addEventListener('click', e=>{
    if(e.target.closest('#menuExport')) exportBackup();
    else if(e.target.closest('#menuImport')) importBackup();
    else if(e.target.closest('#menuReset')) confirmResetAll();
  });
  ['drillScrim','menuScrim'].forEach(id=>{ const s=$('#'+id); if(s) s.onclick=closeSheets; });
}

function wireGame(){
  if($('#modeFlash')) $('#modeFlash').onclick = startFlashcards;
  if($('#playGame')) $('#playGame').onclick = startGame;
  if($('#gameCount')) $('#gameCount').oninput = updateGameBest;
  if($('#chooseBack')) $('#chooseBack').onclick = ()=>show('setup');
  if($('#gameBack')) $('#gameBack').onclick = ()=> show(state.game && state.game.node!=null ? 'map' : 'choose');
  if($('#advBtn')) $('#advBtn').onclick = ()=>show('map');
  if($('#mapBack')) $('#mapBack').onclick = ()=>show('setup');
  $$('.gc-mode').forEach(b=> b.onclick = ()=>{ setGameMode(b.dataset.gmode); persist(); });
  reflectGameMode();
}
function reflectGameMode(){
  $$('.gc-mode').forEach(b=>{ const on=b.dataset.gmode===state.gameMode; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
}
function setGameMode(m){ state.gameMode = m==='attack' ? 'attack' : 'countdown'; reflectGameMode(); }

wireStudy();
wireMonitor();
wireGame();
boot();
