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

const DATA_VERSION = '8';  // bump when flashcards.json changes (cache-busts the data URL)

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
  buildSetup();
  restoreSettings();
  recount();
}

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
  $('#startBtn').onclick = start;
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
  let deck=currentFilter();
  if($('#shuffle').checked) deck=shuffle(deck);
  if(!deck.length) return;
  state.range={a:+$('#pageFrom').value, b:+$('#pageTo').value};
  state.deck=deck; state.idx=0; state.revealed=false; state.results={};
  show('study'); render(); playTutorial();
}
function render(){
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
    h += exs.map(s=>`<p class="hx"><span class="exl">e.g.</span> ${escapeEmph(s,c.w)}</p>`).join('');
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
  $('#backEx').innerHTML = exBack ? `<span class="exl">e.g.</span> ${esc(exBack)}` : '';
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
  // page/usage info stays hidden on the question side — it's inside the context drawer
  $('#deckMeta').textContent = '';
  // a11y: announce front
  $('#flash').setAttribute('aria-label', `Card ${state.idx+1} of ${state.deck.length}: ${c.w}. Activate to reveal translation.`);
}
function setReveal(v){
  state.revealed=v;
  const f=$('#flash'); f.classList.toggle('revealed',v);
  f.querySelector('.front').setAttribute('aria-hidden', v);
  f.querySelector('.back').setAttribute('aria-hidden', !v);
}
function reveal(){ setReveal(!state.revealed); }
function frontFace(){ return document.querySelector('.face.front'); }
function collapseHints(){ const f=frontFace(); if(f) f.classList.remove('hints-open');
  const t=$('#frontHintToggle'); if(t) t.textContent='tap here for context ▾'; }
function toggleHints(){ const f=frontFace(); if(!f) return; const open=f.classList.toggle('hints-open');
  const t=$('#frontHintToggle'); if(t) t.textContent= open?'tap to hide ▴':'tap here for context ▾'; }
function resetSwipe(){
  const sw=$('#swipe'); if(!sw) return;
  sw.style.transition='none'; sw.style.transform=''; sw.style.opacity='';
  $('#tint').style.opacity=0; $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=0;
}
function showAnswerToast(c, verdict){
  const langs=[...state.selLangs].filter(l=>state.data.langs.includes(l));
  const trs=langs.map(l=>{ const t=c.tr&&c.tr[l]; if(!t) return null;
    const arr=Array.isArray(t)?t:[t]; return `${l.toUpperCase()} ${arr.slice(0,3).join(', ')}${arr.length>3?'…':''}`; }).filter(Boolean);
  const el=$('#ansToast');
  el.className='ans-toast '+verdict;
  el.innerHTML=`<div class="aw">${esc(c.w)}<span class="verdict">${verdict==='got'?'✓ known':'↻ review'}</span></div>`+
    (trs.length?`<div class="at">${esc(trs.join('  ·  '))}</div>`:`<div class="at">— no translation —</div>`);
  void el.offsetWidth; el.classList.add('show');
  clearTimeout(state.toastT); state.toastT=setTimeout(()=>el.classList.remove('show'), 2700);
}
function grade(verdict){               // 'got' | 'miss'
  if(state.animating) return;
  const c=state.deck[state.idx]; if(!c) return;
  state.results[c.w]=verdict;
  showAnswerToast(c, verdict);
  state.animating=true;
  const sw=$('#swipe'), dir=verdict==='got'?1:-1;
  sw.style.transition='transform .34s ease-out, opacity .34s ease-out';
  sw.style.transform=`translateX(${dir*140}%) rotate(${dir*18}deg)`;
  sw.style.opacity='0';
  setTimeout(()=>{
    state.animating=false;
    if(state.idx<state.deck.length-1){ state.idx++; render(); popIn(); }
    else done();
  }, 340);
}
function popIn(){
  const sw=$('#swipe'); sw.style.transition='none'; sw.style.transform='scale(.96)'; sw.style.opacity='.4';
  requestAnimationFrame(()=>{ sw.style.transition='transform .2s, opacity .2s'; sw.style.transform=''; sw.style.opacity=''; });
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
  $('#doneStats').innerHTML = `You went through <b>${state.deck.length}</b> cards.<br>✓ ${got} got &nbsp; • &nbsp; ↻ ${miss} to review`;
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
  let dragging=false, x0=0, y0=0, dx=0, moved=false;
  const THRESH=88;
  function down(e){
    if(state.animating) return;
    if(e.target.closest && e.target.closest('a')) return;  // let links (e.g. LOD) work natively
    if(state.tutorial) stopTutorial();
    dragging=true; moved=false; x0=e.clientX; y0=e.clientY; dx=0;
    sw.style.transition='none'; sw.classList.add('dragging');
    try{ sw.setPointerCapture(e.pointerId); }catch(_){}
  }
  function move(e){
    if(!dragging) return;
    dx=e.clientX-x0;
    if(Math.abs(dx)>6) moved=true;
    sw.style.transform=`translateX(${dx}px) rotate(${dx*0.04}deg)`;
    const t=Math.min(Math.abs(dx)/THRESH,1);
    tint.style.background = dx>=0?'var(--accent)':'var(--warn)';
    tint.style.opacity = (moved? t*0.32 : 0);
    $('#stampGot').style.opacity = dx>0? t : 0;
    $('#stampMiss').style.opacity = dx<0? t : 0;
  }
  function up(){
    if(!dragging) return; dragging=false; sw.classList.remove('dragging');
    if(Math.abs(dx)>=THRESH){ grade(dx>0?'got':'miss'); return; }
    if(!moved){                                   // a tap (no drag)
      if(state.revealed){ reveal(); }             // on the answer side: tap flips back
      else {
        const rect=flash.getBoundingClientRect();
        if(y0 > rect.top + rect.height*0.6){ toggleHints(); }  // bottom of card → hints drawer
        else { collapseHints(); reveal(); }                    // upper area → reveal the answer
      }
    }
    sw.style.transition='transform .25s, opacity .25s'; sw.style.transform='';
    tint.style.opacity=0; $('#stampGot').style.opacity=0; $('#stampMiss').style.opacity=0;
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
    else if(e.key==='ArrowRight') grade('got');
    else if(e.key==='ArrowLeft')  grade('miss');
    else if(e.key==='ArrowDown'){ e.preventDefault(); toggleHints(); }
    else if(e.key==='1') grade('miss');
    else if(e.key==='2') grade('got');
  });
}

// ---- helpers ----
function show(id){
  ['setup','study','done'].forEach(s=>$('#'+s).classList.toggle('hidden',s!==id));
  window.scrollTo(0,0);
  const sec=$('#'+id); sec.setAttribute('tabindex','-1');
  try{ sec.focus({preventScroll:true}); }catch(e){ sec.focus(); }
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
    onlyTr:$('#onlyTranslated').checked, shuffle:$('#shuffle').checked };
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
  syncSlider(); paintSlider();
}

wireStudy();
boot();
