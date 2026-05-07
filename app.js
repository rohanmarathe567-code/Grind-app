// ═══════════════════════════════════════════════════════════════
//  GRIND v2 — app.js  (Enhanced + AI Coach)
// ═══════════════════════════════════════════════════════════════

// ── EXERCISE LIBRARY ────────────────────────────────────────────
const EXERCISES = {
  Chest:     ['Bench Press','Incline Bench','Decline Bench','Push-Ups','Dumbbell Flyes','Cable Flyes','Dips','Pec Dec'],
  Back:      ['Deadlift','Pull-Ups','Barbell Row','Lat Pulldown','Seated Cable Row','T-Bar Row','Single-Arm Row','Face Pulls'],
  Legs:      ['Squat','Leg Press','Romanian Deadlift','Lunges','Leg Curl','Leg Extension','Calf Raises','Hack Squat'],
  Shoulders: ['Overhead Press','Dumbbell OHP','Lateral Raises','Front Raises','Rear Delt Flyes','Arnold Press','Shrugs'],
  Arms:      ['Barbell Curl','Hammer Curl','Preacher Curl','Tricep Pushdown','Skull Crushers','Overhead Tricep Ext','Close-Grip Bench'],
  Core:      ['Plank','Crunches','Leg Raises','Russian Twist','Ab Wheel','Cable Crunch','Hanging Knee Raises'],
  Cardio:    ['Running','Cycling','Jump Rope','Rowing','Stair Climber','HIIT Sprints','Battle Ropes','Swimming'],
};

const CAT_TO_STAT = { Chest:'strength',Back:'strength',Legs:'strength',Shoulders:'strength',Arms:'strength',Core:'agility',Cardio:'endurance' };

const PROGRAMS = [
  { icon:'💪', name:'Push Day',  desc:'Chest, shoulders & triceps', exercises:['Bench Press','Overhead Press','Lateral Raises','Tricep Pushdown','Cable Flyes'] },
  { icon:'🏋️', name:'Pull Day',  desc:'Back & biceps',              exercises:['Deadlift','Pull-Ups','Barbell Row','Barbell Curl','Face Pulls'] },
  { icon:'🦵', name:'Leg Day',   desc:'Quads, hams & glutes',      exercises:['Squat','Leg Press','Romanian Deadlift','Leg Curl','Calf Raises'] },
  { icon:'💥', name:'Full Body', desc:'Hit everything at once',    exercises:['Squat','Bench Press','Deadlift','Overhead Press','Pull-Ups','Plank'] },
];

const STAT_COLORS  = { strength:'#7c6dff', endurance:'#00e5a0', power:'#ffd166', agility:'#ff9de2', recovery:'#5edfff' };
const STAT_LABELS  = { strength:'STRENGTH', endurance:'ENDURANCE', power:'POWER', agility:'AGILITY', recovery:'RECOVERY' };

// ── ACHIEVEMENTS ────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_sweat',   icon:'💧', name:'First Sweat',     desc:'Complete your first workout',       check: s => s.workouts.length >= 1 },
  { id:'streak_3',      icon:'🔥', name:'On Fire',         desc:'3-day workout streak',              check: s => s.user.streak >= 3 },
  { id:'streak_7',      icon:'⚡', name:'Electrified',     desc:'7-day streak',                      check: s => s.user.streak >= 7 },
  { id:'level_5',       icon:'⭐', name:'Rising Star',     desc:'Reach Level 5',                     check: s => getLevel() >= 5 },
  { id:'century',       icon:'💯', name:'Century Club',    desc:'Lift 100 kg in one set',            check: s => s.workouts.some(w => w.exercises.some(e => e.sets.some(st => st.weight >= 100))) },
  { id:'sessions_10',   icon:'🎯', name:'Consistent',      desc:'10 sessions completed',             check: s => s.workouts.length >= 10 },
  { id:'pr_breaker',    icon:'🏆', name:'PR Breaker',      desc:'Break a personal record',           check: s => Object.keys(s.prs).length > 0 },
  { id:'volume_king',   icon:'🏋️', name:'Volume King',     desc:'1000 kg volume in one session',     check: s => s.workouts.some(w => sessionVolume(w) >= 1000) },
  { id:'all_muscle',    icon:'💪', name:'Complete Athlete', desc:'Train every muscle group',         check: s => {const cats=new Set(s.workouts.flatMap(w=>w.exercises.map(e=>e.cat)));return['Chest','Back','Legs','Shoulders','Arms','Core','Cardio'].every(c=>cats.has(c));} },
];

// ── STATE ────────────────────────────────────────────────────────
let state = {
  user:       { name:'', level:'', goal:'', joinDate:null, xp:0, streak:0, lastWorkoutDate:null },
  workouts:   [],
  stats:      { strength:0, endurance:0, power:0, agility:0, recovery:0 },
  statHistory:[],
  prs:        {},        // { 'Bench Press': { weight, reps, date, orm } }
  lastWeights:{},        // { 'Bench Press': 80 }
  achievements:[],       // unlocked IDs
  settings:   { restDefault:90 },
};

let session        = null;
let sessionTimer   = null;
let sessionSeconds = 0;
let currentExIdx   = null;
let restTimer      = null;
let restRemaining  = 0;
let chatHistory    = [];   // AI conversation history
let pickerCategory = 'Chest';
let obData         = {};

// ── PERSISTENCE ──────────────────────────────────────────────────
const STORAGE_KEY = 'grind_v2';

function saveState()    { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getApiKey()    { return localStorage.getItem('grind_api_key') || ''; }
function storeApiKey(k) { localStorage.setItem('grind_api_key', k); }

function loadState() {
  // Try current key, then migrate from older versions
  const raw = localStorage.getItem(STORAGE_KEY)
           || localStorage.getItem('grind_state_v2')
           || localStorage.getItem('grind_state');
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state = { ...state, ...s };
    // Ensure all fields from v2 exist (safe migration)
    if (!state.prs)         state.prs         = {};
    if (!state.lastWeights) state.lastWeights  = {};
    if (!state.achievements)state.achievements = [];
    if (!state.statHistory) state.statHistory  = [];
    if (!state.settings)    state.settings     = { restDefault: 90 };
    if (!state.bodyWeightLog) state.bodyWeightLog = [];
    // One-time fix: reset stats that were auto-seeded at 20 (old default)
    // A real stat of exactly 20 from training is virtually impossible for all 5
    const st = state.stats;
    if (st.strength === 20 && st.endurance === 20 && st.power === 20 && st.agility === 20 && st.recovery === 20) {
      state.stats = { strength:0, endurance:0, power:0, agility:0, recovery:0 };
    }
    saveState(); // re-save under current key
    return true;
  } catch(e) { return false; }
}

