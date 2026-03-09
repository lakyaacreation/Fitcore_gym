// Extracted from original single-file HTML. Kept in global scope for inline onclick handlers.

// Apply RBAC after initial render
try{applyRBAC();}catch(e){}

/* ==============================
   RBAC: Role-Based Permissions
   ============================== */
const RBAC = {
  admin: {
    pages: ['dashboard','members','membership','payments','attendance','classes','equipment','staff','plans','myprofile','ai'],
    can: { payments:true, staff:true, equipment:true, plans:true, members:true, attendance:true, classes:true, membership:true }
  },
  trainer: {
    // Real-world trainer access (restricted)
    pages: ['dashboard','members','attendance','classes','myprofile','ai'],
    can: {
      payments:false, staff:false, equipment:false, plans:false,
      members:true, attendance:true, classes:true, membership:false
    }
  },
  user: {
    pages: ['dashboard','myprofile','payments','attendance','classes','ai'],
    can: { payments:true, staff:false, equipment:false, plans:false, members:false, attendance:true, classes:true, membership:false }
  }
};

function currentRole(){
  return (window.currentUser && currentUser.role) ? currentUser.role : 'user';
}
function canAccessPage(pageKey){
  const role = currentRole();
  const allow = RBAC[role]?.pages || [];
  return allow.includes(pageKey);
}
function mustAdmin(){
  return currentRole()==='admin';
}
function denyToast(msg){
  try { toast(msg || 'Access denied'); } catch(e) { alert(msg || 'Access denied'); }
}

/**
 * Enforce UI permissions:
 *  - hide sidebar items that role cannot access
 *  - enforce on page switches
 *  - disable restricted action buttons (payments, staff, plans, equipment)
 */
function applyRBAC(){
  const role = currentRole();
  const allow = new Set(RBAC[role]?.pages || []);

  // Sidebar links: require data-page="dashboard" style attribute.
  document.querySelectorAll('.nav a[data-page]').forEach(a=>{
    const p = a.getAttribute('data-page');
    if (!allow.has(p)){
      a.style.display = 'none';
    } else {
      a.style.display = '';
    }
  });

  // If currently on a forbidden page, bounce to dashboard
  const active = document.querySelector('.page.active')?.id || '';
  const activeKey = active.replace('page-','');
  if (activeKey && !allow.has(activeKey)){
    showPage('dashboard');
  applyRBAC();
  }

  // Disable/Hide sensitive module actions for Trainer
  if (role === 'trainer'){
    // 1) Payments: hide sidebar + block any payment page programmatically
    document.querySelectorAll('[data-page="payments"]').forEach(x=>x.style.display='none');

    // 2) Staff, Plans, Equipment: hide sidebar
    ['staff','plans','equipment'].forEach(p=>{
      document.querySelectorAll(`[data-page="${p}"]`).forEach(x=>x.style.display='none');
    });

    // 3) In Members page: allow view + fitness updates only (block delete / add / membership changes if present)
    // Generic: disable buttons that look like add/delete/plan/payment actions
    const denySelectors = [
      '#btn-add-member', '#btn-del-member', '#btn-delete-member', '.btn-delete-member',
      '#btn-add-payment', '#btn-add-staff', '#btn-add-plan', '#btn-add-equipment'
    ];
    denySelectors.forEach(sel=>document.querySelectorAll(sel).forEach(b=>{
      b.disabled = true; b.style.pointerEvents='none'; b.style.opacity='0.5';
    }));

    // If there are action buttons with text labels, hide by text match (best-effort)
    document.querySelectorAll('button').forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (['delete','remove','refund','add payment','add staff','add plan','add equipment','new plan'].includes(t)){
        b.disabled = true; b.style.pointerEvents='none'; b.style.opacity='0.5';
      }
    });
  }
}
let db;

let currentUser = null;

// Simple demo auth (no backend). Replace with real auth when you move to Laravel/MySQL.
/* AUTH USERS are stored in SQLite table auth_users */

const ROLE_ACCESS = {
  admin: ['dashboard','members','memberships','payments','attendance','classes','equipment','staff','plans'],
  trainer: ['dashboard','members','attendance','classes'],
  user: ['dashboard','myprofile','payments','attendance','classes','ai'],
};

function saveSession(u){
  const data = u || currentUser;
  if(!data) return;
  localStorage.setItem('fitcore_session', JSON.stringify(data));
}
function loadSession(){
  try{
    const raw = localStorage.getItem('fitcore_session');
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function clearSession(){
  localStorage.removeItem('fitcore_session');
}


function onUserChanged(){
  // All render functions are now async (MySQL). Call them and let them run.
  [dash, rMembers, rMS, rPay, rAtt, rClasses, rEquip, rStaff, rPlans, populateSels, loadMyProfile]
    .forEach(fn => { try { Promise.resolve(fn()); } catch(e) { console.warn(fn.name, e); } });
}

function openRegister(){
  // This stub is overridden by the async version in api-client.js (MySQL mode).
  // Fallback: if somehow called before override loads, try async path safely.
  if (typeof window.openRegister === 'function' && window.openRegister !== openRegister) {
    window.openRegister();
    return;
  }
  // Reset plan preview and open modal — api-client.js override handles plan loading
  var ri = document.getElementById('rg-plan-info'); if(ri) ri.style.display='none';
  openM('mo-register');
}

function clearRegisterFields(){
  ['rg-fn','rg-ln','rg-em','rg-ph','rg-dob','rg-pw','rg-pw2'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  const rp=document.getElementById('rg-plan'); if(rp) rp.value='';
  const ri=document.getElementById('rg-plan-info'); if(ri) ri.style.display='none';
}

function fillRegPlan(){
  const pid=document.getElementById('rg-plan').value;
  const info=document.getElementById('rg-plan-info');
  const det=document.getElementById('rg-plan-details');
  if(!pid){ if(info) info.style.display='none'; return; }
  const plan=qry('SELECT * FROM plans WHERE id=?',[pid])[0];
  if(plan && info && det){
    const s=new Date().toISOString().split('T')[0];
    const eDate=new Date(); eDate.setDate(eDate.getDate()+plan.duration);
    const e=eDate.toISOString().split('T')[0];
    det.innerHTML=
      `<b style="color:var(--primary);font-size:13px">${plan.name}</b> &nbsp;|&nbsp; <b style="color:var(--success)">Rs. ${parseFloat(plan.price).toLocaleString('en-LK', {minimumFractionDigits:2, maximumFractionDigits:2})}</b> &nbsp;|&nbsp; ${plan.duration} days<br>`+
      `<span style="color:var(--text-muted)">📅 ${s} → ${e}</span><br>`+
      (plan.features ? `<span style="color:var(--text)">✅ `+plan.features.split(',').map(f=>f.trim()).join(' &nbsp;•&nbsp; ✅ ')+`</span>` : '')+
      (plan.description ? `<br><span style="color:var(--text-muted);font-style:italic">${plan.description}</span>` : '');
    info.style.display='';
  }
}

function registerUser(){
  const fn = (document.getElementById('rg-fn').value || '').trim();
  const ln = (document.getElementById('rg-ln').value || '').trim();
  const em = (document.getElementById('rg-em').value || '').trim().toLowerCase();
  const ph = (document.getElementById('rg-ph').value || '').trim();
  const dob = (document.getElementById('rg-dob').value || '').trim();
  const gen = (document.getElementById('rg-gen').value || 'Other').trim();
  const pw = document.getElementById('rg-pw').value || '';
  const pw2 = document.getElementById('rg-pw2').value || '';
  const pid = document.getElementById('rg-plan').value || '';
  if(!fn || !em || !pw){ toast('First name, email and password are required.', 'error'); return; }
  if(pw.length < 6){ toast('Password must be at least 6 characters.', 'error'); return; }
  if(pw !== pw2){ toast('Passwords do not match.', 'error'); return; }
  if(dob){
    const dobDate = new Date(dob), now = new Date();
    if(isNaN(dobDate) || dobDate >= now || dobDate < new Date('1900-01-01')){
      toast('Please enter a valid date of birth', 'error'); return;
    }
  }
  const exists = qry('SELECT id FROM auth_users WHERE username=?', [em])[0];
  if(exists){ toast('This email is already registered. Please login.', 'error'); return; }

  // Create member profile
  run(`INSERT INTO members(fname,lname,email,phone,dob,gender,status)VALUES(?,?,?,?,?,'Other','active')`, [fn, ln, em, ph, dob||null, gen]);
  const mid = qry('SELECT last_insert_rowid() as id')[0].id;

  // Create auth account linked to member
  run('INSERT INTO auth_users(username,password,role,member_id)VALUES(?,?,?,?)', [em, pw, 'user', mid]);

  // If a plan was chosen, create a membership record
  if(pid){
    const plan = qry('SELECT * FROM plans WHERE id=?', [pid])[0];
    if(plan){
      const s = new Date().toISOString().split('T')[0];
      const eDate = new Date(); eDate.setDate(eDate.getDate()+plan.duration);
      const e = eDate.toISOString().split('T')[0];
      run(`INSERT INTO memberships(member_id,plan_id,start_date,end_date,amount,status,notes)VALUES(?,?,?,?,?,'active','Self-registered online')`,
        [mid, plan.id, s, e, plan.price]);
    }
  }

  const au = qry('SELECT * FROM auth_users WHERE username=?', [em])[0];
  currentUser = { id: au.id, username: au.username, role: au.role, member_id: au.member_id };
  saveSession();
  closeM('mo-register');
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('btn-logout').style.display = '';
  if(typeof window._applyTopbarAvatar==='function'){
    var _m={fname:fn||'',lname:ln||'',avatar_type:'initials',avatar_data:null};
    window._applyTopbarAvatar(_m);
  } else {
    document.getElementById('avatar').textContent = ((fn||'?')[0]+((ln||'?')[0])).toUpperCase();
  }
  applyRole('user');
  onUserChanged();
  toast(pid ? 'Account created with membership! ✅' : 'Account created! ✅', 'success');
}

function loadMyProfile(){
  if(!currentUser || currentUser.role!=='user' || !currentUser.member_id) return;
  const m = qry('SELECT * FROM members WHERE id=?', [currentUser.member_id])[0];
  if(!m) return;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value = v || ''; };
  set('up-fn', m.fname);
  set('up-ln', m.lname);
  set('up-em', m.email || currentUser.username);
  set('up-ph', m.phone);
  set('up-dob', m.dob);
  set('up-gen', m.gender || 'Other');
  set('up-addr', m.address);
  set('up-ec', m.emergency_contact);
  set('up-med', m.medical_notes);

  const ms = qry(`SELECT ms.*, p.name as pn FROM memberships ms JOIN plans p ON p.id=ms.plan_id WHERE ms.member_id=? ORDER BY ms.created_at DESC LIMIT 1`, [currentUser.member_id])[0];
  const snap = document.getElementById('my-ms-snap');
  if(snap){
    snap.innerHTML = ms ? `<div class="act-item"><div class="act-icon join">🎫</div><div class="act-info"><div class="act-name">${ms.pn}</div><div class="act-det">Status: <span class="badge ${ms.status}">${ms.status}</span> • Ends: ${fd(ms.end_date)}</div></div><div class="act-time">${fm(ms.amount)}</div></div>` :
    `<div class="empty"><div class="empty-ico">🎫</div><p>No membership yet</p></div>`;
  }

  const rec = qry('SELECT * FROM ai_recs WHERE member_id=? ORDER BY created_at DESC LIMIT 1', [currentUser.member_id])[0];
  const ai = document.getElementById('my-ai-snap');
  if(ai){
    ai.innerHTML = rec ? `<div class="act-item"><div class="act-icon checkin">🤖</div><div class="act-info"><div class="act-name">${rec.plan_name}</div><div class="act-det">Goal: ${rec.goal} • BMI: ${parseFloat(rec.bmi||0).toFixed(1)} • ${rec.days_per_week} days/week</div></div><div class="act-time">${fd(rec.created_at)}</div></div><div style="margin-top:10px;font-size:12px;color:var(--text-muted)">${(rec.schedule||'').split('\r\n').join('\n').split('\n').join('<br>')}</div>` :
    `<div class="empty"><div class="empty-ico">🤖</div><p>No recommendations yet</p></div>`;
  }
}

function saveMyProfile(){
  if(!currentUser || currentUser.role!=='user' || !currentUser.member_id) return;
  const f=id=>document.getElementById(id).value;
  run(`UPDATE members SET phone=?, dob=?, gender=?, address=?, emergency_contact=?, medical_notes=? WHERE id=?`,
      [f('up-ph'), f('up-dob'), f('up-gen'), f('up-addr'), f('up-ec'), f('up-med'), currentUser.member_id]);
  toast('Profile saved ✅', 'success');
  loadMyProfile();
  populateSels();
}


function applyRole(role){
  const allow = new Set(ROLE_ACCESS[role] || []);
  // Show/hide nav buttons + pages
  document.querySelectorAll('[id^="nav-"]').forEach(btn=>{
    const page = btn.id.replace('nav-','');
    btn.style.display = allow.has(page) ? '' : 'none';
  });
  document.querySelectorAll('.page').forEach(p=>{
    const page = p.id.replace('page-','');
    p.style.display = allow.has(page) ? '' : 'none';
  });

  // Show/hide the Admin nav section label
  var adminLabel = document.getElementById('nav-label-admin');
  if (adminLabel) adminLabel.style.display = (role === 'admin') ? '' : 'none';

  // Show/hide role-specific elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = (role === 'admin') ? '' : 'none';
  });
  document.querySelectorAll('.user-only').forEach(el => {
    el.style.display = (role === 'user') ? '' : 'none';
  });

  // If current page not allowed, send to first allowed
  const first = (ROLE_ACCESS[role] || [])[0] || 'dashboard';
  const activePage = document.querySelector('.page.active')?.id?.replace('page-','');
  if(!allow.has(activePage)){
    nav(first);
  }
}

function showAuthGate(){
  document.getElementById('auth-gate').style.display = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
}

