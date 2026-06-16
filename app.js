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
  results: {}, // word -> 'got' | 'miss'
};

const LS = 'lux-fc-settings';

async function boot(){
  try{
    const res = await fetch('data/flashcards.json', {cache:'force-cache'});
    state.data = await res.json();
  }catch(e){
    $('#loading').textContent = 'Could not load vocabulary data.';
    return;
  }
  $('#loading').classList.add('hidden');
  buildSetup();
  restoreSettings();
  recount();
}

function buildSetup(){
  const d = state.data;
  // pages
  $('#pageFrom').min = $('#pageTo').min = $('#pageFromR').min = $('#pageToR').min = d.pageMin;
  $('#pageFrom').max = $('#pageTo').max = $('#pageFromR').max = $('#pageToR').max = d.pageMax;
  $('#pageFrom').value = $('#pageFromR').value = d.pageMin;
  $('#pageTo').value = $('#pageToR').value = d.pageMax;
  $('#pageHint').textContent = `book pages ${d.pageMin}–${d.pageMax}`;
  syncSlider();

  // type groups (only show groups whose types exist in data)
  const present = new Set(d.types);
  const tg = $('#typeGroups'); tg.innerHTML = '';
  TYPE_GROUPS.forEach(g=>{
    const has = g.types.filter(t=>present.has(t));
    if(!has.length) return;
    const el = chip(g.label, true);
    el.dataset.group = g.key;
    el.onclick = ()=>{ el.classList.toggle('on'); applyGroups(); recount(); persist(); };
    tg.appendChild(el);
    g.types.forEach(t=>{ if(present.has(t)) state.selTypes.add(t); });
  });
  // individual types
  const ti = $('#typeIndividual'); ti.innerHTML='';
  d.types.forEach(t=>{
    const el = chip(t, true); el.dataset.type=t; el.classList.add('itype');
    el.onclick = ()=>{ el.classList.toggle('on');
      el.classList.contains('on')?state.selTypes.add(t):state.selTypes.delete(t);
      syncGroupChips(); recount(); persist(); };
    ti.appendChild(el);
  });
  syncIndividual();

  // languages
  const lc = $('#langChips'); lc.innerHTML='';
  d.langs.forEach(l=>{
    const el = chip(`${d.langLabels[l]||l}`, state.selLangs.has(l)); el.classList.add('lang'); el.dataset.lang=l;
    el.onclick = ()=>{ el.classList.toggle('on');
      el.classList.contains('on')?state.selLangs.add(l):state.selLangs.delete(l);
      if(state.selLangs.size===0){state.selLangs.add(l);el.classList.add('on');}
      recount(); persist(); };
    lc.appendChild(el);
  });

  // wire controls
  ['pageFrom','pageTo'].forEach(id=>$('#'+id).oninput = ()=>{clampPages(id);syncSlider(true);recount();persist();});
  ['pageFromR','pageToR'].forEach(id=>$('#'+id).oninput = ()=>{fromSlider();recount();persist();});
  $('#typeAll').onclick = ()=>{ $$('#typeGroups .chip').forEach(c=>c.classList.add('on')); applyGroups(); recount(); persist(); };
  $('#typeNone').onclick = ()=>{ $$('#typeGroups .chip').forEach(c=>c.classList.remove('on')); applyGroups(); recount(); persist(); };
  $('#onlyTranslated').onchange = ()=>{recount();persist();};
  $('#shuffle').onchange = persist;
  $('#startBtn').onclick = start;
}

function chip(label, on){ const b=document.createElement('button'); b.className='chip'+(on?' on':''); b.textContent=label; return b; }