// ── BOOT ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Register service worker for PWA/offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (loadState() && state.user.name) {
    launchApp();
  } else {
    showLanding();
  }
});

// ── LANDING PAGE ──────────────────────────────────────────────────
function showLanding() {
  document.getElementById('screen-landing').classList.add('active');
  buildLandingStars();
  // Animate a demo radar with random values so it looks alive
  setTimeout(() => {
    const demo = { strength:72, endurance:55, power:63, agility:48, recovery:60 };
    const orig = {...state.stats};
    state.stats = demo;
    drawRadar('landing-radar');
    state.stats = orig;
  }, 300);
}

function buildLandingStars() {
  const c = document.getElementById('landing-stars');
  if (!c) return;
  for (let i = 0; i < 120; i++) {
    const s = document.createElement('div'); s.className = 'landing-star';
    const size = Math.random() * 2 + 0.5;
    s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random()*100}%;left:${Math.random()*100}%;animation-delay:${(Math.random()*5).toFixed(1)}s;animation-duration:${(Math.random()*3+2).toFixed(1)}s;opacity:${(Math.random()*0.5+0.1).toFixed(2)}`;
    c.appendChild(s);
  }
}

function goToOnboarding() {
  document.getElementById('screen-landing').classList.remove('active');
  document.getElementById('screen-onboarding').classList.add('active');
}

// ── ONBOARDING ───────────────────────────────────────────────────
function obNext(step) {
  if (step === 1) {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) { document.getElementById('ob-name').focus(); return; }
    obData.name = name;
  }
  if (step === 2 && !obData.level) return;
  document.getElementById(`ob-step-${step}`).classList.remove('active');
  document.getElementById(`ob-step-${step+1}`).classList.add('active');
}

function selectChoice(btn) {
  const g = btn.dataset.group;
  document.querySelectorAll(`[data-group="${g}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  obData[g] = btn.dataset.val;
}

function obFinish() {
  if (!obData.goal) return;
  state.user = { name:obData.name, level:obData.level, goal:obData.goal, joinDate:new Date().toISOString(), xp:0, streak:0, lastWorkoutDate:null };
  state.stats = { strength:0, endurance:0, power:0, agility:0, recovery:0 };
  saveState();
  launchApp();
}

// ── LAUNCH ───────────────────────────────────────────────────────
function launchApp() {
  ['screen-landing','screen-onboarding'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('screen-app').classList.add('active');
  updateStreak();
  showStreakBanner();
  renderHeader();
  renderHome();
  renderStats();
  renderHistory();
  refreshCoachPage();
  initSwipe();
  loadRestPreset();
  if (getApiKey() && state.workouts.length >= 2) fetchDailyRecommendation();
}

// ── STREAK BANNER ─────────────────────────────────────────────────
function showStreakBanner() {
  if (state.user.streak < 2) return;
  const today = new Date().toDateString();
  const lastDate = state.user.lastWorkoutDate ? new Date(state.user.lastWorkoutDate).toDateString() : null;
  if (lastDate === today) return; // already trained
  const banner = document.getElementById('streak-banner');
  const num    = document.getElementById('streak-banner-num');
  if (!banner || !num) return;
  num.textContent = state.user.streak;
  banner.classList.remove('hidden');
}
function dismissStreakBanner() {
  document.getElementById('streak-banner').classList.add('hidden');
}

// ── BODY WEIGHT ───────────────────────────────────────────────────
function logBodyWeight() {
  const val = parseFloat(document.getElementById('bw-input').value);
  if (!val || val < 20 || val > 400) return;
  if (!state.bodyWeightLog) state.bodyWeightLog = [];
  state.bodyWeightLog.push({ date: new Date().toISOString(), weight: val });
  if (state.bodyWeightLog.length > 90) state.bodyWeightLog.shift();
  saveState();
  document.getElementById('bw-input').value = '';
  renderBodyWeight();
}
function renderBodyWeight() {
  const el = document.getElementById('bw-current'); if (!el) return;
  if (state.bodyWeightLog && state.bodyWeightLog.length) {
    const last = state.bodyWeightLog[state.bodyWeightLog.length - 1];
    el.textContent = `${last.weight} kg`;
  }
}

// ── STREAK ───────────────────────────────────────────────────────
function updateStreak() {
  if (!state.user.lastWorkoutDate) return;
  const diff = Math.floor((new Date() - new Date(state.user.lastWorkoutDate)) / 86400000);
  if (diff > 1) { state.user.streak = 0; saveState(); }
}

// ── HEADER ───────────────────────────────────────────────────────
function renderHeader() {
  const h = new Date().getHours();
  const g = h<12 ? 'Morning' : h<17 ? 'Afternoon' : 'Evening';
  document.getElementById('header-greeting').textContent = `${g}, ${state.user.name}`;
  document.getElementById('header-level').textContent = `LVL ${getLevel()}`;
}

function getLevel()   { return Math.floor(state.user.xp / 500) + 1; }
function getLevelXP() { return state.user.xp % 500; }

// ── HOME ─────────────────────────────────────────────────────────
function renderHome() {
  document.getElementById('streak-count').textContent = state.user.streak;
  const lvlXP = getLevelXP();
  document.getElementById('xp-label').textContent    = `${lvlXP} XP`;
  document.getElementById('xp-next').textContent     = `/ 500`;
  document.getElementById('xp-bar-fill').style.width = `${(lvlXP/500)*100}%`;
  document.getElementById('xp-level-text').textContent = `Level ${getLevel()} · ${500-lvlXP} XP to next`;

  setTimeout(() => drawRadar('radar-home'), 60);
  document.getElementById('radar-home-tip').textContent =
    state.workouts.length > 0 ? `${getDominantStat()} is your strongest stat` : 'Log workouts to grow your signature';

  renderAchievements();

  const grid = document.getElementById('quick-programs');
  grid.innerHTML = '';
  PROGRAMS.forEach(p => {
    const c = document.createElement('div'); c.className='program-card';
    c.innerHTML=`<div class="program-card-icon">${p.icon}</div><div class="program-card-name">${p.name}</div><div class="program-card-desc">${p.desc}</div>`;
    c.onclick=()=>{ switchPage('log',document.querySelector('[data-page="log"]')); startSession(p); };
    grid.appendChild(c);
  });

  renderBodyWeight();

  const el = document.getElementById('last-session-card');
  if (!state.workouts.length) {
    el.className='last-session-empty'; el.innerHTML='No workouts yet — get after it.';
  } else {
    const w = state.workouts[state.workouts.length-1];
    el.className='last-session-card';
    el.innerHTML=`<div class="ls-name">${w.name}</div>
      <div class="ls-meta">${formatDate(w.date)} · ${formatDuration(w.duration)}</div>
      <div class="ls-exercises">${w.exercises.map(e=>`<span class="ls-ex-tag">${e.name}</span>`).join('')}</div>`;
  }
}

function getDominantStat() {
  return STAT_LABELS[Object.entries(state.stats).sort((a,b)=>b[1]-a[1])[0][0]];
}

// ── ACHIEVEMENTS ─────────────────────────────────────────────────
function renderAchievements() {
  const row = document.getElementById('achievements-row');
  row.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = state.achievements.includes(a.id);
    const chip = document.createElement('div');
    chip.className = `achievement-chip ${unlocked?'unlocked':'locked'}`;
    chip.title = `${a.name}: ${a.desc}`;
    chip.innerHTML = `<div class="achievement-icon">${a.icon}</div><div class="achievement-name">${a.name}</div>`;
    row.appendChild(chip);
  });
}