function showApp(u){
  // MySQL mode: session validation is handled by api-client.js (_showApp + initDB).
  // This function is only kept as a fallback stub — do NOT call clearSession() here
  // as that would wipe the localStorage session and log the user out on refresh.
  if(!u || !u.username){ showAuthGate(); return; }
  if(typeof window._showApp === 'function'){
    window.currentUser = u;
    window._showApp(u);
  } else {
    // Minimal safe fallback — just show the shell without SQLite lookup
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('btn-logout').style.display = '';
    document.getElementById('app-shell').style.display = '';
    applyRole(u.role || 'user');
  }
}

function clearLoginFields(){
  const u=document.getElementById('lg-user');
  const p=document.getElementById('lg-pass');
  if(u) u.value='';
  if(p) p.value='';
}

function resetDemoLogin(){
  const role = document.getElementById('lg-role').value;
  const u = AUTH_USERS.find(x=>x.role===role);
  if(!u) return;
  document.getElementById('lg-user').value = u.username;
  document.getElementById('lg-pass').value = u.password;
}

function doLogin(){
  // Handled by api-client.js (MySQL version) — this stub prevents the
  // old SQLite version from running. api-client.js redefines doLogin
  // after this file loads, so calls always reach the MySQL version.
  if(typeof window._mysqlDoLogin === 'function') window._mysqlDoLogin();
}

function logout(){
  clearSession();
  showAuthGate();
  toast('Logged out', 'info');
}



function fillAIDemo(){
  document.getElementById('ai-goal').value   = 'lose';
  document.getElementById('ai-exp').value    = 'beginner';
  document.getElementById('ai-age').value    = 28;
  document.getElementById('ai-gender').value = 'male';
  document.getElementById('ai-h').value      = 168;
  document.getElementById('ai-w').value      = 82;
  document.getElementById('ai-days').value   = 4;
  document.getElementById('ai-notes').value  = 'Knee pain';
  toast('Demo values filled ✅','info');
}

function calcBMI(hCm, wKg){
  const hM = (hCm||0) / 100;
  if(!hM) return null;
  return wKg / (hM*hM);
}

async function pickRecommendedPlan(goal, daysPerWeek, bmi, exp){
  const plans = await qry('SELECT id,name,price,duration,category,features,description FROM plans');
  if(!plans.length) return null;

  // Category weight: higher tier = higher base score
  const catWeight = {Basic:1, Standard:2, Premium:3, VIP:4};

  const scored = plans.map(p=>{
    let score = 0;
    score += (catWeight[p.category]||2) * 10; // base score from tier
    const nm = (p.name||'').toLowerCase();

    // ── Goal-based scoring ─────────────────────────────────────
    if(goal==='lose'){
      // Weight loss: Standard plan is ideal (cardio + classes access)
      if(p.category==='Standard' || nm.includes('standard')) score += 18;
      if(p.category==='Premium'  || nm.includes('premium'))  score += 12;
      if(p.category==='Basic'    || nm.includes('basic'))     score += 6;
      // High BMI members benefit more from premium facilities (pool, sauna)
      if(bmi!=null && bmi>=30 && (p.category==='Standard'||p.category==='Premium')) score += 10;

    } else if(goal==='muscle'){
      // Muscle gain: Premium/VIP gives PT sessions and full equipment
      if(p.category==='Premium'  || nm.includes('premium'))  score += 20;
      if(p.category==='VIP'      || nm.includes('vip'))      score += 14;
      if(p.category==='Standard' || nm.includes('standard')) score += 8;
      // Very lean members benefit from premium nutrition support
      if(bmi!=null && bmi<20 && (p.category==='Premium'||p.category==='VIP')) score += 8;

    } else if(goal==='endurance'){
      // Endurance/Cardio: Standard is enough — pool and classes are key
      if(p.category==='Standard' || nm.includes('standard')) score += 20;
      if(p.category==='Premium'  || nm.includes('premium'))  score += 14;
      if(p.category==='Basic'    || nm.includes('basic'))     score += 4;
      // Features check: pool access is great for endurance training
      if((p.features||'').toLowerCase().includes('pool'))    score += 8;

    } else if(goal==='flexibility'){
      // Flexibility/Yoga: Basic or Standard is fine — no heavy equipment needed
      if(p.category==='Basic'    || nm.includes('basic'))     score += 16;
      if(p.category==='Standard' || nm.includes('standard')) score += 14;
      if(p.category==='Premium'  || nm.includes('premium'))  score += 8;
      // Sauna helps muscle recovery after yoga/stretching
      if((p.features||'').toLowerCase().includes('sauna'))   score += 6;

    } else {
      // General fitness fallback
      if(p.category==='Standard' || nm.includes('standard')) score += 16;
      if(p.category==='Basic'    || nm.includes('basic'))     score += 10;
      if(p.category==='Premium'  || nm.includes('premium'))  score += 10;
    }

    // ── Training frequency bonus ────────────────────────────────
    // More days/week = member gets more value from higher tier plans
    score += Math.min(20, (daysPerWeek - 2) * 6);
    if(daysPerWeek >= 5 && (p.category==='Premium'||p.category==='VIP')) score += 12;
    if(daysPerWeek <= 2 && p.category==='VIP')  score -= 10; // overkill for low frequency

    // ── Experience level adjustment ─────────────────────────────
    if(exp==='advanced' && (p.category==='Premium'||p.category==='VIP')) score += 6;
    if(exp==='beginner' && p.category==='VIP')   score -= 6;  // VIP too much for beginners
    if(exp==='beginner' && p.category==='Basic')  score += 4;  // Basic is a good starting point

    // ── Price penalty for very expensive annual plans ───────────
    if(parseFloat(p.price||0) > 200) score -= 6;

    return {...p, score};
  }).sort((a,b) => b.score - a.score);

  return scored[0]; // Return the highest scored plan
}

async function pickClasses(goal, daysPerWeek){
  const classes = await qry('SELECT id,name,instructor,day,time,duration,capacity FROM classes');
  if(!classes.length) return [];

  // Keywords relevant to each goal — matched against class names
  const goalKeywords = {
    lose:        ['hiit','crossfit','spinning','zumba','boxing','circuit','cardio','burn','cycle'],
    muscle:      ['strength','crossfit','hiit','boxing','weights','power','bodybuilding','resistance'],
    endurance:   ['spinning','cycle','cardio','run','marathon','swimming','rowing','circuit','aerobic'],
    flexibility: ['yoga','pilates','stretch','mobility','barre','meditation','balance','core','flex'],
    fit:         ['yoga','pilates','spinning','zumba','strength','stretch','circuit','cardio']
  };
  const keywords = goalKeywords[goal] || goalKeywords['fit'];

  // Preferred training days for each goal
  const dayWeight = {Monday:6, Tuesday:5, Wednesday:6, Thursday:5, Friday:4, Saturday:4, Sunday:3};

  const scored = classes.map(c=>{
    const name = (c.name||'').toLowerCase();
    let score  = 0;
    // Score by keyword match — exact keyword = +10, partial = +5
    keywords.forEach(k=>{
      if(name.includes(k)) score += 10;
    });
    // Prefer weekdays slightly over weekends for consistency
    score += (dayWeight[c.day] || 0);
    return {...c, score};
  }).sort((a,b) => b.score - a.score);

  // Pick one class per day, up to daysPerWeek
  const picked = [], usedDays = new Set();
  for(const c of scored){
    if(picked.length >= daysPerWeek) break;
    if(usedDays.has(c.day)) continue;
    picked.push(c);
    usedDays.add(c.day);
  }
  // If not enough unique days, fill remaining slots without day restriction
  for(const c of scored){
    if(picked.length >= daysPerWeek) break;
    if(!picked.includes(c)) picked.push(c);
  }
  return picked.slice(0, daysPerWeek);
}

function buildDietTips(goal, bmi, gender, age){
  const tips = [];

  if(goal === 'lose'){
    // ── Weight Loss Diet ──────────────────────────────────────
    tips.push({ico:'🥗', t:'Caloric Deficit',
      d:'Target 300–500 kcal below your Total Daily Energy Expenditure (TDEE). Use a food tracking app to stay accountable.'});
    tips.push({ico:'🍗', t:'High Protein Intake',
      d:'Aim for 1.6–2g of protein per kg of bodyweight daily. Protein preserves muscle while you lose fat.'});
    tips.push({ico:'💧', t:'Stay Hydrated',
      d:'Drink at least 2–3 litres of water per day. Thirst is often mistaken for hunger — hydrate first.'});
    tips.push({ico:'🚫', t:'Cut Liquid Calories',
      d:'Eliminate sugary drinks, fruit juices and alcohol. These add significant calories with little nutritional value.'});
    if(bmi != null && bmi >= 30)
      tips.push({ico:'🥦', t:'Fibre First',
        d:'Fill half your plate with non-starchy vegetables at every meal to stay full on fewer calories.'});

  } else if(goal === 'muscle'){
    // ── Muscle Gain Diet ──────────────────────────────────────
    tips.push({ico:'🍗', t:'Protein Priority',
      d:'Consume 1.8–2.2g protein per kg of bodyweight daily. Spread intake across 4–5 meals for optimal muscle synthesis.'});
    tips.push({ico:'🍚', t:'Carbohydrate Timing',
      d:'Eat complex carbs (oats, brown rice, sweet potato) before and after training to fuel workouts and speed recovery.'});
    tips.push({ico:'🥛', t:'Post-Workout Nutrition',
      d:'Consume 20–40g protein within 30–60 minutes after training. A whey shake with banana is a simple, effective option.'});
    tips.push({ico:'😴', t:'Overnight Recovery Nutrition',
      d:'Eat a casein-rich snack before bed (cottage cheese, Greek yogurt) to fuel muscle repair while you sleep.'});
    if(age != null && age > 35)
      tips.push({ico:'🐟', t:'Omega-3 Fatty Acids',
        d:'Add fatty fish (salmon, tuna) or fish oil supplements — they reduce inflammation and support joint health during heavy training.'});

  } else if(goal === 'endurance'){
    // ── Endurance / Cardio Diet ───────────────────────────────
    tips.push({ico:'🍌', t:'Carbohydrate Loading',
      d:'Carbs are your primary fuel for endurance. Eat 5–7g of carbs per kg of bodyweight on training days.'});
    tips.push({ico:'⚡', t:'Pre-Training Fuel',
      d:'Eat a carb-rich snack 60–90 minutes before long sessions — banana, toast with honey, or porridge all work well.'});
    tips.push({ico:'💧', t:'Electrolyte Balance',
      d:'Replace lost sodium, potassium and magnesium during long sessions. Sports drinks or electrolyte tablets help prevent cramps.'});
    tips.push({ico:'🍗', t:'Moderate Protein',
      d:'Aim for 1.4–1.7g protein per kg bodyweight to support muscle repair after long cardio sessions.'});
    tips.push({ico:'🫐', t:'Antioxidant-Rich Foods',
      d:'Berries, leafy greens and nuts reduce exercise-induced inflammation and speed up recovery between sessions.'});

  } else if(goal === 'flexibility'){
    // ── Flexibility / Yoga Diet ───────────────────────────────
    tips.push({ico:'🥗', t:'Anti-Inflammatory Eating',
      d:'Base your diet on whole foods — fruits, vegetables, legumes and whole grains — to reduce muscle tension and stiffness.'});
    tips.push({ico:'💧', t:'Hydration for Flexibility',
      d:'Well-hydrated muscles and connective tissue are more pliable. Aim for 2–2.5 litres of water daily.'});
    tips.push({ico:'🫒', t:'Healthy Fats',
      d:'Include olive oil, avocado, and nuts. Healthy fats lubricate joints and support tissue flexibility.'});
    tips.push({ico:'🌿', t:'Magnesium-Rich Foods',
      d:'Magnesium relaxes muscles and reduces cramping. Dark chocolate, spinach, almonds and black beans are excellent sources.'});
    tips.push({ico:'🐟', t:'Collagen Support',
      d:'Consume foods rich in vitamin C (citrus, peppers) and glycine (bone broth, chicken) to support collagen and tendon health.'});

  } else {
    // ── General Fitness (fallback) ────────────────────────────
    tips.push({ico:'⚖️', t:'Balanced Macronutrients',
      d:'Aim for roughly 40% carbohydrates, 30% protein and 30% healthy fats at each main meal.'});
    tips.push({ico:'🍎', t:'Whole Foods First',
      d:'Build meals around whole grains, lean proteins, seasonal fruits and vegetables. Minimise processed foods.'});
    tips.push({ico:'💧', t:'Stay Hydrated',
      d:'Drink 2–3 litres of water daily. Consistent hydration improves energy, focus and workout performance.'});
    tips.push({ico:'🕐', t:'Consistent Meal Timing',
      d:'Eat 3–5 smaller, regular meals to keep blood sugar stable and energy levels consistent throughout the day.'});
  }

  // ── Universal additions based on profile ─────────────────────
  if(gender === 'female')
    tips.push({ico:'🩸', t:'Iron & Calcium',
      d:'Women often need more iron and calcium. Include leafy greens, legumes, dairy or fortified foods in your daily diet.'});

  return tips;
}

