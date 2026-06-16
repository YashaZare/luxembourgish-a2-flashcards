'use strict';
/* Lëtzebuergesch Flashcards — A2. Vanilla JS, no build step. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Group the 23 source types into friendly toggles.
const TYPE_GROUPS = [
  { key: 'text',    label: '💬 Text & dialogue', types: ['dialogue','narration','explanation','example'] },
  { key: 'q',       label: '❓ Questions & tasks', types: ['question','instruction'] },
  { key: 'title',   label: '🔠 Titles & headings', types: ['title','subtitle','section-heading','topic-heading'] },
  { key: 'illus',   label: '🖼️ Illustrations', types: ['illustration-text','label','caption'] },
  { key: 'vocab',   label: '📋 Vocabulary lists', types: ['vocabulary','word-list-item'] },
  { key: 'grammar', label: '📐 Grammar', types: ['grammar-term','grammar-example','table-cell','table-header'] },
  { key: 'other',   label: '⋯ Other', types: ['footnote','page-number-word','answer-key','other'] },
];

const state = {
  data: null,
  selTypes: new Set(),
  selLangs: new Set(['en']),
  deck: [], idx: 0, flipped: false,
  range: null, // {a,b} pages being studied
  results: {}, // word -> 'got' | 'miss'
  autoplay: false, // auto-play pronunciation on each new card
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

async function boot(){
  try{
    const res = await fetch('data/flashcards.json?v='+DATA_VERSION, {cache:'force-cache'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    state.data = await res.json();
  }catch(e){
    $('#loading').textContent = 'Could not load vocabulary data. Please refresh.';
    return;
  }
  $('#loading').classList.add('hidden');
  if(global_SRS()) SRS.store.load();
  state.cardByWord = {};
  for(const c of state.data.cards) state.cardByWord[c.w] = c;
  buildSetup();
  restoreSettings();
  recount();
  renderMemory();
}
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
    const el = chip(g.label, true); el.dataset.group = g.key;
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
  if($('#autoPlay')) $('#autoPlay').onchange = ()=>{ state.autoplay=$('#autoPlay').checked; persist(); };
  $('#startBtn').onclick = start;
  if($('#reviewDueBtn')) $('#reviewDueBtn').onclick = startReviewDue;
  syncGroupChips();
}

function chip(label, on){ const b=document.createElement('button'); b.type='button'; b.className='chip'+(on?' on':'');
  b.textContent=label; b.setAttribute('aria-pressed', !!on); return b; }

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
function start(){
  ensureCtx();   // unlock Web Audio within this tap so later autoplay/replay can sound
  let deck=currentFilter();
  if($('#shuffle').checked) deck=shuffle(deck);
  if(!deck.length) return;
  state.range={a:+$('#pageFrom').value, b:+$('#pageTo').value};
  state.autoplay = !!($('#autoPlay') && $('#autoPlay').checked);
  syncPlayFab();
  state.reviewMode=false;
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('study'); render(); playTutorial();
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
  // auto-play the word's pronunciation when a new card appears (if the user enabled it).
  // The deck is only reached via a tap/swipe gesture, so playback is already unlocked.
  if(hasAudio && state.autoplay) playAudio(c);

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
    `<span class="m-pages">📄 ${c.pg.length} page${c.pg.length>1?'s':''}: ${shown.join(', ')}${moreP}</span>`+
    `<span class="m-types">🏷 ${esc(tShown)}</span>`;
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
  const ans=$('#backAnswer'); ans.innerHTML='';
  langs.forEach(l=>{
    const ln=document.createElement('div'); ln.className='ln';
    const tr=(c.tr&&c.tr[l])||null;
    const trv = Array.isArray(tr)?tr.join(', '):(tr?String(tr):null);
    ln.innerHTML = `<span class="flag">${l.toUpperCase()}</span>`+
      (trv? `<span class="tr">${esc(trv)}</span>` : `<span class="clar">— no translation —</span>`);
    ans.appendChild(ln);
  });
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
}
function reveal(){ setReveal(!state.revealed); }
function frontFace(){ return document.querySelector('#flash .face.front'); }
// confidence on a RIGHT swipe is read from where the card is dropped vertically:
// top of the card area = Easy (green), bottom = Hard (orange), middle = Good
function confFromY(y){
  const wrap=$('#flashWrap'); const r=wrap.getBoundingClientRect();
  let f = 1 - (y - r.top)/r.height; f = Math.min(Math.max(f,0),1);   // 1 = top/easy … 0 = bottom/hard
  if(f>=0.6)  return {f, grade:4, label:'EASY', cls:'easy', color:'var(--accent)'};
  if(f>=0.3)  return {f, grade:3, label:'GOOD', cls:'good', color:'#7bd88f'};
  return            {f, grade:2, label:'HARD', cls:'hard', color:'var(--gold)'};
}
function showConfLine(on, cg, t){
  const line=$('#confLine'); if(!line) return;
  if(!on){ line.classList.remove('show'); line.style.opacity=''; return; }
  line.classList.add('show');
  // opacity follows how far the card has been dragged → grows in gradually, never pops
  line.style.opacity = Math.min(Math.max(t==null?1:t*1.15,0),1);
  const dot=$('#confDot'), lab=$('#confLabel'), top=((1-cg.f)*100)+'%';
  if(dot){ dot.style.top=top; dot.className='conf-dot '+cg.cls; }
  if(lab){ lab.style.top=top; lab.className='conf-label '+cg.cls; lab.textContent=cg.label; }
}
function collapseHints(){ const f=frontFace(); if(f) f.classList.remove('hints-open');
  const t=$('#frontHintToggle'); if(t) t.textContent='tap here for context ▾'; }
function toggleHints(){ const f=frontFace(); if(!f) return; const open=f.classList.toggle('hints-open');
  const t=$('#frontHintToggle'); if(t) t.textContent= open?'tap to hide ▴':'tap here for context ▾'; }
function resetSwipe(){
  const sw=$('#swipe'); if(!sw) return;
  sw.style.transition='none'; sw.style.transform=''; sw.style.opacity='';
  $('#tint').style.opacity=0; $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=0;
}
// FSRS grade → short label shown on the stamp/toast
const GRADE_LABEL = {1:'AGAIN', 2:'HARD', 3:'GOOD', 4:'EASY'};
function showAnswerToast(c, verdict, g){
  const langs=[...state.selLangs].filter(l=>state.data.langs.includes(l));
  const trs=langs.map(l=>{ const t=c.tr&&c.tr[l]; if(!t) return null;
    const arr=Array.isArray(t)?t:[t]; return `${l.toUpperCase()} ${arr.slice(0,3).join(', ')}${arr.length>3?'…':''}`; }).filter(Boolean);
  const el=$('#ansToast');
  el.className='ans-toast '+verdict;
  const tag = verdict==='got' ? `✓ ${(GRADE_LABEL[g]||'GOOD').toLowerCase()}` : '↻ review';
  el.innerHTML=`<div class="aw">${esc(c.w)}<span class="verdict">${tag}</span></div>`+
    (trs.length?`<div class="at">${esc(trs.join('  ·  '))}</div>`:`<div class="at">— no translation —</div>`);
  void el.offsetWidth; el.classList.add('show');
  clearTimeout(state.toastT); state.toastT=setTimeout(()=>el.classList.remove('show'), 8100);
}
// verdict 'got'|'miss' drives the visual; srsGrade (1–4) feeds the scheduler;
// flyDir 'left'|'right'|'up' is the exit animation.
function grade(verdict, srsGrade, flyDir){
  if(state.animating) return;
  const c=state.deck[state.idx]; if(!c) return;
  state.results[c.w]=verdict;
  const g = srsGrade || (verdict==='got' ? 3 : 1);   // default right=Good, left=Again
  if(global_SRS()) SRS.store.grade(c.w, g);
  showAnswerToast(c, verdict, g);
  state.animating=true;
  const sw=$('#swipe');
  $('#peek').classList.add('rise');     // the next card (already behind) rises to the front
  sw.style.transition='transform .34s ease-out, opacity .34s ease-out';
  if(flyDir==='up'){ sw.style.transform='translateY(-135%) scale(.86)'; }
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
  if(global_SRS()){ const t=SRS.store.totals();
    extra = `<br><span class="done-mem">🧠 <b>${t.known}</b> known · <b>${t.learning}</b> learning`+
            (t.due?` · 🔁 ${t.due} still due`:` · all reviews cleared ✓`)+`</span>`; }
  $('#doneStats').innerHTML = `You went through <b>${state.deck.length}</b> cards.<br>✓ ${got} got &nbsp; • &nbsp; ↻ ${miss} to review${extra}`;
  $('#reviewMissed').style.display = miss?'':'none';
  show('done');
}

// ---- nav wiring ----
function wireStudy(){
  const flash=$('#flash'), sw=$('#swipe'), tint=$('#tint');
  $('#prevBtn').onclick = ()=>{ stopTutorial(); prev(); };
  $('#backBtn').onclick = ()=>{ stopTutorial(); show('setup'); };
  $('#reshuffleBtn').onclick = ()=>{ state.deck=shuffle(state.deck); state.idx=0; render(); playTutorial(); };
  $('#restartDeck').onclick = ()=>{ state.idx=0; state.results={}; show('study'); render(); playTutorial(); };
  $('#newDeck').onclick = ()=>show('setup');
  $('#reviewMissed').onclick = ()=>{
    const set=new Set(Object.keys(state.results).filter(w=>state.results[w]==='miss'));
    state.deck=state.deck.filter(c=>set.has(c.w)); state.idx=0; state.results={};
    if(state.deck.length){ show('study'); render(); playTutorial(); } else show('setup');
  };
  flash.onkeydown = e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); stopTutorial(); reveal(); } };

  // ---- swipe (pointer = touch + mouse) ----
  let dragging=false, deciding=false, axis=null, x0=0, y0=0, dx=0, dy=0, lastY=0, startedInHints=false;
  const THRESH=88, VTHRESH=78, SWITCH_MARGIN=16;   // hysteresis for changing swipe direction
  function resetStamp(){ const s=$('#stampGot'); s.style.opacity=0; s.className='stamp got'; s.textContent='KNOW IT ✓';
    $('#stampMiss').style.opacity=0; }
  // wipe a swipe's visuals when the user switches direction mid-gesture
  function clearDragVisuals(){ sw.style.transform=''; tint.style.opacity=0; showConfLine(false);
    $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=0; }
  // the hint toggle is the only thing that hides the drawer; tapping/scrolling the
  // hints body must NOT collapse it
  $('#frontHintToggle').onclick = (e)=>{ e.stopPropagation(); if(state.tutorial) stopTutorial(); toggleHints(); };
  $('#frontSay').onclick = (e)=>{ e.stopPropagation(); playAudio(state.deck[state.idx]); };
  $('#backSay').onclick = (e)=>{ e.stopPropagation(); playAudio(state.deck[state.idx]); };
  // bottom button = auto-play on/off toggle only; it plays nothing on its own
  if($('#playFab')) $('#playFab').onclick = (e)=>{
    e.stopPropagation();
    state.autoplay = !state.autoplay;
    if($('#autoPlay')) $('#autoPlay').checked = state.autoplay;
    persist(); syncPlayFab();
  };
  // example-sentence speakers are rendered into card HTML each turn → delegate
  flash.addEventListener('click', (e)=>{
    const b=e.target.closest && e.target.closest('.exsay');
    if(b){ e.stopPropagation(); playExampleAudio(b.dataset.h, b); }
  });

  function down(e){
    if(state.animating) return;
    // interactive bits handle themselves — never start a swipe on them
    if(e.target.closest && (e.target.closest('a') || e.target.closest('.say') || e.target.closest('.exsay') || e.target.closest('#frontHintToggle'))) return;
    if(state.tutorial) stopTutorial();
    // note whether the gesture began on the tips, so a *tap* there won't collapse them
    startedInHints = !!(e.target.closest && e.target.closest('.hints'));
    // start "deciding": don't claim the gesture or capture the pointer until we know it's a
    // horizontal swipe — that lets a vertical drag on the tips scroll the drawer natively
    deciding=true; dragging=false; axis=null; x0=e.clientX; y0=e.clientY; dx=0;
  }
  function engage(e){
    dragging=true; deciding=false;
    sw.style.transition='none'; sw.classList.add('dragging');
    try{ sw.setPointerCapture(e.pointerId); }catch(_){}
  }
  function move(e){
    if(!deciding && !dragging) return;
    const ddx=e.clientX-x0, ddy=e.clientY-y0; lastY=e.clientY;
    if(deciding){
      if(Math.abs(ddx)<8 && Math.abs(ddy)<8) return;            // not enough movement to decide
      if(Math.abs(ddx) >= Math.abs(ddy)){ axis='x'; engage(e); }        // horizontal → swipe L/R
      else if(!startedInHints && ddy<0){ axis='up'; engage(e); }        // upward on the card → "perfect"
      else { axis='y'; deciding=false; return; }                        // down / in-tips → native scroll
    }
    if(!dragging) return;
    // trust the user: once we've captured the pointer, let them change their mind between a
    // horizontal swipe and an upward "perfect" — switch whenever the other direction clearly
    // dominates (a margin of hysteresis keeps it from flickering at the diagonal).
    if(axis==='x' || axis==='up'){
      const ax=Math.abs(ddx), ay=Math.abs(ddy);
      let want=axis;
      if(ax > ay + SWITCH_MARGIN) want='x';
      else if(ay > ax + SWITCH_MARGIN && ddy<0 && !startedInHints) want='up';
      if(want!==axis){ axis=want; clearDragVisuals(); }
    }
    if(axis==='up'){                          // swipe up = perfect / Easy (push far out)
      dx=0; dy=Math.min(ddy,0);
      const t=Math.min(-dy/VTHRESH,1);
      sw.style.transform=`translateY(${dy}px) scale(${1-t*0.05})`;
      tint.style.background='var(--accent)'; tint.style.opacity=t*0.30;
      const s=$('#stampGot'); s.textContent='PERFECT ✓'; s.className='stamp got easy'; s.style.opacity=t;
      $('#stampMiss').style.opacity=0; showConfLine(false);
      return;
    }
    dy=0; dx=ddx;                             // horizontal
    sw.style.transform=`translateX(${dx}px) rotate(${dx*0.04}deg)`;
    const t=Math.min(Math.abs(dx)/THRESH,1);
    if(dx>0){                                 // RIGHT → confidence set by vertical drop position
      const cg=confFromY(lastY);
      showConfLine(true, cg, t);              // fade the gauge in with the drag, no pop
      tint.style.background=cg.color; tint.style.opacity=t*0.30;
      const s=$('#stampGot'); s.textContent=cg.label+' ✓'; s.className='stamp got '+cg.cls; s.style.opacity=t;
      $('#stampMiss').style.opacity=0;
    } else {                                  // LEFT → Again
      showConfLine(false);
      tint.style.background='var(--warn)'; tint.style.opacity=t*0.30;
      $('#stampMiss').style.opacity=t; $('#stampGot').style.opacity=0;
    }
  }
  function up(){
    const wasDragging=dragging, ax=axis;
    deciding=false; dragging=false; sw.classList.remove('dragging'); showConfLine(false);
    if(wasDragging && ax==='up' && -dy>=VTHRESH){ grade('got', 4, 'up'); resetStamp(); return; }
    if(wasDragging && ax==='x' && Math.abs(dx)>=THRESH){
      if(dx>0) grade('got', confFromY(lastY).grade, 'right');
      else grade('miss', 1, 'left');
      resetStamp(); return;
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
    sw.style.transition='transform .25s, opacity .25s'; sw.style.transform='';
    tint.style.opacity=0; resetStamp();
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
function show(id){
  ['setup','study','done'].forEach(s=>$('#'+s).classList.toggle('hidden',s!==id));
  window.scrollTo(0,0);
  const sec=$('#'+id); sec.setAttribute('tabindex','-1');
  try{ sec.focus({preventScroll:true}); }catch(e){ sec.focus(); }
  if(id==='setup') renderMemory();
}

// ---- spaced repetition: memory summary + "review due" ----
function renderMemory(){
  const bar=$('#memBar'); if(!bar || !global_SRS()) return;
  const t=SRS.store.totals();
  const btn=$('#reviewDueBtn'), stats=$('#memStats');
  if(t.seen===0){                       // brand-new user — keep the screen clean
    bar.hidden=true; return;
  }
  bar.hidden=false;
  if(stats) stats.innerHTML =
    `🧠 <b>${t.known}</b> known · <b>${t.learning}</b> learning`+
    (t.due?` · <span class="due">🔁 ${t.due} due</span>`:` · all reviewed ✓`);
  if(btn){
    btn.hidden = !t.due;
    $('#dueCount').textContent = t.due;
  }
}
function startReviewDue(){
  if(!global_SRS()) return;
  const due=SRS.store.dueWords();                    // most-overdue first
  const deck=due.map(w=>state.cardByWord[w]).filter(Boolean).slice(0,120);
  if(!deck.length) return;
  ensureCtx();
  state.autoplay = !!($('#autoPlay') && $('#autoPlay').checked);
  syncPlayFab();
  state.range=null;                                  // due review spans all pages
  state.reviewMode=true;
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('study'); render(); playTutorial();
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
// the bottom button is purely an auto-play on/off toggle — it never plays audio itself
function syncPlayFab(){
  const fab=$('#playFab'); if(!fab) return;
  fab.classList.toggle('on', !!state.autoplay);
  fab.textContent = state.autoplay ? '🔊' : '🔇';
  fab.setAttribute('aria-pressed', state.autoplay?'true':'false');
  fab.setAttribute('aria-label', state.autoplay?'Auto-play on — tap to turn off':'Auto-play off — tap to turn on');
}
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
  const spk = a ? ` <button class="exsay" type="button" data-h="${esc(a)}" aria-label="Play example sentence">🔊</button>` : '';
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
    autoplay:!!($('#autoPlay')&&$('#autoPlay').checked) };
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
  if(typeof s.autoplay==='boolean' && $('#autoPlay')) $('#autoPlay').checked=s.autoplay;
  syncSlider(); paintSlider();
}

wireStudy();
boot();