function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!state.achievements.includes(a.id) && a.check(state)) {
      state.achievements.push(a.id);
      setTimeout(() => showAchievementToast(a), 800);
    }
  });
}

function showAchievementToast(a) {
  const t = document.getElementById('achievement-toast');
  document.getElementById('toast-icon').textContent = a.icon;
  document.getElementById('toast-name').textContent = a.name;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// ── RADAR CHART ──────────────────────────────────────────────────
function drawRadar(canvasId, animated=true) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height, cx=W/2, cy=H/2;
  const radius = Math.min(cx,cy) - 32;
  const keys   = ['strength','endurance','power','agility','recovery'];
  const labels = ['STR','END','PWR','AGL','REC'];
  const targets = keys.map(k => Math.min(state.stats[k]||0, 100));
  const n=keys.length, step=(Math.PI*2)/n, startAngle=-Math.PI/2;

  if (!animated) { _drawRadarFrame(ctx,W,H,cx,cy,radius,keys,labels,targets,n,step,startAngle); return; }

  let progress = 0;
  const animate = () => {
    progress = Math.min(progress + 0.06, 1);
    const eased = 1 - Math.pow(1-progress, 3);
    const current = targets.map(t => t * eased);
    _drawRadarFrame(ctx,W,H,cx,cy,radius,keys,labels,current,n,step,startAngle);
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function _drawRadarFrame(ctx,W,H,cx,cy,radius,keys,labels,values,n,step,startAngle) {
  ctx.clearRect(0,0,W,H);
  // Grid rings
  for (let r=1; r<=5; r++) {
    const rr=(radius*r)/5;
    ctx.beginPath();
    for (let i=0;i<n;i++) { const a=startAngle+i*step; i===0?ctx.moveTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr):ctx.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr); }
    ctx.closePath(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.stroke();
  }
  // Axes
  for (let i=0;i<n;i++) {
    const a=startAngle+i*step;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.stroke();
  }
  // Filled shape
  ctx.beginPath();
  for (let i=0;i<n;i++) { const a=startAngle+i*step,r=(radius*values[i])/100; i===0?ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r):ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); }
  ctx.closePath(); ctx.fillStyle='rgba(124,109,255,0.18)'; ctx.fill();
  ctx.strokeStyle='#7c6dff'; ctx.lineWidth=2; ctx.stroke();
  // Points + glow
  for (let i=0;i<n;i++) {
    const a=startAngle+i*step, r=(radius*values[i])/100, x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r, c=STAT_COLORS[keys[i]];
    const g=ctx.createRadialGradient(x,y,0,x,y,12); g.addColorStop(0,c+'aa'); g.addColorStop(1,c+'00');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  }
  // Labels
  ctx.font='bold 11px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for (let i=0;i<n;i++) {
    const a=startAngle+i*step, lx=cx+Math.cos(a)*(radius+20), ly=cy+Math.sin(a)*(radius+20);
    ctx.fillStyle=STAT_COLORS[keys[i]]; ctx.fillText(labels[i],lx,ly);
  }
}

