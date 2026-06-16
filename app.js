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

const DATA_VERSION = '3';  // bump when flashcards.json changes (cache-busts the data URL)

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
  state.deck=deck; state.idx=0; state.flipped=false; state.results={};
  show('study'); render();
}
function render(){
  const c=state.deck[state.idx]; if(!c) return done();
  const d=state.data;
  setFlip(false);
  $('#frontLesson').textContent = relevantLesson(c)||'';
  $('#frontWord').textContent = c.w;
  $('#frontIpa').textContent = c.ip?`/${c.ip}/`:'';
  const ctx = (c.ex&&c.ex.length)?c.ex[0]:'';
  $('#frontCtx').innerHTML = ctx?escapeEmph(ctx,c.w):'';
  // "marked with the pages it's used in, and where" — pages (in-range first) + location types
  const r=state.range; const PCAP=12;
  let pages=c.pg.slice();
  if(r){ const inR=pages.filter(p=>p>=r.a&&p<=r.b), out=pages.filter(p=>p<r.a||p>r.b); pages=inR.concat(out); }
  const shown=pages.slice(0,PCAP).map(p=>(r&&p>=r.a&&p<=r.b)?`<b>${p}</b>`:`${p}`);
  const moreP=pages.length>PCAP?` +${pages.length-PCAP}`:'';
  const types=typeLabels(c.ty);
  const tShown=types.slice(0,6).join(', ')+(types.length>6?`, +${types.length-6}`:'');
  $('#frontMeta').innerHTML =
    `<span class="m-pages">📄 ${c.pg.length} page${c.pg.length>1?'s':''}: ${shown.join(', ')}${moreP}</span>`+
    `<span class="m-types">🏷 ${esc(tShown)}</span>`;
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
  // progress
  $('#counter').textContent = `${state.idx+1}/${state.deck.length}`;
  $('#progBar').style.width = (state.idx/state.deck.length*100)+'%';
  const inRangeN = r? c.pg.filter(p=>p>=r.a&&p<=r.b).length : c.pg.length;
  $('#deckMeta').textContent = r && inRangeN>1 ? `${inRangeN}× in pp.${r.a}–${r.b} · ${c.f}× in book`
                                              : `${c.f}× in book`;
  // a11y: announce front
  $('#flash').setAttribute('aria-label', `Card ${state.idx+1} of ${state.deck.length}: ${c.w}. Activate to reveal translation.`);
}
function setFlip(v){
  state.flipped=v;
  const f=$('#flash'); f.classList.toggle('flipped',v);
  f.querySelector('.front').setAttribute('aria-hidden', v);
  f.querySelector('.back').setAttribute('aria-hidden', !v);
}
function flip(){ setFlip(!state.flipped); }
function mark(r){ const c=state.deck[state.idx]; if(c) state.results[c.w]=r; next(); }
function next(){ if(state.idx<state.deck.length-1){state.idx++;render();} else done(); }
function prev(){ if(state.idx>0){state.idx--;render();} }
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
  $('#flash').onclick = flip;
  $('#flash').onkeydown = e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); flip(); } };
  $('#flipBtn').onclick = flip;
  $('#gotBtn').onclick = ()=>mark('got');
  $('#missBtn').onclick = ()=>mark('miss');
  $('#prevBtn').onclick = prev;
  $('#backBtn').onclick = ()=>show('setup');
  $('#reshuffleBtn').onclick = ()=>{ state.deck=shuffle(state.deck); state.idx=0; render(); };
  $('#restartDeck').onclick = ()=>{ state.idx=0; state.results={}; show('study'); render(); };
  $('#newDeck').onclick = ()=>show('setup');
  $('#reviewMissed').onclick = ()=>{
    const set=new Set(Object.keys(state.results).filter(w=>state.results[w]==='miss'));
    state.deck=state.deck.filter(c=>set.has(c.w)); state.idx=0; state.results={};
    if(state.deck.length){ show('study'); render(); } else show('setup');
  };
  // swipe
  let x0=null,y0=null;
  const w=$('#flashWrap');
  w.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
  w.addEventListener('touchend',e=>{
    if(x0==null) return; const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)){ dx<0?next():prev(); }
    x0=y0=null;
  },{passive:true});
  // keyboard (desktop) — ignore when focus is on a control to avoid double activation
  document.addEventListener('keydown',e=>{
    if($('#study').classList.contains('hidden')) return;
    if((e.key===' '||e.key==='Enter') && e.target.closest && e.target.closest('button')) return;
    if(e.key===' '||e.key==='Enter'){e.preventDefault();flip();}
    else if(e.key==='ArrowRight')next(); else if(e.key==='ArrowLeft')prev();
    else if(e.key==='1')mark('miss'); else if(e.key==='2')mark('got');
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