function buildWorkoutTips(goal, exp, days, bmi, injuries){
  const tips = [];

  // ── Injury flags ────────────────────────────────────────────
  const hasKnee     = (injuries||'').toLowerCase().includes('knee');
  const hasBack     = (injuries||'').toLowerCase().includes('back');
  const hasShoulder = (injuries||'').toLowerCase().includes('shoulder');
  const hasWrist    = (injuries||'').toLowerCase().includes('wrist');

  if(goal === 'lose'){
    // ── Weight Loss Workout Tips ──────────────────────────────
    tips.push({ico:'🔥', t:'HIIT Training',
      d:`Perform ${days >= 4 ? '3' : '2'} HIIT sessions per week. Short bursts of high intensity (30s on / 30s off) are highly effective for fat burning.`});
    tips.push({ico:'🚶', t:'Daily Movement (NEAT)',
      d:'Non-Exercise Activity Thermogenesis matters enormously. Take the stairs, walk during lunch, park further away — every step counts.'});
    tips.push({ico:'🏋️', t:'Include Strength Training',
      d:'Do at least 2 strength sessions per week alongside cardio. More muscle = higher resting metabolism = more fat burned at rest.'});
    tips.push({ico:'⏱️', t:'Track Your Progress',
      d:'Weigh yourself weekly under the same conditions (same time, same scale). Look for a 0.5–1kg loss per week as a healthy rate.'});

  } else if(goal === 'muscle'){
    // ── Muscle Gain Workout Tips ──────────────────────────────
    tips.push({ico:'📈', t:'Progressive Overload',
      d:'Add weight, reps or sets every 1–2 weeks. Your muscles only grow when consistently challenged beyond their current capacity.'});
    tips.push({ico:'🔄', t:'Training Split',
      d: days >= 4
        ? 'Use a 4-day Push/Pull/Legs split: Day 1 Push, Day 2 Pull, Day 3 Legs, Day 4 repeat. This hits every muscle group twice per week.'
        : 'Use a 3-day full-body split — squat, hinge, push and pull movements every session to maximise muscle stimulus frequency.'});
    tips.push({ico:'😴', t:'Prioritise Recovery',
      d:'Muscles grow during rest, not during the workout itself. Target 7–9 hours of sleep and take at least 2 full rest days per week.'});
    tips.push({ico:'📋', t:'Log Every Session',
      d:'Keep a training log recording weights, sets and reps. Without tracking, progressive overload is impossible to apply consistently.'});

  } else if(goal === 'endurance'){
    // ── Endurance / Cardio Workout Tips ──────────────────────
    tips.push({ico:'🏃', t:'Build Aerobic Base First',
      d:'Start with 3 moderate-intensity sessions per week at 60–70% max heart rate. Build duration before adding intensity.'});
    tips.push({ico:'🔺', t:'Progressive Distance/Time',
      d:'Increase your weekly cardio volume by no more than 10% each week to avoid overuse injuries and allow adaptation.'});
    tips.push({ico:'🔁', t:'Interval Training',
      d:'Add 1 interval session per week — alternate hard efforts (80–90% max HR) with recovery periods to rapidly improve cardiovascular fitness.'});
    tips.push({ico:'🧘', t:'Active Recovery Days',
      d:'On non-cardio days, do 20–30 minutes of light activity (walking, swimming, cycling) to maintain blood flow without adding stress.'});
    tips.push({ico:'❤️', t:'Monitor Heart Rate',
      d:'Use a heart rate monitor or fitness tracker to ensure you are training in the correct zones and not overtraining.'});

  } else if(goal === 'flexibility'){
    // ── Flexibility / Yoga Workout Tips ──────────────────────
    tips.push({ico:'🧘', t:'Consistency Over Intensity',
      d:'Flexibility improves through daily practice, not occasional intense sessions. Even 15–20 minutes of stretching daily produces results.'});
    tips.push({ico:'🌡️', t:'Always Warm Up First',
      d:'Never stretch cold muscles. Do 5–10 minutes of light cardio (brisk walk, light cycling) before any flexibility work to reduce injury risk.'});
    tips.push({ico:'⏳', t:'Hold Stretches Long Enough',
      d:'Hold each static stretch for 30–60 seconds. Short holds do not give connective tissue time to adapt and lengthen.'});
    tips.push({ico:'🌬️', t:'Breathe Into Each Stretch',
      d:'Exhale as you move deeper into a stretch. Controlled breathing activates the parasympathetic nervous system, allowing muscles to relax further.'});
    tips.push({ico:'🔄', t:'Combine Yoga and Mobility Work',
      d:'Yoga improves flexibility and mindfulness together. Add targeted mobility drills (hip circles, shoulder rolls) on alternate days for joint health.'});

  } else {
    // ── General Fitness (fallback) ────────────────────────────
    tips.push({ico:'🔀', t:'Vary Your Training',
      d:'Rotate between cardio, strength and mobility training each week. Variety prevents plateaus and builds well-rounded fitness.'});
    tips.push({ico:'🧘', t:'Add Flexibility Work',
      d:'Finish every session with 10 minutes of stretching. This improves mobility, reduces soreness and lowers injury risk over time.'});
    tips.push({ico:'❤️', t:'Build a Cardio Base',
      d:'Two moderate-intensity cardio sessions per week keeps your cardiovascular system healthy and improves energy levels throughout the day.'});
  }

  // ── Experience level adjustments ─────────────────────────────
  if(exp === 'beginner'){
    tips.push({ico:'🐢', t:'Master Form Before Load',
      d:'Learn correct technique for every exercise before adding weight or speed. Injuries from poor form can set your progress back by months.'});
  } else if(exp === 'intermediate'){
    tips.push({ico:'📊', t:'Track Metrics',
      d:'Start measuring performance indicators (pace, weight lifted, reps) so you can identify where to push harder and where to recover.'});
  } else if(exp === 'advanced'){
    tips.push({ico:'⚡', t:'Periodisation',
      d:'Cycle through hypertrophy, strength and deload phases every 4–6 weeks. Periodisation is essential for continued progress at an advanced level.'});
  }

  // ── Injury-specific warnings ─────────────────────────────────
  if(hasKnee)
    tips.push({ico:'⚠️', t:'Knee Injury — Modify Exercises',
      d:'Avoid deep squats, lunges and high-impact jumping. Substitute with seated leg press, swimming and low-impact cycling until cleared by a physiotherapist.'});
  if(hasBack)
    tips.push({ico:'⚠️', t:'Back Pain — Core First',
      d:'Prioritise core stability exercises (planks, dead bugs, bird-dog). Avoid heavy deadlifts and forward bending under load until a physiotherapist clears you.'});
  if(hasShoulder)
    tips.push({ico:'⚠️', t:'Shoulder Injury — Avoid Overhead',
      d:'Skip overhead pressing movements. Focus on rotator cuff strengthening (band external rotation) and horizontal pulling (rows) instead.'});
  if(hasWrist)
    tips.push({ico:'⚠️', t:'Wrist Injury — Use Alternatives',
      d:'Avoid push-ups on flat palms. Use dumbbells with a neutral grip or perform exercises on fists to keep wrists in a safer position.'});

  return tips;
}

function buildBMIHTML(bmi, bmiTxt, bmiBand, age, gender){
  const bmiColor = bmi==null ? 'var(--text-muted)'
    : bmi<18.5 ? 'var(--info)'
    : bmi<25   ? 'var(--success)'
    : bmi<30   ? 'var(--warning)'
    : 'var(--danger)';

  // BMI gauge (simple progress bar with needle)
  const gaugeMax = 40; const gaugePct = bmi ? Math.min(100, (bmi/gaugeMax)*100) : 0;
  const zones = [
    {label:'Underweight',color:'var(--info)',   pct:46}, // <18.5 = 46% of 40
    {label:'Normal',     color:'var(--success)',pct:16}, // 18.5-25 = 16% of 40 = 40%
    {label:'Overweight', color:'var(--warning)',pct:12}, // 25-30 = 12.5%
    {label:'Obese',      color:'var(--danger)', pct:26}  // 30+ = rest
  ];

  return `
    <div style="text-align:center;padding:10px 0 16px">
      <div style="font-size:48px;font-weight:900;color:${bmiColor}">${bmiTxt}</div>
      <div style="font-size:14px;font-weight:700;color:${bmiColor};margin-top:2px">${bmiBand}</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px">
        <div style="width:46%;background:var(--info);opacity:.7"></div>
        <div style="width:16%;background:var(--success);opacity:.7"></div>
        <div style="width:13%;background:var(--warning);opacity:.7"></div>
        <div style="flex:1;background:var(--danger);opacity:.7"></div>
      </div>
      <div style="display:flex;font-size:10px;color:var(--text-muted);margin-top:4px;justify-content:space-between">
        <span>Underweight &lt;18.5</span><span>Normal 18.5–25</span><span>Overweight 25–30</span><span>Obese 30+</span>
      </div>
    </div>
    <div class="g2" style="gap:10px">
      ${age    ? `<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Age</div><div style="font-size:22px;font-weight:800;margin-top:4px">${age}</div></div>` : ''}
      ${gender ? `<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Gender</div><div style="font-size:18px;font-weight:700;margin-top:4px;text-transform:capitalize">${gender}</div></div>` : ''}
    </div>
    <div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:10px;font-size:12px;color:var(--text-muted);line-height:1.7">
      ${bmi<18.5 ? '⚠️ Your BMI suggests you may be underweight. Consider speaking to a nutritionist to ensure you are meeting caloric and nutritional needs.' :
        bmi<25   ? '✅ Your BMI is in the healthy range. Focus on maintaining your current habits while building fitness.' :
        bmi<30   ? '⚠️ Your BMI is in the overweight range. Moderate lifestyle changes can bring meaningful improvement.' :
                   '🔴 Your BMI is in the obese range. Combined diet and exercise interventions are strongly recommended.'}
    </div>
  `;
}

function switchAITab(tab){
  ['bmi','plan','workout','diet'].forEach(t=>{
    const btn = document.getElementById('ai-tab-'+t);
    const panel = document.getElementById('ai-panel-'+t);
    if(btn)   btn.className = t===tab ? 'btn btn-p btn-sm' : 'btn btn-s btn-sm';
    if(panel) panel.style.display = t===tab ? '' : 'none';
  });
}