// ── STATS PAGE ───────────────────────────────────────────────────
function renderStats() {
  setTimeout(()=>drawRadar('radar-big'), 60);
  document.getElementById('radar-big-name').textContent = getDominantStat();

  const barsEl=document.getElementById('stat-bars'); barsEl.innerHTML='';
  ['strength','endurance','power','agility','recovery'].forEach(k => {
    const val=Math.round(state.stats[k]||0), color=STAT_COLORS[k];
    const row=document.createElement('div'); row.className='stat-bar-row';
    row.innerHTML=`<div class="stat-bar-top"><span class="stat-bar-name" style="color:${color}">${STAT_LABELS[k]}</span><span class="stat-bar-val" style="color:${color}">${val}</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${val}%;background:${color}"></div></div>`;
    barsEl.appendChild(row);
  });

  // PRs
  const prEl=document.getElementById('pr-list'); prEl.innerHTML='';
  const prEntries=Object.entries(state.prs);
  if (!prEntries.length) {
    prEl.innerHTML='<div class="pr-empty">Log workouts to set personal records.</div>';
  } else {
    prEntries.sort((a,b)=>b[1].weight-a[1].weight).slice(0,8).forEach(([name,pr]) => {
      const item=document.createElement('div'); item.className='pr-item';
      item.innerHTML=`<div class="pr-item-name">${name}</div>
        <div class="pr-item-right"><div class="pr-item-weight">${pr.weight} kg</div>
        <div class="pr-item-detail">${pr.reps} reps · 1RM ~${pr.orm} kg · ${formatDate(pr.date)}</div></div>`;
      prEl.appendChild(item);
    });
  }

  // Volume cards
  const totalSets=state.workouts.reduce((s,w)=>s+w.exercises.reduce((ss,e)=>ss+e.sets.length,0),0);
  const totalVol =state.workouts.reduce((s,w)=>s+sessionVolume(w),0);
  const totalMins=state.workouts.reduce((s,w)=>s+Math.floor((w.duration||0)/60),0);
  document.getElementById('volume-cards').innerHTML=`
    <div class="volume-card"><div class="volume-card-val" style="color:#7c6dff">${state.workouts.length}</div><div class="volume-card-label">SESSIONS</div></div>
    <div class="volume-card"><div class="volume-card-val" style="color:#00e5a0">${totalSets}</div><div class="volume-card-label">TOTAL SETS</div></div>
    <div class="volume-card"><div class="volume-card-val" style="color:#ffd166">${fmtNum(Math.round(totalVol))}</div><div class="volume-card-label">KG LIFTED</div></div>
    <div class="volume-card"><div class="volume-card-val" style="color:#ff9de2">${totalMins}</div><div class="volume-card-label">MINS TRAINED</div></div>`;

  // Progress chart
  setTimeout(()=>drawProgressChart(), 60);
}