// ---- type group <-> individual sync ----
function applyGroups(){
  state.selTypes.clear();
  $$('#typeGroups .chip.on').forEach(c=>{
    const g = TYPE_GROUPS.find(x=>x.key===c.dataset.group);
    g.types.forEach(t=>{ if(state.data.types.includes(t)) state.selTypes.add(t); });
  });
  syncIndividual();
}
function syncIndividual(){ $$('#typeIndividual .chip').forEach(c=>c.classList.toggle('on', state.selTypes.has(c.dataset.type))); }
function syncGroupChips(){
  $$('#typeGroups .chip').forEach(c=>{
    const g = TYPE_GROUPS.find(x=>x.key===c.dataset.group);
    const any = g.types.some(t=>state.selTypes.has(t));
    c.classList.toggle('on', any);
  });
}

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
    if(state.selTypes.size && !c.ty.some(t=>state.selTypes.has(t))) return false;
    if(onlyTr){ if(!c.tr) return false; if(!langs.some(l=>c.tr[l])) return false; }
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
  state.deck=deck; state.idx=0; state.flipped=false; state.results={};
  show('study'); render();
}
function render(){
  const c=state.deck[state.idx]; if(!c) return done();
  const d=state.data;
  $('#flash').classList.remove('flipped'); state.flipped=false;
  $('#frontLesson').textContent = (c.ls&&c.ls[0])||'';
  $('#frontWord').textContent = c.w;
  $('#frontIpa').textContent = c.ip?`/${c.ip}/`:'';
  // context: a LOD example sentence (CC0) with the word emphasised
  let ctx = (c.ex&&c.ex.length)?c.ex[0]:'';
  $('#frontCtx').innerHTML = ctx?escapeEmph(ctx,c.w):'';
  // back
  $('#backPos').textContent = c.pos||'';
  const langs=[...state.selLangs].filter(l=>d.langs.includes(l));
  const ans=$('#backAnswer'); ans.innerHTML='';
  langs.forEach(l=>{
    const ln=document.createElement('div'); ln.className='ln';
    const tr=(c.tr&&c.tr[l])||null;
    ln.innerHTML = `<span class="flag">${l.toUpperCase()}</span>`+
      (tr? `<span class="tr">${esc(tr.join(', '))}</span>` : `<span class="clar">— no translation —</span>`);
    ans.appendChild(ln);
  });
  const ex=$('#backEx');
  // show a different LOD example on the back if available, else the first
  const exBack = (c.ex && c.ex.length>1) ? c.ex[1] : (c.ex && c.ex[0]);
  if(exBack){ ex.innerHTML = `<span class="exl">e.g.</span> ${esc(exBack)}`; }
  else ex.innerHTML='';
  // progress
  $('#counter').textContent = `${state.idx+1}/${state.deck.length}`;
  $('#progBar').style.width = (state.idx/state.deck.length*100)+'%';
  $('#deckMeta').textContent = `page ${Math.min(...c.pg)} · freq ${c.f}`;
}
function flip(){ state.flipped=!state.flipped; $('#flash').classList.toggle('flipped',state.flipped); }
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
  $('#flipBtn').onclick = flip;
  $('#gotBtn').onclick = ()=>mark('got');
  $('#missBtn').onclick = ()=>mark('miss');
  $('#prevBtn').onclick = prev;
  $('#backBtn').onclick = ()=>show('setup');
  $('#reshuffleBtn').onclick = ()=>{ state.deck=shuffle(state.deck); state.idx=0; render(); };
  $('#restartDeck').onclick = ()=>{ state.idx=0; state.results={}; show('study'); render(); };
  $('#newDeck').onclick = ()=>show('setup');
  $('#reviewMissed').onclick = ()=>{
    const missed=Object.keys(state.results).filter(w=>state.results[w]==='miss');
    const set=new Set(missed);
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
  // keyboard (desktop)
  document.addEventListener('keydown',e=>{
    if($('#study').classList.contains('hidden')) return;
    if(e.key===' '||e.key==='Enter'){e.preventDefault();flip();}
    else if(e.key==='ArrowRight')next(); else if(e.key==='ArrowLeft')prev();
    else if(e.key==='1')mark('miss'); else if(e.key==='2')mark('got');
  });
}

// ---- helpers ----
function show(id){ ['setup','study','done'].forEach(s=>$('#'+s).classList.toggle('hidden',s!==id));
  window.scrollTo(0,0); }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function esc(s){ return (s+'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
function escapeEmph(sentence,word){
  const e=esc(sentence); const re=new RegExp(`(^|[^\\p{L}])(${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})(?=[^\\p{L}]|$)`,'iu');
  return e.replace(re,(m,a,b)=>`${a}<b>${b}</b>`);
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
  if(s.from) $('#pageFrom').value=$('#pageFromR').value=s.from;
  if(s.to) $('#pageTo').value=$('#pageToR').value=s.to;
  if(s.langs&&s.langs.length){ state.selLangs=new Set(s.langs.filter(l=>state.data.langs.includes(l)));
    $$('#langChips .chip').forEach(c=>c.classList.toggle('on',state.selLangs.has(c.dataset.lang))); }
  if(s.types){ state.selTypes=new Set(s.types.filter(t=>state.data.types.includes(t))); syncIndividual(); syncGroupChips(); }
  if(typeof s.onlyTr==='boolean') $('#onlyTranslated').checked=s.onlyTr;
  if(typeof s.shuffle==='boolean') $('#shuffle').checked=s.shuffle;
  syncSlider(); paintSlider();
}

wireStudy();
boot();