async function runAIPrediction(){
  const goal    = document.getElementById('ai-goal').value;
  const exp     = document.getElementById('ai-exp').value;
  const age     = parseInt(document.getElementById('ai-age').value)||null;
  const gender  = document.getElementById('ai-gender').value;
  const h       = parseFloat(document.getElementById('ai-h').value);
  const w       = parseFloat(document.getElementById('ai-w').value);
  const days    = parseInt(document.getElementById('ai-days').value,10);
  const injuries= (document.getElementById('ai-notes').value||'').trim();

  if (age !== null && (age < 5 || age > 120)) {
    toast('Please enter a valid age (5–120)', 'error'); return;
  }

  if(!h||!w||h<100||h>230||w<30||w>300){
    toast('Please enter valid height and weight','error'); return;
  }

  const bmi     = calcBMI(h,w);
  const bmiTxt  = bmi ? bmi.toFixed(1) : '—';
  const bmiBand = bmi==null ? '—' : (bmi<18.5?'Underweight':bmi<25?'Normal':bmi<30?'Overweight':'Obese');
  const plan    = await pickRecommendedPlan(goal, days, bmi, exp);
  const cls     = await pickClasses(goal, days);
  const dietTips    = buildDietTips(goal, bmi, gender, age);
  const workoutTips = buildWorkoutTips(goal, exp, days, bmi, injuries);

  // Show tabs
  const tabBar = document.getElementById('ai-tabs');
  const empty  = document.getElementById('ai-empty');
  if(tabBar) tabBar.style.display='flex';
  if(empty)  empty.style.display='none';

  // ── BMI Panel ────────────────────────────────────────
  const bmiPanel = document.getElementById('ai-panel-bmi');
  if(bmiPanel) bmiPanel.innerHTML = buildBMIHTML(bmi, bmiTxt, bmiBand, age, gender);

  // ── Plan Panel ───────────────────────────────────────
  const planPanel = document.getElementById('ai-panel-plan');
  if(planPanel){
    const goalTxt = goal==='lose'?'Lose Weight':goal==='muscle'?'Gain Muscle':goal==='endurance'?'Endurance & Cardio':goal==='flexibility'?'Flexibility & Yoga':'General Fitness';
    if(plan){
      const features = (plan.features||'').split(',').filter(Boolean);
      planPanel.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.04));border:1px solid rgba(249,115,22,.2);border-radius:12px;padding:18px;margin-bottom:14px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Recommended Plan</div>
          <div style="font-size:22px;font-weight:900;margin-top:6px">${plan.name}</div>
          <div style="color:var(--success);font-weight:800;font-size:20px;margin:6px 0">${fm(plan.price)} <span style="color:var(--text-muted);font-weight:400;font-size:12px">/ ${plan.duration} days</span></div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${plan.description||''}</div>
          ${features.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">${features.map(f=>`<span style="background:rgba(34,197,94,.12);color:var(--success);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600">✓ ${f.trim()}</span>`).join('')}</div>`:''}
        </div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.8;padding:10px;background:var(--surface2);border-radius:8px">
          <b style="color:var(--text)">Why this plan?</b><br>
          Goal: <b style="color:var(--text)">${goalTxt}</b> &nbsp;•&nbsp;
          Days/week: <b style="color:var(--text)">${days}</b> &nbsp;•&nbsp;
          Level: <b style="color:var(--text)">${exp}</b> &nbsp;•&nbsp;
          BMI: <b style="color:var(--text)">${bmiTxt} (${bmiBand})</b>
        </div>
      `;
    } else {
      planPanel.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>No plans available yet. Ask an admin to add plans.</p></div>`;
    }
  }

  // ── Workout Tips Panel ───────────────────────────────
  const workoutPanel = document.getElementById('ai-panel-workout');
  if(workoutPanel){
    workoutPanel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${workoutTips.map(t=>`
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--surface2);border-radius:10px">
            <div style="font-size:22px;flex-shrink:0;line-height:1">${t.ico}</div>
            <div><div style="font-weight:700;font-size:13px;margin-bottom:3px">${t.t}</div>
            <div style="font-size:12px;color:var(--text-muted);line-height:1.6">${t.d}</div></div>
          </div>`).join('')}
      </div>`;
  }

  // ── Diet Tips Panel ──────────────────────────────────
  const dietPanel = document.getElementById('ai-panel-diet');
  if(dietPanel){
    dietPanel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${dietTips.map(t=>`
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--surface2);border-radius:10px">
            <div style="font-size:22px;flex-shrink:0;line-height:1">${t.ico}</div>
            <div><div style="font-weight:700;font-size:13px;margin-bottom:3px">${t.t}</div>
            <div style="font-size:12px;color:var(--text-muted);line-height:1.6">${t.d}</div></div>
          </div>`).join('')}
      </div>`;
  }

  // Default to BMI tab
  switchAITab('bmi');

  // ── Weekly Schedule ──────────────────────────────────
  const schedEl = document.getElementById('ai-schedule');
  if(cls.length){
    schedEl.innerHTML = `
      <div class="tbl-wrap" style="margin-top:6px">
        <table>
          <thead><tr><th>Day</th><th>Class</th><th>Time</th><th>Instructor</th><th>Duration</th></tr></thead>
          <tbody>
            ${cls.map(c=>`
              <tr>
                <td><span class="badge pending">${c.day}</span></td>
                <td style="font-weight:700">${c.name}</td>
                <td>${c.time||'—'}</td>
                <td>${c.instructor||'—'}</td>
                <td>${c.duration||'—'} min</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        💡 Tip: Consistency matters more than intensity. Start steady and increase gradually.
      </div>`;
  } else {
    schedEl.innerHTML = `<div class="empty"><div class="empty-ico">📭</div><p>No classes found. Ask an admin to add classes first.</p></div>`;
  }

  // ── Save to DB ───────────────────────────────────────
  const cu = typeof window !== 'undefined' ? window.currentUser : currentUser;
  if(cu && cu.role==='user' && cu.member_id){
    const schedTxt  = cls.map(c=>`${c.day} ${c.time} - ${c.name} (${c.duration}m)`).join('\n');
    const classIds  = cls.filter(c=>c.id).map(c=>c.id).join(',');
    const dietStr   = dietTips.map(t=>`${t.t}: ${t.d}`).join(' | ');
    const workStr   = workoutTips.map(t=>`${t.t}: ${t.d}`).join(' | ');
    run('INSERT INTO ai_recs(member_id,goal,bmi,age,gender,injuries,days_per_week,experience,plan_id,plan_name,schedule,recommended_class_ids,diet_tips,workout_tips) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [cu.member_id, goal, bmi, age, gender, injuries||null, days, exp, plan?plan.id:null, plan?plan.name:'', schedTxt, classIds||null, dietStr, workStr]);
    loadAIHistory();
  }

  toast('Recommendation ready! ✅','success');
}

async function loadAIHistory(){
  const cu = typeof window !== 'undefined' ? window.currentUser : currentUser;
  if(!cu || cu.role!=='user' || !cu.member_id) return;
  const rows = await qry('SELECT * FROM ai_recs WHERE member_id=? ORDER BY created_at DESC LIMIT 10', [cu.member_id]);
  const box = document.getElementById('ai-history');
  if(!box) return;
  if(!rows || !rows.length){
    box.innerHTML = `<div class="empty"><div class="empty-ico">📂</div><p>No predictions yet.</p></div>`;
    return;
  }
  const goalLabel = {lose:'Lose Weight', muscle:'Gain Muscle', endurance:'Endurance & Cardio', flexibility:'Flexibility & Yoga', fit:'General Fitness'};
  box.innerHTML = rows.map(r=>`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-weight:700;font-size:14px">${r.plan_name||'No Plan'}</span>
          <span class="badge active" style="font-size:10px">${goalLabel[r.goal]||r.goal}</span>
          <span class="badge paused" style="font-size:10px">${r.experience||'—'}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:10px">
          ${r.bmi   ? `<span>📏 BMI: <b style="color:var(--text)">${parseFloat(r.bmi).toFixed(1)}</b></span>` : ''}
          ${r.age   ? `<span>🎂 Age: <b style="color:var(--text)">${r.age}</b></span>` : ''}
          ${r.gender? `<span>⚧ <b style="color:var(--text);text-transform:capitalize">${r.gender}</b></span>` : ''}
          <span>📅 ${r.days_per_week} days/week</span>
          ${r.injuries ? `<span>⚠️ ${r.injuries}</span>` : ''}
        </div>
        ${r.schedule ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📋 ${r.schedule.split('\n').join(' · ')}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:var(--text-muted)">${r.created_at ? new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${r.created_at ? new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</div>
      </div>
    </div>`).join('');
}

async function initDB_sqlite() {
  const SQL=await initSqlJs({
    locateFile:()=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm'
  });
db=new SQL.Database();
db.run(`CREATE TABLE plans(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, duration INTEGER, price REAL, category TEXT, features TEXT, description TEXT, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE members(id INTEGER PRIMARY KEY AUTOINCREMENT, fname TEXT, lname TEXT, email TEXT, phone TEXT, dob TEXT, gender TEXT, address TEXT, emergency_contact TEXT, medical_notes TEXT, status TEXT DEFAULT 'active', trainer_id INTEGER, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE memberships(id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, plan_id INTEGER, start_date TEXT, end_date TEXT, amount REAL, status TEXT DEFAULT 'active', notes TEXT, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE payments(id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, amount REAL, method TEXT, plan TEXT, date TEXT, note TEXT, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE attendance(id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, checkin_time TEXT, checkout_time TEXT);
CREATE TABLE classes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, instructor TEXT, day TEXT, time TEXT, duration INTEGER, capacity INTEGER, trainer_id INTEGER, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE equipment(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT, quantity INTEGER, condition_status TEXT, purchase_date TEXT, next_maintenance TEXT, notes TEXT);
CREATE TABLE staff(id INTEGER PRIMARY KEY AUTOINCREMENT, fname TEXT, lname TEXT, email TEXT, phone TEXT, role TEXT, hire_date TEXT, salary REAL, schedule TEXT);
CREATE TABLE auth_users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, member_id INTEGER, staff_id INTEGER, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE ai_recs(id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER, goal TEXT, bmi REAL, days_per_week INTEGER, experience TEXT, plan_id INTEGER, plan_name TEXT, schedule TEXT, created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE class_trainers(class_id INTEGER, staff_id INTEGER, assigned_date TEXT, PRIMARY KEY(class_id, staff_id));
`);
seedData();
document.getElementById('loading').style.display='none';
dash();
rMembers();
rMS();
rPay();
rAtt();
rClasses();
rEquip();
rStaff();
rPlans();
populateSels();

  // Auth gate after app is ready
  const sess = loadSession();
  if(sess) showApp(sess);
  else showAuthGate();
}

function seedData() {
  [['Basic Monthly',
  30,
  29.99,
  'Basic',
  'Gym access,Locker room',
  'Basic access'],
  ['Standard Monthly',
  30,
  49.99,
  'Standard',
  'Gym access,Pool,Group classes,Locker room',
  'Full access'],
  ['Premium Monthly',
  30,
  79.99,
  'Premium',
  'All access,Sauna,Guest passes,Consultation',
  'All-inclusive'],
  ['Annual VIP',
  365,
  599.99,
  'VIP',
  'All access,Sauna,Personal training,Nutrition plan',
  'Best value'],
  ['Student Monthly',
  30,
  24.99,
  'Basic',
  'Gym access,Locker room',
  'Student plan']].forEach(p=>db.run('INSERT INTO plans(name,duration,price,category,features,description)VALUES(?,?,?,?,?,?)', p));
  [['Mike',
  'Johnson',
  'mike@fitcore.com',
  '555-0101',
  'Trainer',
  '2022-01-15',
  4500,
  'Mon-Fri 6am-2pm'],
  ['Sarah',
  'Williams',
  'sarah@fitcore.com',
  '555-0102',
  'Manager',
  '2021-06-01',
  6000,
  'Mon-Sat 9am-5pm'],
  ['Carlos',
  'Martinez',
  'carlos@fitcore.com',
  '555-0103',
  'Trainer',
  '2023-03-20',
  4200,
  'Tue-Sun 2pm-10pm'],
  ['Emily',
  'Chen',
  'emily@fitcore.com',
  '555-0104',
  'Receptionist',
  '2022-09-10',
  3200,
  'Mon-Fri 8am-4pm'],
  ['David',
  'Brown',
  'david@fitcore.com',
  '555-0105',
  'Nutritionist',
  '2023-07-01',
  4800,
  'Mon-Wed-Fri']].forEach(s=>db.run('INSERT INTO staff(fname,lname,email,phone,role,hire_date,salary,schedule)VALUES(?,?,?,?,?,?,?,?)', s));
  [['Alex',
  'Turner',
  'alex@email.com',
  '555-1001',
  '1990-03-15',
  'Male',
  '123 Oak St',
  'Emma 555-9999',
  'None',
  'active'],
  ['Maria',
  'Santos',
  'maria@email.com',
  '555-1002',
  '1985-07-22',
  'Female',
  '456 Elm Ave',
  'Carlos 555-8888',
  'Mild asthma',
  'active'],
  ['James',
  'Wilson',
  'james@email.com',
  '555-1003',
  '1995-11-08',
  'Male',
  '789 Pine Rd',
  'Karen 555-7777',
  'None',
  'active'],
  ['Lisa',
  'Anderson',
  'lisa@email.com',
  '555-1004',
  '1988-04-30',
  'Female',
  '321 Maple Dr',
  'Tom 555-6666',
  'Knee injury',
  'active'],
  ['Robert',
  'Davis',
  'robert@email.com',
  '555-1005',
  '1978-09-12',
  'Male',
  '654 Cedar Ln',
  'Susan 555-5555',
  'High BP',
  'expired'],
  ['Jennifer',
  'Lee',
  'jen@email.com',
  '555-1006',
  '1993-01-25',
  'Female',
  '987 Birch St',
  'Michael 555-4444',
  'None',
  'active'],
  ['Chris',
  'Martinez',
  'chris@email.com',
  '555-1007',
  '1991-06-17',
  'Male',
  '147 Spruce Ave',
  'Ana 555-3333',
  'None',
  'active'],
  ['Ashley',
  'Thompson',
  'ashley@email.com',
  '555-1008',
  '1997-12-03',
  'Female',
  '258 Walnut Rd',
  'Bill 555-2222',
  'None',
  'paused']].forEach(m=>db.run("INSERT INTO members(fname,lname,email,phone,dob,gender,address,emergency_contact,medical_notes,status)VALUES(?,?,?,?,?,?,?,?,?,?)", m));

  // Allocate each member to exactly ONE trainer (one-trainer-per-member)
  // Demo allocation: odd member IDs -> Trainer staff_id 1 (Mike), even -> staff_id 3 (Carlos)
  db.run("UPDATE members SET trainer_id = CASE WHEN (id % 2)=1 THEN 1 ELSE 3 END");

  // Seed demo auth users (admin/trainer + one demo user linked to Member #1)
  [
    ['admin','admin123','admin', null],
    ['trainer','trainer123','trainer', null],
    ['user','user123','user', 1]
  ].forEach(u=>db.run('INSERT INTO auth_users(username,password,role,member_id,staff_id)VALUES(?,?,?,?,?)', u));

  const t=new Date(),
  af=d=> {
    let x=new Date(t);
    x.setDate(x.getDate()+d);
    return x.toISOString().split('T')[0]
  }

  ,
  ap=d=> {
    let x=new Date(t);
    x.setDate(x.getDate()-d);
    return x.toISOString().split('T')[0]
  }

  ;
  [[1,
  2,
  ap(10),
  af(20),
  49.99,
  'active',
  ''],
  [2,
  3,
  ap(5),
  af(25),
  79.99,
  'active',
  'Upgraded'],
  [3,
  1,
  ap(15),
  af(15),
  29.99,
  'active',
  ''],
  [4,
  4,
  ap(20),
  af(345),
  599.99,
  'active',
  'Annual'],
  [5,
  2,
  ap(40),
  ap(10),
  49.99,
  'expired',
  ''],
  [6,
  3,
  ap(3),
  af(27),
  79.99,
  'active',
  ''],
  [7,
  2,
  ap(8),
  af(22),
  49.99,
  'active',
  ''],
  [8,
  1,
  ap(15),
  ap(5),
  29.99,
  'paused',
  'Pause req']].forEach(m=>db.run('INSERT INTO memberships(member_id,plan_id,start_date,end_date,amount,status,notes)VALUES(?,?,?,?,?,?,?)', m));
  [[1,
  49.99,
  'card',
  'Standard Monthly',
  ap(10),
  'Online'],
  [2,
  79.99,
  'cash',
  'Premium Monthly',
  ap(5),
  'Front desk'],
  [3,
  29.99,
  'card',
  'Basic Monthly',
  ap(15),
  ''],
  [4,
  599.99,
  'transfer',
  'Annual VIP',
  ap(20),
  'Bank transfer'],
  [6,
  79.99,
  'card',
  'Premium Monthly',
  ap(3),
  ''],
  [7,
  49.99,
  'cash',
  'Standard Monthly',
  ap(8),
  ''],
  [2,
  25,
  'cash',
  'Personal Training',
  ap(2),
  'Extra'],
  [1,
  25,
  'card',
  'Personal Training',
  ap(1),
  '']].forEach(x=>db.run('INSERT INTO payments(member_id,amount,method,plan,date,note)VALUES(?,?,?,?,?,?)', x));
  const nw=new Date().toISOString().slice(0, 16);
  [[1,
  nw,
  ''],
  [2,
  nw,
  ''],
  [3,
  ap(1)+'T09:00',
  ap(1)+'T11:30'],
  [4,
  ap(1)+'T07:00',
  ap(1)+'T09:00'],
  [6,
  ap(2)+'T18:00',
  ap(2)+'T20:00'],
  [7,
  ap(2)+'T07:00',
  ap(2)+'T09:30'],
  [1,
  ap(3)+'T08:00',
  ap(3)+'T10:00']].forEach(a=>db.run('INSERT INTO attendance(member_id,checkin_time,checkout_time)VALUES(?,?,?)', a));
  [['Morning Yoga',
  'Mike Johnson',
  'Monday',
  '07:00',
  60,
  15],
  ['CrossFit HIIT',
  'Carlos Mendez',
  'Monday',
  '09:00',
  45,
  20],
  ['Spinning',
  'Mike Johnson',
  'Tuesday',
  '06:30',
  50,
  18],
  ['Pilates',
  'Carlos Mendez',
  'Tuesday',
  '10:00',
  60,
  12],
  ['Boxing',
  'Mike Johnson',
  'Wednesday',
  '18:00',
  60,
  15],
  ['Yoga Flow',
  'Carlos Mendez',
  'Wednesday',
  '07:00',
  60,
  15],
  ['Zumba',
  'Carlos Mendez',
  'Thursday',
  '19:00',
  55,
  25],
  ['Strength Training',
  'Mike Johnson',
  'Friday',
  '08:00',
  60,
  10],
  ['HIIT Circuit',
  'Carlos Mendez',
  'Saturday',
  '09:00',
  45,
  20],
  ['Sunday Stretch',
  'Mike Johnson',
  'Sunday',
  '10:00',
  60,
  15]].forEach(c=>db.run('INSERT INTO classes(name,instructor,day,time,duration,capacity)VALUES(?,?,?,?,?,?)', c));

  // Allocate classes to trainers (based on instructor string)
  db.run("UPDATE classes SET trainer_id = CASE WHEN instructor LIKE '%Mike%' THEN 1 WHEN instructor LIKE '%Carlos%' THEN 3 ELSE 1 END");

  // Seed class_trainers junction table so JOINs return real trainer names
  db.run("INSERT OR IGNORE INTO class_trainers(class_id, staff_id, assigned_date) SELECT id, trainer_id, date('now') FROM classes WHERE trainer_id IS NOT NULL");

  [['Treadmill Pro X5',
  'Cardio',
  8,
  'Good',
  '2022-03-15',
  af(30),
  'LifeFitness X5'],
  ['Elliptical',
  'Cardio',
  5,
  'Excellent',
  '2023-01-20',
  af(90),
  ''],
  ['Stationary Bike',
  'Cardio',
  10,
  'Good',
  '2021-09-10',
  af(15),
  'Oil chain monthly'],
  ['Squat Rack',
  'Strength',
  4,
  'Excellent',
  '2023-05-01',
  af(180),
  'Olympic standard'],
  ['Chest Press',
  'Strength',
  3,
  'Good',
  '2022-08-15',
  af(45),
  ''],
  ['Dumbbell Set',
  'Free Weights',
  2,
  'Excellent',
  '2023-02-10',
  af(365),
  '2.5-50kg'],
  ['Barbells',
  'Free Weights',
  6,
  'Good',
  '2021-11-20',
  af(90),
  'Olympic bars'],
  ['Yoga Mats',
  'Flexibility',
  20,
  'Fair',
  '2022-06-01',
  af(10),
  'Need replacement'],
  ['Foam Rollers',
  'Flexibility',
  15,
  'Good',
  '2023-03-15',
  af(180),
  ''],
  ['Pull-up Station',
  'Strength',
  2,
  'Excellent',
  '2023-07-01',
  af(180),
  'Free standing']].forEach(e=>db.run('INSERT INTO equipment(name,category,quantity,condition_status,purchase_date,next_maintenance,notes)VALUES(?,?,?,?,?,?,?)', e));
}

function qry(sql, p=[]) {
  try {
    const s=db.prepare(sql);
    s.bind(p);
    const r=[];
    while(s.step())r.push(s.getAsObject());
    s.free();
    return r
  }

  catch(e) {
    console.error(e);
    return[]
  }
}

function run(sql, p=[]) {
  try {
    db.run(sql, p);
    return true
  }

  catch(e) {
    console.error(e);
    return false
  }
}

function td() {
  return new Date().toISOString().split('T')[0]
}

function ndt() {
  return new Date().toISOString().slice(0, 16)
}

function fd(d) {
  if( !d)return'—';

  try {
    return new Date(d).toLocaleDateString('en-US', {
      month:'short', day:'numeric', year:'numeric'
    })
}

catch(e) {
  return d
}
}

function fm(n) {
  return 'Rs. ' + parseFloat(n||0).toLocaleString('en-LK', {minimumFractionDigits:2, maximumFractionDigits:2})
}

function ini(f, l='') {
  return((f||'?')[0]+((l||'?')[0])).toUpperCase()
}

function sbadge(s) {
  return`<span class="badge ${s||'pending'}">${
    s||'?'
  }

  </span>`
}

function toast(msg, type='info') {
  const c=document.getElementById('toast-c'),
  t=document.createElement('div');

  t.className=`toast ${
    type
  }

  `;

  t.innerHTML=`<div class="td"></div><span>${
    msg
  }

  </span>`;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 3000)
}

function nav(p) {
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-' +p).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(x=> {
      if(x.getAttribute('onclick')?.includes(`'${p}' `))x.classList.add('active')
    });

  const T= {
    dashboard: 'Dashboard', myprofile: 'My Profile', members:'Members', memberships:'Memberships', payments:'Payments', attendance:'Attendance', classes:'Classes', equipment:'Equipment', staff:'Staff', plans:'Plans & Pricing', ai:'Recommendation'
  }

  ;
  document.getElementById('page-title').textContent=T[p]||p
}

function openM(id) {
  document.getElementById(id).classList.add('open')
}

function closeM(id) {
  document.getElementById(id).classList.remove('open')
}

document.querySelectorAll('.mo').forEach(m=>m.addEventListener('click', e=> {
      if(e.target===m)m.classList.remove('open')
    }));

function populateSels() {
  const plans=qry('SELECT id,name,price FROM plans ORDER BY price');

  ['m-plan',
  'ms-plan',
  'ems-plan'].forEach(id=> {
      const s=document.getElementById(id); if(s)s.innerHTML=plans.map(p=>`<option value="${p.id}" >${
          p.name
        }

        — ${
          fm(p.price)
        }

        </option>`).join('')
    });

  // Register plan dropdown is handled by openRegister() to ensure it loads even before login
  // But refresh it here too in case user is already logged in
  const rp=document.getElementById('rg-plan');
  if(rp && rp.options.length <= 1) {
    rp.innerHTML=`<option value="">— Select a Plan (optional) —</option>`+plans.map(p=>`<option value="${p.id}">${p.name} — ${fm(p.price)}</option>`).join('');
  }

  let msql = 'SELECT id,fname,lname FROM members';
  if(currentUser && currentUser.role==='trainer' && currentUser.staff_id){
    msql += ` WHERE trainer_id=${currentUser.staff_id}`;
  }
  msql += ' ORDER BY fname';
  const mems = qry(msql);

  ['ms-mem',
  'p-mem',
  'ci-mem'].forEach(id=> {
      const s=document.getElementById(id); if(s)s.innerHTML=mems.map(m=>`<option value="${m.id}" >${
          m.fname
        }

        ${
          m.lname
        }

        </option>`).join('')
    });
  const el=id=>document.getElementById(id);
  if(el('m-start'))el('m-start').value=td();
  if(el('p-date'))el('p-date').value=td();
  if(el('up-date'))el('up-date').value=td();
  if(el('ci-in'))el('ci-in').value=ndt();
  if(el('ms-start'))el('ms-start').value=td()
}

function fillMsPlan() {
  const pid=document.getElementById('ms-plan').value;
  const plan=qry('SELECT * FROM plans WHERE id=?', [pid])[0];

  if(plan) {
    const s=document.getElementById('ms-start').value||td();
    const e=new Date(s);
    e.setDate(e.getDate()+plan.duration);
    document.getElementById('ms-end').value=e.toISOString().split('T')[0];
    document.getElementById('ms-amt').value=plan.price
  }
}

function dashAdmin(){
  // Admin dashboard metrics
  const isAdmin = (currentUser && currentUser.role === 'admin');

  // Staff breakdown (Admin only)
  const trainers = isAdmin ? (qry("SELECT COUNT(*) as c FROM staff WHERE role='Trainer'")[0]?.c || 0) : '—';
  const cleaners = isAdmin ? (qry("SELECT COUNT(*) as c FROM staff WHERE role='Cleaner'")[0]?.c || 0) : '—';
  const receptionists = isAdmin ? (qry("SELECT COUNT(*) as c FROM staff WHERE role='Receptionist'")[0]?.c || 0) : '—';

  // Total users
  const totalUsers = (qry('SELECT COUNT(*) as c FROM members')[0]?.c || 0);

  // Monthly revenue (all)
  const monthStart = td().slice(0,7) + '-01';
  const monthlyRevenue = (qry('SELECT COALESCE(SUM(amount),0) as r FROM payments WHERE date>=?', [monthStart])[0]?.r || 0);

  // DOM updates
  const setTxt = (id, v) => { const el=document.getElementById(id); if(el) el.textContent = v; };
  setTxt('st-trainers', trainers);
  setTxt('st-cleaners', cleaners);
  setTxt('st-receptionists', receptionists);
  setTxt('st-users', totalUsers);
  setTxt('st-rev', fm(monthlyRevenue));
  setTxt('rev-total', fm(monthlyRevenue));

  renderBarChart();
  renderMonthlyRevenueChart();
  renderPlanBreakdown();
  renderRecentAct();
}

function dashTrainer(){
  // Trainer dashboard (no finance / no global staff)
  const role = (currentUser && currentUser.role) ? currentUser.role : 'user';
  if (role !== 'trainer') return;

  // If your DB supports trainer assignment, replace this with assigned members query.
  // Fallback: show total members (demo-friendly)
  const assignedMembers = (qry("SELECT COUNT(*) as c FROM members")[0]?.c || 0);

  // Today's check-ins (all members) - can be restricted to assigned members later
  const today = td();
  const todayCheckins = (qry("SELECT COUNT(*) as c FROM attendance WHERE date(check_in)=date(?)", [today])[0]?.c || 0);

  // Today's classes (all) - can be restricted to trainer classes later
  const todayClasses = (qry("SELECT COUNT(*) as c FROM classes WHERE day_of_week=strftime('%w','now')")[0]?.c || 0);

  const setTxt = (id, v) => { const el=document.getElementById(id); if(el) el.textContent = v; };
  setTxt('tr-members', assignedMembers);
  setTxt('tr-checkins', todayCheckins);
  setTxt('tr-classes', todayClasses);

  // Weekly check-in graph is OK (operational, not financial)
  renderBarChart();

  // Next classes list (top 5 upcoming)
  const list = document.getElementById('tr-next-classes');
  if (list){
    const rows = qry("SELECT name, day_of_week, time FROM classes ORDER BY day_of_week, time LIMIT 5");
    if (!rows.length){
      list.innerHTML = '<div class="empty"><div class="empty-ico">🏋️</div><p>No classes found</p></div>';
    } else {
      list.innerHTML = rows.map(r => `
        <div class="act-item">
          <div class="act-icon checkin">🏋️</div>
          <div class="act-info">
            <div class="act-name">${r.name}</div>
            <div class="act-det">Day: ${r.day_of_week} • Time: ${r.time}</div>
          </div>
          <div class="act-time">Upcoming</div>
        </div>
      `).join('');
    }
  }
}

function dash(){
  const role = (currentUser && currentUser.role) ? currentUser.role : 'user';

  const adminWrap = document.getElementById('dash-admin');
  const trainerWrap = document.getElementById('dash-trainer');

  if (role === 'admin'){
    if (adminWrap) adminWrap.style.display = '';
    if (trainerWrap) trainerWrap.style.display = 'none';
    dashAdmin();
  } else if (role === 'trainer'){
    if (adminWrap) adminWrap.style.display = 'none';
    if (trainerWrap) trainerWrap.style.display = '';
    dashTrainer();
  } else {
    // Users keep existing dashboard behavior (calls existing functions in file)
    if (adminWrap) adminWrap.style.display = 'none';
    if (trainerWrap) trainerWrap.style.display = 'none';
    // Existing user dashboard may be in original dash(); for simplicity, show weekly chart only
    renderBarChart();
  }
}

function renderBarChart() {
  const days=['Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun'];
  const counts=[];

  for(let i=6; i>=0; i--) {
    counts.push(qry(`SELECT COUNT(*) as c FROM attendance WHERE date(checkin_time)=date('now', '-${i} days')`)[0].c)
  }

  const mx=Math.max(...counts, 1);
  document.getElementById('bar-chart').innerHTML=counts.map((c, i)=>`<div class="bar" style="height:${Math.max(4,Math.round(c/mx*78))}px" title="${days[i]}: ${c} check-ins" ></div>`).join('');

  document.getElementById('bar-lbs').innerHTML=days.map(d=>`<div class="bar-lb" >${
      d
    }

    </div>`).join('')
}

function renderMonthlyRevenueChart(){
  const months = [];
  // last 6 months (including current)
  for(let i=5;i>=0;i--){
    const r = qry(`SELECT strftime('%Y-%m', date('now','start of month','-${i} months')) as ym`)[0];
    months.push(r.ym);
  }

  const rows = qry(`
    SELECT strftime('%Y-%m', date) as ym, COALESCE(SUM(amount),0) as total
    FROM payments
    GROUP BY ym
  `);

  const map = {};
  rows.forEach(x => { map[x.ym] = x.total; });

  const totals = months.map(m => map[m] || 0);
  const mx = Math.max(...totals, 1);

  const chart = document.getElementById('rev-chart');
  const lbs = document.getElementById('rev-lbs');
  if(!chart || !lbs) return;

  chart.innerHTML = totals.map((v,i)=>{
    const h = Math.max(4, Math.round((v/mx)*78));
    return `<div class="bar" style="height:${h}px" title="${months[i]}: ${fm(v)}"></div>`;
  }).join('');

  lbs.innerHTML = months.map(m=>`<div class="bar-lb">${m.slice(5)}</div>`).join('');
}


function renderPlanBreakdown() {
  const data=qry(`SELECT p.name, COALESCE(SUM(pay.amount), 0) as total FROM plans p LEFT JOIN payments pay ON pay.plan=p.name AND date(pay.date)>=date('now', 'start of month') GROUP BY p.id ORDER BY total DESC`);
  const mx=Math.max(...data.map(d=>d.total), 1);

  document.getElementById('plan-breakdown').innerHTML=data.map(d=>`<div style="margin-bottom:10px" ><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px" ><span>${
      d.name
    }

    </span><span style="color:var(--success);font-weight:600" >${
      fm(d.total)
    }

    </span></div><div class="pb" ><div class="pf" style="width:${Math.round(d.total/mx*100)}%;background:var(--primary)" ></div></div></div>`).join('')
}

function renderRecentAct() {
  const r=[];

  qry("SELECT m.fname,m.lname,a.checkin_time FROM attendance a JOIN members m ON m.id=a.member_id ORDER BY a.checkin_time DESC LIMIT 3").forEach(x=>r.push({
      type:'checkin', name:`${
        x.fname
      }

      ${
        x.lname
      }

      `, detail:'Checked in', time:x.checkin_time
    }));

qry("SELECT m.fname,m.lname,p.amount,p.date FROM payments p JOIN members m ON m.id=p.member_id ORDER BY p.created_at DESC LIMIT 3").forEach(x=>r.push({
    type:'payment', name:`${
      x.fname
    }

    ${
      x.lname
    }

    `, detail:`Paid ${
      fm(x.amount)
    }

    `, time:x.date
  }));

qry("SELECT fname,lname,created_at FROM members ORDER BY created_at DESC LIMIT 2").forEach(x=>r.push({
    type:'join', name:`${
      x.fname
    }

    ${
      x.lname
    }

    `, detail:'Joined gym', time:x.created_at
  }));
r.sort((a, b)=>new Date(b.time)-new Date(a.time));

const ico= {
  checkin: '📋', payment:'💳', join:'🎉', expire:'⚠️'
}

;

document.getElementById('recent-act').innerHTML=r.slice(0, 6).map(x=>`<div class="act-item" ><div class="act-icon ${x.type}" >${
    ico[x.type]
  }

  </div><div class="act-info" ><div class="act-name" >${
    x.name
  }

  </div><div class="act-det" >${
    x.detail
  }

  </div></div><div class="act-time" >${
    fd(x.time)
  }

  </div></div>`).join('')||'<div class="empty"><div class="empty-ico">📭</div><p>No activity</p></div>'
}

function renderExpiringList() {
  const list=qry(`SELECT m.fname, m.lname, ms.end_date, p.name as pn FROM memberships ms JOIN members m ON m.id=ms.member_id JOIN plans p ON p.id=ms.plan_id WHERE ms.status='active' AND date(ms.end_date) BETWEEN date('now') AND date('now', '+7 days') ORDER BY ms.end_date LIMIT 5`);

  document.getElementById('expiring-list').innerHTML=list.map(r=> {
      const d=Math.ceil((new Date(r.end_date)-new Date())/86400000); return`<div class="act-item" ><div class="act-icon expire" >⚠️</div><div class="act-info" ><div class="act-name" >${
        r.fname
      }

      ${
        r.lname
      }

      </div><div class="act-det" >${
        r.pn
      }

      </div></div><span class="badge ${d<=2?'expired':'pending'}" >${
        d
      }

      d left</span></div>`
    }).join('')||'<div class="empty"><div class="empty-ico">✅</div><p>None expiring soon</p></div>'
}

function rMembers(s='', st='') {
  let sql=`SELECT m.*,
  ms.end_date,
  p.name as pn,
  au.username as uname,
  st.fname as tr_fname,
  st.lname as tr_lname
  FROM members m
  LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1)
  LEFT JOIN plans p ON p.id=ms.plan_id
  LEFT JOIN auth_users au ON au.member_id=m.id
  LEFT JOIN staff st ON st.id=m.trainer_id
  WHERE 1=1`;
  if(currentUser && currentUser.role==='user' && currentUser.member_id){
    sql += ` AND m.id=${currentUser.member_id}`;
  }
  // Trainer sees only allocated members
  if(currentUser && currentUser.role==='trainer' && currentUser.staff_id){
    sql += ` AND m.trainer_id=${currentUser.staff_id}`;
  }
  const pr=[];

  if(s) {
    sql+=` AND(m.fname LIKE? OR m.lname LIKE? OR m.email LIKE? OR m.phone LIKE? OR au.username LIKE?)`;
    pr.push(...Array(5).fill(`%${s}%`))
  }

  if(st) {
    sql+=` AND m.status=?`;
    pr.push(st)
  }

  sql+=' ORDER BY m.created_at DESC';
  const rows=qry(sql, pr);
  const isAdmin = currentUser && currentUser.role==='admin';

  document.getElementById('tbl-members').innerHTML=rows.length?rows.map(r=>`<tr>
    <td><div class="fc"><div class="mav">${ini(r.fname, r.lname)}</div><div>
      <div style="font-weight:600">${r.fname} ${r.lname}</div>
      <div style="font-size:11px;color:var(--text-muted)">${r.email||''}</div>
    </div></div></td>
    <td>${isAdmin && r.uname ? `<span style="font-family:monospace;font-size:12px;color:var(--info)">${r.uname}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    <td>${r.pn||'<span style="color:var(--text-muted)">—</span>'}</td>
    <td>${r.tr_fname ? `<div class="fc" style="gap:6px"><div class="mav" style="width:24px;height:24px;font-size:10px;background:linear-gradient(135deg,var(--info),#8b5cf6)">${ini(r.tr_fname,r.tr_lname)}</div><span style="font-size:12px">${r.tr_fname} ${r.tr_lname}</span></div>` : `<span style="color:var(--text-muted);font-size:12px">—</span>`}</td>
    <td>${r.phone||'—'}</td>
    <td>${fd(r.created_at)}</td>
    <td>${r.end_date?fd(r.end_date):'—'}</td>
    <td>${sbadge(r.status)}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn btn-sm btn-s" onclick="editMember(${r.id})">✏️</button>
      ${isAdmin?`<button class="btn btn-sm btn-s" onclick="openAssignMemberTrainer(${r.id},'${(r.fname+' '+r.lname).replace(/'/g,"\\'")}',${r.trainer_id||'null'})" title="Assign Trainer" style="color:var(--info)">🏋️</button>`:''}
      ${isAdmin?`<button class="btn btn-sm btn-d" onclick="delMember(${r.id})">🗑</button>`:''}
    </div></td>
  </tr>`).join(''):`<tr><td colspan="9"><div class="empty"><div class="empty-ico">👥</div><p>No members found</p></div></td></tr>`
}

function filterMembers() {
  rMembers(document.getElementById('srch-member').value, document.getElementById('flt-mstatus').value)
}

function addMember() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && false ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  if( !f('m-fn')|| !f('m-em'))return toast('Name and email required', 'error');
  if(f('m-dob')){
    const mDob = new Date(f('m-dob')), now = new Date();
    if(isNaN(mDob) || mDob >= now || mDob < new Date('1900-01-01'))
      return toast('Please enter a valid date of birth', 'error');
  }
  run(`INSERT INTO members(fname, lname, email, phone, dob, gender, address, emergency_contact, medical_notes, status)VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`, [f('m-fn'), f('m-ln'), f('m-em'), f('m-ph'), f('m-dob'), f('m-gen'), f('m-addr'), f('m-ec'), f('m-med')]);
  const pid=f('m-plan');

  if(pid) {
    const plan=qry('SELECT * FROM plans WHERE id=?', [pid])[0];
    const mid=qry('SELECT last_insert_rowid() as id')[0].id;
    const s=f('m-start')||td();
    const e=new Date(s);
    e.setDate(e.getDate()+plan.duration);

    run(`INSERT INTO memberships(member_id, plan_id, start_date, end_date, amount, status)VALUES(?, ?, ?, ?, ${
          plan.price
        }

        , 'active')`, [mid, pid, s, e.toISOString().split('T')[0]]);

    run(`INSERT INTO payments(member_id, amount, method, plan, date)VALUES(?, ${
          plan.price
        }

        , 'cash', '${plan.name}', '${s}')`, [mid])
  }

  closeM('mo-member');
  toast('Member added! ✅', 'success');
  rMembers();
  rMS();
  rPay();
  dash();
  populateSels()
}

function editMember(id) {
  const m=qry('SELECT * FROM members WHERE id=?', [id])[0];
  if( !m)return;
  document.getElementById('em-id').value=id;

  const set=(el, v)=> {
    const e=document.getElementById(el);
    if(e)e.value=v||''
  }

  ;
  set('em-fn', m.fname);
  set('em-ln', m.lname);
  set('em-em', m.email);
  set('em-ph', m.phone);
  set('em-gen', m.gender);
  set('em-addr', m.address);
  set('em-ec', m.emergency_contact);
  set('em-med', m.medical_notes);
  set('em-st', m.status);
  openM('mo-edit-member')
}

function saveMember() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && false ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  run(`UPDATE members SET fname=?, lname=?, email=?, phone=?, gender=?, address=?, emergency_contact=?, medical_notes=?, status=? WHERE id=?`, [f('em-fn'), f('em-ln'), f('em-em'), f('em-ph'), f('em-gen'), f('em-addr'), f('em-ec'), f('em-med'), f('em-st'), f('em-id')]);
  closeM('mo-edit-member');
  toast('Updated! ✅', 'success');
  rMembers();
  dash()
}

function delMember(id) {
  if( !confirm('Delete member and all their records? This will also remove their login account.'))return;
  ['DELETE FROM attendance WHERE member_id=?',
  'DELETE FROM payments WHERE member_id=?',
  'DELETE FROM memberships WHERE member_id=?',
  'DELETE FROM auth_users WHERE member_id=?',
  'DELETE FROM members WHERE id=?'].forEach(s=>run(s, [id]));
  toast('Member and login account deleted', 'info');
  rMembers();
  rMS();
  rPay();
  dash();
  populateSels()
}

function openAssignMemberTrainer(memberId, memberName, currentTrainerId) {
  if(!mustAdmin()){ denyToast('Admin only'); return; }
  document.getElementById('amt-member-id').value = memberId;
  document.getElementById('amt-member-name').textContent = '👤 ' + memberName;

  // Populate trainer dropdown with staff who are trainers
  const trainers = qry("SELECT id, fname, lname, schedule FROM staff WHERE role='Trainer' ORDER BY fname");
  const sel = document.getElementById('amt-trainer-sel');
  sel.innerHTML = '<option value="">— No Trainer (Unassign) —</option>' +
    trainers.map(t => `<option value="${t.id}" ${t.id == currentTrainerId ? 'selected' : ''}>${t.fname} ${t.lname}${t.schedule ? ' · ' + t.schedule : ''}</option>`).join('');

  openM('mo-assign-member-trainer');
}

function saveAssignMemberTrainer() {
  const memberId  = document.getElementById('amt-member-id').value;
  const trainerId = document.getElementById('amt-trainer-sel').value;
  if(!memberId) return;

  run('UPDATE members SET trainer_id=? WHERE id=?', [trainerId || null, memberId]);

  closeM('mo-assign-member-trainer');

  const trainerName = trainerId
    ? (qry('SELECT fname, lname FROM staff WHERE id=?', [trainerId])[0] || {})
    : null;
  const label = trainerName ? `${trainerName.fname} ${trainerName.lname}` : 'none';
  toast(`Trainer assigned: ${label} ✅`, 'success');

  rMembers();
}

function rMS(s='') {
  let sql=`SELECT ms.*,
  m.fname,
  m.lname,
  p.name as pn FROM memberships ms JOIN members m ON m.id=ms.member_id JOIN plans p ON p.id=ms.plan_id WHERE 1=1`;
  const pr=[];

  if(s) {
    sql+=` AND(m.fname LIKE? OR m.lname LIKE? OR p.name LIKE?)`;

    pr.push(`%${
        s
      }

      %`, `%${
        s
      }

      %`, `%${
        s
      }

      %`)
  }

  sql+=' ORDER BY ms.created_at DESC';
  const rows=qry(sql, pr);
  const isAdmin = currentUser && currentUser.role==='admin';

  document.getElementById('tbl-ms').innerHTML=rows.length?rows.map(r=>`<tr><td><div class="fc" ><div class="mav" >${
      ini(r.fname, r.lname)
    }

    </div>${
      r.fname
    }

    ${
      r.lname
    }

    </div></td><td>${
      r.pn
    }

    </td><td>${
      fd(r.start_date)
    }

    </td><td>${
      fd(r.end_date)
    }

    </td><td style="color:var(--success);font-weight:600" >${
      fm(r.amount)
    }

    </td><td>${
      sbadge(r.status)
    }

    </td><td><div style="display:flex;gap:6px">
      ${isAdmin?`<button class="btn btn-sm btn-s" onclick="editMS(${r.id})" title="Edit / Change Plan">✏️ Edit</button>`:''}
      <button class="btn btn-sm btn-d" onclick="delMS(${r.id})" >🗑</button>
    </div></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty"><div class="empty-ico">🎫</div><p>No memberships</p></div></td></tr>`
}

function editMS(id){
  if(!mustAdmin()){ denyToast('Admin only'); return; }
  const ms = qry('SELECT ms.*, m.fname, m.lname FROM memberships ms JOIN members m ON m.id=ms.member_id WHERE ms.id=?',[id])[0];
  if(!ms) return;
  populateSels();
  const el=n=>document.getElementById(n);
  el('ems-id').value       = ms.id;
  el('ems-mem-name').value = `${ms.fname} ${ms.lname}`;
  el('ems-plan').value     = ms.plan_id;
  el('ems-start').value    = ms.start_date;
  el('ems-end').value      = ms.end_date;
  el('ems-amt').value      = ms.amount;
  el('ems-st').value       = ms.status;
  el('ems-notes').value    = ms.notes||'';
  openM('mo-edit-ms');
}

function fillEditMsPlan(){
  const pid=document.getElementById('ems-plan').value;
  const plan=qry('SELECT * FROM plans WHERE id=?',[pid])[0];
  if(plan){
    const s=document.getElementById('ems-start').value||td();
    const e=new Date(s); e.setDate(e.getDate()+plan.duration);
    document.getElementById('ems-end').value=e.toISOString().split('T')[0];
    document.getElementById('ems-amt').value=plan.price;
  }
}

function saveMS(){
  const f=id=>document.getElementById(id).value;
  const id=f('ems-id');
  if(!id) return;
  const emsAmt = parseFloat(f('ems-amt'));
  if (!emsAmt || emsAmt <= 0 || !Number.isFinite(emsAmt)) return toast('Amount must be a positive number', 'error');
  run(`UPDATE memberships SET plan_id=?,start_date=?,end_date=?,amount=?,status=?,notes=? WHERE id=?`,
    [f('ems-plan'),f('ems-start'),f('ems-end'),f('ems-amt'),f('ems-st'),f('ems-notes'),id]);
  closeM('mo-edit-ms');
  toast('Membership updated ✅','success');
  rMS(); rMembers(); dash();
}

function filterMS() {
  rMS(document.getElementById('srch-ms').value)
}

function addMembership() {
  const f=id=>document.getElementById(id).value;
  if( !f('ms-mem')|| !f('ms-plan'))return toast('Member and plan required', 'error');
  const msAmt = parseFloat(f('ms-amt'));
  if (!msAmt || msAmt <= 0 || !Number.isFinite(msAmt)) return toast('Amount must be a positive number', 'error');
  run(`INSERT INTO memberships(member_id, plan_id, start_date, end_date, amount, status, notes)VALUES(?, ?, ?, ?, ?, ?, ?)`, [f('ms-mem'), f('ms-plan'), f('ms-start'), f('ms-end'), f('ms-amt'), f('ms-st'), f('ms-notes')]);
  closeM('mo-membership');
  toast('Created!', 'success');
  rMS();
  dash()
}

function delMS(id) {
  if( !confirm('Delete?'))return;
  run('DELETE FROM memberships WHERE id=?', [id]);
  toast('Deleted', 'info');
  rMS();
  dash()
}

function rPay(s='', m='') {
  let sql=`SELECT pay.*,
  m.fname,
  m.lname FROM payments pay JOIN members m ON m.id=pay.member_id WHERE 1=1 ` + (currentUser && currentUser.role==='user' && currentUser.member_id ? ` AND pay.member_id=${currentUser.member_id} ` : ``) + ` `;
  const pr=[];

  if(s) {
    sql+=` AND(m.fname LIKE? OR m.lname LIKE? OR pay.plan LIKE?)`;

    pr.push(`%${
        s
      }

      %`, `%${
        s
      }

      %`, `%${
        s
      }

      %`)
  }

  if(m) {
    sql+=` AND pay.method=?`;
    pr.push(m)
  }

  sql+=' ORDER BY pay.created_at DESC';
  const rows=qry(sql, pr);

  document.getElementById('tbl-pay').innerHTML=rows.length?rows.map(r=>`<tr><td><div class="fc" ><div class="mav" >${
      ini(r.fname, r.lname)
    }

    </div>${
      r.fname
    }

    ${
      r.lname
    }

    </div></td><td style="color:var(--success);font-weight:700;font-size:15px" >${
      fm(r.amount)
    }

    </td><td>${
      sbadge(r.method)
    }

    </td><td>${
      r.plan||'—'
    }

    </td><td>${
      fd(r.date)
    }

    </td><td style="color:var(--text-muted)" >${
      r.note||'—'
    }

    </td></tr>`).join(''):`<tr><td colspan="6"><div class="empty"><div class="empty-ico">💳</div><p>No payments</p></div></td></tr>`
}

function filterPay() {
  rPay(document.getElementById('srch-pay').value, document.getElementById('flt-method').value)
}

function addPayment() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && true ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  if( !f('p-mem')|| !f('p-amt'))return toast('Member and amount required', 'error');
  run(`INSERT INTO payments(member_id, amount, method, plan, date, note)VALUES(?, ?, ?, ?, ?, ?)`, [f('p-mem'), f('p-amt'), f('p-method'), f('p-plan'), f('p-date'), f('p-note')]);
  closeM('mo-payment');
  toast('Payment recorded! 💰', 'success');
  rPay();
  dash()
}

function addUserPayment() {
  if(!currentUser || currentUser.role !== 'user' || !currentUser.member_id) return toast('Not authorised', 'error');
  const f = id => document.getElementById(id).value.trim();
  const amt = f('up-amt');
  const cardNum = f('up-card-num').replace(/\s/g,'');
  const cardName = f('up-card-name');
  const cardExp = f('up-card-exp');
  const cardCvv = f('up-card-cvv');
  const plan = f('up-plan');
  const date = f('up-date');
  if(!amt || parseFloat(amt) <= 0) return toast('Please enter a valid amount', 'error');
  if(!cardName) return toast('Cardholder name is required', 'error');
  if(cardNum.length < 13 || cardNum.length > 19 || !/^\d+$/.test(cardNum)) return toast('Invalid card number', 'error');
  if(!/^\d{2}\/\d{2}$/.test(cardExp)) return toast('Invalid expiry format (MM/YY)', 'error');
  if(cardCvv.length < 3) return toast('Invalid CVV', 'error');
  run(`INSERT INTO payments(member_id, amount, method, plan, date, note)VALUES(?, ?, ?, ?, ?, ?)`,
    [currentUser.member_id, parseFloat(amt), 'credit_card', plan || 'Credit Card Payment', date || td(), `Card: •••• ${cardNum.slice(-4)}`]);
  closeM('mo-user-payment');
  document.getElementById('up-card-num').value = '';
  document.getElementById('up-card-cvv').value = '';
  toast('Payment submitted! 💳', 'success');
  rPay();
  dash();
}

function fmtCard(input) {
  let v = input.value.replace(/\D/g,'').slice(0,16);
  input.value = v.match(/.{1,4}/g)?.join(' ') || v;
}

function fmtExp(input) {
  let v = input.value.replace(/\D/g,'').slice(0,4);
  if(v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  input.value = v;
}

function rAtt(s='') {
  let sql=`SELECT a.*,
  m.fname,
  m.lname FROM attendance a JOIN members m ON m.id=a.member_id WHERE 1=1 ` + (currentUser && currentUser.role==='user' && currentUser.member_id ? ` AND a.member_id=${currentUser.member_id} ` : ``) + (currentUser && currentUser.role==='trainer' && currentUser.staff_id ? ` AND m.trainer_id=${currentUser.staff_id} ` : ``) + ` `;
  const pr=[];

  if(s) {
    sql+=` AND(m.fname LIKE? OR m.lname LIKE?)`;

    pr.push(`%${
        s
      }

      %`, `%${
        s
      }

      %`)
  }

  sql+=' ORDER BY a.checkin_time DESC';
  const rows=qry(sql, pr);

  document.getElementById('tbl-att').innerHTML=rows.length?rows.map(r=> {
      let dur='—'; if(r.checkout_time&&r.checkout_time !=='') {
        const m=Math.round((new Date(r.checkout_time)-new Date(r.checkin_time))/60000); dur=`${
          Math.floor(m/60)
        }

        h ${
          m%60
        }

        m`
      }

      return`<tr><td><div class="fc" ><div class="mav" >${
        ini(r.fname, r.lname)
      }

      </div>${
        r.fname
      }

      ${
        r.lname
      }

      </div></td><td>${
        new Date(r.checkin_time).toLocaleString()
      }

      </td><td>${
        r.checkout_time&&r.checkout_time !=='' ?new Date(r.checkout_time).toLocaleString():'<span class="badge active">Here now</span>'
      }

      </td><td>${
        dur
      }

      </td></tr>`
    }).join(''):`<tr><td colspan="4"><div class="empty"><div class="empty-ico">📋</div><p>No attendance</p></div></td></tr>`
}

function filterAtt() {
  rAtt(document.getElementById('srch-att').value)
}

function checkIn() {
  const f=id=>document.getElementById(id).value;
  if( !f('ci-mem'))return toast('Select a member', 'error');
  run(`INSERT INTO attendance(member_id, checkin_time, checkout_time)VALUES(?, ?, ?)`, [f('ci-mem'), f('ci-in')||ndt(), f('ci-out')||null]);
  closeM('mo-checkin');
  toast('Checked in!', 'success');
  rAtt();
  dash()
}

function rClasses() {
  const role = currentUser ? currentUser.role : 'admin';
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  // ── USER VIEW: show only their trainer's classes + trainer info card ──
  if (role === 'user') {
    const adminView = document.getElementById('cls-admin-view');
    const trainerView = document.getElementById('cls-trainer-view');
    const userView = document.getElementById('cls-user-view');
    if (adminView)   adminView.style.display   = 'none';
    if (trainerView) trainerView.style.display = 'none';
    if (userView)    userView.style.display    = '';

    let trainer = null;
    let assignedClasses = [];
    if (currentUser.member_id) {
      const member = qry('SELECT trainer_id FROM members WHERE id=?', [currentUser.member_id])[0];
      if (member && member.trainer_id) {
        trainer = qry('SELECT * FROM staff WHERE id=?', [member.trainer_id])[0];
        assignedClasses = qry(
          `SELECT * FROM classes WHERE trainer_id=? ORDER BY CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, time`,
          [member.trainer_id]
        );
      }
    }

    const trainerCard = document.getElementById('user-trainer-card');
    if (trainerCard) {
      if (trainer) {
        const initials = ((trainer.fname||'?')[0] + (trainer.lname||'?')[0]).toUpperCase();
        trainerCard.innerHTML = `
          <div style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--surface2);border-radius:12px;border:1px solid var(--border)">
            <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#f43f5e);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0">${initials}</div>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:700">${trainer.fname} ${trainer.lname}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">🏋️ ${trainer.role||'Trainer'}</div>
              ${trainer.email ? `<div style="font-size:12px;color:var(--text-muted)">✉️ ${trainer.email}</div>` : ''}
              ${trainer.phone ? `<div style="font-size:12px;color:var(--text-muted)">📞 ${trainer.phone}</div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Classes</div>
              <div style="font-size:24px;font-weight:800;color:var(--primary)">${assignedClasses.length}</div>
            </div>
          </div>`;
      } else {
        trainerCard.innerHTML = '<div class="empty"><div class="empty-ico">👤</div><p>No trainer assigned yet. Contact the gym staff.</p></div>';
      }
    }

    const schedEl = document.getElementById('sched-grid-user');
    if (schedEl) {
      schedEl.innerHTML = days.map(d => {
        const dc = assignedClasses.filter(c => c.day === d);
        return `<div class="sched-day"><div class="sched-day-label">${d.slice(0,3)}</div>${
          dc.map(c => `<div class="cls-block"><div class="cls-name">${c.name}</div><div class="cls-det">⏰ ${c.time} · ${c.duration} min</div><div class="cls-det">👤 ${c.instructor}</div></div>`).join('') ||
          '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding-top:6px">—</div>'
        }</div>`;
      }).join('');
    }

    const tblEl = document.getElementById('tbl-cls-user');
    if (tblEl) {
      tblEl.innerHTML = assignedClasses.length
        ? assignedClasses.map(c => `<tr>
            <td style="font-weight:600">${c.name}</td>
            <td>${c.instructor}</td>
            <td>${c.day}</td>
            <td>${c.time}</td>
            <td>${c.duration} min</td>
            <td>${c.capacity}</td>
          </tr>`).join('')
        : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px">No classes scheduled yet</td></tr>';
    }
    return;
  }

  // ── TRAINER / ADMIN VIEW ──
  const adminView2   = document.getElementById('cls-admin-view');
  const trainerView2 = document.getElementById('cls-trainer-view');
  const userView2    = document.getElementById('cls-user-view');
  if (userView2) userView2.style.display = 'none';

  if (role === 'trainer') {
    if (adminView2)   adminView2.style.display   = 'none';
    if (trainerView2) trainerView2.style.display = '';
  } else {
    if (adminView2)   adminView2.style.display   = '';
    if (trainerView2) trainerView2.style.display = 'none';
  }

  const cls = qry(`SELECT * FROM classes ${(currentUser && role==='trainer' && currentUser.staff_id) ? `WHERE trainer_id=${currentUser.staff_id} ` : ``}ORDER BY CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, time`);

  const schedGridId = (role === 'trainer') ? 'sched-grid-trainer' : 'sched-grid';
  const schedEl2 = document.getElementById(schedGridId);
  if (schedEl2) {
    const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    schedEl2.innerHTML = days.map(d => {
      const dc = cls.filter(c => c.day === d);
      const isToday = d === todayName;
      return `<div class="sched-day${isToday?' today':''}">
        <div class="sched-day-label">${d.slice(0,3)}</div>
        <div class="sched-day-body">${
          dc.map(c => {
            const pct  = parseInt(c.fill_pct || 0);
            const conf = parseInt(c.confirmed || 0);
            const wait = parseInt(c.waitlisted || 0);
            const barClr = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 60 ? '#eab308' : '#22c55e';
            const statusTag = (pct >= 100)
              ? `<div style="font-size:9px;font-weight:800;color:#ef4444;margin-top:3px">🔴 FULL${wait>0?` +${wait} wait`:''}</div>`
              : (pct >= 80 || wait > 0)
                ? `<div style="font-size:9px;font-weight:800;color:#f97316;margin-top:3px">⚠️ ${pct}%${wait>0?` +${wait} wait`:''}</div>`
                : '';
            const fillBar = `<div style="margin-top:5px"><div style="height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(pct,100)}%;background:${barClr};border-radius:2px"></div></div><div style="font-size:9px;color:var(--text-muted);margin-top:1px;font-family:monospace">${conf}/${c.capacity}</div></div>`;
            const delBtn = role==='admin' ? `<button class="cls-del" onclick="delClass(${c.id})">🗑</button>` : '';
            return `<div class="cls-block">${delBtn}
              <div class="cls-time">${c.time}</div>
              <div class="cls-name">${c.name}</div>
              <div class="cls-det">👤 ${c.trainer_name||c.instructor||'—'}</div>
              <div class="cls-det">⏱ ${c.duration} min</div>
              ${fillBar}${statusTag}
            </div>`;
          }).join('') || '<div class="sched-empty">—</div>'
        }</div>
      </div>`;
    }).join('');
  }

  // Admin table — uses tbl-cls-admin (matches index.html)
  const tblCls = document.getElementById('tbl-cls-admin') || document.getElementById('tbl-cls');
  if (tblCls) {
    tblCls.innerHTML = cls.map(c => {
      const pct  = parseInt(c.fill_pct || 0);
      const conf = parseInt(c.confirmed || 0);
      const wait = parseInt(c.waitlisted || 0);
      const barClr = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 60 ? '#eab308' : '#22c55e';
      const badge = pct >= 100
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(239,68,68,.15);color:#ef4444">FULL${wait>0?` +${wait}`:''}</span>`
        : pct >= 80
          ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(249,115,22,.15);color:#f97316">${pct}%${wait>0?` +${wait} wait`:''}</span>`
          : `<span style="font-size:10px;color:var(--text-muted)">${conf}/${c.capacity}</span>`;
      const fillBar = `<div style="margin-top:3px;height:4px;width:80px;background:var(--border);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(pct,100)}%;background:${barClr}"></div></div>`;
      return `<tr>
        <td style="font-weight:600">${c.name}</td>
        <td>${c.day}</td>
        <td>${c.time}</td>
        <td>${c.duration} min</td>
        <td>${badge}${fillBar}</td>
        <td>${c.trainer_name||c.instructor||'<span style="color:#ef4444;font-size:11px">⚠️ Unassigned</span>'}</td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-sm btn-s" onclick="editClass(${c.id})" title="Edit">✏️</button>
          <button class="btn btn-sm btn-d" onclick="delClass(${c.id})" title="Delete">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Update overflow nav badge after rendering
  updateOverflowBadge(cls);
}

function addClass() {
  const f=id=>document.getElementById(id).value;
  if( !f('cl-name')|| !f('cl-inst'))return toast('Name and instructor required', 'error');
  const clDur = parseInt(f('cl-dur')) || 0;
  const clCap = parseInt(f('cl-cap')) || 0;
  if(clDur <= 0) return toast('Duration must be a positive number of minutes', 'error');
  if(clCap <= 0) return toast('Capacity must be at least 1', 'error');
  run(`INSERT INTO classes(name, instructor, day, time, duration, capacity)VALUES(?, ?, ?, ?, ?, ?)`, [f('cl-name'), f('cl-inst'), f('cl-day'), f('cl-time'), clDur, clCap]);
  closeM('mo-class');
  toast('Class added!', 'success');
  rClasses()
}

function editClass(id) {
  const cls = qry('SELECT * FROM classes WHERE id=?', [id]);
  if (!cls || !cls[0]) return;
  const c = cls[0];
  document.getElementById('ec-id').value  = c.id;
  document.getElementById('ec-name').value = c.name;
  document.getElementById('ec-day').value  = c.day;
  document.getElementById('ec-time').value = c.time;
  document.getElementById('ec-dur').value  = c.duration;
  document.getElementById('ec-cap').value  = c.capacity;
  openM('mo-edit-class');
}

function saveClass() {
  const f = id => document.getElementById(id).value;
  const id = parseInt(f('ec-id'));
  if (!id) return;
  const ecDur = parseInt(f('ec-dur')) || 0;
  const ecCap = parseInt(f('ec-cap')) || 0;
  if(ecDur <= 0) return toast('Duration must be a positive number of minutes', 'error');
  if(ecCap <= 0) return toast('Capacity must be at least 1', 'error');
  run('UPDATE classes SET name=?,day=?,time=?,duration=?,capacity=? WHERE id=?',
      [f('ec-name'), f('ec-day'), f('ec-time'), ecDur, ecCap, id]);
  closeM('mo-edit-class');
  toast('Class updated!', 'success');
  rClasses();
}

function delClass(id) {
  if( !confirm('Delete?'))return;
  run('DELETE FROM classes WHERE id=?', [id]);
  toast('Deleted', 'info');
  rClasses()
}

// ── Overflow Badge ─────────────────────────────────────────────
function updateOverflowBadge(cls) {
  const badge = document.getElementById('nav-cls-overflow-badge');
  if (!badge) return;
  const overflowCount = (cls || []).filter(c => parseInt(c.fill_pct || 0) >= 80).length;
  if (overflowCount > 0) {
    badge.textContent = overflowCount;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

async function checkOverflowOnLoad() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const cls = await qry("SELECT * FROM classes ORDER BY id");
    updateOverflowBadge(cls);
  } catch(e) {}
}

function rEquip() {
  const rows=qry('SELECT * FROM equipment ORDER BY category');

  document.getElementById('eq-grid').innerHTML=rows.length?rows.map(r=>`<div class="eq-card" ><div class="eq-hdr" ><div class="eq-name" >${
      r.name
    }

    </div><span class="badge ${r.condition_status==='Excellent'?'active':r.condition_status==='Needs Repair'?'expired':r.condition_status==='Fair'?'pending':'paused'}" >${
      r.condition_status
    }

    </span></div><div class="eq-det" >📦 ${
      r.category
    }

    | Qty: ${
      r.quantity
    }

    </div><div class="eq-det" >🔧 Maint: ${
      fd(r.next_maintenance)
    }

    </div>${
      r.notes?`<div class="eq-det" style="font-style:italic;font-size:11px" >${
        r.notes
      }

      </div>`:''
    }

    <button class="btn btn-sm btn-d" onclick="delEquip(${r.id})" style="width:100%;margin-top:6px" >🗑 Remove</button></div>`).join(''):'<div class="empty"><div class="empty-ico">🔧</div><p>No equipment</p></div>'
}

function addEquipment() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && false ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  if( !f('eq-name'))return toast('Name required', 'error');
  const eqQty = parseInt(f('eq-qty')) || 0;
  if(eqQty < 1) return toast('Quantity must be at least 1', 'error');
  run(`INSERT INTO equipment(name, category, quantity, condition_status, purchase_date, next_maintenance, notes)VALUES(?, ?, ?, ?, ?, ?, ?)`, [f('eq-name'), f('eq-cat'), eqQty, f('eq-cond'), f('eq-date'), f('eq-maint'), f('eq-notes')]);
  closeM('mo-equipment');
  toast('Added!', 'success');
  rEquip()
}

function delEquip(id) {
  if( !confirm('Delete?'))return;
  run('DELETE FROM equipment WHERE id=?', [id]);
  toast('Deleted', 'info');
  rEquip()
}

function rStaff() {
  const rows=qry('SELECT * FROM staff ORDER BY role,fname');

  document.getElementById('tbl-staff').innerHTML=rows.length?rows.map(r=>`<tr><td><div class="fc" ><div class="mav" style="background:linear-gradient(135deg,var(--info),#8b5cf6)" >${
      ini(r.fname, r.lname)
    }

    </div><div><div style="font-weight:600" >${
      r.fname
    }

    ${
      r.lname
    }

    </div><div style="font-size:11px;color:var(--text-muted)" >${
      r.schedule||''
    }

    </div></div></div></td><td><span class="badge ${r.role==='Manager'?'active':r.role==='Trainer'?'pending':'paused'}" >${
      r.role
    }

    </span></td><td>${
      r.email
    }

    </td><td>${
      r.phone||'—'
    }

    </td><td>${
      fd(r.hire_date)
    }

    </td><td style="color:var(--success);font-weight:600" >${
      r.salary?fm(r.salary)+'/mo':'—'
    }

    </td><td style="white-space:nowrap"><button class="btn btn-sm btn-s" onclick="openEditStaff(${r.id})" style="margin-right:4px">✏️</button><button class="btn btn-sm btn-d" onclick="delStaff(${r.id})" >🗑</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty"><div class="empty-ico">👤</div><p>No staff</p></div></td></tr>`
}

function openEditStaff(id) {
  const r = qry('SELECT * FROM staff WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('es-id').value   = r.id;
  document.getElementById('es-fn').value   = r.fname  || '';
  document.getElementById('es-ln').value   = r.lname  || '';
  document.getElementById('es-em').value   = r.email  || '';
  document.getElementById('es-ph').value   = r.phone  || '';
  document.getElementById('es-hire').value = r.hire_date || '';
  document.getElementById('es-sal').value  = r.salary || '';
  document.getElementById('es-sched').value= r.schedule || '';
  const roleEl = document.getElementById('es-role');
  if (roleEl) {
    for (let i = 0; i < roleEl.options.length; i++) {
      if (roleEl.options[i].value === r.role) { roleEl.selectedIndex = i; break; }
    }
  }
  // Load existing username if any
  const authRow = qry('SELECT username FROM auth_users WHERE staff_id=?', [id])[0];
  const unameEl = document.getElementById('es-uname');
  const unameNote = document.getElementById('es-uname-note');
  if (unameEl) unameEl.value = authRow ? authRow.username : '';
  if (unameNote) unameNote.textContent = authRow ? 'Current login: ' + authRow.username : 'No login account';
  document.getElementById('es-pw').value = '';
  openM('mo-edit-staff');
}

function saveStaff() {
  const id    = document.getElementById('es-id').value;
  const fname = document.getElementById('es-fn').value.trim();
  const lname = document.getElementById('es-ln').value.trim();
  const email = document.getElementById('es-em').value.trim();
  const phone = document.getElementById('es-ph').value.trim();
  const role  = document.getElementById('es-role').value;
  const hire  = document.getElementById('es-hire').value;
  const sal   = parseFloat(document.getElementById('es-sal').value) || 0;
  const sched = document.getElementById('es-sched').value.trim();
  const uname = document.getElementById('es-uname').value.trim();
  const pw    = document.getElementById('es-pw').value;

  if (!fname || !email) return toast('Name and email required', 'error');
  if (sal < 0) return toast('Salary cannot be negative', 'error');

  run('UPDATE staff SET fname=?,lname=?,email=?,phone=?,role=?,hire_date=?,salary=?,schedule=? WHERE id=?',
      [fname, lname, email, phone, role, hire, sal, sched, id]);

  // Handle login account update
  if (uname) {
    const existing = qry('SELECT id FROM auth_users WHERE staff_id=?', [id])[0];
    if (existing) {
      if (pw) {
        run('UPDATE auth_users SET username=?,password=? WHERE staff_id=?', [uname, pw, id]);
      } else {
        run('UPDATE auth_users SET username=? WHERE staff_id=?', [uname, id]);
      }
    } else if (pw) {
      run('INSERT INTO auth_users(username,password,role,staff_id) VALUES(?,?,?,?)',
          [uname, pw, role === 'Trainer' ? 'trainer' : 'admin', id]);
    }
  }

  closeM('mo-edit-staff');
  toast('Staff updated!', 'success');
  rStaff();
}

function addStaff() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && false ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  if( !f('sf-fn')|| !f('sf-em'))return toast('Name and email required', 'error');
  const sfSal = parseFloat(f('sf-sal')) || 0;
  if (sfSal < 0) return toast('Salary cannot be negative', 'error');
  run(`INSERT INTO staff(fname, lname, email, phone, role, hire_date, salary, schedule)VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, [f('sf-fn'), f('sf-ln'), f('sf-em'), f('sf-ph'), f('sf-role'), f('sf-hire'), sfSal, f('sf-sched')]);
  closeM('mo-staff');
  toast('Staff added!', 'success');
  rStaff()
}

function delStaff(id) {
  if( !confirm('Remove?'))return;
  run('DELETE FROM staff WHERE id=?', [id]);
  toast('Removed', 'info');
  rStaff()
}

function rPlans() {
  const plans=qry('SELECT * FROM plans ORDER BY price');

  const cc= {
    Basic: 'var(--info)', Standard:'var(--primary)', Premium:'var(--success)', VIP:'var(--warning)'
  }

  ;

  document.getElementById('plans-grid').innerHTML=plans.map(p=>`<div class="eq-card" style="border-top:3px solid ${cc[p.category]||'var(--primary)'}" ><div class="eq-hdr" ><div class="eq-name" >${
      p.name
    }

    </div><span class="badge ${p.category==='VIP'?'pending':p.category==='Premium'?'active':'paused'}" >${
      p.category
    }

    </span></div><div style="font-size:24px;font-weight:800;color:var(--success)" >${
      fm(p.price)
    }

    <span style="font-size:12px;color:var(--text-muted);font-weight:400" > / ${
      p.duration
    }

    days</span></div>${
      p.features?`<div>${
        p.features.split(',').map(f=>`<div style="font-size:12px;color:var(--text-muted)" >✓ ${
            f.trim()
          }

          </div>`).join('')
      }

      </div>`:''
    }

    <div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-sm btn-s" onclick="openEditPlan(${p.id})" style="flex:1">✏️ Edit</button><button class="btn btn-sm btn-d" onclick="delPlan(${p.id})" style="flex:1">🗑 Delete</button></div></div>`).join('')||'<div class="empty"><div class="empty-ico">📦</div><p>No plans</p></div>'
}

function addPlan() {
  if(currentRole()==='trainer' && !RBAC.trainer.can.payments && false ){ denyToast('Trainers cannot manage payments.'); return; }
  const f=id=>document.getElementById(id).value;
  if( !f('pl-name')|| !f('pl-price'))return toast('Name and price required', 'error');
  run(`INSERT INTO plans(name, duration, price, category, features, description)VALUES(?, ?, ?, ?, ?, ?)`, [f('pl-name'), parseInt(f('pl-dur'))||30, parseFloat(f('pl-price')), f('pl-cat'), f('pl-feat'), f('pl-desc')]);
  closeM('mo-plan');
  toast('Plan added!', 'success');
  rPlans();
  populateSels()
}

function delPlan(id) {
  if(qry('SELECT COUNT(*) as c FROM memberships WHERE plan_id=?', [id])[0].c>0)return toast('Cannot delete plan with active memberships', 'error');
  if( !confirm('Delete plan?'))return;
  run('DELETE FROM plans WHERE id=?', [id]);
  toast('Deleted', 'info');
  rPlans();
  populateSels()
}

function openEditPlan(id) {
  const p = qry('SELECT * FROM plans WHERE id=?', [id])[0];
  if (!p) return toast('Plan not found', 'error');
  document.getElementById('epl-id').value    = p.id;
  document.getElementById('epl-name').value  = p.name    || '';
  document.getElementById('epl-dur').value   = p.duration || 30;
  document.getElementById('epl-price').value = p.price   || '';
  document.getElementById('epl-cat').value   = p.category || 'Basic';
  document.getElementById('epl-feat').value  = p.features || '';
  document.getElementById('epl-desc').value  = p.description || '';
  openM('mo-edit-plan');
}

function saveEditPlan() {
  const f  = id => document.getElementById(id).value;
  const id = parseInt(f('epl-id'));
  if (!id)              return toast('No plan selected', 'error');
  if (!f('epl-name') || !f('epl-price')) return toast('Name and price are required', 'error');
  run(
    `UPDATE plans SET name=?, duration=?, price=?, category=?, features=?, description=? WHERE id=?`,
    [f('epl-name'), parseInt(f('epl-dur'))||30, parseFloat(f('epl-price')), f('epl-cat'), f('epl-feat'), f('epl-desc'), id]
  );
  closeM('mo-edit-plan');
  toast('Plan updated!', 'success');
  rPlans();
  populateSels();
}

// Startup is handled by api-client.js (MySQL mode). initDB_sqlite() is the offline fallback.

// Apply RBAC after initial render
try{applyRBAC();}catch(e){}