function drawProgressChart() {
  const canvas=document.getElementById('progress-chart'); if(!canvas) return;
  const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const history=state.statHistory;
  if (history.length < 2) {
    ctx.font='13px Inter,sans-serif'; ctx.fillStyle='rgba(240,238,255,0.3)';
    ctx.textAlign='center'; ctx.fillText('Complete more workouts to see your progress chart.',W/2,H/2); return;
  }
  const entries=history.slice(-12);
  const keys=['strength','endurance','power','agility','recovery'];
  const pad={t:10,r:10,b:20,l:28};
  const cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;

  // Grid lines
  [0,25,50,75,100].forEach(v => {
    const y=pad.t+cH-(v/100)*cH;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y);
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.stroke();
    ctx.font='9px Inter,sans-serif'; ctx.fillStyle='rgba(240,238,255,0.25)';
    ctx.textAlign='right'; ctx.fillText(v,pad.l-4,y+3);
  });

  // Lines per stat
  keys.forEach(k => {
    ctx.beginPath();
    entries.forEach((e,i) => {
      const x=pad.l+(i/(entries.length-1))*cW;
      const y=pad.t+cH-((e.stats[k]||0)/100)*cH;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.strokeStyle=STAT_COLORS[k]+'cc'; ctx.lineWidth=2; ctx.stroke();
  });
}

// ── HISTORY ──────────────────────────────────────────────────────
function renderHistory() {
  const listEl=document.getElementById('history-list'), emptyEl=document.getElementById('history-empty');
  listEl.innerHTML='';
  if (!state.workouts.length) { emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  [...state.workouts].reverse().forEach((w,revIdx) => {
    const idx=state.workouts.length-1-revIdx;
    const item=document.createElement('div'); item.className='history-item';
    const sets=w.exercises.reduce((s,e)=>s+e.sets.length,0);
    const vol=sessionVolume(w);
    item.innerHTML=`<div class="history-item-header">
        <span class="history-item-name">${w.name}</span>
        <div class="history-item-right"><span class="history-item-date">${formatDate(w.date)}</span>
        <button class="btn-delete-workout" onclick="deleteWorkout(${idx})" title="Delete">🗑</button></div>
      </div>
      <div class="history-item-stats">
        <div class="history-stat"><div class="history-stat-val">${sets}</div><div class="history-stat-label">SETS</div></div>
        <div class="history-stat"><div class="history-stat-val">${fmtNum(Math.round(vol))}</div><div class="history-stat-label">KG</div></div>
        <div class="history-stat"><div class="history-stat-val">${formatDuration(w.duration)}</div><div class="history-stat-label">TIME</div></div>
      </div>
      <div class="history-item-exercises">${w.exercises.map(e=>`<span class="history-ex-tag">${e.name}</span>`).join('')}</div>
      <div class="history-xp">+${w.xpEarned} XP earned</div>`;
    listEl.appendChild(item);
  });
}

function deleteWorkout(idx) {
  if (!confirm('Delete this workout?')) return;
  state.workouts.splice(idx,1);
  saveState(); renderHistory(); renderHome(); renderStats();
}

function getDefaultSessionName() {
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${days[new Date().getDay()]} Session`;
}

// ── SESSION ───────────────────────────────────────────────────────
function startSession(program) {
  if (session) cancelSession();
  const customName = document.getElementById('session-name-input')?.value.trim();
  const name = program ? program.name : (customName || getDefaultSessionName());
  session={ name, startTime:Date.now(), exercises:[] };
  if (program) program.exercises.forEach(name=>{ const cat=getCategoryForExercise(name); session.exercises.push({name,cat,sets:[]}); });
  sessionSeconds=0;
  sessionTimer=setInterval(()=>{
    sessionSeconds++;
    const m=String(Math.floor(sessionSeconds/60)).padStart(2,'0'), s=String(sessionSeconds%60).padStart(2,'0');
    document.getElementById('log-timer').textContent=`${m}:${s}`;
  },1000);
  document.getElementById('log-session-name').textContent=session.name;
  document.getElementById('log-idle').classList.add('hidden');
  document.getElementById('log-active').classList.remove('hidden');
  renderExerciseBlocks();
}

function renderExerciseBlocks() {
  const list=document.getElementById('exercises-list'); list.innerHTML='';
  session.exercises.forEach((ex,idx)=>{
    const block=document.createElement('div'); block.className='exercise-block'; block.id=`ex-block-${idx}`;
    const pr=state.prs[ex.name];
    const prBadge=pr?`<span class="pr-badge">PR ${pr.weight}kg</span>`:'';
    const rows=ex.sets.map((set,si)=>{
      const orm=set.weight>0?Math.round(set.weight*(1+set.reps/30)):0;
      const isPR=pr&&set.weight>pr.weight;
      return `<tr><td class="set-num">${si+1}${isPR?'<span class="set-pr-mark">★</span>':''}</td>
        <td>${set.weight>0?set.weight+' kg':'BW'}</td><td>${set.reps} reps</td>
        <td style="color:var(--muted);font-size:11px">${orm>0?'1RM ~'+orm+' kg':''}</td></tr>`;
    }).join('');
    block.innerHTML=`<div class="exercise-block-header">
        <div><div class="exercise-block-name">${ex.name}</div>
        <div class="exercise-block-cat">${ex.cat} · ${ex.sets.length} set${ex.sets.length!==1?'s':''}</div></div>
        <div class="ex-block-right">${prBadge}<button class="btn-add-set" onclick="openSetModal(${idx})">+ Set</button></div>
      </div>
      ${ex.sets.length?`<table class="sets-table"><thead><tr><th>SET</th><th>WEIGHT</th><th>REPS</th><th>1RM</th></tr></thead><tbody>${rows}</tbody></table>`:''}`;
    list.appendChild(block);
  });
}

function openSetModal(idx) {
  currentExIdx=idx;
  const name=session.exercises[idx].name;
  document.getElementById('set-modal-title').textContent=name;
  document.getElementById('set-weight').value='';
  document.getElementById('set-reps').value='';
  document.getElementById('orm-preview').classList.add('hidden');

  const lastW=state.lastWeights[name];
  const hint=document.getElementById('last-weight-hint');
  if (lastW) { hint.textContent=`Last used: ${lastW} kg`; hint.classList.remove('hidden'); document.getElementById('set-weight').value=lastW; }
  else hint.classList.add('hidden');

  const pr=state.prs[name];
  const prhint=document.getElementById('pr-hint');
  if (pr) { prhint.textContent=`Current PR: ${pr.weight} kg × ${pr.reps} reps (1RM ~${pr.orm} kg)`; prhint.classList.remove('hidden'); }
  else prhint.classList.add('hidden');

  openModal('modal-set');
  setTimeout(()=>document.getElementById('set-reps').focus(),120);

  // Live 1RM preview
  ['set-weight','set-reps'].forEach(id=>{
    document.getElementById(id).addEventListener('input', update1RM);
  });
}

function update1RM() {
  const w=parseFloat(document.getElementById('set-weight').value)||0;
  const r=parseInt(document.getElementById('set-reps').value)||0;
  const el=document.getElementById('orm-preview');
  if (w>0 && r>0) {
    const orm=Math.round(w*(1+r/30));
    document.getElementById('orm-val').textContent=`${orm} kg`;
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

function confirmSet() {
  const weight=parseFloat(document.getElementById('set-weight').value)||0;
  const reps=parseInt(document.getElementById('set-reps').value)||0;
  if (!reps) return;
  session.exercises[currentExIdx].sets.push({weight,reps});
  if (weight>0) state.lastWeights[session.exercises[currentExIdx].name]=weight;
  closeModal('modal-set');
  renderExerciseBlocks();
  startRestTimer();
}

// ── REST TIMER ────────────────────────────────────────────────────
function startRestTimer() {
  if (restTimer) { clearInterval(restTimer); }
  restRemaining=state.settings.restDefault||90;
  updateRestDisplay();
  document.getElementById('rest-timer').classList.remove('hidden');
  restTimer=setInterval(()=>{
    restRemaining--;
    updateRestDisplay();
    if (restRemaining<=0) {
      clearInterval(restTimer); restTimer=null;
      document.getElementById('rest-timer').classList.add('hidden');
      if ('vibrate' in navigator) navigator.vibrate([200,100,200]);
    }
  },1000);
}
function updateRestDisplay() { document.getElementById('rest-countdown').textContent=restRemaining; }
function adjustRest(delta) { restRemaining=Math.max(5,restRemaining+delta); updateRestDisplay(); }
function skipRest() { clearInterval(restTimer); restTimer=null; document.getElementById('rest-timer').classList.add('hidden'); }

// ── FINISH SESSION ────────────────────────────────────────────────
function finishSession() {
  const hasWork=session.exercises.some(e=>e.sets.length>0);
  if (!hasWork) { cancelSession(); return; }

  clearInterval(sessionTimer);
  skipRest();
  const duration=sessionSeconds;
  const xpEarned=calculateXP(session);

  const prevLevel=getLevel();
  state.user.xp+=xpEarned;

  updateStats(session.exercises);
  updatePRs(session.exercises);

  // Streak
  const today=new Date().toDateString();
  const lastDate=state.user.lastWorkoutDate?new Date(state.user.lastWorkoutDate).toDateString():null;
  if (lastDate!==today) {
    const yesterday=new Date(); yesterday.setDate(yesterday.getDate()-1);
    state.user.streak=(lastDate===yesterday.toDateString())?state.user.streak+1:1;
  }
  state.user.lastWorkoutDate=new Date().toISOString();

  // Stat snapshot for chart
  state.statHistory.push({ date:new Date().toISOString(), stats:{...state.stats} });
  if (state.statHistory.length>30) state.statHistory.shift();

  const completed={ name:session.name, date:new Date().toISOString(), duration, exercises:session.exercises, xpEarned };
  state.workouts.push(completed);
  saveState();

  session=null; sessionSeconds=0;
  document.getElementById('log-active').classList.add('hidden');
  document.getElementById('log-idle').classList.remove('hidden');

  checkAchievements();
  renderHeader(); renderHome(); renderStats(); renderHistory();
  switchPage('home', document.querySelector('[data-page="home"]'));

  launchConfetti();

  const newLevel=getLevel();
  if (newLevel>prevLevel) setTimeout(()=>showLevelUp(newLevel), 1200);

  if (getApiKey()) setTimeout(()=>showPostWorkoutAnalysis(completed), 1800);
}

function cancelSession() {
  clearInterval(sessionTimer); skipRest();
  session=null; sessionSeconds=0;
  document.getElementById('log-active').classList.add('hidden');
  document.getElementById('log-idle').classList.remove('hidden');
}

// ── XP ────────────────────────────────────────────────────────────
function calculateXP(sess) {
  let xp=0;
  sess.exercises.forEach(ex=>{ ex.sets.forEach(set=>{ xp+=10; if(set.weight>=60)xp+=5; if(set.weight>=100)xp+=10; if(set.reps>=12)xp+=3; }); });
  if (sess.exercises.length>=4) xp+=20;
  return Math.round(xp);
}

// ── STAT UPDATES ─────────────────────────────────────────────────
function updateStats(exercises) {
  exercises.forEach(ex=>{
    const key=CAT_TO_STAT[ex.cat]||'strength';
    ex.sets.forEach(set=>{
      let gain=key==='endurance'?0.3+(set.reps/100):0.1+((set.weight*set.reps)/2000);
      state.stats[key]=Math.min(100,state.stats[key]+gain);
      if (set.reps<=5&&set.weight>0) state.stats.power=Math.min(100,state.stats.power+0.4);
    });
  });
  exercises.filter(e=>e.cat==='Core').forEach(ex=>{ state.stats.agility=Math.min(100,state.stats.agility+ex.sets.length*0.5); });
  state.stats.recovery=Math.min(100,state.stats.recovery+1.5);
}

// ── PR UPDATES ────────────────────────────────────────────────────
function updatePRs(exercises) {
  exercises.forEach(ex=>{
    ex.sets.forEach(set=>{
      if (set.weight<=0) return;
      const orm=Math.round(set.weight*(1+set.reps/30));
      const existing=state.prs[ex.name];
      if (!existing||set.weight>existing.weight||(set.weight===existing.weight&&orm>existing.orm)) {
        state.prs[ex.name]={ weight:set.weight, reps:set.reps, date:new Date().toISOString(), orm };
      }
    });
  });
}

// ── EXERCISE PICKER ──────────────────────────────────────────────
function showExercisePicker() {
  const tabs=document.getElementById('ex-category-tabs'); tabs.innerHTML='';
  Object.keys(EXERCISES).forEach(cat=>{
    const btn=document.createElement('button'); btn.className='ex-tab'+(cat===pickerCategory?' active':'');
    btn.textContent=cat; btn.onclick=()=>{ pickerCategory=cat; showExercisePicker(); };
    tabs.appendChild(btn);
  });
  document.getElementById('ex-search').value='';
  renderExerciseList(EXERCISES[pickerCategory]);
  openModal('modal-picker');
}

function filterExercises(q) {
  const query=q.toLowerCase();
  const list=query.length>1?Object.values(EXERCISES).flat().filter(e=>e.toLowerCase().includes(query)):EXERCISES[pickerCategory];
  renderExerciseList(list);
}

function renderExerciseList(list) {
  const el=document.getElementById('ex-list'); el.innerHTML='';
  list.forEach(name=>{
    const cat=getCategoryForExercise(name), pr=state.prs[name];
    const item=document.createElement('div'); item.className='ex-item';
    item.innerHTML=`<div class="ex-item-left">
        <span class="ex-item-name">${name}</span>
        <span class="ex-item-cat">${cat}${pr?` · <span class="ex-item-pr">PR: ${pr.weight}kg</span>`:''}</span>
      </div>`;
    item.onclick=()=>addExerciseToSession(name,cat);
    el.appendChild(item);
  });
}

function addExerciseToSession(name, cat) {
  if (!session.exercises.find(e=>e.name===name)) session.exercises.push({name,cat,sets:[]});
  closeModal('modal-picker');
  renderExerciseBlocks();
}

function getCategoryForExercise(name) {
  for (const [cat,list] of Object.entries(EXERCISES)) { if (list.includes(name)) return cat; }
  return 'Chest';
}

// ── PAGE NAVIGATION ──────────────────────────────────────────────
function switchPage(pageId, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');
  if (btn) btn.classList.add('active');
  if (pageId==='home')  setTimeout(()=>drawRadar('radar-home'),60);
  if (pageId==='stats') setTimeout(()=>{ drawRadar('radar-big'); drawProgressChart(); },60);
}

// ── SWIPE NAVIGATION ─────────────────────────────────────────────
const PAGE_ORDER = ['home','log','stats','history','coach'];
function initSwipe() {
  let startX=0;
  const main=document.getElementById('app-main');
  main.addEventListener('touchstart',e=>{ startX=e.touches[0].clientX; },{passive:true});
  main.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-startX;
    if (Math.abs(dx)<60) return;
    const current=document.querySelector('.page.active');
    if (!current) return;
    const id=current.id.replace('page-','');
    const idx=PAGE_ORDER.indexOf(id);
    const nextIdx=dx<0?Math.min(idx+1,PAGE_ORDER.length-1):Math.max(idx-1,0);
    if (nextIdx!==idx) {
      const nextId=PAGE_ORDER[nextIdx];
      switchPage(nextId, document.querySelector(`[data-page="${nextId}"]`));
    }
  },{passive:true});
}

// ── SETTINGS ─────────────────────────────────────────────────────
function openSettings() {
  const key=getApiKey();
  document.getElementById('api-key-input').value=key?'••••••••••••':'';
  loadRestPreset();
  openModal('modal-guide');
}

function loadRestPreset() {
  const def=state.settings.restDefault||90;
  document.querySelectorAll('.rest-preset').forEach(b=>{ b.classList.toggle('active',parseInt(b.dataset.val)===def); });
}

function setRestDefault(btn) {
  state.settings.restDefault=parseInt(btn.dataset.val);
  saveState(); loadRestPreset();
}

function exportData() {
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`grind-data-${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function confirmReset() {
  if (confirm('Delete ALL your data? This cannot be undone.')) {
    ['grind_v2','grind_state_v2','grind_state','grind_api_key'].forEach(k => localStorage.removeItem(k));
    location.reload();
  }
}

// ── CONFETTI ──────────────────────────────────────────────────────
function launchConfetti() {
  const canvas=document.getElementById('confetti-canvas');
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  const ctx=canvas.getContext('2d');
  const colors=['#7c6dff','#00e5a0','#ffd166','#ff9de2','#5edfff','#ff5e5e'];
  const particles=Array.from({length:120},()=>({
    x:Math.random()*canvas.width, y:-10,
    vx:(Math.random()-0.5)*4, vy:Math.random()*4+2,
    size:Math.random()*6+4,
    color:colors[Math.floor(Math.random()*colors.length)],
    rot:Math.random()*360, rotV:(Math.random()-0.5)*8,
  }));
  let frame=0;
  const animate=()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.07; p.rot+=p.rotV;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
    });
    frame++;
    if (frame<120) requestAnimationFrame(animate);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  };
  requestAnimationFrame(animate);
}

// ── AI COACH ─────────────────────────────────────────────────────
function refreshCoachPage() {
  const hasKey = !!getApiKey();
  document.getElementById('coach-no-key').classList.toggle('hidden', hasKey);
  document.getElementById('coach-chat-wrap').classList.toggle('hidden', !hasKey);
  if (hasKey && !chatHistory.length) addAIMessage("Hey! I'm your GRIND AI Coach. I know your full workout history and stats. Ask me anything — from today's training plan to how to bust through a plateau.");
}

function saveApiKey() {
  const k = document.getElementById('api-key-input').value.trim();
  if (!k) return;
  storeApiKey(k);
  closeModal('modal-settings');
  refreshCoachPage();
  showToast('🤖', 'AI Coach', 'AI Coach is now active!');
}

function buildContext() {
  const stats=Object.entries(state.stats).map(([k,v])=>`${STAT_LABELS[k]}: ${Math.round(v)}/100`).join(', ');
  const recentW=state.workouts.slice(-5).map(w=>`${w.name} (${formatDate(w.date)}, ${w.exercises.map(e=>e.name).join(', ')})`).join('\n');
  const topPRs=Object.entries(state.prs).sort((a,b)=>b[1].weight-a[1].weight).slice(0,5).map(([n,p])=>`${n}: ${p.weight}kg×${p.reps}`).join(', ');
  return `User: ${state.user.name}, Level ${getLevel()}, Goal: ${state.user.goal}, Streak: ${state.user.streak} days.
Stats: ${stats}.
Top PRs: ${topPRs||'None yet'}.
Recent workouts:\n${recentW||'None yet'}.
Total sessions: ${state.workouts.length}.`;
}

async function sendChat() {
  const input=document.getElementById('chat-input');
  const msg=input.value.trim(); if(!msg) return;
  input.value='';
  addUserMessage(msg);
  chatHistory.push({role:'user',content:msg});
  addTypingIndicator();
  const reply=await callClaude(chatHistory);
  removeTypingIndicator();
  addAIMessage(reply);
  chatHistory.push({role:'assistant',content:reply});
}

function usePrompt(btn) {
  document.getElementById('chat-input').value=btn.textContent;
  sendChat();
}

function addUserMessage(text) {
  const div=document.createElement('div'); div.className='chat-msg user';
  div.innerHTML=`<div class="chat-bubble">${text}</div><div class="chat-msg-avatar">😤</div>`;
  document.getElementById('chat-messages').appendChild(div);
  scrollChat();
}

function addAIMessage(text) {
  const div=document.createElement('div'); div.className='chat-msg ai';
  div.innerHTML=`<div class="chat-msg-avatar">🤖</div><div class="chat-bubble">${text}</div>`;
  document.getElementById('chat-messages').appendChild(div);
  scrollChat();
}

function addTypingIndicator() {
  const div=document.createElement('div'); div.className='chat-msg ai'; div.id='typing-indicator';
  div.innerHTML=`<div class="chat-msg-avatar">🤖</div><div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  document.getElementById('chat-messages').appendChild(div);
  scrollChat();
}

function removeTypingIndicator() {
  const el=document.getElementById('typing-indicator'); if(el) el.remove();
}

function scrollChat() {
  const msgs=document.getElementById('chat-messages');
  msgs.scrollTop=msgs.scrollHeight;
}

async function callClaude(messages) {
  const key = getApiKey();
  if (!key) return 'Add your Claude API key in ⚙️ Settings to use AI features.';
  const system = `You are GRIND AI Coach, a no-nonsense personal fitness coach inside a gym tracking app. You know the user's full workout history, stats and goals. Be concise, motivating and specific. Never give generic advice — always reference their actual data.\n\n${buildContext()}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':                               key,
        'anthropic-version':                       '2023-06-01',
        'content-type':                            'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:500, system, messages }),
    });
    if (!res.ok) { const e = await res.json(); return `Error: ${e.error?.message || res.status}`; }
    const data = await res.json();
    return data.content[0].text;
  } catch(e) {
    return 'Connection error. Check your API key in Settings.';
  }
}

