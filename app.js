/* 일일펑💥 — 외부 라이브러리 없이 작동하는 개인용 PWA */
(() => {
  'use strict';
  const STORAGE_KEY = 'ililpung-v1';
  const SOUND_KEY = 'ililpung-sound-v1';
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parseDay = (key) => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const shiftDay = (key, n) => { const d=parseDay(key); d.setDate(d.getDate()+n); return dateKey(d); };
  const diffDays = (a,b) => Math.round((Date.UTC(...a.split('-').map((n,i)=>i===1?Number(n)-1:Number(n))) - Date.UTC(...b.split('-').map((n,i)=>i===1?Number(n)-1:Number(n))))/DAY_MS);
  const today = () => dateKey();
  const escapeHTML = (str) => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(parseDay(s)) === s;
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.floor(Math.random()*1e7)}`;
  const allDays = [0,1,2,3,4,5,6];
  function createStarterData() {
    const start=today();
    const rows=[['영양제 먹기','08:30'],['오전 10시까지 간헐적 단식하기','10:00'],['블로그 작업하기','14:00'],['AI 공부하기','19:00']];
    return {version:1,tasks:rows.map(([title,time])=>({id:uid(),title,time,createdDate:start,archived:false,periods:[{from:start,to:null}],schedules:[{from:start,days:[...allDays]}]})),completions:{},failures:{}};
  }
  function validateImport(input) {
    if (!input || !Array.isArray(input.tasks) || !input.completions || typeof input.completions!=='object' || Array.isArray(input.completions)) throw Error('올바른 일일펑 백업 파일이 아니에요.');
    if (input.tasks.length > 500) throw Error('항목 수가 너무 많아요.');
    const ids=new Set();
    const tasks=input.tasks.map(t=>{
      if (typeof t.id!=='string' || t.id.length>90 || !t.id || ids.has(t.id) || typeof t.title!=='string' || !t.title.trim() || t.title.length>45 || !validDate(t.createdDate)) throw Error('할 일 항목 정보가 올바르지 않아요.');
      ids.add(t.id);
      if (!Array.isArray(t.periods) || !Array.isArray(t.schedules) || !t.schedules.length) throw Error('반복 설정 정보가 올바르지 않아요.');
      const periods=t.periods.map(p=>{if(!p||!validDate(p.from)||p.to!==null&&!validDate(p.to)||p.to!==null&&p.to<p.from)throw Error('활성 기간 정보가 올바르지 않아요.');return {from:p.from,to:p.to};});
      const schedules=t.schedules.map(s=>{if(!s||!validDate(s.from)||!Array.isArray(s.days)||!s.days.length||s.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('반복 요일 정보가 올바르지 않아요.');return {from:s.from,days:[...new Set(s.days)]};}).sort((a,b)=>a.from.localeCompare(b.from));
      const time=typeof t.time==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.time) ? t.time : '';
      return {id:t.id,title:t.title.trim(),time,createdDate:t.createdDate,archived:Boolean(t.archived),periods,schedules};
    });
    const completions={};
    for (const [id,dates] of Object.entries(input.completions)) {
      if (!ids.has(id) || !dates || typeof dates!=='object' || Array.isArray(dates)) continue;
      completions[id]={};
      for(const [day,stamp] of Object.entries(dates)) if(validDate(day)&&day<=today()&&typeof stamp==='string'&&stamp.length<80)completions[id][day]=stamp;
    }
    // 기존 v1 백업에는 failures가 없을 수 있어요. 없으면 빈 기록으로 복원합니다.
    const failures={};
    if(input.failures!==undefined){
      if(!input.failures||typeof input.failures!=='object'||Array.isArray(input.failures))throw Error('불발 기록 정보가 올바르지 않아요.');
      for(const [id,dates] of Object.entries(input.failures)){
        if(!ids.has(id)||!dates||typeof dates!=='object'||Array.isArray(dates))continue;
        failures[id]={};
        for(const [day,stamp] of Object.entries(dates)){
          if(validDate(day)&&day<=today()&&typeof stamp==='string'&&stamp.length<80&&!completions[id]?.[day])failures[id][day]=stamp;
        }
      }
    }
    return {version:1,tasks,completions,failures};
  }
  function loadData() {
    try {const raw=localStorage.getItem(STORAGE_KEY); return raw ? validateImport(JSON.parse(raw)) : createStarterData();}
    catch(err) { console.error('저장 기록 읽기 실패:',err); return createStarterData(); }
  }
  let state=loadData();
  let soundEnabled=localStorage.getItem(SOUND_KEY)!=='off';
  let currentPage='today', editingId=null, toastTimer=null, lastOpenedDay=today(), activeBlastIds=new Set();
  let lastPopTime=0, combo=0, audioContext=null;
  let chartRows=[];
  function save() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;} catch(err){console.error(err);showToast('저장 공간 오류: 백업 후 공간을 확인해 주세요.');return false;}}
  function completed(t,day) {return Boolean(state.completions[t.id]?.[day]);}
  function failed(t,day) {return Boolean(state.failures[t.id]?.[day]);}
  function activeOn(t,day) {return t.periods.some(p=>p.from<=day&&(p.to===null||p.to>=day));}
  function scheduleOn(t,day) {const version=t.schedules.filter(s=>s.from<=day).sort((a,b)=>b.from.localeCompare(a.from))[0]; return version ? version.days.includes(parseDay(day).getDay()) : false;}
  function scheduled(t,day) {return t.createdDate<=day&&activeOn(t,day)&&scheduleOn(t,day);}
  function formatDate(key, options={month:'long',day:'numeric',weekday:'long'}) {return parseDay(key).toLocaleDateString('ko-KR',options);}
  function formatWeekdays(t) {const s=t.schedules[t.schedules.length-1]?.days || [];if(s.length===7)return '매일';const ordered=[1,2,3,4,5,6,0].filter(d=>s.includes(d));return ordered.map(d=>weekdays[d]).join(' · ')+'요일';}
  function navigate(page) {if(!['today','records','settings'].includes(page))page='today';currentPage=page;document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page+'Page');document.querySelectorAll('.nav-tab').forEach(el=>{const sel=el.dataset.page===page;el.classList.toggle('is-active',sel);el.setAttribute('aria-current',sel?'page':'false');});if(page==='today')renderToday();if(page==='records')renderRecords();if(page==='settings')renderSettings();if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);window.scrollTo({top:0,behavior:'instant'});}
  function renderToday() {
    const day=today();
    $('todayDate').textContent=formatDate(day);
    const tasks=state.tasks.filter(t=>!t.archived&&scheduled(t,day));
    const done=tasks.filter(t=>completed(t,day)).length;
    const misses=tasks.filter(t=>failed(t,day)).length;
    const remaining=tasks.filter(t=>!completed(t,day)&&!failed(t,day));
    $('doneCount').textContent=done;$('totalCount').textContent=tasks.length;
    $('remainingBadge').textContent=remaining.length;
    const pct=tasks.length?Math.round(done/tasks.length*100):0;
    $('progressFill').style.width=pct+'%';$('progressPct').textContent=pct+'%';
    $('progressHint').textContent=tasks.length===0?'설정에서 오늘의 미션을 만들어 보세요.':remaining.length===0?(misses?`오늘의 기록 완료 · 성공 ${done} / 불발 ${misses}`:'오늘의 모든 미션 클리어!'):misses?`완료 ${done} · 불발 ${misses} · 남은 카드 ${remaining.length}`:done===0?'첫 카드를 터뜨려 볼까요?':`${done}개 완료! 남은 미션도 펑!`;
    const list=$('missionList');
    if(tasks.length===0){list.innerHTML='<div class="empty-missions"><div class="empty-icon">🗓️</div><h3>오늘은 아직 빈 화면!</h3><p>새로운 할 일을 등록하면 오늘부터 미션 카드가 생겨요.</p><button class="primary-button" type="button" data-action="create">＋ 카드 만들기</button></div>';return;}
    const settledHTML=renderSettled(tasks,day);
    if(remaining.length===0){list.innerHTML=(misses?`<div class="complete-box finished-box"><div class="big-complete">✎</div><h3>오늘의 카드 정리 완료</h3><p>펑! ${done}개 · 불발 ${misses}개<br>불발은 오늘 날짜의 그래프에 기록됐어요.</p></div>`:'<div class="complete-box"><div class="big-complete">🏆💥</div><h3>ALL CLEAR!</h3><p>오늘의 할 일을 모두 터뜨렸어요.<br>내일도 새로운 카드가 기다려요.</p></div>')+settledHTML;return;}
    list.innerHTML=remaining.map((t,i)=>`<article class="mission-card" data-task-id="${escapeHTML(t.id)}"><span class="card-index">${String(i+1).padStart(2,'0')}</span><div class="card-copy"><strong>${escapeHTML(t.title)}</strong><span>${t.time?'◷ '+escapeHTML(t.time)+' 기준 · ':''}${escapeHTML(formatWeekdays(t))}</span></div><div class="card-actions"><button class="boom-button" type="button" data-action="boom" data-id="${escapeHTML(t.id)}" aria-label="${escapeHTML(t.title)} 완료하고 폭파하기">펑! 💥</button><button class="miss-button" type="button" data-action="miss" data-id="${escapeHTML(t.id)}" aria-label="${escapeHTML(t.title)} 오늘 불발로 기록하기">불발</button></div></article>`).join('')+settledHTML;
  }
  // 오늘 정리한 카드는 버튼 하나로 전부 되돌려요. 지난 날짜 기록은 건드리지 않아요.
  function renderSettled(tasks,day) {
    const n=tasks.filter(t=>completed(t,day)||failed(t,day)).length;
    if(!n)return '';
    return `<section class="settled-list" aria-label="오늘 정리한 카드"><p>오늘 정리한 카드 <b>${n}</b>개</p><button type="button" class="reset-button" data-action="reset-today">카드 되돌리기</button></section>`;
  }
  function resetToday() {
    const day=today(),targets=state.tasks.filter(t=>!t.archived&&scheduled(t,day)&&(completed(t,day)||failed(t,day)));
    if(!targets.length||targets.some(t=>activeBlastIds.has(t.id)))return;
    if(!confirm(`오늘 정리한 카드 ${targets.length}개를 모두 되돌릴까요?
성공·불발 기록이 오늘 할 일로 돌아가요. 지난 날짜는 바뀌지 않아요.`))return;
    for(const t of targets){if(state.completions[t.id])delete state.completions[t.id][day];if(state.failures[t.id])delete state.failures[t.id][day];}
    save();renderToday();showToast('오늘 카드를 모두 되돌렸어요.');
  }
  function showToast(msg, action=null) {clearTimeout(toastTimer);const box=$('toast');box.replaceChildren();const span=document.createElement('span');span.textContent=msg;box.appendChild(span);if(action){const btn=document.createElement('button');btn.type='button';btn.textContent=action.label;btn.addEventListener('click',()=>{box.hidden=true;clearTimeout(toastTimer);action.fn();},{once:true});box.appendChild(btn);}box.hidden=false;toastTimer=setTimeout(()=>box.hidden=true,action?5500:3000);}
  function playExplosion() {
    if(!soundEnabled) return;
    try {const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;audioContext=audioContext||new Ctx();if(audioContext.state==='suspended')audioContext.resume();const now=audioContext.currentTime; const master=audioContext.createGain();master.gain.setValueAtTime(.19,now);master.gain.exponentialRampToValueAtTime(.001,now+.42);master.connect(audioContext.destination);
      for(let i=0;i<3;i++){const osc=audioContext.createOscillator();const gain=audioContext.createGain();osc.type=i===0?'sawtooth':'square';const at=now+i*.035;osc.frequency.setValueAtTime([260,490,720][i],at);osc.frequency.exponentialRampToValueAtTime([75,200,330][i],at+.13);gain.gain.setValueAtTime(i===0?.36:.16,at);gain.gain.exponentialRampToValueAtTime(.001,at+.2);osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+.21);}const low=audioContext.createOscillator();low.type='triangle';low.frequency.setValueAtTime(95,now);low.frequency.exponentialRampToValueAtTime(38,now+.32);low.connect(master);low.start(now);low.stop(now+.33);
    }catch(err){console.warn('효과음을 재생할 수 없어요.',err);}
  }
  function explodeCard(card) {
    const rect=card.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const fx=$('fxLayer'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.classList.add('is-blasting');
    if(!reduced){
      const flash=document.createElement('div');flash.className='flash';fx.appendChild(flash);setTimeout(()=>flash.remove(),290);
      const ring=document.createElement('div');ring.className='fx-ring';ring.style.setProperty('--x',x+'px');ring.style.setProperty('--y',y+'px');fx.appendChild(ring);setTimeout(()=>ring.remove(),750);
      const burst=document.createElement('div');burst.className='fx-burst';burst.style.setProperty('--x',x+'px');burst.style.setProperty('--y',y+'px');fx.appendChild(burst);setTimeout(()=>burst.remove(),750);
      if(window.IlilFX)IlilFX.blast(x,y,rect,Math.min(combo+1,6));
      else for(let i=0;i<26;i++){const particle=document.createElement('i');particle.className='fx-particle';const a=(i/26)*Math.PI*2+(Math.random()-.5)*.35;const dist=70+Math.random()*175;particle.style.left=x+'px';particle.style.top=y+'px';particle.style.width=(8+Math.random()*16)+'px';particle.style.height=(7+Math.random()*14)+'px';particle.style.background=['#ff593d','#ffd456','#1b1a23','#fff','#ff9459'][i%5];particle.style.setProperty('--dx',Math.cos(a)*dist+'px');particle.style.setProperty('--dy',(Math.sin(a)*dist-25)+'px');particle.style.setProperty('--r',(Math.random()*720-360)+'deg');fx.appendChild(particle);setTimeout(()=>particle.remove(),790);}
      const word=document.createElement('div');word.className='fx-word';word.textContent='펑!';word.style.setProperty('--x',x+'px');word.style.setProperty('--y',y+'px');fx.appendChild(word);setTimeout(()=>word.remove(),750);
      const app=$('app');app.classList.remove('app-shake');void app.offsetWidth;app.classList.add('app-shake');setTimeout(()=>app.classList.remove('app-shake'),340);
    }
    playExplosion();if(navigator.vibrate)navigator.vibrate([25,25,65]);
  }
  function boom(id,btn) {
    const task=state.tasks.find(t=>t.id===id),day=today();
    if(!task||task.archived||!scheduled(task,day)||completed(task,day)||failed(task,day)||activeBlastIds.has(id))return;
    activeBlastIds.add(id);btn.disabled=true;const card=btn.closest('.mission-card');
    if(card)explodeCard(card);
    const now=Date.now();combo=now-lastPopTime<8500?combo+1:1;lastPopTime=now;
    setTimeout(()=>{state.completions[id]??={};state.completions[id][day]=new Date().toISOString();save();activeBlastIds.delete(id);renderToday();showToast(combo>1?`💥 ${combo} COMBO! 연속 폭파 성공!`:'💥 폭파 성공! 멋져요.',{label:'되돌리기',fn:()=>{if(state.completions[id])delete state.completions[id][day];save();renderToday();}});},matchMedia('(prefers-reduced-motion: reduce)').matches?30:430);
  }
  function miss(id) {
    const task=state.tasks.find(t=>t.id===id),day=today();
    if(!task||task.archived||!scheduled(task,day)||completed(task,day)||failed(task,day)||activeBlastIds.has(id))return;
    const stamp=new Date().toISOString();
    state.failures[id]??={};state.failures[id][day]=stamp;
    save();renderToday();
    showToast('불발! 오늘의 실패 기록으로 보냈어요.',{label:'되돌리기',fn:()=>{
      if(state.failures[id]?.[day]===stamp){delete state.failures[id][day];save();if(currentPage==='records')renderRecords();else renderToday();}
    }});
  }
  function openDialog(id=null) {
    editingId=id;const t=state.tasks.find(t=>t.id===id);$('dialogTitle').textContent=t?'카드 수정하기':'새 카드 만들기';$('taskTitle').value=t?.title||'';$('taskTime').value=t?.time||'';const days=t?.schedules[t.schedules.length-1]?.days||allDays;document.querySelectorAll('#weekdayChips input').forEach(c=>c.checked=days.includes(Number(c.value)));$('taskDialog').showModal();$('taskTitle').focus();
  }
  function closeDialog() {$('taskDialog').close();editingId=null;}
  function submitDialog(event) {
    event.preventDefault(); const title=$('taskTitle').value.trim();const time=$('taskTime').value;const days=[...document.querySelectorAll('#weekdayChips input:checked')].map(el=>Number(el.value));
    if(!title){$('taskTitle').focus();showToast('할 일 이름을 입력해 주세요.');return;}
    if(!days.length){showToast('반복 요일을 하나 이상 선택해 주세요.');return;}
    if(editingId){const t=state.tasks.find(t=>t.id===editingId);if(t){t.title=title;t.time=time;const existing=t.schedules.find(s=>s.from===today());if(existing)existing.days=days;else t.schedules.push({from:today(),days});t.schedules.sort((a,b)=>a.from.localeCompare(b.from));}}
    else {state.tasks.push({id:uid(),title,time,createdDate:today(),archived:false,periods:[{from:today(),to:null}],schedules:[{from:today(),days}]});}
    save();closeDialog();navigate(currentPage);showToast('미션 카드가 저장됐어요.');
  }
  function archiveTask(id) {
    const t=state.tasks.find(x=>x.id===id);if(!t||t.archived)return;
    t.archived=true;const current=t.periods.findLast(p=>p.to===null);if(current){const close=(completed(t,today())||failed(t,today()))?today():shiftDay(today(),-1);if(current.from<=close)current.to=close;else t.periods=t.periods.filter(p=>p!==current);}
    save();renderSettings();showToast('카드를 보관했어요. 지난 기록은 남아요.');
  }
  function restoreTask(id) {const t=state.tasks.find(x=>x.id===id);if(!t||!t.archived)return;t.archived=false;t.periods.push({from:today(),to:null});save();renderSettings();showToast('다시 활성화했어요.');}
  function removeTask(id){const t=state.tasks.find(x=>x.id===id);if(!t||!confirm(`“${t.title}” 카드와 모든 기록을 완전히 삭제할까요? 이 작업은 되돌릴 수 없어요.`))return;state.tasks=state.tasks.filter(x=>x.id!==id);delete state.completions[id];save();renderSettings();showToast('카드와 기록을 삭제했어요.');}
  function renderSettings() {
    const active=state.tasks.filter(t=>!t.archived),archived=state.tasks.filter(t=>t.archived);
    const row=(t,off=false)=>`<div class="setting-item"><span class="setting-emoji">${off?'📦':'💣'}</span><div class="setting-copy"><strong>${escapeHTML(t.title)}</strong><span>${escapeHTML(formatWeekdays(t))}${t.time?' · '+escapeHTML(t.time)+' 기준':''}</span></div><div class="setting-actions">${off?`<button type="button" class="small-button" data-action="restore" data-id="${escapeHTML(t.id)}">복원</button><button type="button" class="small-button danger" data-action="remove" data-id="${escapeHTML(t.id)}">삭제</button>`:`<button type="button" class="small-button" data-action="edit" data-id="${escapeHTML(t.id)}">수정</button><button type="button" class="small-button danger" data-action="archive" data-id="${escapeHTML(t.id)}">보관</button>`}</div></div>`;
    $('settingList').innerHTML=active.length?active.map(t=>row(t)).join(''):'<div class="setting-empty">등록된 카드가 없어요. 새 할 일을 만들어 보세요.</div>';
    $('archiveSection').innerHTML=archived.length?`<h3>보관된 카드 · ${archived.length}개</h3><div class="settings-list">${archived.map(t=>row(t,true)).join('')}</div>`:'';
  }
  function datesForRange() {
    const now=today(),range=$('rangeSelect').value;
    if(range==='custom'){const from=$('startDate').value,to=$('endDate').value;if(!validDate(from)||!validDate(to)||from>to)return null;const actualTo=to>now?now:to;if(from>actualTo)return null;return {from,to:actualTo};}
    if(range==='all'){const keys=state.tasks.flatMap(t=>t.periods.map(p=>p.from));const first=keys.length?keys.sort()[0]:now;return {from:first,to:now};}
    return {from:shiftDay(now,-Number(range)+1),to:now};
  }
  function makeDailyStats(range,id) {
    const res=[]; const selected=id==='all'?state.tasks:state.tasks.filter(t=>t.id===id);
    const maxDays=3660;const start=diffDays(range.to,range.from)>maxDays?shiftDay(range.to,-maxDays):range.from;
    for(let day=start;day<=range.to;day=shiftDay(day,1)){
      let done=0,miss=0,pending=0;
      for(const t of selected){if(!scheduled(t,day))continue;if(completed(t,day))done++;else if(failed(t,day)||day<today())miss++;else pending++;}
      res.push({day,done,miss,pending});
    }
    return res;
  }
  function isoWeekKey(day) {const d=parseDay(day),weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday);return dateKey(d);}
  function groupDaily(daily,bucket) {
    const map=new Map();
    for(const r of daily){const key=bucket==='week'?isoWeekKey(r.day):bucket==='month'?r.day.slice(0,7):r.day;if(!map.has(key))map.set(key,{key,from:r.day,to:r.day,done:0,miss:0,pending:0});const g=map.get(key);g.to=r.day;g.done+=r.done;g.miss+=r.miss;g.pending+=r.pending;}
    return [...map.values()];
  }
  const compactLabel=(day)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
  function chartLabel(g,bucket){if(bucket==='month')return `${Number(g.key.slice(5,7))}월`;if(bucket==='week')return compactLabel(g.from);return `${Number(g.from.slice(5,7))}.${Number(g.from.slice(8))}`;}
  function renderChart(daily,bucket) {
    const grouped=groupDaily(daily,bucket);chartRows=grouped;const holder=$('chart');
    const active=grouped.filter(g=>g.done+g.miss+g.pending>0);
    if(!active.length){holder.innerHTML='<div class="chart-empty">아직 표시할 기록이 없어요.<br>오늘 카드를 터뜨리거나 며칠 사용하면 그래프가 나타나요.</div>';$('chartDetail').textContent='';return;}
    const max=Math.max(1,...grouped.map(g=>g.done+g.miss));
    holder.innerHTML=grouped.map((g,i)=>{const done=Math.round(g.done/max*154),miss=Math.round(g.miss/max*154);const label=chartLabel(g,bucket);return `<button class="chart-col" data-chart-index="${i}" type="button" aria-label="${escapeHTML(g.from)}부터 ${escapeHTML(g.to)}까지 완료 ${g.done}건, 미완료 ${g.miss}건, 진행 중 ${g.pending}건" title="${escapeHTML(g.from)} ~ ${escapeHTML(g.to)}: 완료 ${g.done} / 미완료 ${g.miss} / 진행 중 ${g.pending}"><span class="bar-stack"><i class="bar-miss" style="height:${miss}px"></i><i class="bar-done" style="height:${done}px"></i></span><span class="chart-label">${label}</span></button>`;}).join('');
    const activeIndex=grouped.findLastIndex(g=>g.done+g.miss+g.pending>0);
    selectChartColumn(activeIndex);
  }
  function selectChartColumn(i) {
    const g=chartRows[i];if(!g)return;document.querySelectorAll('.chart-col').forEach(el=>el.classList.toggle('selected',Number(el.dataset.chartIndex)===i));
    $('chartDetail').textContent=`${g.from===g.to?formatDate(g.from,{year:'numeric',month:'numeric',day:'numeric'}):g.from+' ~ '+g.to}  ·  💥 완료 ${g.done}건   /   미완료 ${g.miss}건${g.pending?'   /   진행 중 '+g.pending+'건':''}`;
  }
  function renderTrend(daily) {
    const history=daily.filter(d=>d.day<today() && (d.done+d.miss)>0);
    if(history.length<4){$('trendText').textContent='실천한 날짜가 4일 이상 쌓이면 앞부분과 뒷부분의 미완료 비율을 비교해 드려요.';return;}
    const half=Math.floor(history.length/2),first=history.slice(0,half),second=history.slice(half);
    const calc=(rows)=>{const done=rows.reduce((s,x)=>s+x.done,0),miss=rows.reduce((s,x)=>s+x.miss,0);return Math.round(miss/(done+miss)*100);};
    const before=calc(first),after=calc(second),diff=before-after;
    $('trendText').textContent=diff>0?`조회 기간 앞부분 미완료율 ${before}% → 뒷부분 ${after}%. ${diff}%p 줄었어요!`:diff<0?`조회 기간 앞부분 미완료율 ${before}% → 뒷부분 ${after}%. 아직 미완료가 더 많지만, 다음 폭파부터 다시 바뀔 수 있어요.`:`조회 기간 앞부분과 뒷부분의 미완료율이 ${before}%로 같아요. 작은 완료를 하나씩 쌓아 보세요.`;
  }
  function renderRecords() {
    const selected=$('taskSelect').value;
    $('taskSelect').innerHTML='<option value="all">전체 항목</option>'+state.tasks.map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.title)}${t.archived?' (보관됨)':''}</option>`).join('');
    $('taskSelect').value=state.tasks.some(t=>t.id===selected)?selected:'all';
    const range=datesForRange();
    if(!range){$('chart').innerHTML='<div class="chart-empty">유효한 조회 기간을 선택해 주세요.</div>';$('rateStat').textContent='—';$('successStat').innerHTML='0<span>건</span>';$('failureStat').innerHTML='0<span>건</span>';$('chartDetail').textContent='';$('trendText').textContent='시작일과 종료일을 확인해 주세요.';return;}
    const daily=makeDailyStats(range,$('taskSelect').value),done=daily.reduce((s,x)=>s+x.done,0),miss=daily.reduce((s,x)=>s+x.miss,0);
    $('rateStat').textContent=done+miss?Math.round(done/(done+miss)*100)+'%':'—';
    $('successStat').innerHTML=done+'<span>건</span>';$('failureStat').innerHTML=miss+'<span>건</span>';
    renderChart(daily,$('bucketSelect').value);renderTrend(daily);
  }
  function exportBackup() {
    const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`일일펑_백업_${today()}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),2000);showToast('기록 백업 파일을 저장했어요.');
  }
  async function importBackup(file) {
    if(!file)return;
    try{if(file.size>3_000_000)throw Error('백업 파일 용량이 너무 커요.');const parsed=validateImport(JSON.parse(await file.text()));if(!confirm('현재 저장된 할 일과 기록을 백업 파일로 모두 교체할까요?'))return;state=parsed;save();navigate('settings');showToast('백업 기록을 불러왔어요.');}
    catch(err){showToast(err.message||'백업 파일을 읽지 못했어요.');}
    finally{$('importFile').value='';}
  }
  function init() {
    save();
    $('soundToggle').textContent=soundEnabled?'♪ ON':'♪ OFF';$('soundToggle').classList.toggle('is-muted',!soundEnabled);
    document.querySelectorAll('.nav-tab').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
    $('soundToggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;localStorage.setItem(SOUND_KEY,soundEnabled?'on':'off');$('soundToggle').textContent=soundEnabled?'♪ ON':'♪ OFF';$('soundToggle').classList.toggle('is-muted',!soundEnabled);});
    $('quickAdd').addEventListener('click',()=>openDialog());$('settingsAdd').addEventListener('click',()=>openDialog());$('gotoRecords').addEventListener('click',()=>navigate('records'));
    $('missionList').addEventListener('click',(event)=>{const btn=event.target.closest('button[data-action]');if(!btn)return;if(btn.dataset.action==='create')openDialog();else if(btn.dataset.action==='boom')boom(btn.dataset.id,btn);else if(btn.dataset.action==='miss')miss(btn.dataset.id);else if(btn.dataset.action==='reset-today')resetToday();});
    $('settingList').addEventListener('click',settingClick);$('archiveSection').addEventListener('click',settingClick);
    function settingClick(event){const b=event.target.closest('button[data-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.action){case 'edit':openDialog(id);break;case 'archive':archiveTask(id);break;case 'restore':restoreTask(id);break;case 'remove':removeTask(id);break;}}
    $('taskForm').addEventListener('submit',submitDialog);$('dialogClose').addEventListener('click',closeDialog);$('dialogCancel').addEventListener('click',closeDialog);$('taskDialog').addEventListener('click',(e)=>{if(e.target===$('taskDialog'))closeDialog();});
    $('rangeSelect').addEventListener('change',()=>{const r=$('rangeSelect').value;$('customDates').hidden=r!=='custom';if(r==='7')$('bucketSelect').value='day';if(r==='30'||r==='90')$('bucketSelect').value='week';if(r==='all')$('bucketSelect').value='month';renderRecords();});
    ['bucketSelect','taskSelect','startDate','endDate'].forEach(id=>$(id).addEventListener('change',renderRecords));
    $('chart').addEventListener('click',(event)=>{const col=event.target.closest('[data-chart-index]');if(col)selectChartColumn(Number(col.dataset.chartIndex));});
    $('exportBtn').addEventListener('click',exportBackup);$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',e=>importBackup(e.target.files?.[0]));
    $('startDate').value=shiftDay(today(),-29);$('endDate').value=today();
    window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
    function rollover(){const day=today();if(day!==lastOpenedDay){lastOpenedDay=day; if($('endDate').value<day)$('endDate').value=day;navigate(currentPage);}}
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover();});window.addEventListener('focus',rollover);setInterval(rollover,60000);
    navigate(location.hash.slice(1)||'today');
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('오프라인 사용 준비 오류',err));
  }
  init();
})();