async function fetchDailyRecommendation() {
  const el=document.getElementById('ai-recommendation');
  const textEl=document.getElementById('ai-rec-text');
  el.classList.remove('hidden');
  const messages=[{role:'user',content:'In 1-2 sentences, what should I train today based on my history and weakest stats? Be direct.'}];
  const reply=await callClaude(messages);
  textEl.textContent=reply;
}

async function showPostWorkoutAnalysis(workout) {
  openModal('modal-analysis');
  const sets=workout.exercises.reduce((s,e)=>s+e.sets.length,0);
  const vol=sessionVolume(workout);
  const messages=[{role:'user',content:`I just finished a ${workout.name} session: ${sets} sets, ${Math.round(vol)} kg volume, ${formatDuration(workout.duration)}. Exercises: ${workout.exercises.map(e=>e.name).join(', ')}. Give me a 3-sentence analysis covering what went well, one specific improvement, and what to do next session.`}];
  const reply=await callClaude(messages);
  document.getElementById('analysis-content').innerHTML=`<p>${reply}</p>`;
}

// ── SHARE SIGNATURE ──────────────────────────────────────────────
// Safe rounded-rect helper (ctx.roundRect not supported on Safari < 15.4)
function _rrect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); return; }
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y, x+w,y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h, x+w-r,y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h, x,y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,y, x+r,y, r);
  ctx.closePath();
}

function shareSignature() {
  const W=800, H=500;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');

  // Background
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#09090d'); bg.addColorStop(1,'#130e2e');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

  // Subtle grid glow
  const glow=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,350);
  glow.addColorStop(0,'rgba(124,109,255,0.12)'); glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);

  // GRIND wordmark
  ctx.font='bold 60px "Arial Black",sans-serif';
  ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillStyle='#ffffff'; ctx.fillText('GRIND',40,36);
  ctx.font='12px Arial,sans-serif';
  ctx.fillStyle='rgba(240,238,255,0.4)';
  ctx.fillText('LEVEL UP YOUR BODY',40,100);

  // User name + level
  ctx.font='bold 22px Arial,sans-serif';
  ctx.fillStyle='rgba(124,109,255,0.9)';
  ctx.textAlign='right';
  ctx.fillText(`${state.user.name}  ·  LVL ${getLevel()}`,W-40,44);
  ctx.font='12px Arial,sans-serif'; ctx.fillStyle='rgba(240,238,255,0.35)';
  ctx.fillText(`${state.workouts.length} sessions · ${state.user.streak} day streak`,W-40,74);

  // Radar (centre-left)
  const radarCx=230, radarCy=H/2+10, radarR=150;
  const keys=['strength','endurance','power','agility','recovery'];
  const labels=['STR','END','PWR','AGL','REC'];
  const n=5, step=(Math.PI*2)/n, startA=-Math.PI/2;
  const vals=keys.map(k=>Math.min(state.stats[k]||0,100));

  // rings
  for(let r=1;r<=5;r++){
    const rr=(radarR*r)/5;
    ctx.beginPath();
    for(let i=0;i<n;i++){const a=startA+i*step;i===0?ctx.moveTo(radarCx+Math.cos(a)*rr,radarCy+Math.sin(a)*rr):ctx.lineTo(radarCx+Math.cos(a)*rr,radarCy+Math.sin(a)*rr);}
    ctx.closePath(); ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1; ctx.stroke();
  }
  // axes
  for(let i=0;i<n;i++){const a=startA+i*step;ctx.beginPath();ctx.moveTo(radarCx,radarCy);ctx.lineTo(radarCx+Math.cos(a)*radarR,radarCy+Math.sin(a)*radarR);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.stroke();}
  // fill
  ctx.beginPath();
  for(let i=0;i<n;i++){const a=startA+i*step,r=(radarR*vals[i])/100;i===0?ctx.moveTo(radarCx+Math.cos(a)*r,radarCy+Math.sin(a)*r):ctx.lineTo(radarCx+Math.cos(a)*r,radarCy+Math.sin(a)*r);}
  ctx.closePath(); ctx.fillStyle='rgba(124,109,255,0.22)'; ctx.fill();
  ctx.strokeStyle='#7c6dff'; ctx.lineWidth=2.5; ctx.stroke();
  // dots
  for(let i=0;i<n;i++){const a=startA+i*step,r=(radarR*vals[i])/100,x=radarCx+Math.cos(a)*r,y=radarCy+Math.sin(a)*r;ctx.fillStyle=STAT_COLORS[keys[i]];ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
  // labels
  ctx.font='bold 13px Arial,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=0;i<n;i++){const a=startA+i*step,lx=radarCx+Math.cos(a)*(radarR+22),ly=radarCy+Math.sin(a)*(radarR+22);ctx.fillStyle=STAT_COLORS[keys[i]];ctx.fillText(labels[i],lx,ly);}

  // Stat bars (right side)
  const bx=440, by=130, bw=300, rowH=46;
  ctx.textAlign='left'; ctx.textBaseline='middle';
  keys.forEach((k,i)=>{
    const val=Math.round(state.stats[k]||0), color=STAT_COLORS[k], y=by+i*rowH;
    ctx.font='bold 11px Arial,sans-serif'; ctx.fillStyle=color;
    ctx.fillText(STAT_LABELS[k],bx,y);
    ctx.font='bold 18px Arial,sans-serif'; ctx.fillStyle=color;
    ctx.textAlign='right'; ctx.fillText(val,bx+bw,y);
    ctx.textAlign='left';
    const trackY=y+14;
    ctx.fillStyle='rgba(255,255,255,0.08)'; _rrect(ctx,bx,trackY,bw,6,3); ctx.fill();
    ctx.fillStyle=color; _rrect(ctx,bx,trackY,Math.max(bw*(val/100),2),6,3); ctx.fill();
  });

  // Footer
  ctx.font='11px Arial,sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.18)';
  ctx.fillText('grind.app — Turn every rep into power',W/2,H-18);

  // Export or share
  const dataURL=c.toDataURL('image/png');
  if (navigator.share && navigator.canShare && navigator.canShare({files:[]})) {
    c.toBlob(blob=>{
      const file=new File([blob],'grind-power-signature.png',{type:'image/png'});
      navigator.share({ title:'My GRIND Power Signature', text:`Level ${getLevel()} athlete — check out my Power Signature!`, files:[file] }).catch(()=>_downloadShareCard(dataURL));
    },'image/png');
  } else {
    _downloadShareCard(dataURL);
  }
}

function _downloadShareCard(dataURL) {
  const a=document.createElement('a');
  a.href=dataURL; a.download=`grind-signature-${state.user.name.toLowerCase().replace(/\s+/g,'-')}.png`;
  a.click();
}

// ── LEVEL UP ─────────────────────────────────────────────────────
function showLevelUp(level) { document.getElementById('levelup-num').textContent=level; document.getElementById('levelup-overlay').classList.remove('hidden'); }
function closeLevelUp()     { document.getElementById('levelup-overlay').classList.add('hidden'); }

// ── MODALS ───────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.addEventListener('click', e=>{ if(e.target.classList.contains('modal')) e.target.classList.add('hidden'); });

// ── HELPERS ───────────────────────────────────────────────────────
function sessionVolume(w)  { return w.exercises.reduce((s,e)=>s+e.sets.reduce((ss,st)=>ss+(st.weight*st.reps||0),0),0); }
function fmtNum(n)         { return n>=1000?(n/1000).toFixed(1)+'k':n.toString(); }
function formatDate(iso)   { return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
function formatDuration(s) { const m=Math.floor((s||0)/60),sec=(s||0)%60; return m>0?`${m}m ${sec}s`:`${sec}s`; }

function showToast(icon, title, name) {
  document.getElementById('toast-icon').textContent=icon;
  document.getElementById('toast-name').textContent=name;
  const t=document.getElementById('achievement-toast');
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),3000);
}
