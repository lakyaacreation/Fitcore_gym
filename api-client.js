// ============================================================
//  FitCore — MySQL API Client  (api-client.js)
//  Loads after app.js. Every function here overwrites the
//  SQLite version from app.js immediately at parse time.
// ============================================================
const API = 'http://localhost/fitcore/api.php';

// ── Session ───────────────────────────────────────────────────
function saveSession(u) {
  try { localStorage.setItem('fitcore_session', JSON.stringify(u || window.currentUser)); } catch(e) {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem('fitcore_session')); } catch(e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem('fitcore_session'); } catch(e) {}
}

// ── Trainer Schedule Helpers ──────────────────────────────────
// Supports TWO formats in staff.schedule column:
//   NEW: "Monday,Tuesday,Wednesday|09:00|15:00"  (full days + shift times)
//   OLD: "Mon-Fri", "Mon-Sat", "Tue-Sat", "Mon-Sun"  (day range only, no times)
// Old format is read automatically — admin just needs to add shift times via ⚙️ Set.

var _DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
var _DAY_ABBR  = {
  mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday',
  fri:'Friday', sat:'Saturday', sun:'Sunday',
  // full names too (lowercase)
  monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday',
  friday:'Friday', saturday:'Saturday', sunday:'Sunday'
};

function _expandDayRange(seg) {
  seg = (seg || '').trim().toLowerCase();
  var dash = seg.indexOf('-');
  if (dash !== -1) {
    var from = _DAY_ABBR[seg.slice(0, dash).trim()];
    var to   = _DAY_ABBR[seg.slice(dash + 1).trim()];
    if (from && to) {
      var si = _DAY_ORDER.indexOf(from);
      var ei = _DAY_ORDER.indexOf(to);
      if (si !== -1 && ei !== -1 && ei >= si) return _DAY_ORDER.slice(si, ei + 1);
    }
  }
  // Single abbreviation or full name
  var d = _DAY_ABBR[seg];
  return d ? [d] : [];
}

function parseSchedule(schedStr) {
  if (!schedStr || !schedStr.trim()) return null;

  // ── NEW structured format: "Monday,Wednesday|09:00|15:00" ──
  if (schedStr.indexOf('|') !== -1) {
    var parts = schedStr.split('|');
    var days  = parts[0].split(',').map(function(d){ return d.trim(); }).filter(Boolean);
    return { days: days, start: parts[1] || '09:00', end: parts[2] || '17:00', hasTime: true };
  }

  // ── OLD format: "Mon-Fri", "Mon-Sat", "Tue-Sat", "Mon-Sun" ──
  var segments = schedStr.split(',');
  var days = [];
  segments.forEach(function(seg) {
    _expandDayRange(seg).forEach(function(d) {
      if (days.indexOf(d) === -1) days.push(d);
    });
  });
  if (days.length) {
    days.sort(function(a,b){ return _DAY_ORDER.indexOf(a) - _DAY_ORDER.indexOf(b); });
    // hasTime:false means shift hours are not set yet — UI will prompt admin to add them
    return { days: days, start: null, end: null, hasTime: false };
  }
  return null;
}

function timeToMins(t) {
  if (!t) return 0;
  var p = t.split(':');
  return parseInt(p[0]||0) * 60 + parseInt(p[1]||0);
}

// Returns: 'available' | 'wrong-time' | 'wrong-day' | 'no-time' | 'unset'
function trainerAvailability(schedStr, day, classTime, classDurMin) {
  var sched = parseSchedule(schedStr);
  if (!sched) return 'unset';                          // nothing stored at all
  if (sched.days.indexOf(day) === -1) return 'wrong-day'; // works, but not this day
  if (!sched.hasTime) return 'no-time';                // day matches but no hours set yet
  var cStart = timeToMins(classTime);
  var cEnd   = cStart + (parseInt(classDurMin) || 60);
  var sStart = timeToMins(sched.start);
  var sEnd   = timeToMins(sched.end);
  if (cStart < sStart || cEnd > sEnd) return 'wrong-time';
  return 'available';
}

// ── Core fetch — returns parsed JSON or throws ────────────────
async function apiFetch(qs, body) {
  var url  = API + '?' + new URLSearchParams(qs).toString();
  var meth = body !== undefined && body !== null ? 'POST' : 'GET';
  var opts = { method: meth, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);

  var res;
  try { res = await fetch(url, opts); }
  catch (e) { throw new Error('Cannot reach Apache. Is XAMPP running? ' + e.message); }

  var text = await res.text();
  var data;
  try { data = JSON.parse(text); }
  catch (e) {
    var snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error('PHP error: ' + snippet);
  }
  if (!res.ok) throw new Error((data && data.error) ? data.error : 'HTTP ' + res.status);
  return data;
}

// ── qry() — async SELECT proxy ────────────────────────────────
async function qry(sql, params) {
  if (!params) params = [];
  try {
    var d = await apiFetch({ action: 'sql_qry' }, { sql: sql, params: params });
    return d.rows || [];
  } catch(e) { console.error('[qry]', e.message, sql); return []; }
}

// ── run() — async INSERT/UPDATE/DELETE proxy ──────────────────
async function run(sql, params) {
  if (!params) params = [];
  var role = (window.currentUser && window.currentUser.role) ? window.currentUser.role : '';
  try { return await apiFetch({ action: 'sql_run' }, { sql: sql, params: params, role: role }); }
  catch(e) { console.error('[run]', e.message, sql); return { success: false }; }
}

// ── Tiny helpers ──────────────────────────────────────────────
function _td()  { return new Date().toISOString().split('T')[0]; }
function _ndt() { return new Date().toISOString().slice(0, 16); }
function _fm(n) { return 'Rs. ' + parseFloat(n || 0).toLocaleString('en-LK', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function _fd(d) {
  try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
  catch(e) { return d || '-'; }
}
function _ini(f, l) { return ((f||'?')[0] + ((l||'?')[0])).toUpperCase(); }
function _sbadge(s) { return '<span class="badge ' + (s||'pending') + '">' + (s||'?') + '</span>'; }
function _gel(id)   { return document.getElementById(id); }
function _gv(id)    { var e = _gel(id); return e ? e.value : ''; }

// ── Show/hide app shell ───────────────────────────────────────
window._showApp = function _showApp(u) {
  var ag = _gel('auth-gate'); if (ag) ag.style.display = 'none';
  var bl = _gel('btn-logout'); if (bl) bl.style.display = '';
  var as = _gel('app-shell'); if (as) as.style.display = '';
  var av = _gel('avatar');
  if (av) {
    if (u.member_id) {
      // Always fetch fresh from DB — avatar_data can be large base64, unreliable in localStorage
      qry('SELECT fname, lname, avatar_type, avatar_data FROM members WHERE id=?', [u.member_id]).then(function(rows) {
        if (rows && rows[0]) {
          var m = rows[0];
          u.fname = m.fname; u.lname = m.lname;
          window.currentUser = u; saveSession(u);
          _applyTopbarAvatar(m);
        }
      });
      // Show initials immediately while fetch is in-flight
      if (u.fname || u.lname) av.textContent = _ini(u.fname, u.lname);
    } else if (u.staff_id) {
      qry('SELECT fname, lname FROM staff WHERE id=?', [u.staff_id]).then(function(rows) {
        if (rows && rows[0]) {
          u.fname = rows[0].fname; u.lname = rows[0].lname;
          window.currentUser = u; saveSession(u);
          av.textContent = _ini(u.fname, u.lname);
        }
      });
      if (u.fname || u.lname) av.textContent = _ini(u.fname, u.lname);
    } else {
      // Admin — use username initial
      av.textContent = (u.fname ? _ini(u.fname, u.lname) : (u.role || 'U').slice(0,2).toUpperCase());
    }
  }
  var rb = _gel('role-badge'); if (rb) rb.textContent = (u.role || 'user').toUpperCase() + ' · MySQL';
  // Staff attendance tab is admin-only (member tab removed)
  // Hide admin-only buttons for non-admins, show them for admins
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.style.display = (u.role === 'admin') ? '' : 'none';
  });
  // Hide non-admin-only elements for admins (e.g. Member Check-In button)
  document.querySelectorAll('.non-admin-only').forEach(function(el) {
    el.style.display = (u.role === 'admin') ? 'none' : '';
  });
  // Trainer-only elements: visible only to trainers
  document.querySelectorAll('.trainer-only').forEach(function(el) {
    el.style.display = (u.role === 'trainer') ? '' : 'none';
  });
  // Show correct attendance layout based on role
  var attAdmin = _gel('att-admin-header');
  var attUser  = _gel('att-user-view');
  if (u.role === 'user') {
    if (attAdmin) attAdmin.style.display = 'none';
    if (attUser)  attUser.style.display  = '';
  } else {
    if (attAdmin) attAdmin.style.display = '';
    if (attUser)  attUser.style.display  = 'none';
    // Admin: load staff attendance directly (member tab removed)
    if (u.role === 'admin') {
      setTimeout(function() { if (typeof rStaffAtt === 'function') rStaffAtt(); }, 150);
    } else {
      setTimeout(function() { if (typeof switchAttTab === 'function') switchAttTab('member'); }, 150);
    }
  }
  // Hide Admin nav section label for non-admins
  var adminLabel = _gel('nav-label-admin');
  if (adminLabel) adminLabel.style.display = (u.role === 'admin') ? '' : 'none';

  // Hide Memberships nav for users — they don't manage memberships directly
  var navMS = _gel('nav-memberships');
  console.log('[FitCore] User role:', u.role, '| Hiding memberships nav:', u.role === 'user');
  if (navMS) {
    navMS.style.display = (u.role === 'user') ? 'none' : '';
    console.log('[FitCore] Memberships nav display:', navMS.style.display);
  }
  
  if (typeof applyRBAC === 'function') try { applyRBAC(); }         catch(e) {}
  if (typeof applyRole === 'function') try { applyRole(u.role); }   catch(e) {}
  onUserChanged();
  // Show login notifications after a short delay so dashboard loads first
  setTimeout(function() {
    if (typeof showLoginNotifications === 'function') showLoginNotifications(u);
  }, 800);
}

// ════════════════════════════════════════════════════════════
//  AUTH  — these overwrite the SQLite versions in app.js
// ════════════════════════════════════════════════════════════
window.doLogin = async function doLogin() {
  var username = (_gv('lg-user') || '').trim().toLowerCase();
  var password = _gv('lg-pass') || '';
  if (!username || !password) { toast('Enter username and password.', 'error'); return; }
  try {
    var u = await apiFetch({ action: 'login' }, { username: username, password: password });
    window.currentUser = u;
    saveSession(u);
    _showApp(u);
    toast('Welcome! ✅', 'success');
  } catch(e) { toast(e.message || 'Login failed.', 'error'); }
};
// Also expose under the stub name used in the patched app.js
window._mysqlDoLogin = window.doLogin;

window.registerUser = async function registerUser() {
  var fn  = (_gv('rg-fn') || '').trim();
  var ln  = (_gv('rg-ln') || '').trim();
  var em  = (_gv('rg-em') || '').trim();
  var ph  = (_gv('rg-ph') || '').trim();
  var dob = (_gv('rg-dob') || '').trim();
  var gen = (_gv('rg-gen') || 'Other').trim();
  var pw  = _gv('rg-pw')  || '';
  var pw2 = _gv('rg-pw2') || '';
  var pid = _gv('rg-plan') || '';
  if (!fn || !em || !pw)  { toast('First name, email and password required.', 'error'); return; }
  if (pw !== pw2)          { toast('Passwords do not match.', 'error'); return; }
  try {
    var u = await apiFetch({ action: 'register' },
      { fname: fn, lname: ln, email: em, phone: ph, dob: dob||null, gender: gen, password: pw, plan_id: pid||null });
    window.currentUser = u;
    saveSession(u);
    if (typeof closeM === 'function') closeM('mo-register');
    _showApp(u);
    toast(pid ? 'Account created with membership! ✅' : 'Account created! ✅', 'success');
  } catch(e) { toast(e.message || 'Registration failed.', 'error'); }
};

window.logout = function logout() {
  window.currentUser = null;
  clearSession();
  var ag = _gel('auth-gate'); if (ag) ag.style.display = '';
  var bl = _gel('btn-logout'); if (bl) bl.style.display = 'none';
  var as = _gel('app-shell'); if (as) as.style.display = 'none';
  
  toast('Logged out', 'info');
};

// Current selected role on login screen
window._loginRole = 'admin';

window.selectRole = function selectRole(role) {
  window._loginRole = role;
  // Update card visuals
  document.querySelectorAll('.role-card').forEach(function(c) {
    c.classList.toggle('selected', c.getAttribute('data-role') === role);
  });
  // Show Register button only for members
  var rb = _gel('btn-register');
  if (rb) rb.style.display = (role === 'user') ? '' : 'none';
  // Clear fields
  var u = _gel('lg-user'); if (u) u.value = '';
  var p = _gel('lg-pass'); if (p) p.value = '';
  setTimeout(function() { var u = _gel('lg-user'); if (u) u.focus(); }, 50);
};

window.fillLogin = function fillLogin() {}; // no-op, hints removed

// ════════════════════════════════════════════════════════════
//  initDB — replaces the sql.js version
// ════════════════════════════════════════════════════════════
var _initDBStarted = false;
window.initDB = async function initDB() {
  if (_initDBStarted) return;   // prevent double-call from app.js setTimeout + DOMContentLoaded
  _initDBStarted = true;
  try { await apiFetch({ action: 'ping' }); }
  catch(e) {
    _gel('loading').innerHTML =
      '<div style="text-align:center;padding:40px;font-family:system-ui">' +
      '<div style="font-size:56px;margin-bottom:16px">⚠️</div>' +
      '<div style="font-size:22px;font-weight:800;margin-bottom:12px;color:#f0f0f0">Cannot reach XAMPP backend</div>' +
      '<div style="color:#888;font-size:14px;line-height:2;margin-bottom:16px">' +
      '① XAMPP Control Panel → Start <b>Apache</b> and <b>MySQL</b><br>' +
      '② Copy files to <code style="color:#f97316">C:\\xampp\\htdocs\\fitcore\\</code><br>' +
      '③ Open <code style="color:#f97316">http://localhost/fitcore/index.html</code>' +
      '</div>' +
      '<div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:12px;' +
      'font-size:12px;color:#f87171;font-family:monospace;word-break:break-all;margin-bottom:20px">' +
      e.message + '</div>' +
      '<button onclick="location.reload()" style="padding:10px 28px;background:#f97316;color:#fff;' +
      'border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🔄 Retry</button>' +
      '</div>';
    return;
  }
  var ld = _gel('loading'); if (ld) ld.style.display = 'none';

  var sess = loadSession();
  if (sess) {
    window.currentUser = sess;
    _showApp(sess);
  } else {
    var ag = _gel('auth-gate'); if (ag) ag.style.display = '';
    var as = _gel('app-shell'); if (as) as.style.display = 'none';
    
  }
  toast('Connected to MySQL ✅', 'success');
};

// ════════════════════════════════════════════════════════════
//  onUserChanged
// ════════════════════════════════════════════════════════════
window.onUserChanged = function onUserChanged() {
  var fns = [dash, rMembers, rMS, rPay, rAtt, rClasses, rEquip, rStaff, rPlans, populateSels, loadMyProfile, loadAIHistory, loadUserAttendance];
  fns.forEach(function(fn) {
    if (typeof fn !== 'function') return;
    try { var r = fn(); if (r && typeof r.catch === 'function') r.catch(function(e){ console.warn(e); }); }
    catch(e) { console.warn(fn.name, e); }
  });
};

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
window.dashAdmin = async function dashAdmin() {
  var isAdmin = window.currentUser && window.currentUser.role === 'admin';
  var monthStart = _td().slice(0,7) + '-01';
  function setTxt(id, v) { var e = _gel(id); if (e) e.textContent = v; }

  var p1 = isAdmin ? qry("SELECT COUNT(*) as c FROM staff WHERE role='Trainer'")      : Promise.resolve([{c:'--'}]);
  var p2 = isAdmin ? qry("SELECT COUNT(*) as c FROM staff WHERE role='Cleaner'")      : Promise.resolve([{c:'--'}]);
  var p3 = isAdmin ? qry("SELECT COUNT(*) as c FROM staff WHERE role='Receptionist'") : Promise.resolve([{c:'--'}]);
  var p4 = qry('SELECT COUNT(*) as c FROM members');
  // Only this month: match exact YYYY-MM so no other months bleed in
  var currentMonth = _td().slice(0,7);
  var p5 = qry("SELECT COALESCE(SUM(amount),0) as r FROM payments WHERE DATE_FORMAT(date,'%Y-%m')=?", [currentMonth]);

  var res = await Promise.all([p1, p2, p3, p4, p5]);
  var monthlyRevenue = res[4][0] ? res[4][0].r : 0;
  setTxt('st-trainers',      res[0][0] ? res[0][0].c : '--');
  setTxt('st-cleaners',      res[1][0] ? res[1][0].c : '--');
  setTxt('st-receptionists', res[2][0] ? res[2][0].c : '--');
  setTxt('st-users',         res[3][0] ? res[3][0].c : 0);
  setTxt('st-rev',           _fm(monthlyRevenue));
  setTxt('rev-total',        _fm(monthlyRevenue));

  await renderBarChart();
  await renderMonthlyRevenueChart();
  await renderPlanBreakdown();
  await renderRecentAct();
};

window.dashTrainer = async function dashTrainer() {
  if (!window.currentUser || window.currentUser.role !== 'trainer') return;
  var today    = _td();
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  var sid      = window.currentUser.staff_id ? parseInt(window.currentUser.staff_id, 10) : 0;

  // Recover staff_id from DB if missing from session
  if (!sid && window.currentUser.username) {
    var authRow = await qry('SELECT staff_id FROM auth_users WHERE username=?', [window.currentUser.username]);
    if (authRow[0] && authRow[0].staff_id) {
      sid = parseInt(authRow[0].staff_id, 10);
      window.currentUser.staff_id = sid;
      try { localStorage.setItem('fitcore_session', JSON.stringify(window.currentUser)); } catch(e) {}
    }
  }
  function setTxt(id, v) { var e = _gel(id); if (e) e.textContent = v; }

  // ── Stat strip ────────────────────────────────────────────────
  var res = await Promise.all([
    sid ? qry('SELECT COUNT(*) as c FROM members WHERE trainer_id=?', [sid])
        : qry('SELECT COUNT(*) as c FROM members'),
    sid ? qry('SELECT COUNT(*) as c FROM attendance a JOIN members m ON m.id=a.member_id WHERE DATE(a.checkin_time)=? AND m.trainer_id=?', [today, sid])
        : qry('SELECT COUNT(*) as c FROM attendance WHERE DATE(checkin_time)=?', [today]),
    sid ? qry('SELECT COUNT(*) as c FROM class_trainers WHERE staff_id=? AND class_id IN (SELECT id FROM classes WHERE day=?)', [sid, todayDow])
        : qry('SELECT COUNT(*) as c FROM classes WHERE day=?', [todayDow]),
  ]);
  setTxt('tr-members',  res[0][0] ? res[0][0].c : 0);
  setTxt('tr-checkins', res[1][0] ? res[1][0].c : 0);
  setTxt('tr-classes',  res[2][0] ? res[2][0].c : 0);

  // ── Feature 1: Today's Schedule ───────────────────────────────
  var dateEl = _gel('tr-today-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  var schedEl = _gel('tr-schedule');
  if (schedEl) {
    var todayCls = await (sid
      ? qry('SELECT c.* FROM classes c JOIN class_trainers ct ON ct.class_id=c.id WHERE ct.staff_id=? AND c.day=? ORDER BY c.time', [sid, todayDow])
      : qry('SELECT * FROM classes WHERE day=? ORDER BY time', [todayDow]));

    if (!todayCls.length) {
      schedEl.innerHTML = '<div style="text-align:center;padding:28px 0;color:var(--text-muted)">' +
        '<div style="font-size:36px;margin-bottom:8px">😴</div>' +
        '<div style="font-weight:600">No classes today</div>' +
        '<div style="font-size:12px;margin-top:4px">Enjoy your rest day!</div></div>';
    } else {
      var nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      schedEl.innerHTML = todayCls.map(function(c) {
        var parts    = (c.time || '00:00').split(':');
        var startMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        var endMin   = startMin + parseInt(c.duration || 60);
        var isNow    = nowMins >= startMin && nowMins < endMin;
        var isDone   = nowMins >= endMin;
        var pct      = Math.min(100, Math.max(0, Math.round((nowMins - startMin) / (c.duration||60) * 100)));
        var startH   = parseInt(parts[0]);
        var startStr = (startH % 12 || 12) + ':' + parts[1] + (startH < 12 ? ' AM' : ' PM');
        var eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
        var endStr   = (eh % 12 || 12) + ':' + (em < 10 ? '0' : '') + em + (eh < 12 ? ' AM' : ' PM');
        return '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--border);align-items:flex-start">' +
          '<div style="min-width:64px;text-align:center;padding-top:2px">' +
            '<div style="font-size:13px;font-weight:700;color:' + (isNow ? 'var(--primary)' : isDone ? 'var(--text-muted)' : 'var(--text)') + '">' + startStr + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted)">' + endStr + '</div>' +
          '</div>' +
          '<div style="width:3px;border-radius:4px;background:' + (isNow ? 'var(--primary)' : isDone ? 'var(--border)' : 'var(--success)') + ';align-self:stretch;flex-shrink:0"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
              '<span style="font-weight:700;font-size:14px;' + (isDone ? 'color:var(--text-muted)' : '') + '">' + c.name + '</span>' +
              (isNow  ? '<span class="badge active"  style="font-size:9px;padding:2px 7px">● NOW</span>' : '') +
              (isDone ? '<span class="badge expired" style="font-size:9px;padding:2px 7px">Done</span>' : '') +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:' + (isNow ? '8px' : '0') + '">' +
              '⏱ ' + (c.duration||60) + ' min &nbsp;·&nbsp; 👥 Cap: ' + (c.capacity||'—') +
            '</div>' +
            (isNow ? '<div style="height:4px;background:var(--border);border-radius:4px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--primary);border-radius:4px"></div></div>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // ── Feature 2: My Members cards ───────────────────────────────
  var cardsEl = _gel('tr-member-cards');
  var countEl = _gel('tr-member-count');
  if (cardsEl) {
    var members = await (sid
      ? qry('SELECT m.*, ms.end_date, ms.status as ms_status, p.name as pn, ' +
            '(SELECT checkin_time FROM attendance WHERE member_id=m.id ORDER BY checkin_time DESC LIMIT 1) as last_ci ' +
            'FROM members m ' +
            'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
            'LEFT JOIN plans p ON p.id=ms.plan_id WHERE m.trainer_id=? ORDER BY m.fname', [sid])
      : qry('SELECT m.*, ms.end_date, ms.status as ms_status, p.name as pn, ' +
            '(SELECT checkin_time FROM attendance WHERE member_id=m.id ORDER BY checkin_time DESC LIMIT 1) as last_ci ' +
            'FROM members m ' +
            'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
            'LEFT JOIN plans p ON p.id=ms.plan_id ORDER BY m.fname'));

    if (countEl) countEl.textContent = members.length + ' member' + (members.length !== 1 ? 's' : '');

    if (!members.length) {
      cardsEl.innerHTML = '<div class="empty"><div class="empty-ico">👥</div><p>No members assigned yet</p></div>';
    } else {
      cardsEl.innerHTML = members.map(function(m) {
        var lastCi   = m.last_ci ? new Date(m.last_ci) : null;
        var daysAgo  = lastCi ? Math.floor((new Date() - lastCi) / 86400000) : null;
        var actColor = daysAgo === null ? 'var(--text-muted)'
                     : daysAgo === 0   ? 'var(--success)'
                     : daysAgo <= 3    ? 'var(--primary)'
                     : daysAgo <= 7    ? 'var(--warning)'
                     : '#f43f5e';
        var actLabel = daysAgo === null  ? 'Never checked in'
                     : daysAgo === 0    ? 'Today ✅'
                     : daysAgo === 1    ? 'Yesterday'
                     : daysAgo + ' days ago';
        var msColor  = m.ms_status === 'active'  ? 'var(--success)'
                     : m.ms_status === 'expired' ? '#f43f5e'
                     : 'var(--warning)';
        var expWarning = '';
        if (m.end_date) {
          var daysLeft = Math.floor((new Date(m.end_date) - new Date()) / 86400000);
          if (daysLeft >= 0 && daysLeft <= 7)
            expWarning = '<div style="margin-top:6px;padding:4px 8px;background:rgba(251,191,36,0.12);border-radius:6px;font-size:11px;color:var(--warning)">⚠️ Expires in ' + daysLeft + ' day' + (daysLeft!==1?'s':'') + '</div>';
          else if (daysLeft < 0)
            expWarning = '<div style="margin-top:6px;padding:4px 8px;background:rgba(244,63,94,0.1);border-radius:6px;font-size:11px;color:#f43f5e">❌ Membership expired</div>';
        }
        return '<div class="eq-card" style="gap:8px">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div class="mav" style="width:38px;height:38px;font-size:14px;flex-shrink:0">' + _ini(m.fname,m.lname) + '</div>' +
            '<div style="min-width:0">' +
              '<div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + m.fname + ' ' + m.lname + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted)">' + (m.phone||m.email||'—') + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<span style="font-size:12px;color:var(--text-muted)">' + (m.pn||'No plan') + '</span>' +
            '<span style="font-size:11px;font-weight:600;color:' + msColor + ';text-transform:capitalize">' + (m.ms_status||'—') + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;font-size:12px">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:' + actColor + ';flex-shrink:0"></div>' +
            '<span style="color:var(--text-muted)">Last visit:</span>' +
            '<span style="font-weight:600;color:' + actColor + '">' + actLabel + '</span>' +
          '</div>' +
          expWarning +
        '</div>';
      }).join('');
    }
  }

  await renderBarChart();
};

window.dash = async function dash() {
  var role = window.currentUser ? window.currentUser.role : 'user';
  var aw = _gel('dash-admin');
  var tw = _gel('dash-trainer');
  var uw = _gel('dash-user');
  if (role === 'admin') {
    if (aw) aw.style.display = ''; if (tw) tw.style.display = 'none'; if (uw) uw.style.display = 'none';
    await dashAdmin();
  } else if (role === 'trainer') {
    if (aw) aw.style.display = 'none'; if (tw) tw.style.display = ''; if (uw) uw.style.display = 'none';
    await dashTrainer();
  } else {
    if (aw) aw.style.display = 'none'; if (tw) tw.style.display = 'none'; if (uw) uw.style.display = '';
    await dashUser();
  }
};

// ────────────────────────────────────────────────────────────
//  USER DASHBOARD
// ────────────────────────────────────────────────────────────
window.dashUser = async function dashUser() {
  var mid = window.currentUser && window.currentUser.member_id ? window.currentUser.member_id : null;
  if (!mid) { console.warn('No member_id for user dashboard'); return; }

  function setTxt(id, v) { var e = _gel(id); if (e) e.textContent = v; }

  // Get member + latest membership
  var member = await qry('SELECT * FROM members WHERE id=?', [mid]);
  var m = member && member[0];
  if (!m) return;

  var ms = await qry(
    'SELECT ms.*, p.name AS plan_name FROM memberships ms ' +
    'JOIN plans p ON p.id=ms.plan_id WHERE ms.member_id=? ORDER BY ms.end_date DESC LIMIT 1', [mid]
  );
  var membership = ms && ms[0];

  // Membership card
  if (membership) {
    setTxt('du-plan-name', membership.plan_name || 'No Plan');
    setTxt('du-expires', _fd(membership.end_date));
    var daysLeft = Math.max(0, Math.ceil((new Date(membership.end_date) - new Date()) / 86400000));
    setTxt('du-days-left', daysLeft + ' days');
    var statusBadge = _gel('du-status-badge');
    if (statusBadge) {
      var badge = 'active';
      if (membership.status === 'expired') badge = 'expired';
      else if (membership.status === 'paused') badge = 'paused';
      statusBadge.innerHTML = '<span class="badge ' + badge + '" style="font-size:11px">' + 
        (membership.status || 'active').toUpperCase() + '</span>';
    }
  } else {
    setTxt('du-plan-name', 'No Active Plan');
    setTxt('du-expires', '—');
    setTxt('du-days-left', '—');
  }
  setTxt('du-since', _fd(m.created_at));

  // Stats
  var today = _td();
  var monthStart = today.slice(0,7) + '-01';

  var checkins = await qry('SELECT COUNT(*) as c FROM attendance WHERE member_id=?', [mid]);
  var totalCheckins = checkins && checkins[0] ? parseInt(checkins[0].c) : 0;
  setTxt('du-checkins-total', totalCheckins);

  var monthCheckins = await qry(
    'SELECT COUNT(*) as c FROM attendance WHERE member_id=? AND DATE(checkin_time)>=?', [mid, monthStart]
  );
  var monthCount = monthCheckins && monthCheckins[0] ? parseInt(monthCheckins[0].c) : 0;
  setTxt('du-checkins-month', monthCount);

  // Calculate streak
  var allDates = await qry(
    'SELECT DISTINCT DATE(checkin_time) as d FROM attendance WHERE member_id=? ORDER BY d DESC', [mid]
  );
  var streak = 0;
  if (allDates && allDates.length) {
    var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    var checkDate = new Date(today);
    for (var i = 0; i < allDates.length; i++) {
      var d = allDates[i].d;
      if (d === checkDate.toISOString().split('T')[0]) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }
  setTxt('du-streak', streak);

  // Recent check-ins
  var recentAtt = await qry(
    'SELECT * FROM attendance WHERE member_id=? ORDER BY checkin_time DESC LIMIT 7', [mid]
  );
  var rcBox = _gel('du-recent-checkins');
  if (rcBox) {
    rcBox.innerHTML = recentAtt && recentAtt.length ? recentAtt.map(function(a) {
      var dur = '—';
      if (a.checkout_time) {
        var mins = Math.round((new Date(a.checkout_time) - new Date(a.checkin_time)) / 60000);
        dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
      }
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border);font-size:13px">' +
        '<div>' +
          '<div style="font-weight:700">' + _fd(a.checkin_time) + '</div>' +
          '<div style="color:var(--text-muted);font-size:11px">' + new Date(a.checkin_time).toLocaleTimeString() + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-weight:600;color:var(--primary)">' + dur + '</div>' +
          '<div style="color:var(--text-muted);font-size:11px">' + (a.checkout_time ? 'Completed' : 'In progress') + '</div>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-ico">📋</div><p>No check-ins yet</p></div>';
  }

  // My payments
  var payments = await qry(
    'SELECT * FROM payments WHERE member_id=? ORDER BY created_at DESC LIMIT 5', [mid]
  );
  var payBox = _gel('du-payments');
  if (payBox) {
    payBox.innerHTML = payments && payments.length ? payments.map(function(p) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border);font-size:13px">' +
        '<div>' +
          '<div style="font-weight:700">' + (p.plan || 'Payment') + '</div>' +
          '<div style="color:var(--text-muted);font-size:11px">' + _fd(p.date) + ' · ' + (p.method||'—') + '</div>' +
        '</div>' +
        '<div style="font-weight:700;color:var(--success)">' + _fm(p.amount) + '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-ico">💳</div><p>No payments yet</p></div>';
  }

  // ── 1. EXPIRY COUNTDOWN / RENEWAL ALERT ──────────────────────
  var expiryBox = _gel('du-expiry-content');
  if (expiryBox && membership) {
    var dLeft   = Math.ceil((new Date(membership.end_date) - new Date()) / 86400000);
    var isExp   = membership.status === 'expired' || dLeft < 0;
    var isPaused= membership.status === 'paused';
    var urgent  = !isExp && !isPaused && dLeft <= 7;
    var warning = !isExp && !isPaused && dLeft > 7 && dLeft <= 30;

    // Ring colour
    var ringColor = isExp   ? 'var(--danger)'
                  : isPaused? 'var(--info)'
                  : urgent  ? 'var(--warning)'
                  : warning ? 'var(--primary)'
                  : 'var(--success)';

    // Arc: 0–100 days mapped to 0–100% of circumference (251)
    var maxDays = parseInt(membership.duration || 30);
    var pct     = isExp ? 0 : Math.min(1, Math.max(0, dLeft / maxDays));
    var circ    = 251;
    var dash    = Math.round(pct * circ);

    var label   = isExp    ? 'Expired'
                : isPaused ? 'Paused'
                : dLeft === 0 ? 'Expires today!'
                : dLeft + ' days left';

    var sub     = isExp    ? 'Your membership has expired. Please renew to continue.'
                : isPaused ? 'Your membership is currently paused.'
                : urgent   ? 'Renewing soon? Contact us to extend your plan.'
                : warning  ? 'Less than a month remaining on your plan.'
                : 'Your membership is in good standing.';

    var alertBar = (isExp || urgent)
      ? '<div style="margin-top:14px;padding:10px 14px;background:' +
          (isExp ? 'rgba(239,68,68,.12)' : 'rgba(234,179,8,.12)') +
          ';border:1px solid ' + (isExp ? 'rgba(239,68,68,.25)' : 'rgba(234,179,8,.25)') +
          ';border-radius:8px;font-size:12px;color:' + ringColor + ';font-weight:600">' +
          (isExp ? '🔴 Membership expired — please contact the gym to renew.'
                 : '⚠️ Expiring in ' + dLeft + ' day' + (dLeft !== 1 ? 's' : '') + ' — contact us to renew!') +
        '</div>'
      : '';

    expiryBox.innerHTML =
      '<div style="display:flex;align-items:center;gap:20px;padding:6px 0">' +
        // SVG ring
        '<div style="flex-shrink:0">' +
          '<svg width="90" height="90" viewBox="0 0 90 90">' +
            '<circle cx="45" cy="45" r="40" fill="none" stroke="var(--border)" stroke-width="8"/>' +
            '<circle cx="45" cy="45" r="40" fill="none" stroke="' + ringColor + '" stroke-width="8"' +
              ' stroke-dasharray="' + dash + ' ' + circ + '"' +
              ' stroke-linecap="round" transform="rotate(-90 45 45)"' +
              ' style="transition:stroke-dasharray .6s ease"/>' +
            '<text x="45" y="48" text-anchor="middle" font-size="13" font-weight="800" fill="' + ringColor + '">' +
              (isExp ? 'EXP' : isPaused ? '⏸' : dLeft) +
            '</text>' +
          '</svg>' +
        '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:18px;font-weight:800;margin-bottom:4px">' + (membership.plan_name||'—') + '</div>' +
          '<div style="font-size:13px;font-weight:700;color:' + ringColor + '">' + label + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">' + sub + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Expires: <b style="color:var(--text)">' + _fd(membership.end_date) + '</b></div>' +
        '</div>' +
      '</div>' +
      alertBar;
  } else if (expiryBox) {
    expiryBox.innerHTML = '<div class="empty"><div class="empty-ico">🎫</div><p>No active membership found.</p></div>';
  }

  // ── 2. WEEKLY ATTENDANCE BAR CHART ───────────────────────────
  var barChart = _gel('du-bar-chart');
  var barLbs   = _gel('du-bar-lbs');
  var weekSum  = _gel('du-week-summary');
  if (barChart) {
    var days    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dayFull = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    var todayDow = new Date().getDay(); // 0=Sun
    // Build Mon–Sun for current week
    var weekDates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      // distance from Monday
      var diff = i - ((todayDow + 6) % 7);
      d.setDate(d.getDate() + diff);
      weekDates.push(d.toISOString().split('T')[0]);
    }
    // Fetch checkins for this week
    var weekRows = await qry(
      'SELECT DATE(checkin_time) as d, COUNT(*) as c FROM attendance WHERE member_id=? AND DATE(checkin_time) BETWEEN ? AND ? GROUP BY d',
      [mid, weekDates[0], weekDates[6]]
    );
    var countMap = {};
    (weekRows || []).forEach(function(r){ countMap[r.d] = parseInt(r.c); });
    var counts  = weekDates.map(function(d){ return countMap[d] || 0; });
    var maxC    = Math.max.apply(null, counts.concat([1]));
    var totalWeek = counts.reduce(function(a,b){ return a+b; }, 0);
    var todayIdx  = (todayDow + 6) % 7; // 0=Mon

    barChart.innerHTML = counts.map(function(c, i) {
      var isToday = i === todayIdx;
      var ht = Math.max(4, Math.round((c / maxC) * 72));
      var col = c > 0
        ? (isToday ? 'var(--primary)' : 'var(--success)')
        : 'var(--border)';
      return '<div style="flex:1;height:' + ht + 'px;background:' + col + ';border-radius:4px 4px 0 0;' +
        'opacity:' + (isToday ? '1' : '0.75') + ';cursor:default;position:relative" title="' +
        dayFull[i] + ': ' + c + ' check-in' + (c!==1?'s':'') + '">' +
        (c > 0 ? '<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:var(--text)">' + c + '</div>' : '') +
      '</div>';
    }).join('');

    barLbs.innerHTML = days.map(function(d, i) {
      var isToday = i === todayIdx;
      return '<div class="bar-lb" style="' + (isToday ? 'color:var(--primary);font-weight:700' : '') + '">' + d + '</div>';
    }).join('');

    if (weekSum) {
      weekSum.textContent = totalWeek === 0
        ? 'No visits this week yet — keep going!'
        : totalWeek === 1
        ? '1 visit this week. Great start!'
        : totalWeek + ' visits this week. ' + (totalWeek >= 4 ? 'Outstanding! 🔥' : totalWeek >= 2 ? 'Nice work! 💪' : 'Keep it up!');
    }
  }

  // ── 3. UPCOMING CLASSES THIS WEEK ────────────────────────────
  var clsBox = _gel('du-upcoming-classes');
  if (clsBox) {
    var dowNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var todayName = dowNames[new Date().getDay()];
    var dowOrder  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    var todayOrder= dowOrder.indexOf(todayName);

    // Get remaining days this week including today
    var remainingDays = dowOrder.slice(todayOrder >= 0 ? todayOrder : 0);

    var upcomingCls = await qry(
      'SELECT c.*, GROUP_CONCAT(CONCAT(s.fname, " ", s.lname) SEPARATOR ", ") as trainers ' +
      'FROM classes c ' +
      'LEFT JOIN class_trainers ct ON ct.class_id = c.id ' +
      'LEFT JOIN staff s ON s.id = ct.staff_id ' +
      'WHERE c.day IN (' + remainingDays.map(function(){ return '?'; }).join(',') + ') ' +
      'GROUP BY c.id ORDER BY FIELD(c.day,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"), c.time',
      remainingDays
    );

    if (!upcomingCls || !upcomingCls.length) {
      clsBox.innerHTML = '<div class="empty"><div class="empty-ico">🗓️</div><p>No more classes this week.</p></div>';
    } else {
      // Group by day
      var byDay = {};
      upcomingCls.forEach(function(c) {
        if (!byDay[c.day]) byDay[c.day] = [];
        byDay[c.day].push(c);
      });
      clsBox.innerHTML = remainingDays.filter(function(d){ return byDay[d]; }).map(function(day) {
        var isToday = day === todayName;
        return '<div style="margin-bottom:12px">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:' +
            (isToday ? 'var(--primary)' : 'var(--text-muted)') +
          ';margin-bottom:6px">' + day + (isToday ? ' · Today' : '') + '</div>' +
          byDay[day].map(function(c) {
            var parts = (c.time||'00:00').split(':');
            var h = parseInt(parts[0]), mn = parts[1]||'00';
            var timeStr = (h%12||12) + ':' + mn + (h<12?' AM':' PM');
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;' +
              'background:' + (isToday ? 'rgba(249,115,22,.08)' : 'var(--surface2)') + ';' +
              'border:1px solid ' + (isToday ? 'rgba(249,115,22,.2)' : 'var(--border)') + ';' +
              'border-radius:8px;margin-bottom:5px">' +
              '<div style="font-size:18px">🏋️</div>' +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:700;font-size:13px">' + c.name + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted)">' +
                  timeStr + ' &nbsp;·&nbsp; ' + (c.duration||60) + ' min' +
                  (c.trainers ? ' &nbsp;·&nbsp; ' + c.trainers : '') +
                '</div>' +
              '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);flex-shrink:0">👥 ' + (c.capacity||'—') + '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }).join('');
    }
  }

  // ── 4. LATEST AI PREDICTION SNAPSHOT ─────────────────────────
  var aiBox = _gel('du-ai-snapshot');
  if (aiBox) {
    var aiRec = await qry(
      'SELECT * FROM ai_recs WHERE member_id=? ORDER BY created_at DESC LIMIT 1', [mid]
    );
    var ai = aiRec && aiRec[0];
    if (!ai) {
      aiBox.innerHTML = '<div class="empty"><div class="empty-ico">✨</div><p>No prediction yet. <a onclick="nav(&quot;ai&quot;)" style="color:var(--primary);cursor:pointer;font-weight:600">Try the AI page &#8594;</a></p></div>';
    } else {
      var goalLabel = { lose: 'Lose Weight', muscle: 'Gain Muscle', fit: 'General Fitness' };
      var bmiVal  = ai.bmi ? parseFloat(ai.bmi).toFixed(1) : null;
      var bmiColor= !bmiVal ? 'var(--text-muted)'
                  : bmiVal < 18.5 ? 'var(--info)'
                  : bmiVal < 25   ? 'var(--success)'
                  : bmiVal < 30   ? 'var(--warning)'
                  : 'var(--danger)';
      var bmiBand = !bmiVal ? '—'
                  : bmiVal < 18.5 ? 'Underweight'
                  : bmiVal < 25   ? 'Normal'
                  : bmiVal < 30   ? 'Overweight'
                  : 'Obese';
      var schedLines = ai.schedule ? ai.schedule.split('\n').filter(Boolean).slice(0,3) : [];

      aiBox.innerHTML =
        // Header row: plan + goal badge
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px">' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Recommended Plan</div>' +
            '<div style="font-size:18px;font-weight:800;margin-top:3px">' + (ai.plan_name || 'No Plan') + '</div>' +
          '</div>' +
          '<span class="badge active" style="white-space:nowrap;flex-shrink:0">' + (goalLabel[ai.goal]||ai.goal) + '</span>' +
        '</div>' +
        // Stats row: BMI + days + level
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">' +
          '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
            '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">BMI</div>' +
            '<div style="font-size:20px;font-weight:800;color:' + bmiColor + '">' + (bmiVal||'—') + '</div>' +
            '<div style="font-size:10px;color:' + bmiColor + '">' + bmiBand + '</div>' +
          '</div>' +
          '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
            '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Days/Week</div>' +
            '<div style="font-size:20px;font-weight:800">' + (ai.days_per_week||'—') + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted)">training days</div>' +
          '</div>' +
          '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
            '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Level</div>' +
            '<div style="font-size:14px;font-weight:800;text-transform:capitalize;margin-top:4px">' + (ai.experience||'—') + '</div>' +
          '</div>' +
        '</div>' +
        // Schedule preview
        (schedLines.length
          ? '<div style="background:var(--surface2);border-radius:8px;padding:10px;margin-bottom:10px">' +
              '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Schedule Preview</div>' +
              schedLines.map(function(s){ return '<div style="font-size:12px;color:var(--text-muted);padding:2px 0">📅 ' + s + '</div>'; }).join('') +
              (ai.schedule.split('\n').filter(Boolean).length > 3 ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic">+ more on the AI page</div>' : '') +
            '</div>'
          : '') +
        // Footer: date + link
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div style="font-size:11px;color:var(--text-muted)">Generated: ' + _fd(ai.created_at) + '</div>' +
          '<a onclick="nav(&quot;ai&quot;)" style="font-size:12px;color:var(--primary);cursor:pointer;font-weight:600">Regenerate &#8594;</a>' +
        '</div>';
    }
  }

  // ── NEW FEATURES ─────────────────────────────────────────────
  loadDailyQuote();
  await loadWorkoutTime(mid);
  await loadGoalProgress(mid);
};

// ════════════════════════════════════════════════════════════
//  CHARTS
// ════════════════════════════════════════════════════════════
window.renderBarChart = async function renderBarChart() {
  var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Single GROUP BY query instead of 7 individual round-trips
  var rows = await qry(
    'SELECT DATE(checkin_time) as d, COUNT(*) as c FROM attendance ' +
    'WHERE DATE(checkin_time) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY d',
    []
  );
  // Build a date->count map, then fill 7-day array in order
  var dateMap = {};
  rows.forEach(function(r) { dateMap[r.d] = parseInt(r.c); });
  var counts = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    counts.push(dateMap[d.toISOString().split('T')[0]] || 0);
  }
  var mx = Math.max.apply(null, counts.concat([1]));
  var bc = _gel('bar-chart');
  var bl = _gel('bar-lbs');
  if (bc) bc.innerHTML = counts.map(function(c, i) {
    return '<div class="bar" style="height:' + Math.max(4, Math.round(c/mx*78)) + 'px" title="' + days[i] + ': ' + c + '"></div>';
  }).join('');
  if (bl) bl.innerHTML = days.map(function(d) {
    return '<div class="bar-lb">' + d + '</div>';
  }).join('');
};

window.renderMonthlyRevenueChart = async function renderMonthlyRevenueChart() {
  var months = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(); d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0,7));
  }
  var rows = await qry("SELECT DATE_FORMAT(date,'%Y-%m') as ym, COALESCE(SUM(amount),0) as total FROM payments GROUP BY ym");
  var map = {};
  rows.forEach(function(x) { map[x.ym] = parseFloat(x.total); });
  var totals = months.map(function(m) { return map[m] || 0; });
  var mx = Math.max.apply(null, totals.concat([1]));
  var chart = _gel('rev-chart');
  var lbs   = _gel('rev-lbs');
  if (chart) chart.innerHTML = totals.map(function(v, i) {
    return '<div class="bar" style="height:' + Math.max(4,Math.round(v/mx*78)) + 'px" title="' + months[i] + ': ' + _fm(v) + '"></div>';
  }).join('');
  if (lbs) lbs.innerHTML = months.map(function(m) {
    return '<div class="bar-lb">' + m.slice(5) + '</div>';
  }).join('');
};

window.renderPlanBreakdown = async function renderPlanBreakdown() {
  var monthStart = _td().slice(0,7) + '-01';
  var data = await qry(
    'SELECT p.name, COALESCE(SUM(pay.amount),0) as total FROM plans p ' +
    'LEFT JOIN payments pay ON pay.plan=p.name AND pay.date>=? GROUP BY p.id ORDER BY total DESC',
    [monthStart]);
  var totals = data.map(function(d) { return parseFloat(d.total); });
  var mx = Math.max.apply(null, totals.concat([1]));
  var el = _gel('plan-breakdown');
  if (el) el.innerHTML = data.map(function(d) {
    var pct = Math.round(parseFloat(d.total)/mx*100);
    return '<div style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">' +
      '<span>' + d.name + '</span>' +
      '<span style="color:var(--success);font-weight:600">' + _fm(d.total) + '</span></div>' +
      '<div class="pb"><div class="pf" style="width:' + pct + '%;background:var(--primary)"></div></div></div>';
  }).join('');
};

window.renderRecentAct = async function renderRecentAct() {
  var ico = { checkin:'📋', payment:'💳', join:'🎉' };
  var res = await Promise.all([
    qry('SELECT m.fname,m.lname,a.checkin_time FROM attendance a JOIN members m ON m.id=a.member_id ORDER BY a.checkin_time DESC LIMIT 3'),
    qry('SELECT m.fname,m.lname,p.amount,p.date FROM payments p JOIN members m ON m.id=p.member_id ORDER BY p.created_at DESC LIMIT 3'),
    qry('SELECT fname,lname,created_at FROM members ORDER BY created_at DESC LIMIT 2'),
  ]);
  var r = [];
  res[0].forEach(function(x) { r.push({type:'checkin',name:x.fname+' '+x.lname,detail:'Checked in',       time:x.checkin_time}); });
  res[1].forEach(function(x) { r.push({type:'payment',name:x.fname+' '+x.lname,detail:'Paid '+_fm(x.amount),time:x.date}); });
  res[2].forEach(function(x) { r.push({type:'join',   name:x.fname+' '+x.lname,detail:'Joined gym',       time:x.created_at}); });
  r.sort(function(a,b){ return new Date(b.time)-new Date(a.time); });
  r = r.slice(0,6);
  var el = _gel('recent-act');
  if (el) el.innerHTML = r.map(function(x) {
    return '<div class="act-item">' +
      '<div class="act-icon ' + x.type + '">' + (ico[x.type]||'•') + '</div>' +
      '<div class="act-info"><div class="act-name">' + x.name + '</div>' +
      '<div class="act-det">' + x.detail + '</div></div>' +
      '<div class="act-time">' + _fd(x.time) + '</div></div>';
  }).join('') || '<div class="empty"><p>No recent activity</p></div>';
};

// ════════════════════════════════════════════════════════════
//  MEMBERS
// ════════════════════════════════════════════════════════════
window.populateSels = async function populateSels() {
  var plans = await qry('SELECT id,name,price FROM plans ORDER BY price');
  ['m-plan','ms-plan','ems-plan'].forEach(function(id) {
    var s = _gel(id);
    if (s) s.innerHTML = plans.map(function(p) {
      return '<option value="' + p.id + '">' + p.name + ' — ' + _fm(p.price) + '</option>';
    }).join('');
  });
  // Use parameterized query to avoid SQL injection if staff_id is ever tainted
  var mems;
  if (window.currentUser && window.currentUser.role === 'trainer' && window.currentUser.staff_id) {
    var sid = parseInt(window.currentUser.staff_id, 10);
    if (!sid) { mems = []; }
    else { mems = await qry('SELECT id,fname,lname FROM members WHERE trainer_id=? ORDER BY fname', [sid]); }
  } else {
    mems = await qry('SELECT id,fname,lname FROM members ORDER BY fname');
  }
  ['ms-mem','p-mem','ci-mem'].forEach(function(id) {
    var s = _gel(id);
    if (s) s.innerHTML = mems.map(function(m) {
      return '<option value="' + m.id + '">' + m.fname + ' ' + m.lname + '</option>';
    }).join('');
  });
  var ms = _gel('m-start');  if (ms)  ms.value  = _td();
  var pd = _gel('p-date');   if (pd)  pd.value  = _td();
  var upd = _gel('up-date'); if (upd) upd.value = _td();
  var ci = _gel('ci-in');    if (ci)  ci.value  = _ndt();
  var ms2= _gel('ms-start'); if (ms2) ms2.value = _td();
};

window.fillMsPlan = async function fillMsPlan() {
  var pid  = _gv('ms-plan');
  var plan = pid ? (await qry('SELECT * FROM plans WHERE id=?', [pid]))[0] : null;
  if (!plan) return;
  var s = _gv('ms-start') || _td();
  var e = new Date(s); e.setDate(e.getDate() + parseInt(plan.duration));
  var me = _gel('ms-end'); if (me) me.value = e.toISOString().split('T')[0];
  var ma = _gel('ms-amt'); if (ma) ma.value = plan.price;
};

window.rMembers = async function rMembers(s, st) {
  if (!s)  s  = '';
  if (!st) st = '';
  var role      = window.currentUser ? window.currentUser.role        : '';
  var sid       = window.currentUser ? window.currentUser.staff_id    : null;
  var mid       = window.currentUser ? window.currentUser.member_id   : null;
  var isAdmin   = role === 'admin';
  var isTrainer = role === 'trainer';

  // Trainers get the coaching dashboard instead of the plain table
  if (isTrainer) {
    var adminView   = _gel('members-admin-view');
    var trainerView = _gel('members-trainer-view');
    if (adminView)   adminView.style.display = 'none';
    if (trainerView) trainerView.style.display = '';
    renderTrainerCoachingDashboard(s, st);
    return;
  }

  // Admin / user: show standard table
  var adminView2   = _gel('members-admin-view');
  var trainerView2 = _gel('members-trainer-view');
  if (adminView2)   adminView2.style.display = '';
  if (trainerView2) trainerView2.style.display = 'none';

  var sql = 'SELECT m.*, ms.end_date, p.name as pn, au.username as uname, ' +
    'st.fname as tr_fname, st.lname as tr_lname FROM members m ' +
    'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=' +
    '(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
    'LEFT JOIN plans p ON p.id=ms.plan_id ' +
    'LEFT JOIN auth_users au ON au.member_id=m.id ' +
    'LEFT JOIN staff st ON st.id=m.trainer_id WHERE 1=1';
  var pr = [];

  if (role === 'user' && mid) { sql += ' AND m.id=?'; pr.push(mid); }
  if (s)  { sql += ' AND (m.fname LIKE ? OR m.lname LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)'; pr.push('%'+s+'%','%'+s+'%','%'+s+'%','%'+s+'%'); }
  if (st) { sql += ' AND m.status=?'; pr.push(st); }
  sql += ' ORDER BY m.created_at DESC';

  var rows = await qry(sql, pr);
  var tbl  = _gel('tbl-members');
  if (!tbl) return;

  tbl.innerHTML = rows.length ? rows.map(function(r) {
    var trainerCell = r.tr_fname
      ? '<div class="fc" style="gap:6px"><div class="mav" style="width:24px;height:24px;font-size:10px;background:linear-gradient(135deg,var(--info),#8b5cf6)">' + _ini(r.tr_fname, r.tr_lname) + '</div><span style="font-size:12px">' + r.tr_fname + ' ' + r.tr_lname + '</span></div>'
      : '<span style="color:var(--text-muted);font-size:12px">--</span>';
    var memberName = (r.fname + ' ' + r.lname).replace(/'/g, "\\'");
    return '<tr>' +
      '<td><div class="fc"><div class="mav">' + _ini(r.fname,r.lname) + '</div>' +
        '<div><div style="font-weight:600">' + r.fname + ' ' + r.lname + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + (r.email||'') + '</div></div></div></td>' +
      '<td>' + (isAdmin && r.uname
        ? '<span style="font-family:monospace;font-size:12px;color:var(--info)">' + r.uname + '</span>'
        : '<span style="color:var(--text-muted)">--</span>') + '</td>' +
      '<td>' + (r.pn || '<span style="color:var(--text-muted)">--</span>') + '</td>' +
      '<td>' + trainerCell + '</td>' +
      '<td>' + (r.phone||'--') + '</td>' +
      '<td>' + _fd(r.created_at) + '</td>' +
      '<td>' + (r.end_date ? _fd(r.end_date) : '--') + '</td>' +
      '<td>' + _sbadge(r.status) + '</td>' +
      '<td><div style="display:flex;gap:6px">' +
        (isAdmin ? '<button class="btn btn-sm btn-s" onclick="editMember(' + r.id + ')">&#9999;&#65039;</button>' : '') +
        (isAdmin ? '<button class="btn btn-sm btn-s" onclick="openAssignMemberTrainer(' + r.id + ',\'' + memberName + '\',' + (r.trainer_id || 'null') + ')" title="Assign Trainer" style="color:var(--info)">&#127947;</button>' : '') +
        (isAdmin ? '<button class="btn btn-sm btn-d" onclick="delMember(' + r.id + ')">&#128465;</button>' : '') +
      '</div></td></tr>';
  }).join('') : '<tr><td colspan="9"><div class="empty"><div class="empty-ico">&#128101;</div><p>No members found</p></div></td></tr>';
};

window.openAssignMemberTrainer = async function openAssignMemberTrainer(memberId, memberName, currentTrainerId) {
  var cu = window.currentUser || {};
  if (cu.role !== 'admin') { toast('Admin only', 'error'); return; }

  var midEl = _gel('amt-member-id');   if (midEl)  midEl.value = memberId;
  var nmEl  = _gel('amt-member-name'); if (nmEl)   nmEl.textContent = '👤 ' + memberName;

  // Load only Trainer-role staff
  var trainers = await qry("SELECT id, fname, lname, schedule FROM staff WHERE role='Trainer' ORDER BY fname");
  var sel = _gel('amt-trainer-sel');
  if (sel) {
    sel.innerHTML = '<option value="">— No Trainer (Unassign) —</option>' +
      trainers.map(function(t) {
        var selected = (t.id == currentTrainerId) ? ' selected' : '';
        var label = t.fname + ' ' + t.lname + (t.schedule ? ' · ' + t.schedule : '');
        return '<option value="' + t.id + '"' + selected + '>' + label + '</option>';
      }).join('');
  }
  if (typeof openM === 'function') openM('mo-assign-member-trainer');
};

window.saveAssignMemberTrainer = async function saveAssignMemberTrainer() {
  var memberId  = _gv('amt-member-id');
  var trainerId = _gv('amt-trainer-sel');
  if (!memberId) return;

  await run('UPDATE members SET trainer_id=? WHERE id=?', [trainerId || null, parseInt(memberId)]);

  if (typeof closeM === 'function') closeM('mo-assign-member-trainer');

  var label = '--';
  if (trainerId) {
    var rows = await qry('SELECT fname, lname FROM staff WHERE id=?', [trainerId]);
    if (rows && rows[0]) label = rows[0].fname + ' ' + rows[0].lname;
  }
  toast('Trainer assigned: ' + (trainerId ? label : 'none') + ' ✅', 'success');
  await rMembers();
};

window.addMember = async function addMember() {
  if (!_gv('m-fn') || !_gv('m-em')) { toast('Name and email required', 'error'); return; }
  var res = await run(
    "INSERT INTO members(fname,lname,email,phone,dob,gender,address,emergency_contact,medical_notes,status) VALUES(?,?,?,?,?,?,?,?,?,'active')",
    [_gv('m-fn'),_gv('m-ln'),_gv('m-em'),_gv('m-ph'),_gv('m-dob'),_gv('m-gen'),_gv('m-addr'),_gv('m-ec'),_gv('m-med')]
  );
  var mid = res && res.id ? res.id : null;
  var pid = _gv('m-plan');
  if (pid && mid) {
    var plan = (await qry('SELECT * FROM plans WHERE id=?', [pid]))[0];
    if (plan) {
      var s = _gv('m-start') || _td();
      var e = new Date(s); e.setDate(e.getDate() + parseInt(plan.duration));
      await run("INSERT INTO memberships(member_id,plan_id,start_date,end_date,amount,status) VALUES(?,?,?,?,?,'active')",
        [mid, pid, s, e.toISOString().split('T')[0], plan.price]);
      await run("INSERT INTO payments(member_id,amount,method,plan,date) VALUES(?,?,?,?,?)",
        [mid, plan.price, 'Cash', plan.name, s]);
    }
  }
  if (typeof closeM === 'function') closeM('mo-member');
  toast('Member added! ✅', 'success');
  await Promise.all([rMembers(), rMS(), rPay(), dash(), populateSels()]);
};

window.editMember = async function editMember(id) {
  var m = (await qry('SELECT * FROM members WHERE id=?', [id]))[0];
  if (!m) return;
  function set(el, v) { var e = _gel(el); if (e) e.value = v || ''; }
  _gel('em-id').value = id;
  set('em-fn',m.fname); set('em-ln',m.lname); set('em-em',m.email); set('em-ph',m.phone);
  set('em-gen',m.gender); set('em-addr',m.address); set('em-ec',m.emergency_contact);
  set('em-med',m.medical_notes); set('em-st',m.status);
  if (typeof openM === 'function') openM('mo-edit-member');
};

window.saveMember = async function saveMember() {
  await run(
    'UPDATE members SET fname=?,lname=?,email=?,phone=?,gender=?,address=?,emergency_contact=?,medical_notes=?,status=? WHERE id=?',
    [_gv('em-fn'),_gv('em-ln'),_gv('em-em'),_gv('em-ph'),_gv('em-gen'),_gv('em-addr'),_gv('em-ec'),_gv('em-med'),_gv('em-st'),_gv('em-id')]
  );
  if (typeof closeM === 'function') closeM('mo-edit-member');
  toast('Updated! ✅', 'success');
  await Promise.all([rMembers(), dash()]);
};

window.delMember = async function delMember(id) {
  if (!confirm('Delete member and all their records? This will also remove their login account.')) return;
  await run('DELETE FROM attendance WHERE member_id=?', [id]);
  await run('DELETE FROM payments WHERE member_id=?', [id]);
  await run('DELETE FROM memberships WHERE member_id=?', [id]);
  await run('DELETE FROM auth_users WHERE member_id=?', [id]);
  await run('DELETE FROM members WHERE id=?', [id]);
  toast('Member and login account deleted', 'info');
  await Promise.all([rMembers(), rMS(), rPay(), dash(), populateSels()]);
};

window.loadMyProfile = async function loadMyProfile() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;
  
  var m = (await qry('SELECT * FROM members WHERE id=?', [cu.member_id]))[0];
  if (!m) return;
  
  function set(id, v) { var e = _gel(id); if (e) e.value = v || ''; }
  function setTxt(id, v) { var e = _gel(id); if (e) e.textContent = v || '—'; }
  
  // Header section — render avatar (photo, preset, or initials)
  var avatar = _gel('up-avatar');
  if (avatar) applyAvatarEl(avatar, m, true);
  setTxt('up-fullname', m.fname + ' ' + m.lname);
  // Update topbar avatar with real photo/preset/initials
  var topAv = _gel('avatar');
  if (topAv) {
    // Reset inline styles so applyAvatarEl can override them cleanly
    _applyTopbarAvatar(m);
  }
  // Keep session in sync with latest name (don't store avatar_data — too large for localStorage)
  var changed = cu.fname !== m.fname || cu.lname !== m.lname || cu.avatar_type !== m.avatar_type;
  if (changed) {
    cu.fname = m.fname; cu.lname = m.lname;
    cu.avatar_type = m.avatar_type;
    window.currentUser = cu; saveSession(cu);
  }
  setTxt('up-email-display', m.email);
  setTxt('up-member-since', _fd(m.created_at));
  
  var statusBadge = _gel('up-status-badge');
  if (statusBadge) {
    var badge = m.status === 'active' ? 'active' : m.status === 'expired' ? 'expired' : 'paused';
    statusBadge.className = 'badge ' + badge;
    statusBadge.style.fontSize = '11px';
    statusBadge.textContent = (m.status || 'active').toUpperCase();
  }
  
  // Form fields
  set('up-fn', m.fname);
  set('up-ln', m.lname);
  set('up-em', m.email);
  set('up-ph', m.phone);
  set('up-dob', m.dob);
  set('up-gen', m.gender || 'Other');
  set('up-addr', m.address);
  set('up-ec', m.emergency_contact);
  var medField = _gel('up-med');
  if (medField) medField.value = m.medical_notes || '';
  
  // Security tab
  var auth = (await qry('SELECT * FROM auth_users WHERE member_id=?', [cu.member_id]))[0];
  if (auth) {
    setTxt('up-username', auth.username);
    setTxt('up-account-created', _fd(auth.created_at));
  }
  setTxt('up-member-id', '#' + String(m.id).padStart(4, '0'));
  
  // Load payment history
  await loadPaymentHistory();
};

window.saveMyProfile = async function saveMyProfile() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;
  
  var phone = _gv('up-ph');
  var dob   = _gv('up-dob');
  var gender = _gv('up-gen');
  var addr  = _gv('up-addr');
  var ec    = _gv('up-ec');
  var med   = _gv('up-med');
  
  await run(
    'UPDATE members SET phone=?, dob=?, gender=?, address=?, emergency_contact=?, medical_notes=? WHERE id=?',
    [phone, dob, gender, addr, ec, med, cu.member_id]
  );
  
  toast('Profile updated! ✅', 'success');
  await loadMyProfile();
};

window.switchProfileTab = function switchProfileTab(tab) {
  var tabs = ['info', 'payments', 'security'];
  tabs.forEach(function(t) {
    var btn = _gel('profile-tab-' + t);
    var panel = _gel('profile-panel-' + t);
    if (btn) {
      btn.className = t === tab ? 'btn btn-p' : 'btn btn-s';
      btn.style.borderBottom = t === tab ? '3px solid var(--primary)' : '3px solid transparent';
    }
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
};

window.loadPaymentHistory = async function loadPaymentHistory() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  
  var rows = await qry(
    'SELECT * FROM payments WHERE member_id=? ORDER BY created_at DESC',
    [cu.member_id]
  );
  
  var box = _gel('up-payment-history');
  if (!box) return;
  
  box.innerHTML = rows && rows.length ? rows.map(function(r) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1">' +
        '<div style="font-weight:700;margin-bottom:4px">' + (r.plan || 'Payment') + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted)">' +
          _fd(r.date) + ' · ' + (r.method || '—').toUpperCase() +
        '</div>' +
        (r.note ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">📝 ' + r.note + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-weight:700;color:var(--success);font-size:16px">' + _fm(r.amount) + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted)">' + _fd(r.created_at) + '</div>' +
      '</div>' +
    '</div>';
  }).join('') : '<div class="empty"><div class="empty-ico">💳</div><p>No payments yet</p></div>';
};

window.changePassword = async function changePassword() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  
  var curr = _gv('up-curr-pw');
  var newPw = _gv('up-new-pw');
  var confirm = _gv('up-confirm-pw');
  
  if (!curr || !newPw || !confirm) {
    toast('All fields are required', 'error');
    return;
  }
  
  if (newPw.length < 6) {
    toast('New password must be at least 6 characters', 'error');
    return;
  }
  
  if (newPw !== confirm) {
    toast('New passwords do not match', 'error');
    return;
  }
  
  // Verify current password server-side via login action (bcrypt-safe)
  var authRow = (await qry('SELECT username FROM auth_users WHERE member_id=?', [cu.member_id]))[0];
  if (!authRow) { toast('Account not found', 'error'); return; }

  try {
    await apiFetch({ action: 'login' }, { username: authRow.username, password: curr });
  } catch(e) {
    toast('Current password is incorrect', 'error');
    return;
  }

  // Hash and save the new password server-side
  try {
    await apiFetch({ action: 'change_password' }, { member_id: cu.member_id, new_password: newPw });
  } catch(e) {
    toast(e.message || 'Failed to update password', 'error');
    return;
  }

  clearPasswordFields();
  toast('Password changed successfully! 🔒', 'success');
};

window.clearPasswordFields = function clearPasswordFields() {
  var set = function(id, v) { var e = _gel(id); if (e) e.value = v; };
  set('up-curr-pw', '');
  set('up-new-pw', '');
  set('up-confirm-pw', '');
};

// ════════════════════════════════════════════════════════════
//  AVATAR SYSTEM
// ════════════════════════════════════════════════════════════

// Preset avatars: gradient key → CSS gradient
var AVATAR_PRESETS = [
  { key:'p1',  bg:'linear-gradient(135deg,#6366f1,#8b5cf6)', label:'Indigo' },
  { key:'p2',  bg:'linear-gradient(135deg,#ec4899,#f43f5e)', label:'Pink' },
  { key:'p3',  bg:'linear-gradient(135deg,#14b8a6,#06b6d4)', label:'Teal' },
  { key:'p4',  bg:'linear-gradient(135deg,#f59e0b,#f97316)', label:'Orange' },
  { key:'p5',  bg:'linear-gradient(135deg,#10b981,#22c55e)', label:'Green' },
  { key:'p6',  bg:'linear-gradient(135deg,#8b5cf6,#a855f7)', label:'Purple' },
  { key:'p7',  bg:'linear-gradient(135deg,#ef4444,#f97316)', label:'Red' },
  { key:'p8',  bg:'linear-gradient(135deg,#0ea5e9,#6366f1)', label:'Sky' },
  { key:'p9',  bg:'linear-gradient(135deg,#84cc16,#14b8a6)', label:'Lime' },
  { key:'p10', bg:'linear-gradient(135deg,#f43f5e,#8b5cf6)', label:'Rose' },
  { key:'p11', bg:'linear-gradient(135deg,#1e293b,#334155)', label:'Slate' },
  { key:'p12', bg:'linear-gradient(135deg,#d97706,#b45309)', label:'Amber' },
  { key:'p13', bg:'linear-gradient(135deg,#7c3aed,#4f46e5)', label:'Violet' },
  { key:'p14', bg:'linear-gradient(135deg,#059669,#0284c7)', label:'Emerald' },
  { key:'p15', bg:'linear-gradient(135deg,#db2777,#9333ea)', label:'Fuchsia' },
];

// Pending selection while modal is open
var _avatarPending = null; // { type: 'preset'|'upload', data: key|base64 }

// Apply avatar to a DOM element (img if photo, div with initials otherwise)
window.applyAvatarEl = function applyAvatarEl(el, member, large) {
  var sz = large ? '88px' : '38px';
  var fs = large ? '32px' : '14px';
  var base = 'width:'+sz+';height:'+sz+';border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;overflow:hidden;font-size:'+fs+';flex-shrink:0;';

  if (member.avatar_type === 'upload' && member.avatar_data) {
    el.style.cssText = base + 'background:#111;padding:0;';
    el.innerHTML = '<img src="' + member.avatar_data + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  } else if (member.avatar_type === 'preset' && member.avatar_data) {
    var preset = AVATAR_PRESETS.find(function(p){ return p.key === member.avatar_data; });
    el.style.cssText = base + 'background:' + (preset ? preset.bg : 'linear-gradient(135deg,var(--primary),#8b5cf6)') + ';';
    el.textContent = _ini(member.fname, member.lname);
  } else {
    el.style.cssText = base + 'background:linear-gradient(135deg,var(--primary),#8b5cf6);';
    el.textContent = _ini(member.fname, member.lname);
  }
};

// Apply avatar specifically to the topbar circle (preserves 34px CSS size)
function _applyTopbarAvatar(member) {
  var av = _gel('avatar');
  if (!av) return;
  // Clear both first to avoid stale content
  av.innerHTML = '';
  av.textContent = '';
  av.style.background = 'linear-gradient(135deg,var(--primary),#f43f5e)';
  if (member.avatar_type === 'upload' && member.avatar_data) {
    var img = document.createElement('img');
    img.src = member.avatar_data;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    av.appendChild(img);
  } else if (member.avatar_type === 'preset' && member.avatar_data) {
    var preset = AVATAR_PRESETS.find(function(p){ return p.key === member.avatar_data; });
    if (preset) av.style.background = preset.bg;
    av.textContent = _ini(member.fname, member.lname);
  } else {
    av.textContent = _ini(member.fname, member.lname);
  }
}

// Apply avatar to the preview circle inside the modal
function _applyPreview(type, data, initials) {
  var prev = _gel('av-preview');
  if (!prev) return;
  if (type === 'upload') {
    prev.style.background = '#111';
    prev.innerHTML = '<img src="' + data + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  } else {
    var preset = AVATAR_PRESETS.find(function(p){ return p.key === data; });
    prev.style.background = preset ? preset.bg : 'linear-gradient(135deg,var(--primary),#8b5cf6)';
    prev.innerHTML = '';
    prev.textContent = initials || '?';
  }
}

window.openAvatarModal = async function openAvatarModal() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  _avatarPending = null;

  // Load current member data to pre-populate preview
  var rows = await qry('SELECT * FROM members WHERE id=?', [cu.member_id]);
  var m = rows && rows[0];
  if (!m) return;
  var initials = _ini(m.fname, m.lname);

  // Pre-populate preview with current avatar
  var prev = _gel('av-preview');
  if (prev) applyAvatarEl(prev, m, false);

  // Build preset grid
  var grid = _gel('av-preset-grid');
  if (grid) {
    var currentKey = m.avatar_type === 'preset' ? m.avatar_data : null;
    grid.innerHTML = AVATAR_PRESETS.map(function(p) {
      var selected = p.key === currentKey;
      return '<div onclick="selectPreset(&quot;' + p.key + '&quot;,&quot;' + initials + '&quot;)" title="' + p.label + '" ' +
        'style="width:100%;aspect-ratio:1;border-radius:50%;background:' + p.bg + ';' +
        'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;' +
        'cursor:pointer;border:3px solid ' + (selected ? '#fff' : 'transparent') + ';' +
        'box-shadow:' + (selected ? '0 0 0 3px var(--primary)' : 'none') + ';' +
        'transition:all .15s" id="av-preset-' + p.key + '">' +
        initials + '</div>';
    }).join('');
  }

  // Reset upload error
  var err = _gel('av-upload-error'); if (err) { err.style.display='none'; err.textContent=''; }
  var fi  = _gel('av-file-input');  if (fi) fi.value = '';

  switchAvatarTab('upload');
  if (typeof openM === 'function') openM('mo-avatar');
};

window.switchAvatarTab = function switchAvatarTab(tab) {
  var tabUpload  = _gel('av-tab-upload');
  var tabPreset  = _gel('av-tab-preset');
  var btnUpload  = _gel('av-tab-btn-upload');
  var btnPreset  = _gel('av-tab-btn-preset');
  if (tabUpload) tabUpload.style.display = tab === 'upload' ? '' : 'none';
  if (tabPreset) tabPreset.style.display = tab === 'preset' ? '' : 'none';
  if (btnUpload) {
    btnUpload.style.borderBottomColor = tab === 'upload' ? 'var(--primary)' : 'transparent';
    btnUpload.style.color = tab === 'upload' ? 'var(--text)' : 'var(--text-muted)';
    btnUpload.style.fontWeight = tab === 'upload' ? '700' : '400';
  }
  if (btnPreset) {
    btnPreset.style.borderBottomColor = tab === 'preset' ? 'var(--primary)' : 'transparent';
    btnPreset.style.color = tab === 'preset' ? 'var(--text)' : 'var(--text-muted)';
    btnPreset.style.fontWeight = tab === 'preset' ? '700' : '400';
  }
};

window.selectPreset = function selectPreset(key, initials) {
  _avatarPending = { type: 'preset', data: key };
  // Update preview
  _applyPreview('preset', key, initials);
  // Highlight selected tile
  AVATAR_PRESETS.forEach(function(p) {
    var tile = _gel('av-preset-grid') && _gel('av-preset-grid').children[AVATAR_PRESETS.indexOf(p)];
    if (tile) {
      tile.style.border = p.key === key ? '3px solid #fff' : '3px solid transparent';
      tile.style.boxShadow = p.key === key ? '0 0 0 3px var(--primary)' : 'none';
    }
  });
};

window.handleAvatarFile = function handleAvatarFile(input) {
  var file = input.files && input.files[0];
  var err  = _gel('av-upload-error');
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    if (err) { err.textContent = 'File too large — max 8MB.'; err.style.display = ''; }
    input.value = '';
    return;
  }
  if (!file.type.match(/^image\//)) {
    if (err) { err.textContent = 'Please select an image file (JPG, PNG, GIF).'; err.style.display = ''; }
    input.value = '';
    return;
  }
  if (err) { err.style.display = 'none'; err.textContent = ''; }

  // Show loading state in preview
  var prev = _gel('av-preview');
  if (prev) { prev.textContent = '⏳'; prev.style.background = 'var(--surface2)'; }

  var reader = new FileReader();
  reader.onload = function(e) {
    // Compress & resize via canvas before storing
    var img = new Image();
    img.onload = function() {
      var MAX = 300; // max 300×300px — plenty for an avatar
      var w = img.width, h = img.height;
      var scale = Math.min(1, MAX / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // Try quality 0.82 first; if still > 200KB, reduce further
      var base64 = canvas.toDataURL('image/jpeg', 0.82);
      if (base64.length > 200 * 1024) base64 = canvas.toDataURL('image/jpeg', 0.65);
      if (base64.length > 150 * 1024) base64 = canvas.toDataURL('image/jpeg', 0.5);

      _avatarPending = { type: 'upload', data: base64 };
      _applyPreview('upload', base64, null);

      // Show compressed size hint
      var kb = Math.round(base64.length * 0.75 / 1024); // rough bytes from base64
      if (err) { err.style.display = ''; err.style.color = 'var(--success)'; err.style.background = 'rgba(34,197,94,.1)'; err.textContent = 'Image ready — approx ' + kb + ' KB after compression.'; }
    };
    img.onerror = function() {
      if (err) { err.textContent = 'Could not read image. Please try another file.'; err.style.display = ''; err.style.color = '#ef4444'; err.style.background = 'rgba(239,68,68,.1)'; }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveAvatar = async function saveAvatar() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  if (!_avatarPending) { toast('Please choose or upload an avatar first.', 'error'); return; }

  var btn   = _gel('av-save-btn');
  var errEl = _gel('av-upload-error');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }
  if (errEl) { errEl.style.display = 'none'; }

  try {
    // Use FormData + multipart POST to bypass JSON body size limits
    var fd = new FormData();
    fd.append('member_id',   cu.member_id);
    fd.append('avatar_type', _avatarPending.type);

    if (_avatarPending.type === 'preset') {
      fd.append('avatar_data', _avatarPending.data);
    } else {
      // Convert base64 data URI to a Blob so it travels as a real file upload
      var dataUri  = _avatarPending.data;
      var parts    = dataUri.split(',');
      var mime     = parts[0].match(/:(.*?);/)[1];
      var byteStr  = atob(parts[1]);
      var arr      = new Uint8Array(byteStr.length);
      for (var i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      var blob = new Blob([arr], { type: mime });
      fd.append('avatar_file', blob, 'avatar.jpg');
    }

    var res  = await fetch(API + '?action=save_avatar', { method: 'POST', body: fd });
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch(e) { throw new Error('Server error: ' + text.slice(0,200)); }
    if (!res.ok || !data.success) throw new Error(data.error || 'Save failed — unknown server error.');

    // Refresh avatar in profile header and topbar nav
    var rows = await qry('SELECT * FROM members WHERE id=?', [cu.member_id]);
    var m    = rows && rows[0];
    if (m) {
      var profileAv = _gel('up-avatar');
      if (profileAv) applyAvatarEl(profileAv, m, true);
      // Update top-right nav avatar for all types (upload, preset, initials)
      var navAv = _gel('avatar');
      if (navAv) _applyTopbarAvatar(m);
      // Persist avatar data in session so refresh restores it
      cu.fname = m.fname; cu.lname = m.lname;
      cu.avatar_type = m.avatar_type;
      // Don't store avatar_data in session — base64 images are too large for localStorage
      window.currentUser = cu; saveSession(cu);
    }

    if (typeof closeM === 'function') closeM('mo-avatar');
    toast('Avatar updated! 🎨', 'success');
    _avatarPending = null;

  } catch(e) {
    if (errEl) {
      errEl.style.display = '';
      errEl.style.color = '#ef4444';
      errEl.style.background = 'rgba(239,68,68,.1)';
      errEl.textContent = '❌ ' + (e.message || 'Save failed. Please try a smaller image.');
    }
    toast('Save failed — ' + (e.message || 'unknown error'), 'error');
  }

  if (btn) { btn.disabled = false; btn.textContent = '💾 Save Avatar'; }
};

// Legacy stub — kept so any old onclick="changeAvatar()" still works
window.changeAvatar = function changeAvatar() { openAvatarModal(); };

// ════════════════════════════════════════════════════════════
//  REGISTER — Customer self-signup with plan selection
// ════════════════════════════════════════════════════════════
window.openRegister = async function openRegister() {
  var plans = await qry('SELECT id,name,price FROM plans ORDER BY price');
  var rp = _gel('rg-plan');
  if (rp) {
    rp.innerHTML = '<option value="">— Select a Plan (optional) —</option>' +
      plans.map(function(p) {
        return '<option value="' + p.id + '">' + p.name + ' — ' + _fm(p.price) + '</option>';
      }).join('');
  }
  var ri = _gel('rg-plan-info'); if (ri) ri.style.display = 'none';
  if (typeof openM === 'function') openM('mo-register');
};

window.fillRegPlan = async function fillRegPlan() {
  var pid = _gv('rg-plan');
  var info = _gel('rg-plan-info');
  var det  = _gel('rg-plan-details');
  if (!pid) { if (info) info.style.display = 'none'; return; }
  var plan = (await qry('SELECT * FROM plans WHERE id=?', [pid]))[0];
  if (plan && info && det) {
    var s = new Date().toISOString().split('T')[0];
    var eDate = new Date(); eDate.setDate(eDate.getDate() + parseInt(plan.duration));
    var e = eDate.toISOString().split('T')[0];
    det.innerHTML =
      '<b style="color:var(--primary);font-size:13px">' + plan.name + '</b>' +
      ' &nbsp;|&nbsp; <b style="color:var(--success)">' + _fm(plan.price) + '</b>' +
      ' &nbsp;|&nbsp; ' + plan.duration + ' days<br>' +
      '<span style="color:var(--text-muted)">📅 ' + s + ' → ' + e + '</span><br>' +
      (plan.features ? '<span style="color:var(--text)">✅ ' + plan.features.split(',').map(function(f){ return f.trim(); }).join(' &nbsp;•&nbsp; ✅ ') + '</span>' : '') +
      (plan.description ? '<br><span style="color:var(--text-muted);font-style:italic">' + plan.description + '</span>' : '');
    info.style.display = '';
  }
};

window.rMS = async function rMS(s) {
  if (!s) s = '';
  var sql = 'SELECT ms.*, m.fname, m.lname, p.name as pn FROM memberships ms ' +
    'JOIN members m ON m.id=ms.member_id JOIN plans p ON p.id=ms.plan_id WHERE 1=1';
  var pr = [];
  if (s) { sql += ' AND (m.fname LIKE ? OR m.lname LIKE ? OR p.name LIKE ?)'; pr.push('%'+s+'%','%'+s+'%','%'+s+'%'); }
  sql += ' ORDER BY ms.created_at DESC';
  var rows = await qry(sql, pr);
  var tbl = _gel('tbl-ms');
  if (!tbl) return;
  var isAdmin = window.currentUser && window.currentUser.role === 'admin';
  tbl.innerHTML = rows.length ? rows.map(function(r) {
    return '<tr>' +
      '<td><div class="fc"><div class="mav">' + _ini(r.fname,r.lname) + '</div>' + r.fname + ' ' + r.lname + '</div></td>' +
      '<td>' + r.pn + '</td>' +
      '<td>' + _fd(r.start_date) + '</td>' +
      '<td>' + _fd(r.end_date) + '</td>' +
      '<td style="color:var(--success);font-weight:600">' + _fm(r.amount) + '</td>' +
      '<td>' + _sbadge(r.status) + '</td>' +
      '<td><div style="display:flex;gap:6px">' +
      (isAdmin ? '<button class="btn btn-sm btn-s" onclick="editMS(' + r.id + ')" title="Edit / Change Plan">✏️ Edit</button>' : '') +
      '<button class="btn btn-sm btn-d" onclick="delMS(' + r.id + ')">🗑</button>' +
      '</div></td></tr>';
  }).join('') : '<tr><td colspan="7"><div class="empty"><div class="empty-ico">🎫</div><p>No memberships</p></div></td></tr>';
};

window.editMS = async function editMS(id) {
  if (!window.currentUser || window.currentUser.role !== 'admin') { toast('Admin only', 'error'); return; }
  var rows = await qry('SELECT ms.*, m.fname, m.lname FROM memberships ms JOIN members m ON m.id=ms.member_id WHERE ms.id=?', [id]);
  var ms = rows && rows[0];
  if (!ms) return;
  await populateSels();
  var el = function(n){ return _gel(n); };
  el('ems-id').value       = ms.id;
  el('ems-mem-name').value = ms.fname + ' ' + ms.lname;
  el('ems-plan').value     = ms.plan_id;
  el('ems-start').value    = ms.start_date;
  el('ems-end').value      = ms.end_date;
  el('ems-amt').value      = ms.amount;
  el('ems-st').value       = ms.status;
  el('ems-notes').value    = ms.notes || '';
  if (typeof openM === 'function') openM('mo-edit-ms');
};

window.fillEditMsPlan = async function fillEditMsPlan() {
  var pid  = _gv('ems-plan');
  var plan = pid ? (await qry('SELECT * FROM plans WHERE id=?', [pid]))[0] : null;
  if (!plan) return;
  var s = _gv('ems-start') || _td();
  var e = new Date(s); e.setDate(e.getDate() + parseInt(plan.duration));
  var me = _gel('ems-end'); if (me) me.value = e.toISOString().split('T')[0];
  var ma = _gel('ems-amt'); if (ma) ma.value = plan.price;
};

window.saveMS = async function saveMS() {
  var id = _gv('ems-id');
  if (!id) return;
  await run(
    'UPDATE memberships SET plan_id=?,start_date=?,end_date=?,amount=?,status=?,notes=? WHERE id=?',
    [_gv('ems-plan'),_gv('ems-start'),_gv('ems-end'),_gv('ems-amt'),_gv('ems-st'),_gv('ems-notes'),id]
  );
  if (typeof closeM === 'function') closeM('mo-edit-ms');
  toast('Membership updated ✅', 'success');
  await Promise.all([rMS(), rMembers(), dash()]);
};

window.delMS = async function delMS(id) {
  if (!confirm('Delete this membership record?')) return;
  await run('DELETE FROM memberships WHERE id=?', [id]);
  toast('Membership deleted', 'info');
  await Promise.all([rMS(), rMembers(), dash()]);
};

// ════════════════════════════════════════════════════════════
//  CLASSES
// ════════════════════════════════════════════════════════════
window.rClasses = async function rClasses() {
  var cu      = window.currentUser || {};
  var role    = cu.role || '';
  var isAdmin = role === 'admin';
  var isUser  = role === 'user';
  var isTrainer = role === 'trainer';


  var trainerView = _gel('cls-trainer-view');
  var adminView   = _gel('cls-admin-view');
  var userView    = _gel('cls-user-view');
  if (trainerView) trainerView.style.display = isTrainer ? '' : 'none';
  if (adminView)   adminView.style.display   = (isTrainer || isUser) ? 'none' : '';
  if (userView)    userView.style.display    = isUser ? '' : 'none';

  if (isTrainer) { renderTrainerClasses(); return; }

  var days     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  // ── USER VIEW: all classes with self-booking ──────────────────
  if (isUser) {
    var mid = cu.member_id;

    // Trainer info card (keep existing logic)
    var trainerCard = _gel('user-trainer-card');
    if (trainerCard && mid) {
      var memberRow = await qry('SELECT trainer_id FROM members WHERE id=?', [mid]);
      var assignedTid = memberRow && memberRow[0] ? memberRow[0].trainer_id : null;
      if (assignedTid) {
        var trRows = await qry('SELECT * FROM staff WHERE id=?', [assignedTid]);
        var trainerInfo = trRows && trRows[0] ? trRows[0] : null;
        if (trainerInfo) {
          var ini = ((trainerInfo.fname||'')[0]||'').toUpperCase() + ((trainerInfo.lname||'')[0]||'').toUpperCase();
          trainerCard.innerHTML =
            '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;align-items:center;gap:18px">' +
              '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#f43f5e);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;flex-shrink:0">' + ini + '</div>' +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-size:18px;font-weight:800;margin-bottom:2px">' + (trainerInfo.fname||'') + ' ' + (trainerInfo.lname||'') + '</div>' +
                '<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:8px">' + (trainerInfo.role||'Trainer') + '</div>' +
              '</div>' +
              '<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:var(--success);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0">Your Trainer</div>' +
            '</div>';
        } else {
          trainerCard.innerHTML = '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;color:var(--text-muted);font-size:13px">No trainer assigned yet. Contact reception.</div>';
        }
      } else {
        trainerCard.innerHTML = '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;color:var(--text-muted);font-size:13px">No trainer assigned yet. Contact reception.</div>';
      }
    }

    // Fetch ONLY the assigned trainer's classes with enrollment counts
    var _cr = await apiFetch({ action: 'peak_dashboard' }).catch(function(){ return {}; });
    var allCls = (_cr && _cr.all_classes) ? _cr.all_classes : [];

    // Filter to only this member's assigned trainer's classes
    var memberRow2 = await qry('SELECT trainer_id FROM members WHERE id=?', [mid]);
    var assignedTid2 = memberRow2 && memberRow2[0] ? memberRow2[0].trainer_id : null;
    var allCls = assignedTid2
      ? allCls.filter(function(c){ return parseInt(c.trainer_id) === parseInt(assignedTid2); })
      : [];

    // Fetch member's current bookings
    var myBookings = [];
    if (mid) {
      myBookings = await qry('SELECT class_id, status FROM class_enrollments WHERE member_id=?', [mid]);
    }
    var myBookingMap = {};
    myBookings.forEach(function(b){ myBookingMap[b.class_id] = b.status; });

    // Render weekly grid with Book/Cancel buttons
    var sg = _gel('sched-grid-user');
    if (!sg) return;

    if (!assignedTid2) {
      sg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">' +
        '<div style="font-size:32px;margin-bottom:10px">👤</div>' +
        '<div style="font-size:14px;font-weight:600">No trainer assigned yet</div>' +
        '<div style="font-size:12px;margin-top:4px">Contact reception to be assigned a personal trainer.</div>' +
        '</div>';
      return;
    }

    sg.innerHTML = days.map(function(d) {
      var dc = allCls.filter(function(c){ return c.day === d; });
      var isToday = d === todayDow;
      return '<div class="sched-day' + (isToday ? ' today' : '') + '">' +
        '<div class="sched-day-label">' + d.slice(0,3).toUpperCase() + (isToday ? ' \u00B7 TODAY' : '') + '</div>' +
        '<div class="sched-day-body">' +
        (dc.length ? dc.map(function(c) {
          var parts = (c.time||'00:00').split(':');
          var h = parseInt(parts[0]), m = parts[1]||'00';
          var timeStr = (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
          var pct  = parseInt(c.fill_pct || 0);
          var conf = parseInt(c.confirmed || 0);
          var isFull = c.capacity > 0 && conf >= c.capacity;
          var myStatus = myBookingMap[c.id];

          var bookingBtn = '';
          if (myStatus === 'confirmed') {
            bookingBtn = '<button onclick="cancelBooking(' + c.id + ')" style="margin-top:6px;width:100%;padding:4px 0;border-radius:5px;border:none;background:rgba(239,68,68,.15);color:#ef4444;font-size:10px;font-weight:700;cursor:pointer">\u2713 Booked \u00B7 Cancel</button>';
          } else if (myStatus === 'waitlisted') {
            bookingBtn = '<button onclick="cancelBooking(' + c.id + ')" style="margin-top:6px;width:100%;padding:4px 0;border-radius:5px;border:none;background:rgba(234,179,8,.12);color:#eab308;font-size:10px;font-weight:700;cursor:pointer">\u23F3 Waitlisted \u00B7 Cancel</button>';
          } else if (isFull) {
            bookingBtn = '<button onclick="bookClass(' + c.id + ')" style="margin-top:6px;width:100%;padding:4px 0;border-radius:5px;border:none;background:rgba(249,115,22,.12);color:#f97316;font-size:10px;font-weight:700;cursor:pointer">Join Waitlist</button>';
          } else {
            bookingBtn = '<button onclick="bookClass(' + c.id + ')" style="margin-top:6px;width:100%;padding:4px 0;border-radius:5px;border:none;background:rgba(249,115,22,.9);color:#fff;font-size:10px;font-weight:700;cursor:pointer">Book Class</button>';
          }

          var barClr = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : '#22c55e';
          var fillBar = '<div style="margin-top:4px;height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + barClr + ';border-radius:2px"></div></div>' +
            '<div style="font-size:9px;color:var(--text-muted);margin-top:1px;font-family:monospace">' + conf + '/' + c.capacity + '</div>';

          return '<div class="cls-block">' +
            '<div class="cls-time">' + timeStr + '</div>' +
            '<div class="cls-name">' + c.name + '</div>' +
            '<div class="cls-det">\u23F1 ' + (c.duration||60) + ' min</div>' +
            '<div class="cls-det">\uD83D\uDC64 ' + (c.trainer_name||'\u2014') + '</div>' +
            fillBar + bookingBtn +
          '</div>';
        }).join('') : '<div class="sched-empty">\u2014</div>') +
        '</div></div>';
    }).join('');

    return;
  }

  // ── ADMIN VIEW ─────────────────────────────────────────────────
  var _clsRes = await apiFetch({ action: 'peak_dashboard' }).catch(function(){ return {}; });
  var cls = (_clsRes && _clsRes.all_classes) ? _clsRes.all_classes : [];
  var sg  = _gel('sched-grid');
  if (!sg) return;


  // ── ADMIN / non-user: full weekly schedule ──
  sg.innerHTML = days.map(function(d) {
    var dc      = cls.filter(function(c){ return c.day === d; });
    var isToday = d === todayDow;
    return '<div class="sched-day' + (isToday ? ' today' : '') + '">' +
      '<div class="sched-day-label">' + d.slice(0,3).toUpperCase() + (isToday ? ' \u00B7 Today' : '') + '</div>' +
      '<div class="sched-day-body">' +
      (dc.length ? dc.map(function(c) {
        var parts   = (c.time||'00:00').split(':');
        var h = parseInt(parts[0]), m = parts[1]||'00';
        var timeStr = (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
        var trainerLine = c.trainer_name && c.trainer_name.trim()
          ? '<div class="cls-det" style="color:var(--primary);font-weight:600">\uD83D\uDC64 ' + c.trainer_name + '</div>'
          : '<div class="cls-det" style="color:var(--warning);font-style:italic">\u26A0\uFE0F No instructor</div>';
        var pct  = parseInt(c.fill_pct  || 0);
        var conf = parseInt(c.confirmed || 0);
        var wait = parseInt(c.waitlisted|| 0);
        var barClr = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 60 ? '#eab308' : '#22c55e';
        var statusTag = pct >= 100
          ? '<div style="font-size:9px;font-weight:800;color:#ef4444;margin-top:2px">\uD83D\uDD34 FULL' + (wait>0?' +'+wait+' wait':'') + '</div>'
          : (pct >= 80 || wait > 0)
            ? '<div style="font-size:9px;font-weight:800;color:#f97316;margin-top:2px">\u26A0\uFE0F ' + pct + '%' + (wait>0?' +'+wait+' wait':'') + '</div>'
            : '';
        var fillBar = '<div style="margin-top:5px">' +
          '<div style="height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden">' +
          '<div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + barClr + ';border-radius:2px"></div></div>' +
          '<div style="font-size:9px;color:var(--text-muted);margin-top:1px;font-family:monospace">' + conf + '/' + c.capacity + '</div></div>';
        return '<div class="cls-block">' +
          (isAdmin ? '<button class="cls-del" onclick="delClass(' + c.id + ')" title="Delete">\u2715</button><button onclick="viewRoster(' + c.id + ',\'' + c.name.replace(/'/g,"\\'") + '\')" title="View Roster" style="position:absolute;top:6px;right:26px;background:rgba(99,102,241,.2);border:none;border-radius:4px;color:#818cf8;font-size:11px;padding:2px 5px;cursor:pointer">\uD83D\uDC65</button>' : '') +
          '<div class="cls-time">' + timeStr + '</div>' +
          '<div class="cls-name">' + c.name + '</div>' +
          '<div class="cls-det">\u23F1 ' + (c.duration||60) + ' min</div>' +
          trainerLine + fillBar + statusTag +
          '</div>';
      }).join('') : '<div class="sched-empty">\u2014</div>') +
      '</div></div>';
  }).join('');

  var tbl = _gel('tbl-cls'); if (tbl) tbl.innerHTML = '';
  // (All Classes table removed — schedule grid is the single source of truth)
  if (false) {
    tblAdmin.innerHTML = cls.length ? cls.map(function(c) {
      var parts   = (c.time||'00:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      var timeStr = (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
      var instrHtml = c.trainer_name && c.trainer_name.trim()
        ? '<span style="color:var(--success);font-weight:600">\uD83D\uDC64 ' + c.trainer_name + '</span>'
        : '<span style="color:var(--warning);font-style:italic">\u26A0\uFE0F Unassigned</span>';
      var pct  = parseInt(c.fill_pct  || 0);
      var conf = parseInt(c.confirmed || 0);
      var wait = parseInt(c.waitlisted|| 0);
      var barClr = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f97316' : pct >= 60 ? '#eab308' : '#22c55e';
      var badge = pct >= 100
        ? '<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:5px;background:rgba(239,68,68,.15);color:#ef4444">FULL' + (wait>0?' +'+wait:'') + '</span>'
        : pct >= 80
          ? '<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:5px;background:rgba(249,115,22,.15);color:#f97316">' + pct + '%' + (wait>0?' +'+wait+' wait':'') + '</span>'
          : '<span style="font-size:11px;color:var(--text-muted)">' + conf + '/' + c.capacity + '</span>';
      var fillBar = '<div style="margin-top:3px;height:4px;width:72px;background:var(--border);border-radius:2px;overflow:hidden">' +
        '<div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + barClr + '"></div></div>';
      return '<tr>' +
        '<td style="font-weight:600">' + c.name + '</td>' +
        '<td><span class="badge pending" style="font-size:10px">' + c.day + '</span></td>' +
        '<td style="font-weight:700;color:var(--primary)">' + timeStr + '</td>' +
        '<td style="color:var(--text-muted)">' + (c.duration||60) + ' min</td>' +
        '<td>' + badge + fillBar + '</td>' +
        '<td>' + instrHtml + '</td>' +
        '<td style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-s" onclick="editClass(' + c.id + ')">\u270F\uFE0F Edit</button>' +
          '<button class="btn btn-sm btn-p" onclick="pkOpenAssign(' + c.id + ',event)" style="background:var(--info)">\uD83D\uDC64 Assign</button>' +
          '<button class="btn btn-sm" onclick="viewRoster(' + c.id + ',\'' + c.name.replace(/'/g,"\\'") + '\')" style="background:rgba(99,102,241,.2);color:#818cf8">\uD83D\uDC65 Roster</button>' +
          '<button class="btn btn-sm btn-d" onclick="delClass(' + c.id + ')">\uD83D\uDDD1</button>' +
        '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">No classes yet — click ➕ Add Class</td></tr>';
  }
  // Update overflow badge in nav
  if (typeof updateOverflowBadge === 'function') updateOverflowBadge(cls);
  if (isAdmin) { rTrainerAssignments(); renderTrainerSchedules(); }
};

window.renderTrainerSchedules = async function renderTrainerSchedules() {
  var wrap = _gel('trainer-sched-section');
  if (!wrap) return;

  var trainers = await qry(
    "SELECT id, fname, lname, schedule FROM staff WHERE role='Trainer' ORDER BY fname"
  );
  if (!trainers || !trainers.length) { wrap.innerHTML = ''; return; }

  var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var abbr = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  wrap.innerHTML =
    '<div style="font-size:14px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:10px">' +
      '<span>🗓 Trainer Schedules</span>' +
      '<span style="font-size:11px;font-weight:400;color:var(--text-muted)">Set working days & shift hours for each trainer</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">' +
    trainers.map(function(t) {
      var sched    = parseSchedule(t.schedule);
      var workDays = sched ? sched.days : [];
      var shiftStr, unset, needsTime;
      if (!sched) {
        unset = true; needsTime = false;
        shiftStr = '';
      } else if (!sched.hasTime) {
        unset = false; needsTime = true;
        shiftStr = 'Days set — add shift hours';
      } else {
        unset = false; needsTime = false;
        shiftStr = sched.start + ' – ' + sched.end;
      }

      var dayDots = days.map(function(d, i) {
        var isWork    = workDays.indexOf(d) !== -1;
        var isToday   = d === todayDow;
        var cls = 'tr-sched-day-dot ' + (isWork ? (isToday ? 'today-on' : 'on') : (isToday ? 'today-off' : 'off'));
        return '<div class="' + cls + '">' + abbr[i] + '</div>';
      }).join('');

      return '<div class="tr-sched-card">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          '<div class="mav" style="background:linear-gradient(135deg,var(--info),#8b5cf6);flex-shrink:0">' + _ini(t.fname,t.lname) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:14px">' + t.fname + ' ' + t.lname + '</div>' +
            '<div style="font-size:12px;color:' + (unset ? 'var(--danger)' : needsTime ? 'var(--warning)' : 'var(--success)') + ';font-weight:600">' +
              (unset ? '⚠️ No schedule set' : needsTime ? '🕐 Add shift hours to enable filtering' : '🕐 ' + shiftStr) +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-s" onclick="openTrainerSchedModal(' + t.id + ')" style="flex-shrink:0">⚙️ Set</button>' +
        '</div>' +
        '<div style="display:flex;gap:4px">' + dayDots + '</div>' +
        (unset ? '<div style="margin-top:10px;font-size:11px;color:var(--danger);padding:6px 10px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:7px">No schedule data — click ⚙️ Set to configure</div>' :
         needsTime ? '<div style="margin-top:10px;font-size:11px;color:var(--warning);padding:6px 10px;background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.2);border-radius:7px">Working days detected from existing data — click ⚙️ Set to add shift start/end times</div>' : '') +
      '</div>';
    }).join('') +
    '</div>';
};

// ── Auto-calculate shift from assigned classes ────────────────
async function calcSchedFromClasses(tid) {
  // Get all classes assigned to this trainer
  var cls = await qry(
    'SELECT c.day, c.time, c.duration FROM class_trainers ct ' +
    'JOIN classes c ON c.id=ct.class_id WHERE ct.staff_id=?', [tid]
  );
  if (!cls || !cls.length) return null;

  // Collect working days
  var days = [];
  cls.forEach(function(c) {
    if (days.indexOf(c.day) === -1) days.push(c.day);
  });
  days.sort(function(a,b){ return _DAY_ORDER.indexOf(a) - _DAY_ORDER.indexOf(b); });

  // Find earliest start and latest end across ALL assigned classes
  var minStart = 24 * 60; // start very high
  var maxEnd   = 0;
  cls.forEach(function(c) {
    var start = timeToMins(c.time);
    var end   = start + (parseInt(c.duration) || 60);
    if (start < minStart) minStart = start;
    if (end   > maxEnd)   maxEnd   = end;
  });

  // Convert back to HH:MM
  function minsToTime(m) {
    var h = Math.floor(m / 60);
    var min = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
  }

  return {
    days:    days,
    start:   minsToTime(minStart),
    end:     minsToTime(maxEnd),
    hasTime: true
  };
}

window.openTrainerSchedModal = async function openTrainerSchedModal(tid) {
  var rows = await qry('SELECT id, fname, lname, schedule FROM staff WHERE id=?', [tid]);
  var t = rows && rows[0];
  if (!t) return;

  _gel('ts-id').value = t.id;
  _gel('ts-trainer-name').textContent = t.fname + ' ' + t.lname;

  // Reset all checkboxes
  document.querySelectorAll('.ts-day-cb').forEach(function(cb) { cb.checked = false; });

  // Auto-calculate from assigned classes first
  var autoSched = await calcSchedFromClasses(t.id);
  var sched     = autoSched || parseSchedule(t.schedule);

  var warn = _gel('ts-class-warning');

  if (autoSched) {
    // Fill days from class assignments
    autoSched.days.forEach(function(d) {
      var cb = document.querySelector('.ts-day-cb[value="' + d + '"]');
      if (cb) cb.checked = true;
    });
    _gel('ts-start').value = autoSched.start;
    _gel('ts-end').value   = autoSched.end;

    // Show a green info note
    if (warn) {
      warn.style.display    = '';
      warn.style.background = 'rgba(34,197,94,.08)';
      warn.style.borderColor= 'rgba(34,197,94,.3)';
      warn.style.color      = 'var(--success)';
      warn.innerHTML = '✅ <b>Auto-calculated from ' + autoSched.days.length + ' working day' +
        (autoSched.days.length > 1 ? 's' : '') + ' and ' +
        (await qry('SELECT COUNT(*) as c FROM class_trainers WHERE staff_id=?',[t.id]))[0].c +
        ' assigned classes.</b> Shift: ' + autoSched.start + ' – ' + autoSched.end +
        '. You can adjust and click Save.';
    }
  } else if (sched) {
    // Fall back to stored schedule (old format)
    sched.days.forEach(function(d) {
      var cb = document.querySelector('.ts-day-cb[value="' + d + '"]');
      if (cb) cb.checked = true;
    });
    _gel('ts-start').value = sched.start || '09:00';
    _gel('ts-end').value   = sched.end   || '17:00';
    if (warn) {
      warn.style.display    = '';
      warn.style.background = 'rgba(59,130,246,.08)';
      warn.style.borderColor= 'rgba(59,130,246,.3)';
      warn.style.color      = 'var(--info)';
      warn.innerHTML = '📋 <b>No classes assigned yet.</b> Days loaded from stored schedule. ' +
        'Assign classes first for auto-calculation.';
    }
  } else {
    // No data at all
    _gel('ts-start').value = '09:00';
    _gel('ts-end').value   = '17:00';
    if (warn) {
      warn.style.display    = '';
      warn.style.background = 'rgba(234,179,8,.08)';
      warn.style.borderColor= 'rgba(234,179,8,.3)';
      warn.style.color      = 'var(--warning)';
      warn.innerHTML = '⚠️ <b>No classes assigned yet.</b> Assign classes to this trainer first, then the schedule will auto-calculate.';
    }
  }

  if (typeof openM === 'function') openM('mo-trainer-sched');
};

async function updateSchedWarning(tid, sched) {
  var warn = _gel('ts-class-warning'); if (!warn) return;
  if (!sched) { warn.style.display = 'none'; return; }
  // Check for classes assigned to this trainer that fall outside their schedule
  var clsRows = await qry(
    'SELECT c.name, c.day, c.time, c.duration FROM class_trainers ct ' +
    'JOIN classes c ON c.id=ct.class_id WHERE ct.staff_id=?', [tid]
  );
  var conflicts = (clsRows||[]).filter(function(c) {
    var av = trainerAvailability(sched.days.join(',') + '|' + sched.start + '|' + sched.end, c.day, c.time, c.duration);
    return av !== 'available';
  });
  if (conflicts.length) {
    warn.style.display = '';
    warn.innerHTML = '⚠️ <b>' + conflicts.length + ' assigned class' + (conflicts.length>1?'es':'') + ' outside this schedule:</b><br>' +
      conflicts.map(function(c) {
        var parts = (c.time||'00:00').split(':');
        var h = parseInt(parts[0]), m = parts[1]||'00';
        var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
        return '• ' + c.name + ' (' + c.day + ' ' + ts + ')';
      }).join('<br>');
  } else {
    warn.style.display = 'none';
  }
}

window.saveTrainerSched = async function saveTrainerSched() {
  var tid = _gv('ts-id');
  if (!tid) return;

  var checkedDays = [];
  document.querySelectorAll('.ts-day-cb:checked').forEach(function(cb) {
    checkedDays.push(cb.value);
  });
  if (!checkedDays.length) { toast('Select at least one working day', 'error'); return; }

  var start = _gv('ts-start') || '09:00';
  var end   = _gv('ts-end')   || '17:00';
  if (timeToMins(end) <= timeToMins(start)) { toast('End time must be after start time', 'error'); return; }

  // Store in structured format: "Monday,Tuesday,Wednesday|09:00|17:00"
  var schedStr = checkedDays.join(',') + '|' + start + '|' + end;
  await run('UPDATE staff SET schedule=? WHERE id=?', [schedStr, tid]);

  if (typeof closeM === 'function') closeM('mo-trainer-sched');
  toast('Schedule saved! ✅', 'success');
  rClasses(); // refresh so schedule cards update
};

// ── Auto-set ALL trainers from their assigned classes ─────────
window.autoSetAllTrainers = async function autoSetAllTrainers() {
  var trainers = await qry("SELECT id, fname, lname FROM staff WHERE role='Trainer' ORDER BY fname");
  if (!trainers || !trainers.length) { toast('No trainers found', 'error'); return; }

  var updated = 0, skipped = 0;
  for (var i = 0; i < trainers.length; i++) {
    var t     = trainers[i];
    var sched = await calcSchedFromClasses(t.id);
    if (sched && sched.days.length) {
      var schedStr = sched.days.join(',') + '|' + sched.start + '|' + sched.end;
      await run('UPDATE staff SET schedule=? WHERE id=?', [schedStr, t.id]);
      updated++;
    } else {
      skipped++;
    }
  }

  var msg = '✅ ' + updated + ' trainer' + (updated !== 1 ? 's' : '') + ' updated from class assignments.';
  if (skipped) msg += ' ' + skipped + ' skipped (no classes assigned yet).';
  toast(msg, 'success');
  rClasses(); // refresh trainer schedule cards
};

window.rTrainerAssignments = async function rTrainerAssignments() {
  var wrap = _gel('trainer-assignments');
  if (!wrap) return;

  // Get all trainers with their assigned class count from class_trainers
  var rows = await qry(
    "SELECT s.id, s.fname, s.lname, COUNT(ct.id) as total " +
    "FROM staff s LEFT JOIN class_trainers ct ON ct.staff_id=s.id " +
    "WHERE s.role='Trainer' GROUP BY s.id, s.fname, s.lname ORDER BY s.fname"
  );

  if (!rows || !rows.length) { wrap.innerHTML = ''; return; }

  var assigned = rows.filter(function(r){ return parseInt(r.total) > 0; });
  if (!assigned.length) { wrap.innerHTML = ''; return; }

  // Get all class_trainers rows with class details, grouped by staff_id
  var classes = await qry(
    "SELECT ct.staff_id, c.id, c.name, c.day, c.time, c.duration, c.capacity " +
    "FROM class_trainers ct JOIN classes c ON c.id=ct.class_id " +
    "ORDER BY ct.staff_id, CASE c.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 " +
    "WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 " +
    "WHEN 'Saturday' THEN 6 ELSE 7 END, c.time"
  );

  var byTrainer = {};
  classes.forEach(function(c) {
    if (!byTrainer[c.staff_id]) byTrainer[c.staff_id] = [];
    byTrainer[c.staff_id].push(c);
  });

  wrap.innerHTML =
    '<div style="font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
      '<span>📋 Trainer Assignments</span>' +
      '<span style="font-size:11px;font-weight:400;color:var(--text-muted)">' + assigned.length + ' trainer' + (assigned.length !== 1 ? 's' : '') + ' assigned</span>' +
    '</div>' +
    assigned.map(function(t) {
      var tCls = byTrainer[t.id] || [];
      return '<div class="panel" style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          '<div class="mav" style="background:linear-gradient(135deg,var(--info),#8b5cf6);flex-shrink:0">' + _ini(t.fname, t.lname) + '</div>' +
          '<div>' +
            '<div style="font-weight:700">' + t.fname + ' ' + t.lname + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted)">' + tCls.length + ' class' + (tCls.length !== 1 ? 'es' : '') + ' assigned</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-s" style="margin-left:auto" onclick="openAssignTrainer(' + t.id + ')">✏️ Edit</button>' +
        '</div>' +
        '<div style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border)">' +
            '<th style="text-align:left;padding:6px 8px;font-weight:600">Class</th>' +
            '<th style="text-align:left;padding:6px 8px;font-weight:600">Day</th>' +
            '<th style="text-align:left;padding:6px 8px;font-weight:600">Time</th>' +
            '<th style="text-align:left;padding:6px 8px;font-weight:600">Duration</th>' +
            '<th style="text-align:left;padding:6px 8px;font-weight:600">Capacity</th>' +
          '</tr></thead>' +
          '<tbody>' +
          tCls.map(function(c) {
            var parts   = (c.time||'00:00').split(':');
            var h = parseInt(parts[0]), m = parts[1]||'00';
            var timeStr = (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
            return '<tr style="border-bottom:1px solid var(--border);font-size:13px">' +
              '<td style="padding:8px;font-weight:600">' + c.name + '</td>' +
              '<td style="padding:8px"><span class="badge pending" style="font-size:10px">' + c.day + '</span></td>' +
              '<td style="padding:8px;font-weight:700;color:var(--primary)">' + timeStr + '</td>' +
              '<td style="padding:8px;color:var(--text-muted)">' + (c.duration||60) + ' min</td>' +
              '<td style="padding:8px;color:var(--text-muted)">👥 ' + (c.capacity||'—') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div></div>';
    }).join('');
};

window.openAddClass = async function openAddClass() {
  clearAddClass();
  // Pre-load trainers list
  var trainers = await qry("SELECT id, fname, lname, schedule FROM staff WHERE role='Trainer' ORDER BY fname");
  window._allTrainersForClass = trainers; // cache for filtering
  if (typeof openM === 'function') openM('mo-class');
  updateAvailableTrainers();
};

window.clearAddClass = function clearAddClass() {
  var set = function(id, v) { var e = _gel(id); if (e) e.value = v; };
  set('cl-name', '');
  set('cl-day',  'Monday');
  set('cl-time', '');
  set('cl-dur',  '60');
  set('cl-cap',  '20');
  set('cl-trainer', '');
  var hint = _gel('cl-trainer-hint'); if (hint) hint.textContent = '';
};

window.updateAvailableTrainers = function updateAvailableTrainers() {
  var trainers = window._allTrainersForClass || [];
  var day  = (_gel('cl-day')  || {}).value || 'Monday';
  var time = (_gel('cl-time') || {}).value || '';
  var dur  = parseInt((_gel('cl-dur') || {}).value) || 60;
  var sel  = _gel('cl-trainer');
  var hint = _gel('cl-trainer-hint');
  if (!sel) return;

  var available = [], noTime = [], unavailDay = [], unavailTime = [], unset = [];
  trainers.forEach(function(t) {
    var av = trainerAvailability(t.schedule, day, time, dur);
    var name = t.fname + ' ' + t.lname;
    if      (av === 'available')   available.push({ t: t, name: name });
    else if (av === 'no-time')     noTime.push({ t: t, name: name });
    else if (av === 'wrong-day')   unavailDay.push({ t: t, name: name });
    else if (av === 'wrong-time')  unavailTime.push({ t: t, name: name });
    else                           unset.push({ t: t, name: name });
  });

  var prev = sel.value;
  sel.innerHTML = '<option value="">— Assign later —</option>';
  if (available.length) {
    var og1 = document.createElement('optgroup');
    og1.label = '✅ Available on ' + day + ' (' + (time||'any time') + ')';
    available.forEach(function(x) {
      var opt = document.createElement('option');
      opt.value = x.t.id; opt.textContent = x.name;
      og1.appendChild(opt);
    });
    sel.appendChild(og1);
  }
  if (noTime.length) {
    var og5 = document.createElement('optgroup');
    og5.label = '🕐 Works ' + day + ' — shift hours not set yet';
    noTime.forEach(function(x) {
      var opt = document.createElement('option');
      opt.value = x.t.id; opt.textContent = x.name + ' (add shift times)';
      og5.appendChild(opt);
    });
    sel.appendChild(og5);
  }
  if (unavailTime.length) {
    var og2 = document.createElement('optgroup');
    og2.label = '⚠️ Works ' + day + ' but class is outside their shift';
    unavailTime.forEach(function(x) {
      var opt = document.createElement('option');
      opt.value = x.t.id; opt.textContent = x.name + ' (outside shift)';
      og2.appendChild(opt);
    });
    sel.appendChild(og2);
  }
  if (unavailDay.length) {
    var og3 = document.createElement('optgroup');
    og3.label = '❌ Not scheduled on ' + day;
    unavailDay.forEach(function(x) {
      var opt = document.createElement('option');
      opt.value = x.t.id; opt.textContent = x.name + ' (day off)';
      og3.appendChild(opt);
    });
    sel.appendChild(og3);
  }
  if (unset.length) {
    var og4 = document.createElement('optgroup');
    og4.label = '📋 No schedule set yet';
    unset.forEach(function(x) {
      var opt = document.createElement('option');
      opt.value = x.t.id; opt.textContent = x.name;
      og4.appendChild(opt);
    });
    sel.appendChild(og4);
  }
  // Restore previous selection if still in list
  if (prev) sel.value = prev;

  // Update hint text
  if (hint) {
    if (!time) {
      hint.textContent = 'Set a time to see available trainers';
      hint.style.color = 'var(--text-muted)';
    } else if (available.length) {
      hint.textContent = available.length + ' trainer' + (available.length>1?'s':'') + ' available for this slot';
      hint.style.color = 'var(--success)';
    } else if (noTime.length && !available.length) {
      hint.textContent = noTime.length + ' trainer' + (noTime.length>1?'s':'') + ' work on ' + day + ' — open ⚙️ Set to add their shift hours for full availability checking';
      hint.style.color = 'var(--warning)';
    } else if (trainers.length === 0) {
      hint.textContent = 'No trainers in staff — add trainers first';
      hint.style.color = 'var(--warning)';
    } else {
      hint.textContent = 'No trainer is available for this slot — check Trainer Schedules';
      hint.style.color = 'var(--warning)';
    }
  }
};


// ── MEMBER SELF-BOOKING ───────────────────────────────────────
window.bookClass = async function bookClass(classId) {
  var cu = window.currentUser || {};
  var mid = cu.member_id;
  if (!mid) { toast('No member account linked to your profile.', 'error'); return; }

  var res = await apiFetch({ action: 'book_class' }, { class_id: classId, member_id: mid }).catch(function(e){
    toast('Booking failed: ' + e.message, 'error'); return null;
  });
  if (!res) return;

  if (res.already) {
    toast('You are already ' + res.status + ' for this class.', 'info');
  } else if (res.status === 'confirmed') {
    toast('✅ Class booked successfully!', 'success');
  } else {
    toast('⏳ Class is full — you\'ve been added to the waitlist.', 'info');
  }
  rClasses();
};

window.cancelBooking = async function cancelBooking(classId) {
  var cu = window.currentUser || {};
  var mid = cu.member_id;
  if (!mid) return;

  if (!confirm('Cancel your booking for this class?')) return;

  await apiFetch({ action: 'cancel_booking' }, { class_id: classId, member_id: mid }).catch(function(e){
    toast('Cancel failed: ' + e.message, 'error');
  });
  toast('Booking cancelled.', 'info');
  rClasses();
};

// ── ADMIN: VIEW CLASS ROSTER ──────────────────────────────────
window.viewRoster = async function viewRoster(classId, className) {
  var mo = _gel('mo-roster');
  if (!mo) return;

  _gel('roster-title').textContent = '\uD83D\uDC65 ' + className + ' \u2014 Enrolled Members';
  _gel('roster-body').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</td></tr>';
  mo.style.display = 'flex';

  var res = await apiFetch({ action: 'get_enrollments', class_id: classId }).catch(function(){ return {}; });
  var rows = (res && res.enrollments) ? res.enrollments : [];

  if (!rows.length) {
    _gel('roster-body').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted)">No members enrolled yet</td></tr>';
    return;
  }

  _gel('roster-body').innerHTML = rows.map(function(r) {
    var badge = r.status === 'confirmed'
      ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;background:rgba(34,197,94,.15);color:#22c55e">Confirmed</span>'
      : '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;background:rgba(234,179,8,.15);color:#eab308">Waitlisted</span>';
    var dt = r.enrolled_at ? r.enrolled_at.slice(0,10) : '\u2014';
    return '<tr>' +
      '<td style="font-weight:600">' + (r.member_name||'\u2014') + '</td>' +
      '<td style="color:var(--text-muted);font-size:12px">' + (r.phone||'\u2014') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td style="color:var(--text-muted);font-size:12px">' + dt + '</td>' +
    '</tr>';
  }).join('');
};

window.closeRoster = function closeRoster() {
  var mo = _gel('mo-roster');
  if (mo) mo.style.display = 'none';
};


window.addClass = async function addClass() {
  var name    = (_gv('cl-name') || '').trim();
  var day     = _gv('cl-day');
  var time    = _gv('cl-time');
  var dur     = parseInt(_gv('cl-dur'))  || 60;
  var cap     = parseInt(_gv('cl-cap'))  || 20;
  var trainer = _gv('cl-trainer') || '';
  if (!name) { toast('Class name is required', 'error'); return; }
  if (!time) { toast('Please set a time', 'error'); return; }
  await run(
    'INSERT INTO classes(name,day,time,duration,capacity) VALUES(?,?,?,?,?)',
    [name, day, time, dur, cap]
  );
  // If a trainer was selected, assign them
  if (trainer) {
    var newCls = await qry('SELECT id FROM classes WHERE name=? AND day=? AND time=? ORDER BY id DESC LIMIT 1', [name, day, time]);
    if (newCls && newCls[0]) {
      await run(
        'INSERT IGNORE INTO class_trainers(class_id, staff_id, assigned_date) VALUES(?,?,?)',
        [newCls[0].id, trainer, _td()]
      );
    }
  }
  if (typeof closeM === 'function') closeM('mo-class');
  toast(trainer ? 'Class added with instructor! ✅' : 'Class added! ✅ You can assign an instructor below.', 'success');
  rClasses();
};

window.delClass = async function delClass(id) {
  if (!confirm('Delete this class?')) return;
  // class_trainers rows cascade-delete via FK, no manual cleanup needed
  await run('DELETE FROM classes WHERE id=?', [id]);
  toast('Class deleted', 'info');
  rClasses();
};

window.editClass = async function editClass(id) {
  var rows = await qry('SELECT * FROM classes WHERE id=?', [id]);
  var c = rows && rows[0];
  if (!c) return;
  _gel('ec-id').value   = c.id;
  _gel('ec-name').value = c.name;
  _gel('ec-day').value  = c.day;
  _gel('ec-time').value = c.time;
  _gel('ec-dur').value  = c.duration;
  _gel('ec-cap').value  = c.capacity;
  if (typeof openM === 'function') openM('mo-edit-class');
};

window.saveClass = async function saveClass() {
  var id   = _gv('ec-id');
  var name = (_gv('ec-name') || '').trim();
  var day  = _gv('ec-day');
  var time = _gv('ec-time');
  var dur  = parseInt(_gv('ec-dur'))  || 60;
  var cap  = parseInt(_gv('ec-cap'))  || 1;
  if (!name) { toast('Class name is required', 'error'); return; }
  if (!time) { toast('Please set a time', 'error'); return; }
  await run(
    'UPDATE classes SET name=?, day=?, time=?, duration=?, capacity=? WHERE id=?',
    [name, day, time, dur, cap, id]
  );
  if (typeof closeM === 'function') closeM('mo-edit-class');
  toast('Class updated! ✅', 'success');
  rClasses();
};

// ── Assign Trainer ───────────────────────────────────────────
window.openAssignTrainer = async function openAssignTrainer(preselect) {
  var trainers = await qry("SELECT s.id, s.fname, s.lname FROM staff s WHERE s.role='Trainer' ORDER BY s.fname");
  var sel = _gel('at-trainer');
  if (sel) {
    sel.innerHTML = '<option value="">— Pick a trainer —</option>' +
      trainers.map(function(t) {
        return '<option value="' + t.id + '">' + t.fname + ' ' + t.lname + '</option>';
      }).join('');
    sel.value = preselect ? String(preselect) : '';
  }
  var box = _gel('at-classes');
  if (box) box.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0">Select a trainer first</div>';
  if (typeof openM === 'function') openM('mo-assign-trainer');
  if (preselect) loadAssignClasses();
};

window.loadAssignClasses = async function loadAssignClasses() {
  var tid = _gv('at-trainer');
  var box = _gel('at-classes');
  if (!box) return;
  if (!tid) {
    box.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0">Select a trainer first</div>';
    return;
  }
  // Get trainer's schedule
  var trows = await qry('SELECT fname, lname, schedule FROM staff WHERE id=?', [tid]);
  var trow  = trows && trows[0];
  var sched = trow ? parseSchedule(trow.schedule) : null;

  // Show trainer's schedule summary at top of list
  var schedSummary = '';
  if (sched) {
    var abbr = { Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat',Sunday:'Sun' };
    var dayStr = sched.days.map(function(d){ return abbr[d]||d; }).join(', ');
    schedSummary = '<div style="margin-bottom:10px;padding:10px 12px;background:rgba(249,115,22,.07);border:1px solid rgba(249,115,22,.2);border-radius:8px;font-size:12px">' +
      '<span style="font-weight:700;color:var(--primary)">📅 ' + (trow.fname||'') + '\'s Schedule:</span> ' +
      '<span style="color:var(--text)">' + dayStr + '</span>' +
      ' &nbsp;·&nbsp; <span style="color:var(--text)">' + sched.start + ' – ' + sched.end + '</span>' +
      '</div>';
  } else {
    schedSummary = '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.2);border-radius:8px;font-size:12px;color:var(--warning)">' +
      '⚠️ No schedule set for this trainer. Set it under Trainer Schedules in the Classes page.' +
      '</div>';
  }

  var cls = await apiFetch({ action: 'get', table: 'classes' }).catch(function(){ return []; });
  var assigned = await qry('SELECT class_id FROM class_trainers WHERE staff_id=?', [tid]);
  var assignedIds = assigned.map(function(r){ return parseInt(r.class_id); });

  if (!cls.length) {
    box.innerHTML = schedSummary + '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0">No classes yet — add some first</div>';
    return;
  }

  // Sort classes by availability first, then day, then time
  var dayOrder = { Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:7 };
  cls.sort(function(a,b){
    var aAv = trow ? trainerAvailability(trow.schedule, a.day, a.time, a.duration) : 'unset';
    var bAv = trow ? trainerAvailability(trow.schedule, b.day, b.time, b.duration) : 'unset';
    var order = { available:0, 'wrong-time':1, unset:2, 'wrong-day':3 };
    var oa = order[aAv]||2, ob = order[bAv]||2;
    if (oa !== ob) return oa - ob;
    return (dayOrder[a.day]||8) - (dayOrder[b.day]||8) || a.time.localeCompare(b.time);
  });

  box.innerHTML = schedSummary + cls.map(function(c) {
    var isAssigned = assignedIds.indexOf(parseInt(c.id)) !== -1;
    var parts  = (c.time||'00:00').split(':');
    var h = parseInt(parts[0]), m = parts[1]||'00';
    var timeStr = (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');

    var av     = trow ? trainerAvailability(trow.schedule, c.day, c.time, c.duration) : 'unset';
    var avBadge = '';
    if      (av === 'available')  avBadge = '<span style="font-size:10px;color:var(--success);font-weight:700;margin-left:4px">✅ Available</span>';
    else if (av === 'no-time')    avBadge = '<span style="font-size:10px;color:var(--info);font-weight:700;margin-left:4px">🕐 Add shift hours</span>';
    else if (av === 'wrong-time') avBadge = '<span style="font-size:10px;color:var(--warning);font-weight:700;margin-left:4px">⚠️ Outside shift</span>';
    else if (av === 'wrong-day')  avBadge = '<span style="font-size:10px;color:var(--danger);font-weight:700;margin-left:4px">❌ Day off</span>';
    else                          avBadge = '<span style="font-size:10px;color:var(--text-muted);margin-left:4px">📋 No schedule</span>';

    var borderColor = av === 'available' ? 'var(--primary)' : (av === 'wrong-day' ? 'rgba(239,68,68,.3)' : (av === 'wrong-time' ? 'rgba(234,179,8,.3)' : 'var(--border)'));
    var bg = isAssigned ? 'rgba(99,102,241,.08)' : 'var(--surface)';

    return '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:' + bg + ';border:1px solid ' + borderColor + ';margin-bottom:4px">' +
      '<input type="checkbox" data-id="' + c.id + '" ' + (isAssigned ? 'checked' : '') + ' style="accent-color:var(--primary);width:16px;height:16px;flex-shrink:0">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;flex-wrap:wrap;gap:4px">' + c.name + avBadge + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + c.day + ' · ' + timeStr + ' · ' + (c.duration||60) + ' min</div>' +
      '</div>' +
      (isAssigned ? '<span style="font-size:10px;color:var(--primary);font-weight:700;flex-shrink:0">Assigned</span>' : '') +
      '</label>';
  }).join('');
};

window.assignTrainer = async function assignTrainer() {
  var tid = _gv('at-trainer');
  if (!tid) { toast('Please select a trainer', 'error'); return; }

  var box = _gel('at-classes');
  if (!box) return;
  var boxes = box.querySelectorAll('input[type=checkbox]');
  if (!boxes.length) { toast('No classes available', 'error'); return; }

  var trow  = await qry('SELECT fname, lname FROM staff WHERE id=?', [tid]);
  var tname = trow && trow[0] ? trow[0].fname + ' ' + trow[0].lname : '';
  var today = _td();

  var assigned = 0;
  for (var i = 0; i < boxes.length; i++) {
    var cid     = parseInt(boxes[i].getAttribute('data-id'));
    var checked = boxes[i].checked;
    if (checked) {
      // INSERT IGNORE keeps the UNIQUE constraint safe — no duplicates
      await run(
        'INSERT IGNORE INTO class_trainers(class_id, staff_id, assigned_date) VALUES(?,?,?)',
        [cid, tid, today]
      );
      assigned++;
    } else {
      // Unchecked = remove this trainer from this class
      await run(
        'DELETE FROM class_trainers WHERE class_id=? AND staff_id=?',
        [cid, tid]
      );
    }
  }

  if (typeof closeM === 'function') closeM('mo-assign-trainer');
  toast(assigned + ' class' + (assigned !== 1 ? 'es' : '') + ' assigned to ' + tname + ' ✅', 'success');
  rClasses();
};

// ════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════
window.rPay = async function rPay(s, m) {
  if (!s) s = '';
  if (!m) m = '';
  var sql = 'SELECT pay.*, me.fname, me.lname FROM payments pay JOIN members me ON me.id=pay.member_id WHERE 1=1';
  var pr  = [];
  if (window.currentUser && window.currentUser.role === 'user' && window.currentUser.member_id)
    sql += ' AND pay.member_id=' + window.currentUser.member_id;
  if (s) { sql += ' AND (me.fname LIKE ? OR me.lname LIKE ? OR pay.plan LIKE ?)'; pr.push('%'+s+'%','%'+s+'%','%'+s+'%'); }
  if (m) { sql += ' AND pay.method=?'; pr.push(m); }
  sql += ' ORDER BY pay.created_at DESC';
  var rows = await qry(sql, pr);
  var tbl  = _gel('tbl-pay');
  if (!tbl) return;
  tbl.innerHTML = rows.length ? rows.map(function(r) {
    return '<tr>' +
      '<td><div class="fc"><div class="mav">' + _ini(r.fname,r.lname) + '</div>' + r.fname + ' ' + r.lname + '</div></td>' +
      '<td style="color:var(--success);font-weight:700;font-size:15px">' + _fm(r.amount) + '</td>' +
      '<td><span class="badge ' + (r.method||'cash').toLowerCase() + '">' + (r.method||'—') + '</span></td>' +
      '<td>' + (r.plan||'—') + '</td>' +
      '<td>' + _fd(r.date) + '</td>' +
      '<td style="color:var(--text-muted)">' + (r.note||'—') + '</td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="empty-ico">💳</div><p>No payments</p></div></td></tr>';
};

window.filterPay = function filterPay() {
  rPay((_gel('srch-pay')||{}).value||'', (_gel('flt-method')||{}).value||'');
};

window.addPayment = async function addPayment() {
  if (!_gv('p-mem') || !_gv('p-amt')) { toast('Member and amount required', 'error'); return; }
  await run(
    'INSERT INTO payments(member_id,amount,method,plan,date,note) VALUES(?,?,?,?,?,?)',
    [_gv('p-mem'), _gv('p-amt'), _gv('p-method'), _gv('p-plan'), _gv('p-date'), _gv('p-note')]
  );
  if (typeof closeM === 'function') closeM('mo-payment');
  toast('Payment recorded! 💰', 'success');
  rPay();
  dash();
};

window.addUserPayment = async function addUserPayment() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) { toast('Not authorised', 'error'); return; }
  var amt=(_gv('up-amt')||'').trim(), cardNum=(_gv('up-card-num')||'').replace(/\s/g,'');
  var cardName=(_gv('up-card-name')||'').trim(), cardExp=(_gv('up-card-exp')||'').trim();
  var cardCvv=(_gv('up-card-cvv')||'').trim(), plan=(_gv('up-plan')||'').trim(), date=(_gv('up-date')||'').trim();
  if(!amt||parseFloat(amt)<=0){toast('Please enter a valid amount','error');return;}
  if(!cardName){toast('Cardholder name is required','error');return;}
  if(cardNum.length<13||!/^\d+$/.test(cardNum)){toast('Invalid card number','error');return;}
  if(!/^\d{2}\/\d{2}$/.test(cardExp)){toast('Invalid expiry format (MM/YY)','error');return;}
  if(cardCvv.length<3){toast('Invalid CVV','error');return;}
  await run('INSERT INTO payments(member_id,amount,method,plan,date,note) VALUES(?,?,?,?,?,?)',
    [cu.member_id,parseFloat(amt),'credit_card',plan||'Credit Card Payment',date||_td(),'Card: •••• '+cardNum.slice(-4)]);
  if(typeof closeM==='function') closeM('mo-user-payment');
  var cn=_gel('up-card-num'); if(cn) cn.value='';
  var cv=_gel('up-card-cvv'); if(cv) cv.value='';
  toast('Payment submitted!','success'); rPay(); dash();
};
window.fmtCard=function(input){var v=input.value.replace(/\D/g,'').slice(0,16);var m=v.match(/.{1,4}/g);input.value=m?m.join(' '):v;};
window.fmtExp=function(input){var v=input.value.replace(/\D/g,'').slice(0,4);if(v.length>=3)v=v.slice(0,2)+'/'+v.slice(2);input.value=v;};

// ════════════════════════════════════════════════════════════
//  ATTENDANCE (member check-in)
// ════════════════════════════════════════════════════════════
window.rAtt = async function rAtt(s) {
  var role = window.currentUser ? window.currentUser.role : '';
  var sid  = window.currentUser ? window.currentUser.staff_id : null;

  var trainerView = _gel('att-trainer-view');
  var adminView   = _gel('att-admin-header');
  var userView    = _gel('att-user-view');

  if (role === 'user') {
    if (trainerView) trainerView.style.display = 'none';
    if (adminView)   adminView.style.display   = 'none';
    if (userView)    userView.style.display     = '';
    loadUserAttendance();
    return;
  }

  if (role === 'trainer') {
    if (trainerView) trainerView.style.display = '';
    if (adminView)   adminView.style.display   = 'none';
    if (userView)    userView.style.display     = 'none';
    if (!s) s = '';
    var sql = 'SELECT a.*, m.fname, m.lname FROM attendance a JOIN members m ON m.id=a.member_id WHERE m.trainer_id=?';
    var pr  = [sid];
    if (s) { sql += ' AND (m.fname LIKE ? OR m.lname LIKE ?)'; pr.push('%'+s+'%','%'+s+'%'); }
    sql += ' ORDER BY a.checkin_time DESC LIMIT 100';
    var rows = await qry(sql, pr);
    var tbl  = _gel('tbl-att');
    if (tbl) {
      tbl.innerHTML = rows && rows.length ? rows.map(function(r) {
        var dur = '--';
        if (r.checkout_time) {
          var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
          dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
        }
        var cin = new Date(r.checkin_time);
        var dateStr = cin.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
        var cinStr  = cin.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        return '<tr>' +
          '<td><div class="fc"><div class="mav" style="width:28px;height:28px;font-size:11px">' + _ini(r.fname,r.lname) + '</div>' +
            '<div><div style="font-weight:600">' + r.fname+' '+r.lname + '</div></div></div></td>' +
          '<td><div style="font-weight:600">' + dateStr + '</div>' +
            '<div style="font-size:11px;color:var(--primary);font-weight:700">' + cinStr + '</div></td>' +
          '<td>' + (r.checkout_time
            ? new Date(r.checkout_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
            : '<span class="badge active" style="font-size:10px">Here now</span>') + '</td>' +
          '<td style="font-weight:600">' + dur + '</td>' +
          '<td><div style="display:flex;gap:6px">' +
            '<button class="btn btn-sm btn-s" onclick="editMemberAtt(' + r.id + ')">✏️</button>' +
            '<button class="btn btn-sm btn-d" onclick="delMemberAtt(' + r.id + ')">🗑</button>' +
          '</div></td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="5"><div class="empty"><div class="empty-ico">&#128203;</div><p>No attendance records</p></div></td></tr>';
    }
    return;
  }

  // Admin view — member attendance table removed; load staff attendance directly
  if (trainerView) trainerView.style.display = 'none';
  if (adminView)   adminView.style.display   = '';
  if (userView)    userView.style.display     = 'none';
  if (typeof rStaffAtt === 'function') rStaffAtt(s || '');
};

window.filterAtt = function filterAtt() {
  rAtt((_gel('srch-att')||{}).value||'');
};

// ── USER ATTENDANCE ───────────────────────────────────────────
window.loadUserAttendance = async function loadUserAttendance() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;
  var mid = cu.member_id;

  var monthFilter = (_gel('uatt-month-filter')||{}).value || '';
  var search      = (_gel('srch-uatt')||{}).value || '';

  // ── Stats ──────────────────────────────────────────────────
  var today      = _td();
  var monthStart = today.slice(0,7) + '-01';

  var allRows = await qry(
    'SELECT * FROM attendance WHERE member_id=? ORDER BY checkin_time DESC', [mid]
  );

  // Populate month filter dropdown (first time)
  var mf = _gel('uatt-month-filter');
  if (mf && mf.options.length <= 1) {
    var months = {};
    (allRows||[]).forEach(function(r) {
      var mo = (r.checkin_time||'').slice(0,7);
      if (mo) months[mo] = true;
    });
    Object.keys(months).sort().reverse().forEach(function(mo) {
      var opt = document.createElement('option');
      opt.value = mo;
      var d = new Date(mo + '-01');
      opt.textContent = d.toLocaleDateString('en-US', {month:'long', year:'numeric'});
      mf.appendChild(opt);
    });
  }

  // This month count
  var monthCount = (allRows||[]).filter(function(r){ return (r.checkin_time||'').startsWith(today.slice(0,7)); }).length;
  var totalCount = (allRows||[]).length;

  // Streak
  var streak = 0;
  // Deduplicate without spread syntax for cross-browser compatibility
  var _seen = {};
  var uniqueDates = (allRows||[]).map(function(r){ return (r.checkin_time||'').slice(0,10); })
    .filter(function(d){ return d && !_seen[d] && (_seen[d] = true); }).sort().reverse();
  var checkDate = new Date(today);
  for (var i = 0; i < uniqueDates.length; i++) {
    if (uniqueDates[i] === checkDate.toISOString().split('T')[0]) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  // Total workout time
  var totalMins = 0;
  (allRows||[]).forEach(function(r) {
    if (r.checkout_time) {
      var m = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
      if (m > 0 && m < 600) totalMins += m;
    }
  });
  var hrs = Math.floor(totalMins/60), mins = totalMins % 60;

  var setTxt = function(id,v){ var e=_gel(id); if(e) e.textContent=v; };
  setTxt('uatt-month',  monthCount);
  setTxt('uatt-streak', streak + ' days');
  setTxt('uatt-total',  totalCount);
  setTxt('uatt-time',   hrs > 0 ? hrs + 'h ' + mins + 'm' : (totalMins > 0 ? totalMins + 'm' : '0h'));

  // Check if currently checked in (no checkout)
  var activeRow = (allRows||[]).find(function(r){ return !r.checkout_time; });
  var coBtn = _gel('uatt-checkout-btn');
  if (coBtn) {
    coBtn.style.display = activeRow ? '' : 'none';
    if (activeRow) coBtn.dataset.attId = activeRow.id;
  }

  // ── Filter rows for table ─────────────────────────────────
  var filtered = (allRows||[]).filter(function(r) {
    if (monthFilter && !(r.checkin_time||'').startsWith(monthFilter)) return false;
    if (search) {
      var dt = new Date(r.checkin_time).toLocaleString().toLowerCase();
      if (dt.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  });

  // ── Render table ──────────────────────────────────────────
  var tbl = _gel('tbl-uatt');
  if (!tbl) return;

  if (!filtered.length) {
    tbl.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty-ico">📋</div><p>No visits found.</p></div></td></tr>';
    return;
  }

  tbl.innerHTML = filtered.map(function(r) {
    var checkinDt  = new Date(r.checkin_time);
    var dateStr    = checkinDt.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
    var checkinStr = checkinDt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    var checkoutStr = '—';
    var dur = '—';
    var isActive = !r.checkout_time;

    if (!isActive) {
      var coDt = new Date(r.checkout_time);
      checkoutStr = coDt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      var m = Math.round((coDt - checkinDt) / 60000);
      dur = Math.floor(m/60) + 'h ' + (m%60) + 'm';
    }

    var statusBadge = isActive
      ? '<span class="badge active" style="font-size:11px">Here now</span>'
      : '<span class="badge paused" style="font-size:11px">Completed</span>';

    var actionBtn = isActive
      ? '<button class="btn btn-s btn-sm" onclick="userCheckOut(' + r.id + ')">🚪 Check Out</button>'
      : '<button class="btn btn-s btn-sm" onclick="editUserCheckin(' + r.id + ', \'' + (r.checkin_time||'').replace('T',' ').slice(0,16) + '\', \'' + (r.checkout_time||'').replace('T',' ').slice(0,16) + '\')">✏️ Edit</button>';

    return '<tr>' +
      '<td style="font-weight:600">' + dateStr + '</td>' +
      '<td>' + checkinStr + '</td>' +
      '<td>' + checkoutStr + '</td>' +
      '<td>' + dur + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + actionBtn + '</td>' +
    '</tr>';
  }).join('');
};

window.openUserCheckin = function openUserCheckin() {
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) +
            'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  var el = _gel('uci-in'); if (el) el.value = dt;
  var co = _gel('uci-out'); if (co) co.value = '';
  var nt = _gel('uci-notes'); if (nt) nt.value = '';
  if (typeof openM === 'function') openM('mo-user-checkin');
};

window.submitUserCheckin = async function submitUserCheckin() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;

  var inTime  = (_gel('uci-in')  ||{}).value || _ndt();
  var outTime = (_gel('uci-out') ||{}).value || null;

  if (outTime && new Date(outTime) <= new Date(inTime)) {
    toast('Check-out must be after check-in', 'error'); return;
  }

  await run(
    'INSERT INTO attendance(member_id, checkin_time, checkout_time) VALUES(?,?,?)',
    [cu.member_id, inTime, outTime || null]
  );
  if (typeof closeM === 'function') closeM('mo-user-checkin');
  toast('Visit logged! ✅', 'success');
  loadUserAttendance();
};

window.userCheckOut = async function userCheckOut(attId) {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;

  // If called from the top button without an id, find the active row
  if (!attId) {
    var btn = _gel('uatt-checkout-btn');
    attId = btn && btn.dataset.attId ? parseInt(btn.dataset.attId) : null;
  }
  if (!attId) { toast('No active check-in found', 'error'); return; }

  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) +
            ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':00';

  await run('UPDATE attendance SET checkout_time=? WHERE id=? AND member_id=?',
    [dt, attId, cu.member_id]);
  toast('Checked out! 👋', 'success');
  loadUserAttendance();
};

window.editUserCheckin = function editUserCheckin(id, inTime, outTime) {
  // Reuse the check-in modal for editing
  var toLocal = function(s) {
    if (!s) return '';
    return s.trim().replace(' ', 'T').slice(0,16);
  };
  var el = _gel('uci-in');  if (el) el.value = toLocal(inTime);
  var co = _gel('uci-out'); if (co) co.value = toLocal(outTime);
  var nt = _gel('uci-notes'); if (nt) nt.value = '';

  // Override submit button to do UPDATE instead of INSERT
  var saveBtn = document.querySelector('#mo-user-checkin .btn-p');
  if (saveBtn) {
    saveBtn.textContent = '💾 Save Changes';
    saveBtn.onclick = async function() {
      var cu = window.currentUser;
      if (!cu || !cu.member_id) return;
      var newIn  = (_gel('uci-in') ||{}).value;
      var newOut = (_gel('uci-out')||{}).value || null;
      if (newOut && new Date(newOut) <= new Date(newIn)) {
        toast('Check-out must be after check-in', 'error'); return;
      }
      await run('UPDATE attendance SET checkin_time=?, checkout_time=? WHERE id=? AND member_id=?',
        [newIn, newOut, id, cu.member_id]);
      // Restore button
      saveBtn.textContent = '✅ Log Visit';
      saveBtn.onclick = submitUserCheckin;
      if (typeof closeM === 'function') closeM('mo-user-checkin');
      toast('Visit updated! ✅', 'success');
      loadUserAttendance();
    };
  }
  if (typeof openM === 'function') openM('mo-user-checkin');
};

window.checkIn = async function checkIn() {
  if (!_gv('ci-mem')) { toast('Select a member', 'error'); return; }
  await run(
    'INSERT INTO attendance(member_id,checkin_time,checkout_time) VALUES(?,?,?)',
    [_gv('ci-mem'), _gv('ci-in')||_ndt(), _gv('ci-out')||null]
  );
  if (typeof closeM === 'function') closeM('mo-checkin');
  toast('Checked in! ✅', 'success');
  rAtt();
  dash();
};

// ════════════════════════════════════════════════════════════
//  EQUIPMENT
// ════════════════════════════════════════════════════════════
window.rEquip = async function rEquip() {
  var rows = await qry('SELECT * FROM equipment ORDER BY category, name');
  var grid = _gel('eq-grid');
  if (!grid) return;
  var condBadge = function(c) {
    if (c === 'Excellent')    return 'active';
    if (c === 'Needs Repair') return 'expired';
    if (c === 'Fair')         return 'pending';
    return 'paused';
  };
  grid.innerHTML = rows.length ? rows.map(function(r) {
    return '<div class="eq-card">' +
      '<div class="eq-hdr">' +
        '<div class="eq-name">' + r.name + '</div>' +
        '<span class="badge ' + condBadge(r.condition_status) + '">' + r.condition_status + '</span>' +
      '</div>' +
      '<div class="eq-det">📦 ' + r.category + ' &nbsp;|&nbsp; Qty: ' + r.quantity + '</div>' +
      '<div class="eq-det">🔧 Maint: ' + _fd(r.next_maintenance) + '</div>' +
      (r.notes ? '<div class="eq-det" style="font-style:italic;font-size:11px;color:var(--text-muted)">' + r.notes + '</div>' : '') +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button class="btn btn-sm btn-s" onclick="editEquip(' + r.id + ')" style="flex:1">✏️ Edit</button>' +
        '<button class="btn btn-sm btn-d" onclick="delEquip(' + r.id + ')" style="flex:1">🗑 Remove</button>' +
      '</div>' +
      '</div>';
  }).join('') : '<div class="empty"><div class="empty-ico">🔧</div><p>No equipment</p></div>';
};

window.addEquipment = async function addEquipment() {
  if (!_gv('eq-name')) { toast('Name required', 'error'); return; }
  await run(
    'INSERT INTO equipment(name,category,quantity,condition_status,purchase_date,next_maintenance,notes) VALUES(?,?,?,?,?,?,?)',
    [_gv('eq-name'), _gv('eq-cat'), parseInt(_gv('eq-qty'))||1,
     _gv('eq-cond'), _gv('eq-date'), _gv('eq-maint'), _gv('eq-notes')]
  );
  if (typeof closeM === 'function') closeM('mo-equipment');
  toast('Equipment added! ✅', 'success');
  rEquip();
};

window.editEquip = async function editEquip(id) {
  var rows = await qry('SELECT * FROM equipment WHERE id=?', [id]);
  var r = rows && rows[0];
  if (!r) return;
  function set(el, v) { var e = _gel(el); if (e) e.value = v || ''; }
  _gel('eeq-id').value = r.id;
  set('eeq-name',  r.name);
  set('eeq-cat',   r.category);
  set('eeq-qty',   r.quantity);
  set('eeq-cond',  r.condition_status);
  set('eeq-date',  r.purchase_date  ? r.purchase_date.split('T')[0]  : '');
  set('eeq-maint', r.next_maintenance ? r.next_maintenance.split('T')[0] : '');
  set('eeq-notes', r.notes);
  if (typeof openM === 'function') openM('mo-edit-equipment');
};

window.saveEquip = async function saveEquip() {
  var id = _gv('eeq-id');
  if (!_gv('eeq-name')) { toast('Name required', 'error'); return; }
  await run(
    'UPDATE equipment SET name=?,category=?,quantity=?,condition_status=?,purchase_date=?,next_maintenance=?,notes=? WHERE id=?',
    [_gv('eeq-name'), _gv('eeq-cat'), parseInt(_gv('eeq-qty'))||1,
     _gv('eeq-cond'), _gv('eeq-date')||null, _gv('eeq-maint')||null, _gv('eeq-notes'), id]
  );
  if (typeof closeM === 'function') closeM('mo-edit-equipment');
  toast('Equipment updated! ✅', 'success');
  rEquip();
};

window.delEquip = async function delEquip(id) {
  if (!confirm('Delete this equipment?')) return;
  await run('DELETE FROM equipment WHERE id=?', [id]);
  toast('Deleted', 'info');
  rEquip();
};

// ════════════════════════════════════════════════════════════
//  STAFF
// ════════════════════════════════════════════════════════════
window.rStaff = async function rStaff() {
  var rows = await qry(
    'SELECT s.*, au.username as uname, au.id as auth_id FROM staff s ' +
    'LEFT JOIN auth_users au ON au.staff_id=s.id ORDER BY s.role, s.fname'
  );
  var tbl     = _gel('tbl-staff');
  if (!tbl) return;
  var isAdmin = window.currentUser && window.currentUser.role === 'admin';
  var roleBadge = function(r) {
    if (r === 'Manager')  return 'active';
    if (r === 'Trainer')  return 'pending';
    return 'paused';
  };
  tbl.innerHTML = rows.length ? rows.map(function(r) {
    return '<tr>' +
      '<td><div class="fc">' +
        '<div class="mav" style="background:linear-gradient(135deg,var(--info),#8b5cf6)">' + _ini(r.fname,r.lname) + '</div>' +
        '<div><div style="font-weight:600">' + r.fname + ' ' + r.lname + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + (r.schedule||'') + '</div></div>' +
      '</div></td>' +
      '<td><span class="badge ' + roleBadge(r.role) + '">' + r.role + '</span></td>' +
      '<td>' + (r.uname
        ? '<span style="font-family:monospace;font-size:12px;color:var(--info)">@' + r.uname + '</span>'
        : '<span style="color:var(--text-muted);font-size:12px">No login</span>') + '</td>' +
      '<td>' + (r.email||'—') + '</td>' +
      '<td>' + (r.phone||'—') + '</td>' +
      '<td>' + _fd(r.hire_date) + '</td>' +
      '<td style="color:var(--success);font-weight:600">' + (r.salary ? _fm(r.salary)+'/mo' : '—') + '</td>' +
      '<td>' + (isAdmin
        ? '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-sm btn-s" onclick="editStaff(' + r.id + ')">✏️</button>' +
            '<button class="btn btn-sm btn-d" onclick="delStaff(' + r.id + ')">🗑</button>' +
          '</div>'
        : '—') + '</td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="8"><div class="empty"><div class="empty-ico">👤</div><p>No staff</p></div></td></tr>';
};

window.editStaff = async function editStaff(id) {
  var rows = await qry(
    'SELECT s.*, au.username as uname, au.id as auth_id FROM staff s ' +
    'LEFT JOIN auth_users au ON au.staff_id=s.id WHERE s.id=?', [id]
  );
  if (!rows || !rows.length) { toast('Staff not found', 'error'); return; }
  var r = rows[0];

  // Populate fields
  var set = function(elId, val) { var e = _gel(elId); if (e) e.value = val||''; };
  set('es-id',    r.id);
  set('es-fn',    r.fname);
  set('es-ln',    r.lname);
  set('es-em',    r.email);
  set('es-ph',    r.phone);
  set('es-hire',  r.hire_date ? r.hire_date.split('T')[0] : '');
  set('es-sal',   r.salary);
  set('es-sched', r.schedule);
  set('es-uname', r.uname||'');
  set('es-pw',    ''); // always blank — only filled if changing

  // Set role select
  var rs = _gel('es-role');
  if (rs) {
    for (var i = 0; i < rs.options.length; i++) {
      if (rs.options[i].value === r.role) { rs.selectedIndex = i; break; }
    }
  }

  // Show note about existing login
  var note = _gel('es-uname-note');
  if (note) note.textContent = r.uname
    ? '✅ Has login account — change username or leave as is'
    : '⚠️ No login yet — enter a username to create one';

  if (typeof openM === 'function') openM('mo-edit-staff');
};

window.saveStaff = async function saveStaff() {
  var id    = parseInt(_gv('es-id'));
  var fn    = (_gv('es-fn')||'').trim();
  var em    = (_gv('es-em')||'').trim();
  var uname = (_gv('es-uname')||'').trim().toLowerCase();
  var pw    = (_gv('es-pw')||'').trim();

  if (!fn || !em) { toast('First name and email are required', 'error'); return; }

  // Check if username is already taken by ANOTHER user
  if (uname) {
    var conflict = await qry('SELECT id FROM auth_users WHERE username=? AND staff_id!=?', [uname, id]);
    if (conflict && conflict.length) { toast('Username "' + uname + '" is already taken', 'error'); return; }
  }

  if (pw && pw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }

  // Update staff record
  var role = _gv('es-role') || 'Trainer';
  await run(
    'UPDATE staff SET fname=?,lname=?,email=?,phone=?,role=?,hire_date=?,salary=?,schedule=? WHERE id=?',
    [fn, _gv('es-ln'), em, _gv('es-ph'), role,
     _gv('es-hire'), parseFloat(_gv('es-sal'))||0, _gv('es-sched'), id]
  );

  // Handle auth_users — passwords always hashed server-side
  var existing = await qry('SELECT id FROM auth_users WHERE staff_id=?', [id]);
  var authRole = (role === 'Manager') ? 'admin' : 'trainer';

  if (existing && existing.length) {
    // Update existing login — use dedicated action so password is bcrypt-hashed
    if (pw) {
      await apiFetch({ action: 'set_staff_password' }, { staff_id: id, username: uname, role: authRole, new_password: pw });
    } else {
      await run('UPDATE auth_users SET username=?,role=? WHERE staff_id=?', [uname, authRole, id]);
    }
  } else if (uname && pw) {
    // No account yet — create via dedicated action so password is bcrypt-hashed
    await apiFetch({ action: 'set_staff_password' }, { staff_id: id, username: uname, role: authRole, new_password: pw, create: true });
  }

  if (typeof closeM === 'function') closeM('mo-edit-staff');
  toast('Staff updated! ✅', 'success');
  rStaff();
};

window.toggleStaffLogin = function toggleStaffLogin() {
  var cb    = _gel('sf-create-login');
  var field = _gel('sf-login-fields');
  var note  = _gel('sf-login-note');
  if (!cb || !field) return;
  var show = cb.checked;
  field.style.display = show ? '' : 'none';
  if (note) note.style.display = show ? '' : 'none';
  // Auto-suggest username from first+last name
  if (show) {
    var fn = (_gv('sf-fn')||'').trim().toLowerCase().replace(/\s+/g,'');
    var ln = (_gv('sf-ln')||'').trim().toLowerCase().replace(/\s+/g,'');
    var un = _gel('sf-uname');
    if (un && !un.value && fn) un.value = fn + (ln ? '.' + ln : '');
  }
};

window.clearAddStaff = function clearAddStaff() {
  var set = function(id, v) { var e = _gel(id); if (e) e.value = v; };
  set('sf-fn',    '');
  set('sf-ln',    '');
  set('sf-em',    '');
  set('sf-ph',    '');
  set('sf-role',  'Trainer');
  set('sf-hire',  '');
  set('sf-sal',   '');
  set('sf-sched', '');
  set('sf-uname', '');
  set('sf-pw',    '');
  // Reset login checkbox to checked and refresh login fields
  var cb = _gel('sf-create-login');
  if (cb) cb.checked = true;
  // Call toggleStaffLogin to ensure login fields display properly
  if (typeof toggleStaffLogin === 'function') toggleStaffLogin();
};

window.addStaff = async function addStaff() {
  var fn    = _gv('sf-fn');
  var em    = _gv('sf-em');
  var uname = (_gv('sf-uname')||'').trim().toLowerCase();
  var pw    = _gv('sf-pw')||'';
  var createLogin = (_gel('sf-create-login')||{}).checked;

  if (!fn || !em) { toast('First name and email are required', 'error'); return; }

  // Validate login fields if creating account
  if (createLogin) {
    if (!uname)     { toast('Username is required for login account', 'error'); return; }
    if (pw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    // Check username not already taken
    var existing = await qry('SELECT id FROM auth_users WHERE username=?', [uname]);
    if (existing && existing.length) { toast('Username "' + uname + '" is already taken', 'error'); return; }
  }

  // Determine role — only Trainer and Manager get login access by default
  var role = _gv('sf-role') || 'Trainer';

  // Insert staff record
  var res = await run(
    'INSERT INTO staff(fname,lname,email,phone,role,hire_date,salary,schedule) VALUES(?,?,?,?,?,?,?,?)',
    [fn, _gv('sf-ln'), em, _gv('sf-ph'), role, _gv('sf-hire'), parseFloat(_gv('sf-sal'))||0, _gv('sf-sched')]
  );
  var staffId = res && res.id ? res.id : null;

  // Create auth_users login account if requested — password bcrypt-hashed server-side
  if (createLogin && staffId && uname && pw) {
    var authRole = (role === 'Manager') ? 'admin' : 'trainer';
    await apiFetch({ action: 'set_staff_password' }, { staff_id: staffId, username: uname, role: authRole, new_password: pw, create: true });
    toast('Staff added with login: ' + uname + ' ✅', 'success');
  } else {
    toast('Staff added! ✅', 'success');
  }

  if (typeof closeM === 'function') closeM('mo-staff');
  // Reset login fields
  var cb = _gel('sf-create-login'); if (cb) cb.checked = true;
  var lf = _gel('sf-login-fields'); if (lf) lf.style.display = '';
  rStaff();
  // Refresh class assignments panel if a trainer was added
  if (role === 'Trainer') rClasses();
};

window.delStaff = async function delStaff(id) {
  // Count classes assigned to this trainer so we can warn
  var clsCount = await qry('SELECT COUNT(*) as c FROM class_trainers WHERE staff_id=?', [id]);
  var cls = clsCount && clsCount[0] ? parseInt(clsCount[0].c) : 0;
  var msg = 'Remove this staff member and their login account?';
  if (cls > 0) msg += '\n\n⚠️ This will also unassign them from ' + cls + ' class' + (cls !== 1 ? 'es' : '') + '.';
  if (!confirm(msg)) return;

  await run('DELETE FROM class_trainers   WHERE staff_id=?',   [id]);
  await run('DELETE FROM staff_attendance WHERE staff_id=?',   [id]);
  await run('DELETE FROM auth_users       WHERE staff_id=?',   [id]);
  await run('DELETE FROM staff            WHERE id=?',          [id]);

  toast('Staff member removed' + (cls > 0 ? ', unassigned from ' + cls + ' class' + (cls !== 1 ? 'es' : '') : ''), 'info');
  rStaff();
  if (cls > 0) rClasses();
};

// ════════════════════════════════════════════════════════════
//  PLANS
// ════════════════════════════════════════════════════════════
window.rPlans = async function rPlans() {
  var plans   = await qry('SELECT * FROM plans ORDER BY price');
  var grid    = _gel('plans-grid');
  if (!grid) return;
  var isAdmin = window.currentUser && window.currentUser.role === 'admin';
  var cc = { Basic:'var(--info)', Standard:'var(--primary)', Premium:'var(--success)', VIP:'var(--warning)' };
  var catBadge = function(c) {
    if (c === 'VIP')     return 'pending';
    if (c === 'Premium') return 'active';
    return 'paused';
  };
  grid.innerHTML = plans.length ? plans.map(function(p) {
    return '<div class="eq-card" style="border-top:3px solid ' + (cc[p.category]||'var(--primary)') + '">' +
      '<div class="eq-hdr">' +
        '<div class="eq-name">' + p.name + '</div>' +
        '<span class="badge ' + catBadge(p.category) + '">' + p.category + '</span>' +
      '</div>' +
      '<div style="font-size:24px;font-weight:800;color:var(--success)">' + _fm(p.price) +
        '<span style="font-size:12px;color:var(--text-muted);font-weight:400"> / ' + p.duration + ' days</span>' +
      '</div>' +
      (p.features ? '<div>' + p.features.split(',').map(function(f) {
        return '<div style="font-size:12px;color:var(--text-muted)">✓ ' + f.trim() + '</div>';
      }).join('') + '</div>' : '') +
      (isAdmin ?
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button class="btn btn-sm btn-s" onclick="openEditPlan(' + p.id + ')" style="flex:1">&#9999;&#65039; Edit</button>' +
          '<button class="btn btn-sm btn-d" onclick="delPlan(' + p.id + ')" style="flex:1">&#128465; Delete</button>' +
        '</div>'
      : '') +
      '</div>';
  }).join('') : '<div class="empty"><div class="empty-ico">📦</div><p>No plans</p></div>';
};

window.addPlan = async function addPlan() {
  if (!window.currentUser || window.currentUser.role !== 'admin') { toast('Admin only', 'error'); return; }
  if (!_gv('pl-name') || !_gv('pl-price')) { toast('Name and price required', 'error'); return; }
  await run(
    'INSERT INTO plans(name,duration,price,category,features,description) VALUES(?,?,?,?,?,?)',
    [_gv('pl-name'), parseInt(_gv('pl-dur'))||30, parseFloat(_gv('pl-price')),
     _gv('pl-cat'), _gv('pl-feat'), _gv('pl-desc')]
  );
  if (typeof closeM === 'function') closeM('mo-plan');
  toast('Plan added! ✅', 'success');
  rPlans();
  populateSels();
};

window.delPlan = async function delPlan(id) {
  if (!window.currentUser || window.currentUser.role !== 'admin') { toast('Admin only', 'error'); return; }
  var check = await qry('SELECT COUNT(*) as c FROM memberships WHERE plan_id=?', [id]);
  if (check && check[0] && check[0].c > 0) { toast('Cannot delete a plan with active memberships', 'error'); return; }
  if (!confirm('Delete this plan?')) return;
  await run('DELETE FROM plans WHERE id=?', [id]);
  toast('Deleted', 'info');
  rPlans();
  populateSels();
};

window.openEditPlan = async function openEditPlan(id) {
  if (!window.currentUser || window.currentUser.role !== 'admin') { toast('Admin only', 'error'); return; }
  var rows = await qry('SELECT * FROM plans WHERE id=?', [id]);
  var p = rows && rows[0];
  if (!p) { toast('Plan not found', 'error'); return; }
  _gel('epl-id').value    = p.id;
  _gel('epl-name').value  = p.name        || '';
  _gel('epl-dur').value   = p.duration    || 30;
  _gel('epl-price').value = p.price       || '';
  _gel('epl-cat').value   = p.category    || 'Basic';
  _gel('epl-feat').value  = p.features    || '';
  _gel('epl-desc').value  = p.description || '';
  if (typeof openM === 'function') openM('mo-edit-plan');
};

window.saveEditPlan = async function saveEditPlan() {
  if (!window.currentUser || window.currentUser.role !== 'admin') { toast('Admin only', 'error'); return; }
  var id = parseInt(_gv('epl-id'));
  if (!id)                                    { toast('No plan selected', 'error'); return; }
  if (!_gv('epl-name') || !_gv('epl-price')) { toast('Name and price are required', 'error'); return; }
  await run(
    'UPDATE plans SET name=?, duration=?, price=?, category=?, features=?, description=? WHERE id=?',
    [_gv('epl-name'), parseInt(_gv('epl-dur'))||30, parseFloat(_gv('epl-price')),
     _gv('epl-cat'), _gv('epl-feat'), _gv('epl-desc'), id]
  );
  if (typeof closeM === 'function') closeM('mo-edit-plan');
  toast('Plan updated! ✅', 'success');
  rPlans();
  populateSels();
};

// ════════════════════════════════════════════════════════════
//  MEMBER ATTENDANCE — trainer only (add / edit / delete)
// ════════════════════════════════════════════════════════════

// Open the Member Check-In modal (trainer only)
window.openMemberCheckin = async function openMemberCheckin() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'trainer') { toast('Trainers only', 'error'); return; }
  // Populate member dropdown with trainer's own members
  var sid = cu.staff_id;
  var members = sid
    ? await qry('SELECT id,fname,lname FROM members WHERE trainer_id=? AND status="active" ORDER BY fname', [sid])
    : await qry('SELECT id,fname,lname FROM members WHERE status="active" ORDER BY fname', []);
  var sel = _gel('ci-mem');
  if (sel) sel.innerHTML = (members||[]).map(function(m) {
    return '<option value="' + m.id + '">' + m.fname + ' ' + m.lname + '</option>';
  }).join('');
  var cin = _gel('ci-in');  if (cin) cin.value = _ndt();
  var co  = _gel('ci-out'); if (co)  co.value  = '';
  if (typeof openM === 'function') openM('mo-checkin');
};

// Delete a member attendance record (trainer only)
window.delMemberAtt = async function delMemberAtt(id) {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'trainer') { toast('Trainers only', 'error'); return; }
  if (!confirm('Delete this attendance record?')) return;
  await run('DELETE FROM attendance WHERE id=?', [id]);
  toast('Record deleted', 'info');
  if (typeof loadTrainerAttendancePage === 'function') loadTrainerAttendancePage();
  filterAtt();
};

// Edit a member attendance record (trainer only)
window.editMemberAtt = async function editMemberAtt(id) {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'trainer') { toast('Trainers only', 'error'); return; }
  var rows = await qry(
    'SELECT a.*, CONCAT(m.fname," ",m.lname) AS member_name FROM attendance a JOIN members m ON m.id=a.member_id WHERE a.id=?', [id]
  );
  var r = rows && rows[0];
  if (!r) return;
  function fmtDt(dt) {
    if (!dt) return '';
    return new Date(dt).toISOString().slice(0,16);
  }
  // Reuse the mo-checkin modal in edit mode
  var sel = _gel('ci-mem');
  if (sel) {
    sel.innerHTML = '<option value="' + r.member_id + '">' + r.member_name + '</option>';
    sel.disabled = true;
  }
  var cin = _gel('ci-in');  if (cin) cin.value = fmtDt(r.checkin_time);
  var co  = _gel('ci-out'); if (co)  co.value  = fmtDt(r.checkout_time);
  // Store the id on the modal for save
  var modal = _gel('mo-checkin');
  if (modal) modal.dataset.editId = id;
  // Change button text to Save
  var saveBtn = modal ? modal.querySelector('.btn-p') : null;
  if (saveBtn) { saveBtn.textContent = '💾 Save Changes'; saveBtn.onclick = saveMemberAtt; }
  if (typeof openM === 'function') openM('mo-checkin');
};

// Save edited member attendance record
window.saveMemberAtt = async function saveMemberAtt() {
  var modal = _gel('mo-checkin');
  var id    = modal ? modal.dataset.editId : null;
  var cin   = _gv('ci-in');
  var cout  = _gv('ci-out') || null;
  if (!id || !cin) { toast('Check-in time is required', 'error'); return; }
  await run('UPDATE attendance SET checkin_time=?, checkout_time=? WHERE id=?', [cin, cout, id]);
  // Reset modal back to add mode
  if (modal) {
    delete modal.dataset.editId;
    var saveBtn = modal.querySelector('.btn-p');
    if (saveBtn) { saveBtn.textContent = 'Check In'; saveBtn.onclick = checkIn; }
    var sel = _gel('ci-mem'); if (sel) sel.disabled = false;
  }
  if (typeof closeM === 'function') closeM('mo-checkin');
  toast('Attendance updated ✅', 'success');
  if (typeof loadTrainerAttendancePage === 'function') loadTrainerAttendancePage();
  filterAtt();
};

// ════════════════════════════════════════════════════════════
//  STAFF ATTENDANCE — admin only
// ════════════════════════════════════════════════════════════
window.switchAttTab = function switchAttTab(tab) {
  var isAdmin   = window.currentUser && window.currentUser.role === 'admin';
  var isTrainer = window.currentUser && window.currentUser.role === 'trainer';
  var pm = _gel('att-panel-member'); var ps = _gel('att-panel-staff');
  var tm = _gel('att-tab-member');   var ts = _gel('att-tab-staff');
  var bm = _gel('att-btn-member');   var bs = _gel('att-btn-staff');

  if (tab === 'staff' && !isAdmin) { toast('Admin only', 'error'); return; }

  if (tab === 'member') {
    if (pm) pm.style.display = '';    if (ps) ps.style.display = 'none';
    if (tm) { tm.className = 'btn btn-p'; tm.style.borderRadius='7px'; tm.style.padding='7px 18px'; }
    if (ts) { ts.className = 'btn btn-s'; ts.style.borderRadius='7px'; ts.style.padding='7px 18px'; }
    // Member Check-In button: trainers only
    if (bm) bm.style.display = isTrainer ? '' : 'none';
    if (bs) bs.style.display = 'none';
    // Show/hide Actions column header
    var acol = _gel('att-actions-col');
    if (acol) acol.style.display = isTrainer ? '' : 'none';
  } else {
    if (pm) pm.style.display = 'none'; if (ps) ps.style.display = '';
    if (tm) { ts && (ts.className = 'btn btn-p'); ts.style.borderRadius='7px'; ts.style.padding='7px 18px'; }
    if (ts) { tm && (tm.className = 'btn btn-s'); tm.style.borderRadius='7px'; tm.style.padding='7px 18px'; }
    if (bm) bm.style.display = 'none';
    // Staff Check-In button: only admin
    if (bs) bs.style.display = isAdmin ? '' : 'none';
    rStaffAtt();
  }
};

window.openStaffCheckin = async function openStaffCheckin() {
  var staff = await qry('SELECT id,fname,lname,role FROM staff ORDER BY fname');
  var sel = _gel('sci-staff');
  if (sel) sel.innerHTML = staff.map(function(s) {
    return '<option value="' + s.id + '">' + s.fname + ' ' + s.lname + ' (' + s.role + ')</option>';
  }).join('');
  var ci = _gel('sci-in'); if (ci) ci.value = _ndt();
  var co = _gel('sci-out'); if (co) co.value = '';
  var cn = _gel('sci-notes'); if (cn) cn.value = '';
  if (typeof openM === 'function') openM('mo-staff-checkin');
};

window.staffCheckIn = async function staffCheckIn() {
  var sid   = _gv('sci-staff');
  var cin   = _gv('sci-in')    || _ndt();
  var cout  = _gv('sci-out')   || null;
  var notes = _gv('sci-notes') || '';
  if (!sid) { toast('Please select a staff member', 'error'); return; }
  await run(
    'INSERT INTO staff_attendance(staff_id,checkin_time,checkout_time,notes) VALUES(?,?,?,?)',
    [sid, cin, cout||null, notes]
  );
  if (typeof closeM === 'function') closeM('mo-staff-checkin');
  toast('Staff checked in! ✅', 'success');
  rStaffAtt();
};

window.rStaffAtt = async function rStaffAtt(s) {
  // Always render the weekly overview first
  await renderAttWeeklyOverview();

  if (!s) s = '';
  var sql = 'SELECT sa.*, st.fname, st.lname, st.role, st.schedule FROM staff_attendance sa ' +
    'JOIN staff st ON st.id=sa.staff_id WHERE 1=1';
  var pr = [];
  if (s) { sql += ' AND (st.fname LIKE ? OR st.lname LIKE ? OR st.role LIKE ?)'; pr.push('%'+s+'%','%'+s+'%','%'+s+'%'); }
  sql += ' ORDER BY sa.checkin_time DESC';
  var rows = await qry(sql, pr);
  var tbl = _gel('tbl-staff-att');
  if (!tbl) return;

  tbl.innerHTML = rows.length ? rows.map(function(r) {
    var dur = '—';
    var shiftStart = '—', shiftEnd = '—', shiftDiff = '';
    var sched = parseSchedule(r.schedule);
    if (sched) {
      shiftStart = sched.start;
      shiftEnd   = sched.end;
      // Compare actual check-in with expected start
      var cin = new Date(r.checkin_time);
      var cinMins = cin.getHours()*60 + cin.getMinutes();
      var expMins = timeToMins(sched.start);
      var diff = cinMins - expMins;
      if (diff > 5) shiftDiff = '<span style="font-size:10px;color:var(--danger);font-weight:700;margin-left:4px">+' + diff + 'min late</span>';
      else if (diff < -5) shiftDiff = '<span style="font-size:10px;color:var(--success);font-weight:700;margin-left:4px">' + Math.abs(diff) + 'min early</span>';
      else shiftDiff = '<span style="font-size:10px;color:var(--success);font-weight:700;margin-left:4px">✅ On time</span>';
    }
    if (r.checkout_time) {
      var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
      dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    }
    var stillHere = !r.checkout_time
      ? '<span class="badge active">On duty</span>'
      : new Date(r.checkout_time).toLocaleString();
    var cin2 = new Date(r.checkin_time);
    var cinStr = cin2.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    var dateStr = cin2.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    return '<tr>' +
      '<td><div class="fc"><div class="mav">' + _ini(r.fname,r.lname) + '</div>' + r.fname + ' ' + r.lname + '</div></td>' +
      '<td><span class="badge paused" style="text-transform:none;font-size:11px">' + (r.role||'—') + '</span></td>' +
      '<td>' +
        '<div style="font-weight:600">' + dateStr + '</div>' +
        '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap">' +
          '<span style="font-size:12px;color:var(--primary);font-weight:700">' + cinStr + '</span>' +
          (sched ? '<span style="font-size:10px;color:var(--text-muted)"> (exp. ' + shiftStart + ')</span>' : '') +
          shiftDiff +
        '</div>' +
      '</td>' +
      '<td>' + stillHere + (sched && r.checkout_time ? '<div style="font-size:10px;color:var(--text-muted)">(exp. ' + shiftEnd + ')</div>' : '') + '</td>' +
      '<td style="font-weight:600">' + dur + '</td>' +
      '<td style="color:var(--text-muted);font-size:12px">' + (r.notes||'—') + '</td>' +
      '<td><div style="display:flex;gap:6px">' +
        '<button class="btn btn-sm btn-s" onclick="editStaffAtt(' + r.id + ')">✏️</button>' +
        '<button class="btn btn-sm btn-d" onclick="delStaffAtt(' + r.id + ')">🗑</button>' +
      '</div></td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="7"><div class="empty"><div class="empty-ico">🧑‍💼</div><p>No staff attendance records</p></div></td></tr>';
};

window.renderAttWeeklyOverview = async function renderAttWeeklyOverview() {
  var wrap = _gel('att-weekly-overview');
  if (!wrap) return;

  var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var abbr = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var today = new Date();
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  var todayIdx = days.indexOf(todayDow); // 0-6

  // Get all trainers
  var trainers = await qry("SELECT id, fname, lname, schedule FROM staff WHERE role='Trainer' ORDER BY fname");
  if (!trainers || !trainers.length) { wrap.innerHTML = ''; return; }

  // Get this week's Monday date
  var dayOfWeek = today.getDay(); // 0=Sun
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var monday = new Date(today); monday.setDate(today.getDate() + mondayOffset);
  var weekDates = days.map(function(_, i) {
    var d = new Date(monday); d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0,10);
  });

  // Get all staff_attendance records for this week
  var weekAtt = await qry(
    'SELECT staff_id, checkin_time, checkout_time FROM staff_attendance ' +
    'WHERE DATE(checkin_time) >= ? AND DATE(checkin_time) <= ?',
    [weekDates[0], weekDates[6]]
  );

  // Get all class_trainers to know who has classes on which days
  var classAssign = await qry(
    'SELECT ct.staff_id, c.day FROM class_trainers ct JOIN classes c ON c.id=ct.class_id'
  );
  var classDaysByTrainer = {}; // { staff_id: Set of days }
  (classAssign||[]).forEach(function(r) {
    if (!classDaysByTrainer[r.staff_id]) classDaysByTrainer[r.staff_id] = {};
    classDaysByTrainer[r.staff_id][r.day] = true;
  });

  // Build grid
  var html =
    '<div class="panel" style="margin-bottom:0">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div class="pt" style="margin-bottom:0">📊 This Week\'s Trainer Overview</div>' +
      '<div style="display:flex;align-items:center;gap:16px;font-size:11px;color:var(--text-muted)">' +
        '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(34,197,94,.3);margin-right:4px"></span>Checked in</span>' +
        '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(239,68,68,.2);margin-right:4px"></span>Missed (had class)</span>' +
        '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(234,179,8,.15);margin-right:4px"></span>Absent</span>' +
        '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--surface2);margin-right:4px"></span>Day off</span>' +
      '</div>' +
    '</div>' +

    // Header row
    '<div class="att-week-row" style="border-bottom:2px solid var(--border)">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Trainer</div>' +
      days.map(function(d, i) {
        var isToday = d === todayDow;
        return '<div style="text-align:center;font-size:11px;font-weight:' + (isToday?'800':'600') + ';color:' + (isToday?'var(--primary)':'var(--text-muted)') + ';padding:4px 2px">' +
          abbr[i] + (isToday ? '<br><span style="font-size:9px;color:var(--primary);background:rgba(249,115,22,.15);padding:1px 5px;border-radius:4px">Today</span>' : '') +
          '</div>';
      }).join('') +
    '</div>' +

    trainers.map(function(t) {
      var sched = parseSchedule(t.schedule);
      var workDays = sched ? sched.days : [];
      var hasClass = classDaysByTrainer[t.id] || {};

      // Check attendance per weekday
      var attByDay = {};
      (weekAtt||[]).filter(function(a){ return parseInt(a.staff_id) === parseInt(t.id); })
        .forEach(function(a) {
          var d = new Date(a.checkin_time);
          var dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
          attByDay[dow] = a;
        });

      // Summary stats
      var scheduled = workDays.filter(function(d,i){ return days.indexOf(d) <= todayIdx; }).length;
      var present   = Object.keys(attByDay).length;
      var missed    = scheduled - present;
      var missedWithClass = workDays.filter(function(d) {
        var di = days.indexOf(d);
        return di <= todayIdx && !attByDay[d] && hasClass[d];
      }).length;

      var cells = days.map(function(d, i) {
        var isWork   = workDays.indexOf(d) !== -1;
        var isFuture = i > todayIdx;
        var att      = attByDay[d];
        var hasClsDay = hasClass[d];

        var cls, icon, title;
        if (!isWork) {
          cls = 'dayoff'; icon = '—'; title = 'Day off';
        } else if (isFuture) {
          cls = 'future'; icon = '·'; title = 'Upcoming';
        } else if (att) {
          var cinTime = new Date(att.checkin_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          cls = 'present'; icon = '✓'; title = 'Checked in ' + cinTime;
          if (sched) {
            var expMins = timeToMins(sched.start);
            var cinMins = new Date(att.checkin_time).getHours()*60 + new Date(att.checkin_time).getMinutes();
            if (cinMins - expMins > 10) icon = '✓<span style="display:block;font-size:8px">+' + (cinMins-expMins) + 'm</span>';
          }
        } else if (hasClsDay) {
          cls = 'absent-class'; icon = '!'; title = 'Absent — had classes today';
        } else {
          cls = 'absent-noclass'; icon = '✗'; title = 'Absent';
        }
        return '<div class="att-week-day-cell ' + cls + '" title="' + title + '">' + icon + '</div>';
      }).join('');

      return '<div class="att-week-row">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<div class="mav" style="width:28px;height:28px;font-size:10px;flex-shrink:0">' + _ini(t.fname,t.lname) + '</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700">' + t.fname + ' ' + t.lname + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted)">' +
              '<span style="color:var(--success)">' + present + '</span>/' + scheduled + ' days' +
              (missedWithClass > 0 ? ' · <span style="color:var(--danger)">⚠️ ' + missedWithClass + ' missed class</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        cells +
      '</div>';
    }).join('') +
    '</div>';

  wrap.innerHTML = html;
};

window.filterStaffAtt = function filterStaffAtt() {
  rStaffAtt((_gel('srch-staff-att') || {}).value || '');
};

window.delStaffAtt = async function delStaffAtt(id) {
  if (!confirm('Delete this staff attendance record?')) return;
  await run('DELETE FROM staff_attendance WHERE id=?', [id]);
  toast('Deleted', 'info');
  rStaffAtt();
};

window.editStaffAtt = async function editStaffAtt(id) {
  var rows = await qry(
    'SELECT sa.*, CONCAT(st.fname," ",st.lname) AS staff_name ' +
    'FROM staff_attendance sa JOIN staff st ON st.id=sa.staff_id WHERE sa.id=?', [id]
  );
  var r = rows && rows[0];
  if (!r) return;
  function fmt(dt) {
    if (!dt) return '';
    // Normalize to datetime-local format: "YYYY-MM-DDTHH:MM"
    return new Date(dt).toISOString().slice(0, 16);
  }
  _gel('esa-id').value         = r.id;
  _gel('esa-staff-name').value = r.staff_name || '';
  _gel('esa-in').value         = fmt(r.checkin_time);
  _gel('esa-out').value        = fmt(r.checkout_time);
  _gel('esa-notes').value      = r.notes || '';
  if (typeof openM === 'function') openM('mo-edit-staff-att');
};

window.saveStaffAtt = async function saveStaffAtt() {
  var id  = _gv('esa-id');
  var cin = _gv('esa-in');
  var cout = _gv('esa-out') || null;
  if (!cin) { toast('Check-in time is required', 'error'); return; }
  await run(
    'UPDATE staff_attendance SET checkin_time=?, checkout_time=?, notes=? WHERE id=?',
    [cin, cout, _gv('esa-notes'), id]
  );
  if (typeof closeM === 'function') closeM('mo-edit-staff-att');
  toast('Attendance updated! ✅', 'success');
  rStaffAtt();
};

// ════════════════════════════════════════════════════════════
//  START — kick off initDB after DOM is ready
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  LOGIN NOTIFICATIONS
// ════════════════════════════════════════════════════════════

window.showLoginNotifications = async function showLoginNotifications(u) {
  if (!u || !u.role) return;
  var role = u.role;

  var cards = [];

  if (role === 'trainer') {
    cards = await buildTrainerNotifications(u);
  } else if (role === 'user') {
    cards = await buildMemberNotifications(u);
  } else {
    return; // admin gets no pop-up (they post announcements)
  }

  if (!cards.length) return; // nothing to show

  // Build modal content
  var body = _gel('notify-body');
  var subtitle = _gel('notify-subtitle');
  if (!body) return;

  body.innerHTML = cards.map(function(c) {
    return '<div class="notify-card ' + (c.type||'') + '">' +
      '<div class="notify-card-title">' + (c.icon||'') + ' ' + c.title + '</div>' +
      '<div class="notify-card-body">' + c.body + '</div>' +
    '</div>';
  }).join('');

  if (subtitle) subtitle.textContent = cards.length + ' notification' + (cards.length > 1 ? 's' : '') + ' for you today';

  // Show role-specific header icon
  var icon = _gel('notify-icon');
  var title = _gel('notify-title');
  if (icon)  icon.textContent  = role === 'trainer' ? '🏋️' : '👤';
  if (title) title.textContent = role === 'trainer' ? 'Your Training Day' : 'Welcome Back!';

  if (typeof openM === 'function') openM('mo-notify');
};

// ── Trainer Notifications ─────────────────────────────────────
async function buildTrainerNotifications(u) {
  var cards = [];
  var sid   = u.staff_id ? parseInt(u.staff_id) : 0;
  if (!sid) return cards;

  var now      = new Date();
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
  var nowMins  = now.getHours() * 60 + now.getMinutes();
  var today    = _td();

  // 1. Get today's classes for this trainer
  var todayClasses = await qry(
    'SELECT c.name, c.time, c.duration, c.capacity FROM class_trainers ct ' +
    'JOIN classes c ON c.id=ct.class_id ' +
    'WHERE ct.staff_id=? AND c.day=? ORDER BY c.time',
    [sid, todayDow]
  );

  // 2. Check if trainer has checked in today
  var checkinToday = await qry(
    'SELECT id FROM staff_attendance WHERE staff_id=? AND DATE(checkin_time)=?',
    [sid, today]
  );
  var hasCheckedIn = checkinToday && checkinToday.length > 0;

  // 3. Alert: haven't checked in but have a class within 2 hours
  if (!hasCheckedIn && todayClasses.length) {
    var soonClass = todayClasses.find(function(c) {
      var cMins = timeToMins(c.time);
      return cMins - nowMins <= 120 && cMins >= nowMins;
    });
    if (soonClass) {
      var parts = (soonClass.time||'00:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
      cards.push({
        type:  'urgent',
        icon:  '⚠️',
        title: 'You haven\'t checked in yet!',
        body:  'You have <b>' + soonClass.name + '</b> at <b>' + ts + '</b> and you\'re not checked in. Please check in at the reception desk.'
      });
    }
  }

  // 4. Classes happening in the next 60 minutes
  var in60 = todayClasses.filter(function(c) {
    var cMins = timeToMins(c.time);
    return cMins - nowMins > 0 && cMins - nowMins <= 60;
  });
  if (in60.length) {
    in60.forEach(function(c) {
      var parts = (c.time||'00:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
      var diff = timeToMins(c.time) - nowMins;
      cards.push({
        type:  'warning',
        icon:  '⏰',
        title: 'Class in ' + diff + ' minutes!',
        body:  '<b>' + c.name + '</b> starts at <b>' + ts + '</b> — ' + (c.capacity||'—') + ' capacity. Get ready!'
      });
    });
  }

  // 5. Today's full class list
  if (todayClasses.length) {
    var classLines = todayClasses.map(function(c) {
      var parts = (c.time||'00:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
      var cMins = timeToMins(c.time);
      var isDone = cMins + (parseInt(c.duration)||60) < nowMins;
      return (isDone ? '<s style="opacity:.5">' : '') + '• <b>' + ts + '</b> ' + c.name + ' (' + (c.duration||60) + ' min)' + (isDone ? '</s>' : '');
    }).join('<br>');
    cards.push({
      type:  'info',
      icon:  '📅',
      title: 'Your classes today — ' + todayDow,
      body:  classLines
    });
  } else {
    cards.push({
      type:  'success',
      icon:  '😊',
      title: 'No classes today',
      body:  'You have no classes scheduled for ' + todayDow + '. Enjoy your day!'
    });
  }

  // 6. Upcoming classes this week (not today)
  var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var todayIdx = days.indexOf(todayDow);
  var upcomingDays = days.filter(function(d, i) { return i > todayIdx; });

  if (upcomingDays.length) {
    var upcomingCls = await qry(
      'SELECT c.name, c.time, c.day, c.duration FROM class_trainers ct ' +
      'JOIN classes c ON c.id=ct.class_id WHERE ct.staff_id=? ' +
      'AND c.day IN (' + upcomingDays.map(function(){ return '?'; }).join(',') + ') ' +
      'ORDER BY CASE c.day WHEN "Monday" THEN 1 WHEN "Tuesday" THEN 2 WHEN "Wednesday" THEN 3 ' +
      'WHEN "Thursday" THEN 4 WHEN "Friday" THEN 5 WHEN "Saturday" THEN 6 ELSE 7 END, c.time',
      [sid].concat(upcomingDays)
    );
    if (upcomingCls && upcomingCls.length) {
      var upLines = upcomingCls.slice(0, 6).map(function(c) {
        var parts = (c.time||'00:00').split(':');
        var h = parseInt(parts[0]), m = parts[1]||'00';
        var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
        return '• <b>' + c.day.slice(0,3) + '</b> ' + ts + ' — ' + c.name;
      }).join('<br>');
      if (upcomingCls.length > 6) upLines += '<br><span style="opacity:.6">+ ' + (upcomingCls.length-6) + ' more classes this week</span>';
      cards.push({
        type:  '',
        icon:  '📆',
        title: 'Upcoming this week (' + upcomingCls.length + ' class' + (upcomingCls.length>1?'es':'') + ')',
        body:  upLines
      });
    }
  }

  return cards;
}

// ── Member Notifications ──────────────────────────────────────
async function buildMemberNotifications(u) {
  var cards = [];
  var mid   = u.member_id ? parseInt(u.member_id) : 0;
  if (!mid) return cards;

  // 1. Check membership expiry
  var ms = await qry(
    'SELECT ms.end_date, ms.status, p.name AS plan_name FROM memberships ms ' +
    'JOIN plans p ON p.id=ms.plan_id WHERE ms.member_id=? ORDER BY ms.end_date DESC LIMIT 1',
    [mid]
  );
  if (ms && ms[0]) {
    var daysLeft = Math.ceil((new Date(ms[0].end_date) - new Date()) / 86400000);
    if (ms[0].status === 'expired' || daysLeft < 0) {
      cards.push({
        type:  'urgent',
        icon:  '❌',
        title: 'Membership Expired!',
        body:  'Your <b>' + ms[0].plan_name + '</b> membership has expired. Please visit the reception to renew.'
      });
    } else if (daysLeft <= 7) {
      cards.push({
        type:  'warning',
        icon:  '⚠️',
        title: 'Membership expiring in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + '!',
        body:  'Your <b>' + ms[0].plan_name + '</b> expires on <b>' + _fd(ms[0].end_date) + '</b>. Renew soon to avoid interruption.'
      });
    }
  }

  // 2. Get assigned trainer & their classes today
  var memberRow = await qry('SELECT trainer_id FROM members WHERE id=?', [mid]);
  var tid = memberRow && memberRow[0] ? memberRow[0].trainer_id : null;
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  if (tid) {
    var trainerInfo = await qry('SELECT fname, lname FROM staff WHERE id=?', [tid]);
    var trName = trainerInfo && trainerInfo[0] ? trainerInfo[0].fname + ' ' + trainerInfo[0].lname : 'Your trainer';

    var trainerTodayClasses = await qry(
      'SELECT c.name, c.time, c.duration, c.capacity FROM class_trainers ct ' +
      'JOIN classes c ON c.id=ct.class_id WHERE ct.staff_id=? AND c.day=? ORDER BY c.time',
      [tid, todayDow]
    );

    if (trainerTodayClasses && trainerTodayClasses.length) {
      var clsLines = trainerTodayClasses.map(function(c) {
        var parts = (c.time||'00:00').split(':');
        var h = parseInt(parts[0]), m = parts[1]||'00';
        var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
        return '• <b>' + ts + '</b> ' + c.name + ' (' + (c.duration||60) + ' min · 👥 ' + (c.capacity||'—') + ')';
      }).join('<br>');
      cards.push({
        type:  'info',
        icon:  '🏋️',
        title: trName + '\'s classes today — join in!',
        body:  clsLines
      });
    }

    // 3. Upcoming classes this week from their trainer
    var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    var todayIdx = days.indexOf(todayDow);
    var upcomingDays = days.filter(function(d, i) { return i > todayIdx; });
    if (upcomingDays.length) {
      var upCls = await qry(
        'SELECT c.name, c.time, c.day FROM class_trainers ct ' +
        'JOIN classes c ON c.id=ct.class_id WHERE ct.staff_id=? ' +
        'AND c.day IN (' + upcomingDays.map(function(){ return '?'; }).join(',') + ') ' +
        'ORDER BY CASE c.day WHEN "Monday" THEN 1 WHEN "Tuesday" THEN 2 WHEN "Wednesday" THEN 3 ' +
        'WHEN "Thursday" THEN 4 WHEN "Friday" THEN 5 WHEN "Saturday" THEN 6 ELSE 7 END, c.time',
        [tid].concat(upcomingDays)
      );
      if (upCls && upCls.length) {
        var upLines = upCls.slice(0, 5).map(function(c) {
          var parts = (c.time||'00:00').split(':');
          var h = parseInt(parts[0]), m = parts[1]||'00';
          var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
          return '• <b>' + c.day.slice(0,3) + '</b> ' + ts + ' — ' + c.name;
        }).join('<br>');
        cards.push({
          type:  '',
          icon:  '📆',
          title: 'Your trainer\'s classes this week',
          body:  upLines
        });
      }
    }
  }

  // 4. General announcements from admin (recent_changes with event_type='announcement', last 7 days)
  var anns = await qry(
    "SELECT title, detail, created_at FROM recent_changes WHERE event_type='announcement' " +
    "AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY created_at DESC LIMIT 5"
  );
  if (anns && anns.length) {
    anns.forEach(function(a) {
      var dateStr = new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      cards.push({
        type:  'announce',
        icon:  '📢',
        title: a.title || 'Gym Announcement',
        body:  (a.detail || '') + '<div style="margin-top:4px;font-size:10px;opacity:.5">' + dateStr + '</div>'
      });
    });
  }

  return cards;
}

// ── Admin: Post Announcement ──────────────────────────────────
window.postAnnouncement = async function postAnnouncement() {
  var title  = (_gv('ann-title')  || '').trim();
  var detail = (_gv('ann-detail') || '').trim();
  if (!title)  { toast('Please enter a title', 'error'); return; }
  if (!detail) { toast('Please enter a message', 'error'); return; }

  await run(
    "INSERT INTO recent_changes(event_type, entity, title, detail, actor_id) VALUES(?,?,?,?,?)",
    ['announcement', 'gym', title, detail, null]
  );

  var ta = _gel('ann-detail'); if (ta) ta.value = '';
  var ti = _gel('ann-title');  if (ti) ti.value = '';
  if (typeof closeM === 'function') closeM('mo-announcement');
  toast('📢 Announcement posted! Members will see it when they log in.', 'success');
};

// ════════════════════════════════════════════════════════════
//  START — kick off initDB after DOM is ready
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // api-client.js has overridden window.initDB with the MySQL version by now.
  // Call it directly — the setTimeout in app.js will also call it but
  // initDB is idempotent (ping is fast and the session check is safe to repeat).
  initDB();
});

// ================================================================
//  AI PREDICTION — async overrides for MySQL mode
// ================================================================
window.loadAIHistory = async function loadAIHistory() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;
  var rows = await qry('SELECT * FROM ai_recs WHERE member_id=? ORDER BY created_at DESC LIMIT 10', [cu.member_id]);
  var box = _gel('ai-history');
  if (!box) return;
  var goalLabel = { lose: 'Lose Weight', muscle: 'Gain Muscle', fit: 'General Fitness' };
  if (!rows || !rows.length) {
    box.innerHTML = '<div class="empty"><div class="empty-ico">&#128194;</div><p>No predictions yet.</p></div>';
    return;
  }
  box.innerHTML = rows.map(function(r) {
    var dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '--';
    var timeStr = r.created_at ? new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
    var schedLine = r.schedule ? r.schedule.split('\n').join(' &middot; ') : '';
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
          '<span style="font-weight:700;font-size:14px">' + (r.plan_name || 'No Plan') + '</span>' +
          '<span class="badge active" style="font-size:10px">' + (goalLabel[r.goal] || r.goal) + '</span>' +
          '<span class="badge paused" style="font-size:10px">' + (r.experience || '--') + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:10px">' +
          (r.bmi    ? '<span>BMI: <b style="color:var(--text)">' + parseFloat(r.bmi).toFixed(1) + '</b></span>' : '') +
          (r.age    ? '<span>Age: <b style="color:var(--text)">' + r.age + '</b></span>' : '') +
          (r.gender ? '<span><b style="color:var(--text);text-transform:capitalize">' + r.gender + '</b></span>' : '') +
          '<span>' + r.days_per_week + ' days/week</span>' +
          (r.injuries ? '<span>Notes: ' + r.injuries + '</span>' : '') +
        '</div>' +
        (schedLine ? '<div style="margin-top:6px;font-size:11px;color:var(--text-muted);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Schedule: ' + schedLine + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-size:11px;color:var(--text-muted)">' + dateStr + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + timeStr + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};

window.runAIPrediction = async function runAIPrediction() {
  var cu       = window.currentUser;
  var goal     = (_gel('ai-goal')   || {}).value || 'fit';
  var exp      = (_gel('ai-exp')    || {}).value || 'beginner';
  var age      = parseInt((_gel('ai-age')    || {}).value) || null;
  var gender   = (_gel('ai-gender') || {}).value || 'other';
  var h        = parseFloat((_gel('ai-h')    || {}).value);
  var w        = parseFloat((_gel('ai-w')    || {}).value);
  var days     = parseInt((_gel('ai-days')   || {}).value, 10);
  var injuries = ((_gel('ai-notes')  || {}).value || '').trim();

  if (!h || !w || h < 100 || h > 230 || w < 30 || w > 300) {
    toast('Please enter valid height and weight', 'error'); return;
  }

  var bmi      = calcBMI(h, w);
  var bmiTxt   = bmi ? bmi.toFixed(1) : '--';
  var bmiBand  = !bmi ? '--' : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  var plan     = await pickRecommendedPlan(goal, days, bmi, exp);
  var cls      = await pickClasses(goal, days);
  var dietTips    = buildDietTips(goal, bmi, gender, age);
  var workoutTips = buildWorkoutTips(goal, exp, days, bmi, injuries);

  var tabBar = _gel('ai-tabs');   if (tabBar) tabBar.style.display = 'flex';
  var empty  = _gel('ai-empty');  if (empty)  empty.style.display  = 'none';

  // BMI panel
  var bmiPanel = _gel('ai-panel-bmi');
  if (bmiPanel) bmiPanel.innerHTML = buildBMIHTML(bmi, bmiTxt, bmiBand, age, gender);

  // Plan panel
  var planPanel = _gel('ai-panel-plan');
  if (planPanel) {
    var goalTxt = goal==='lose'?'Lose Weight':goal==='muscle'?'Gain Muscle':'General Fitness';
    if (plan) {
      var features = (plan.features||'').split(',').filter(Boolean);
      planPanel.innerHTML =
        '<div style="background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.04));border:1px solid rgba(249,115,22,.2);border-radius:12px;padding:18px;margin-bottom:14px">' +
          '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Recommended Plan</div>' +
          '<div style="font-size:22px;font-weight:900;margin-top:6px">' + plan.name + '</div>' +
          '<div style="color:var(--success);font-weight:800;font-size:20px;margin:6px 0">' + _fm(plan.price) +
            ' <span style="color:var(--text-muted);font-weight:400;font-size:12px">/ ' + plan.duration + ' days</span></div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + (plan.description||'') + '</div>' +
          (features.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
            features.map(function(f){ return '<span style="background:rgba(34,197,94,.12);color:var(--success);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600">&#10003; '+f.trim()+'</span>'; }).join('') +
          '</div>' : '') +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);line-height:1.8;padding:10px;background:var(--surface2);border-radius:8px">' +
          '<b style="color:var(--text)">Why this plan?</b><br>' +
          'Goal: <b style="color:var(--text)">'+goalTxt+'</b> &nbsp;&#8226;&nbsp; ' +
          'Days/week: <b style="color:var(--text)">'+days+'</b> &nbsp;&#8226;&nbsp; ' +
          'Level: <b style="color:var(--text)">'+exp+'</b> &nbsp;&#8226;&nbsp; ' +
          'BMI: <b style="color:var(--text)">'+bmiTxt+' ('+bmiBand+')</b>' +
        '</div>';
    } else {
      planPanel.innerHTML = '<div class="empty"><div class="empty-ico">&#9888;&#65039;</div><p>No plans available yet.</p></div>';
    }
  }

  // Workout Tips panel
  var workoutPanel = _gel('ai-panel-workout');
  if (workoutPanel) {
    workoutPanel.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' +
      workoutTips.map(function(t){
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--surface2);border-radius:10px">' +
          '<div style="font-size:22px;flex-shrink:0;line-height:1">'+t.ico+'</div>' +
          '<div><div style="font-weight:700;font-size:13px;margin-bottom:3px">'+t.t+'</div>' +
          '<div style="font-size:12px;color:var(--text-muted);line-height:1.6">'+t.d+'</div></div></div>';
      }).join('') + '</div>';
  }

  // Diet Tips panel
  var dietPanel = _gel('ai-panel-diet');
  if (dietPanel) {
    dietPanel.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' +
      dietTips.map(function(t){
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--surface2);border-radius:10px">' +
          '<div style="font-size:22px;flex-shrink:0;line-height:1">'+t.ico+'</div>' +
          '<div><div style="font-weight:700;font-size:13px;margin-bottom:3px">'+t.t+'</div>' +
          '<div style="font-size:12px;color:var(--text-muted);line-height:1.6">'+t.d+'</div></div></div>';
      }).join('') + '</div>';
  }

  if (typeof switchAITab === 'function') switchAITab('bmi');

  // Weekly schedule
  var schedEl = _gel('ai-schedule');
  if (schedEl) {
    if (cls.length) {
      schedEl.innerHTML = '<div class="tbl-wrap" style="margin-top:6px"><table>' +
        '<thead><tr><th>Day</th><th>Class</th><th>Time</th><th>Instructor</th><th>Duration</th></tr></thead><tbody>' +
        cls.map(function(c){
          return '<tr><td><span class="badge pending">'+c.day+'</span></td>' +
            '<td style="font-weight:700">'+c.name+'</td>' +
            '<td>'+(c.time||'--')+'</td><td>'+(c.instructor||'--')+'</td>' +
            '<td>'+(c.duration||'--')+' min</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">&#128161; Tip: Consistency matters more than intensity. Start steady and build gradually.</div>';
    } else {
      schedEl.innerHTML = '<div class="empty"><div class="empty-ico">&#128237;</div><p>No classes found. Ask an admin to add classes first.</p></div>';
    }
  }

  // Save to DB
  if (cu && cu.role === 'user' && cu.member_id) {
    var schedTxt  = cls.map(function(c){ return c.day+' '+(c.time||'')+' - '+c.name+' ('+(c.duration||0)+'m)'; }).join('\n');
    var classIds  = cls.filter(function(c){ return c.id; }).map(function(c){ return c.id; }).join(',');
    var dietStr   = dietTips.map(function(t){ return t.t+': '+t.d; }).join(' | ');
    var workStr   = workoutTips.map(function(t){ return t.t+': '+t.d; }).join(' | ');
    await run(
      'INSERT INTO ai_recs(member_id,goal,bmi,age,gender,injuries,days_per_week,experience,plan_id,plan_name,schedule,recommended_class_ids,diet_tips,workout_tips) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [cu.member_id, goal, bmi, age, gender, injuries||null, days, exp, plan?plan.id:null, plan?plan.name:'', schedTxt, classIds||null, dietStr, workStr]
    );
    await loadAIHistory();
  }

  toast('Recommendation ready!', 'success');
};

// ════════════════════════════════════════════════════════════
//  USER DASHBOARD — NEW FEATURES
// ════════════════════════════════════════════════════════════

// ── Motivational Quote of the Day ────────────────────────────
window.loadDailyQuote = function loadDailyQuote() {
  var quotes = [
    { text: "The only bad workout is the one that didn't happen.", author: "— Unknown" },
    { text: "Take care of your body. It's the only place you have to live.", author: "— Jim Rohn" },
    { text: "Success isn't always about greatness. It's about consistency.", author: "— Dwayne Johnson" },
    { text: "The hardest lift of all is lifting your butt off the couch.", author: "— Unknown" },
    { text: "Fitness is not about being better than someone else. It's about being better than you used to be.", author: "— Unknown" },
    { text: "A one hour workout is 4% of your day. No excuses.", author: "— Unknown" },
    { text: "What seems impossible today will one day become your warm-up.", author: "— Unknown" },
    { text: "Don't stop when you're tired. Stop when you're done.", author: "— Unknown" },
    { text: "Your body can stand almost anything. It's your mind you have to convince.", author: "— Unknown" },
    { text: "The pain you feel today will be the strength you feel tomorrow.", author: "— Unknown" },
    { text: "Exercise is a celebration of what your body can do, not a punishment for what you ate.", author: "— Unknown" },
    { text: "Push yourself because no one else is going to do it for you.", author: "— Unknown" },
    { text: "Small progress is still progress.", author: "— Unknown" },
    { text: "It never gets easier, you just get stronger.", author: "— Unknown" },
    { text: "Your future self is watching you right now through your memories.", author: "— Unknown" },
    { text: "Strive for progress, not perfection.", author: "— Unknown" },
    { text: "Wake up with determination. Go to bed with satisfaction.", author: "— Unknown" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "— Zig Ziglar" },
    { text: "Sweat is just fat crying.", author: "— Unknown" },
    { text: "Believe in yourself and all that you are.", author: "— Christian D. Larson" },
    { text: "The difference between try and triumph is a little 'umph'.", author: "— Marvin Phillips" },
    { text: "You are one workout away from a good mood.", author: "— Unknown" },
  ];
  // Pick based on day-of-year so it changes daily but stays consistent within a day
  var now   = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  var doy   = Math.floor((now - start) / 86400000);
  var q = quotes[doy % quotes.length];
  var textEl   = _gel('du-quote-text');
  var authorEl = _gel('du-quote-author');
  if (textEl)   textEl.textContent   = '\u201C' + q.text + '\u201D';
  if (authorEl) authorEl.textContent = q.author;
};

// ── Total Workout Time ────────────────────────────────────────
window.loadWorkoutTime = async function loadWorkoutTime(mid) {
  if (!mid) return;
  var rows = await qry(
    'SELECT checkin_time, checkout_time FROM attendance WHERE member_id=? AND checkout_time IS NOT NULL',
    [mid]
  );
  var totalMins = 0;
  (rows || []).forEach(function(r) {
    var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
    if (mins > 0 && mins < 600) totalMins += mins; // cap at 10h per session (sanity)
  });
  var hrs  = Math.floor(totalMins / 60);
  var mins = totalMins % 60;
  var el   = _gel('du-workout-time');
  if (el) el.textContent = hrs > 0 ? hrs + 'h ' + mins + 'm' : (totalMins > 0 ? totalMins + 'm' : '0h');
  var sub = _gel('du-workout-time') && _gel('du-workout-time').parentElement
    ? _gel('du-workout-time').parentElement.querySelector('.stat-sub')
    : null;
  if (sub) sub.textContent = totalMins > 0 ? Math.round(totalMins / 60 * 10) / 10 + ' hrs total' : 'No data yet';
};

// ── Goal Progress Tracker ─────────────────────────────────────
window.openGoalModal = async function openGoalModal() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  // Load existing goal if any
  var rows = await qry('SELECT * FROM member_goals WHERE member_id=? ORDER BY created_at DESC LIMIT 1', [cu.member_id]);
  var g    = rows && rows[0];
  var set  = function(id, v) { var e = _gel(id); if (e) e.value = v || ''; };
  set('goal-id',      g ? g.id      : '');
  set('goal-type',    g ? g.goal_type   : 'weight_loss');
  set('goal-label',   g ? g.goal_label  : '');
  set('goal-start',   g ? g.start_value  : '');
  set('goal-target',  g ? g.target_value : '');
  set('goal-current', g ? g.current_value: '');
  set('goal-notes',   g ? g.notes       : '');
  toggleGoalFields();
  if (typeof openM === 'function') openM('mo-goal');
};

window.toggleGoalFields = function toggleGoalFields() {
  var type = (_gel('goal-type') || {}).value || 'weight_loss';
  var isCustom = type === 'custom';
  var labelRow   = _gel('goal-label-row');
  var startRow   = _gel('goal-start-row');
  var targetRow  = _gel('goal-target-row');
  var currentRow = _gel('goal-current-row');
  if (labelRow)   labelRow.style.display   = isCustom ? '' : 'none';
  if (startRow)   startRow.style.display   = isCustom ? 'none' : '';
  if (targetRow)  targetRow.style.display  = isCustom ? 'none' : '';
  if (currentRow) currentRow.style.display = isCustom ? 'none' : '';
  // Update labels for gain vs loss
  var startLbl   = startRow   && startRow.querySelector('label');
  var targetLbl  = targetRow  && targetRow.querySelector('label');
  var currentLbl = currentRow && currentRow.querySelector('label');
  if (startLbl)   startLbl.textContent   = type === 'weight_gain' ? 'Starting Weight (kg)' : 'Starting Weight (kg)';
  if (targetLbl)  targetLbl.textContent  = type === 'weight_gain' ? 'Target Weight (kg)'   : 'Target Weight (kg)';
  if (currentLbl) currentLbl.textContent = 'Current Weight (kg)';
};

window.saveGoal = async function saveGoal() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;
  var id      = _gv('goal-id');
  var type    = _gv('goal-type');
  var label   = _gv('goal-label');
  var start   = parseFloat(_gv('goal-start'))   || null;
  var target  = parseFloat(_gv('goal-target'))  || null;
  var current = parseFloat(_gv('goal-current')) || null;
  var notes   = _gv('goal-notes');
  var isCustom = type === 'custom';
  if (!isCustom && (!start || !target)) { toast('Please enter starting and target weight', 'error'); return; }
  if (isCustom && !label.trim())        { toast('Please enter a goal label', 'error'); return; }
  if (id) {
    await run(
      'UPDATE member_goals SET goal_type=?,goal_label=?,start_value=?,target_value=?,current_value=?,notes=?,achieved=? WHERE id=?',
      [type, label, isCustom?null:start, isCustom?null:target, isCustom?null:current, notes,
       (!isCustom && current && target && ((type==='weight_loss' && current<=target)||(type==='weight_gain' && current>=target))) ? 1 : 0,
       id]
    );
  } else {
    await run(
      'INSERT INTO member_goals(member_id,goal_type,goal_label,start_value,target_value,current_value,unit,notes) VALUES(?,?,?,?,?,?,?,?)',
      [cu.member_id, type, label, isCustom?null:start, isCustom?null:target, isCustom?null:current, 'kg', notes]
    );
  }
  if (typeof closeM === 'function') closeM('mo-goal');
  toast('Goal saved! \uD83C\uDFAF', 'success');
  loadGoalProgress(cu.member_id);
};

window.loadGoalProgress = async function loadGoalProgress(mid) {
  if (!mid) return;
  var rows = await qry('SELECT * FROM member_goals WHERE member_id=? ORDER BY created_at DESC LIMIT 1', [mid]);
  var box  = _gel('du-goal-content');
  if (!box) return;
  var g = rows && rows[0];
  if (!g) {
    box.innerHTML = '<div class="empty"><div class="empty-ico">&#127919;</div><p>No goal set yet. Click <b>Set Goal</b> to get started.</p></div>';
    return;
  }

  if (g.goal_type === 'custom') {
    var ach = g.achieved ? '<span class="badge active" style="font-size:11px">&#10003; Achieved!</span>' : '<span class="badge pending" style="font-size:11px">In Progress</span>';
    box.innerHTML =
      '<div style="padding:6px 0">' +
        '<div style="font-size:16px;font-weight:800;margin-bottom:8px">' + (g.goal_label || 'My Goal') + '</div>' +
        '<div style="margin-bottom:10px">' + ach + '</div>' +
        (g.notes ? '<div style="font-size:12px;color:var(--text-muted)">' + g.notes + '</div>' : '') +
        '<div style="margin-top:14px;display:flex;gap:8px">' +
          '<button class="btn btn-s btn-sm" onclick="markGoalAchieved(' + g.id + ')">&#10003; Mark Achieved</button>' +
          '<button class="btn btn-s btn-sm" onclick="openGoalModal()">&#9998; Edit</button>' +
        '</div>' +
      '</div>';
    return;
  }

  var start   = parseFloat(g.start_value)   || 0;
  var target  = parseFloat(g.target_value)  || 0;
  var current = parseFloat(g.current_value) || start;
  var isLoss  = g.goal_type === 'weight_loss';

  var totalChange = Math.abs(target - start);
  var madeChange  = isLoss ? (start - current) : (current - start);
  var pct = totalChange > 0 ? Math.min(100, Math.max(0, Math.round((madeChange / totalChange) * 100))) : 0;
  var remaining = Math.abs(target - current).toFixed(1);
  var achieved  = isLoss ? current <= target : current >= target;

  var barColor = achieved ? 'var(--success)' : pct >= 60 ? 'var(--primary)' : pct >= 30 ? 'var(--warning)' : 'var(--danger)';
  var typeLabel = isLoss ? 'Weight Loss' : 'Weight Gain';
  var arrow     = isLoss ? '&#8595;' : '&#8593;';

  box.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:700">' + typeLabel + ' Goal ' + arrow + '</div>' +
        (achieved ? '<span class="badge active" style="font-size:11px">&#10003; Achieved!</span>' : '<span style="font-size:12px;font-weight:700;color:' + barColor + '">' + pct + '%</span>') +
      '</div>' +
      '<div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;margin-bottom:8px">' +
        '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width .6s ease"></div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
      '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Start</div>' +
        '<div style="font-size:17px;font-weight:800">' + start.toFixed(1) + '<span style="font-size:10px;font-weight:400"> kg</span></div>' +
      '</div>' +
      '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Current</div>' +
        '<div style="font-size:17px;font-weight:800;color:' + barColor + '">' + current.toFixed(1) + '<span style="font-size:10px;font-weight:400;color:var(--text-muted)"> kg</span></div>' +
      '</div>' +
      '<div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">' +
        '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Target</div>' +
        '<div style="font-size:17px;font-weight:800">' + target.toFixed(1) + '<span style="font-size:10px;font-weight:400"> kg</span></div>' +
      '</div>' +
    '</div>' +
    (!achieved ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;text-align:center">' +
      remaining + ' kg ' + (isLoss ? 'to lose' : 'to gain') + ' remaining' +
    '</div>' : '') +
    '<div style="display:flex;gap:8px">' +
      '<button class="btn btn-s btn-sm" style="flex:1" onclick="openGoalModal()">&#9998; Update Weight</button>' +
    '</div>';
};

window.markGoalAchieved = async function markGoalAchieved(id) {
  await run('UPDATE member_goals SET achieved=1 WHERE id=?', [id]);
  toast('Congratulations! Goal achieved! \uD83C\uDF89', 'success');
  var cu = window.currentUser;
  if (cu && cu.member_id) loadGoalProgress(cu.member_id);
};

// ════════════════════════════════════════════════════════════
//  TRAINER DASHBOARD — Four New Feature Tabs
// ════════════════════════════════════════════════════════════

// ── Tab switcher ─────────────────────────────────────────────
window.switchTrainerTab = function switchTrainerTab(tab) {
  var tabs = ['overview', 'goals', 'checkin', 'roster', 'myshift'];
  tabs.forEach(function(t) {
    var panel = _gel('tr-tab-' + t);
    var btn   = _gel('tr-tab-btn-' + t);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn) {
      btn.className = t === tab ? 'btn btn-p btn-sm' : 'btn btn-s btn-sm';
      btn.style.cssText = 'border-radius:7px 7px 0 0;margin-bottom:-1px;border-bottom:3px solid ' +
        (t === tab ? 'var(--primary)' : 'transparent');
    }
  });
  // Lazy-load the activated tab's data
  if (tab === 'goals')   loadTrainerGoals();
  if (tab === 'checkin') { loadTrainerCiMembers(); loadTrainerCheckins(); loadTrainerAttTable(); }
  if (tab === 'roster')  loadTrainerRosterClasses();
  if (tab === 'myshift') { loadTrainerShifts(); loadTrainerShiftStats(); }
};

// ════════════════════════════════════════════════════════════
//  FEATURE 1 — MEMBER GOALS TRACKER
// ════════════════════════════════════════════════════════════

window.loadTrainerGoals = async function loadTrainerGoals() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  var search  = (_gel('tr-goal-search')  || {}).value || '';
  var filter  = (_gel('tr-goal-filter') || {}).value || '';

  // Fetch all members assigned to this trainer
  var members = await (sid
    ? qry('SELECT m.*, ms.status as ms_status FROM members m ' +
          'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=' +
          '(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
          'WHERE m.trainer_id=? ORDER BY m.fname', [sid])
    : qry('SELECT m.*, ms.status as ms_status FROM members m ' +
          'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=' +
          '(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
          'ORDER BY m.fname'));

  // Fetch all goals for these members in one query
  var mids = members.map(function(m){ return m.id; });
  var goals = mids.length
    ? await qry('SELECT * FROM member_goals WHERE member_id IN (' + mids.map(function(){ return '?'; }).join(',') + ') ORDER BY updated_at DESC', mids)
    : [];

  // Build map: member_id -> latest goal
  var goalMap = {};
  goals.forEach(function(g) {
    if (!goalMap[g.member_id]) goalMap[g.member_id] = g;
  });

  // Filter
  var filtered = members.filter(function(m) {
    if (search && !(m.fname + ' ' + m.lname).toLowerCase().includes(search.toLowerCase())) return false;
    var g = goalMap[m.id];
    if (filter === 'has_goal')    return !!g;
    if (filter === 'no_goal')     return !g;
    if (filter === 'achieved')    return g && g.achieved == 1;
    if (filter === 'in_progress') return g && !g.achieved;
    return true;
  });

  var grid = _gel('tr-goals-grid');
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎯</div><p>No members match the filter</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(function(m) {
    var g = goalMap[m.id];
    var statusBadge = m.ms_status === 'active' ? 'active' : m.ms_status === 'expired' ? 'expired' : 'pending';

    var goalHtml = '';
    if (!g) {
      goalHtml =
        '<div style="padding:10px;background:var(--surface2);border-radius:8px;text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:10px">' +
          '⚬ No goal set yet' +
        '</div>';
    } else {
      var isCustom = g.goal_type === 'custom';
      var achieved = g.achieved == 1;
      var typeLabel = g.goal_type === 'weight_loss' ? '⬇ Weight Loss'
                    : g.goal_type === 'weight_gain' ? '⬆ Weight Gain'
                    : '✦ ' + (g.goal_label || 'Custom Goal');

      if (isCustom) {
        goalHtml =
          '<div style="padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:10px">' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">' + typeLabel + '</div>' +
            (achieved
              ? '<span class="badge active" style="font-size:10px">✓ Achieved</span>'
              : '<span class="badge pending" style="font-size:10px">In Progress</span>') +
            (g.notes ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">' + g.notes + '</div>' : '') +
          '</div>';
      } else {
        var start   = parseFloat(g.start_value)   || 0;
        var target  = parseFloat(g.target_value)  || 0;
        var current = parseFloat(g.current_value) || start;
        var isLoss  = g.goal_type === 'weight_loss';
        var totalChange = Math.abs(target - start);
        var madeChange  = isLoss ? (start - current) : (current - start);
        var pct = totalChange > 0 ? Math.min(100, Math.max(0, Math.round((madeChange / totalChange) * 100))) : 0;
        var barColor = achieved ? 'var(--success)' : pct >= 60 ? 'var(--primary)' : pct >= 30 ? 'var(--warning)' : '#f43f5e';

        goalHtml =
          '<div style="padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:10px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
              '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + typeLabel + '</span>' +
              (achieved
                ? '<span class="badge active" style="font-size:10px">✓ Achieved</span>'
                : '<span style="font-size:12px;font-weight:800;color:' + barColor + '">' + pct + '%</span>') +
            '</div>' +
            '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:8px">' +
              '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:4px;transition:width .5s ease"></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)">' +
              '<span>Start: <b style="color:var(--text)">' + start.toFixed(1) + ' kg</b></span>' +
              '<span>Now: <b style="color:' + barColor + '">' + current.toFixed(1) + ' kg</b></span>' +
              '<span>Goal: <b style="color:var(--text)">' + target.toFixed(1) + ' kg</b></span>' +
            '</div>' +
          '</div>';
      }
    }

    return '<div class="eq-card" style="gap:8px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
        '<div class="mav" style="width:38px;height:38px;font-size:13px;flex-shrink:0">' + _ini(m.fname, m.lname) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:14px">' + m.fname + ' ' + m.lname + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted)">' + (m.phone || m.email || '—') + '</div>' +
        '</div>' +
        '<span class="badge ' + statusBadge + '" style="font-size:10px;flex-shrink:0">' + (m.ms_status || '—') + '</span>' +
      '</div>' +
      goalHtml +
      '<button class="btn btn-s btn-sm" style="width:100%" onclick="openTrainerGoalModal(' + m.id + ',' + (g ? g.id : 0) + ',\'' + m.fname.replace(/'/g,"\\'") + ' ' + m.lname.replace(/'/g,"\\'") + '\')">' +
        (g ? '✏️ Update Goal' : '🎯 Set Goal') +
      '</button>' +
    '</div>';
  }).join('');
};

window.filterTrainerGoals = function filterTrainerGoals() {
  loadTrainerGoals();
};

window.openTrainerGoalModal = async function openTrainerGoalModal(memberId, goalId, memberName) {
  _gel('tr-goal-member-id').value = memberId;
  _gel('tr-goal-id').value        = goalId || '';
  _gel('tr-goal-member-name').textContent = '👤 ' + memberName;

  if (goalId) {
    var rows = await qry('SELECT * FROM member_goals WHERE id=?', [goalId]);
    var g = rows && rows[0];
    if (g) {
      _gel('tr-goal-type').value    = g.goal_type    || 'weight_loss';
      _gel('tr-goal-label').value   = g.goal_label   || '';
      _gel('tr-goal-start').value   = g.start_value  || '';
      _gel('tr-goal-target').value  = g.target_value || '';
      _gel('tr-goal-current').value = g.current_value|| '';
      _gel('tr-goal-notes').value   = g.notes        || '';
    }
  } else {
    ['tr-goal-type','tr-goal-label','tr-goal-start','tr-goal-target','tr-goal-current','tr-goal-notes']
      .forEach(function(id){ var e = _gel(id); if (e) e.value = ''; });
    _gel('tr-goal-type').value = 'weight_loss';
  }
  trToggleGoalFields();
  openM('mo-tr-goal');
};

window.trToggleGoalFields = function trToggleGoalFields() {
  var type     = (_gel('tr-goal-type') || {}).value || 'weight_loss';
  var isCustom = type === 'custom';
  var lr = _gel('tr-goal-label-row');   if (lr) lr.style.display   = isCustom ? '' : 'none';
  var sr = _gel('tr-goal-start-row');   if (sr) sr.style.display   = isCustom ? 'none' : '';
  var tr = _gel('tr-goal-target-row');  if (tr) tr.style.display   = isCustom ? 'none' : '';
  var cr = _gel('tr-goal-current-row'); if (cr) cr.style.display   = isCustom ? 'none' : '';
};

window.saveTrainerGoal = async function saveTrainerGoal() {
  var mid     = parseInt(_gv('tr-goal-member-id'));
  var gid     = parseInt(_gv('tr-goal-id'))   || 0;
  var type    = _gv('tr-goal-type');
  var label   = _gv('tr-goal-label');
  var start   = parseFloat(_gv('tr-goal-start'))   || null;
  var target  = parseFloat(_gv('tr-goal-target'))  || null;
  var current = parseFloat(_gv('tr-goal-current')) || null;
  var notes   = _gv('tr-goal-notes');
  var isCustom = type === 'custom';

  if (!mid) { toast('Member not found', 'error'); return; }
  if (!isCustom && (!start || !target)) { toast('Enter starting and target weight', 'error'); return; }
  if (isCustom && !label.trim())        { toast('Enter a goal label', 'error'); return; }

  var achieved = (!isCustom && current && target &&
    ((type === 'weight_loss' && current <= target) || (type === 'weight_gain' && current >= target))) ? 1 : 0;

  if (gid) {
    await run(
      'UPDATE member_goals SET goal_type=?,goal_label=?,start_value=?,target_value=?,current_value=?,notes=?,achieved=? WHERE id=?',
      [type, label, isCustom?null:start, isCustom?null:target, isCustom?null:current, notes, achieved, gid]
    );
  } else {
    await run(
      'INSERT INTO member_goals(member_id,goal_type,goal_label,start_value,target_value,current_value,unit,notes) VALUES(?,?,?,?,?,?,?,?)',
      [mid, type, label, isCustom?null:start, isCustom?null:target, isCustom?null:current, 'kg', notes]
    );
  }
  closeM('mo-tr-goal');
  toast('Goal saved! 🎯', 'success');
  if (achieved) toast('🎉 Goal achieved! Great work!', 'success');
  loadTrainerGoals();
};

// ════════════════════════════════════════════════════════════
//  FEATURE 2 — QUICK CHECK-IN LOGGER
// ════════════════════════════════════════════════════════════

window.loadTrainerCiMembers = async function loadTrainerCiMembers() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  var mems = await (sid
    ? qry('SELECT id, fname, lname FROM members WHERE trainer_id=? ORDER BY fname', [sid])
    : qry('SELECT id, fname, lname FROM members ORDER BY fname'));

  var sel = _gel('tr-ci-member');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select member —</option>' +
    mems.map(function(m) {
      return '<option value="' + m.id + '">' + m.fname + ' ' + m.lname + '</option>';
    }).join('');

  // Default time to now
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) +
            'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  var ci = _gel('tr-ci-in'); if (ci) ci.value = dt;
  var co = _gel('tr-ci-out'); if (co) co.value = '';
};

window.trainerCheckIn = async function trainerCheckIn() {
  var mid   = _gv('tr-ci-member');
  var inT   = _gv('tr-ci-in') || _ndt();
  var outT  = _gv('tr-ci-out') || null;
  if (!mid) { toast('Please select a member', 'error'); return; }
  if (outT && new Date(outT) <= new Date(inT)) { toast('Check-out must be after check-in', 'error'); return; }

  await run('INSERT INTO attendance(member_id,checkin_time,checkout_time) VALUES(?,?,?)',
    [mid, inT, outT || null]);
  toast('Check-in logged! ✅', 'success');

  // Reset
  var co = _gel('tr-ci-out'); if (co) co.value = '';
  var nt = _gel('tr-ci-notes'); if (nt) nt.value = '';
  var ms = _gel('tr-ci-member'); if (ms) ms.value = '';

  loadTrainerCheckins();
  loadTrainerAttTable();
  dash(); // refresh stat strip
};

window.loadTrainerCheckins = async function loadTrainerCheckins() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  var today = _td();

  var rows = await (sid
    ? qry('SELECT a.*, m.fname, m.lname FROM attendance a JOIN members m ON m.id=a.member_id ' +
          'WHERE m.trainer_id=? AND DATE(a.checkin_time)=? ORDER BY a.checkin_time DESC', [sid, today])
    : qry('SELECT a.*, m.fname, m.lname FROM attendance a JOIN members m ON m.id=a.member_id ' +
          'WHERE DATE(a.checkin_time)=? ORDER BY a.checkin_time DESC', [today]));

  var box = _gel('tr-today-checkins');
  if (!box) return;

  if (!rows || !rows.length) {
    box.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--text-muted)">' +
      '<div style="font-size:32px;margin-bottom:8px">🌅</div>' +
      '<div style="font-weight:600">No check-ins today yet</div></div>';
    return;
  }

  box.innerHTML = rows.map(function(r) {
    var inTime = new Date(r.checkin_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    var isActive = !r.checkout_time;
    var dur = '—';
    if (!isActive) {
      var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
      dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    }
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div class="mav" style="width:32px;height:32px;font-size:12px;flex-shrink:0">' + _ini(r.fname, r.lname) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:13px">' + r.fname + ' ' + r.lname + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted)">⏰ ' + inTime +
          (isActive ? ' &nbsp;·&nbsp; <span style="color:var(--success);font-weight:600">Here now</span>'
                    : ' &nbsp;·&nbsp; ' + dur) +
        '</div>' +
      '</div>' +
      (isActive
        ? '<button class="btn btn-s btn-sm" onclick="trainerCheckOut(' + r.id + ')">🚪 Out</button>'
        : '<span style="font-size:11px;color:var(--text-muted)">Done</span>') +
    '</div>';
  }).join('');
};

window.trainerCheckOut = async function trainerCheckOut(attId) {
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) +
            ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':00';
  await run('UPDATE attendance SET checkout_time=? WHERE id=?', [dt, attId]);
  toast('Checked out! 👋', 'success');
  loadTrainerCheckins();
  loadTrainerAttTable();
  dash();
};

window.loadTrainerAttTable = async function loadTrainerAttTable(search) {
  if (!search) search = (_gel('tr-att-search') || {}).value || '';
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;

  var sql = 'SELECT a.*, m.fname, m.lname FROM attendance a JOIN members m ON m.id=a.member_id WHERE 1=1';
  var pr  = [];
  if (sid) { sql += ' AND m.trainer_id=?'; pr.push(sid); }
  if (search) { sql += ' AND (m.fname LIKE ? OR m.lname LIKE ?)'; pr.push('%'+search+'%','%'+search+'%'); }
  sql += ' ORDER BY a.checkin_time DESC LIMIT 100';

  var rows = await qry(sql, pr);
  var tbl  = _gel('tr-att-table');
  if (!tbl) return;

  tbl.innerHTML = rows.length ? rows.map(function(r) {
    var dur = '—';
    if (r.checkout_time) {
      var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
      dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    }
    var isActive = !r.checkout_time;
    return '<tr>' +
      '<td><div class="fc"><div class="mav" style="width:28px;height:28px;font-size:11px">' + _ini(r.fname,r.lname) + '</div>' + r.fname + ' ' + r.lname + '</div></td>' +
      '<td>' + new Date(r.checkin_time).toLocaleString() + '</td>' +
      '<td>' + (isActive ? '<span class="badge active">Here now</span>' : new Date(r.checkout_time).toLocaleString()) + '</td>' +
      '<td>' + dur + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
        '<button class="btn btn-sm btn-s" onclick="openTrainerAttEdit(' + r.id + ',\'' + (r.checkin_time||'').replace('T',' ').slice(0,16) + '\',\'' + (r.checkout_time||'').replace('T',' ').slice(0,16) + '\')">✏️</button>' +
        '<button class="btn btn-sm btn-d" onclick="deleteTrainerAtt(' + r.id + ')">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="5"><div class="empty"><div class="empty-ico">📋</div><p>No records</p></div></td></tr>';
};

window.filterTrainerAtt = function filterTrainerAtt() { loadTrainerAttTable(); };

window.openTrainerAttEdit = function openTrainerAttEdit(id, inTime, outTime) {
  _gel('tr-att-edit-id').value = id;
  var toLocal = function(s){ return (s||'').trim().replace(' ','T').slice(0,16); };
  var ei = _gel('tr-att-edit-in');  if (ei) ei.value = toLocal(inTime);
  var eo = _gel('tr-att-edit-out'); if (eo) eo.value = toLocal(outTime);
  openM('mo-tr-att-edit');
};

window.saveTrainerAtt = async function saveTrainerAtt() {
  var id   = _gv('tr-att-edit-id');
  var inT  = _gv('tr-att-edit-in');
  var outT = _gv('tr-att-edit-out') || null;
  if (!id || !inT) { toast('Check-in time is required', 'error'); return; }
  if (outT && new Date(outT) <= new Date(inT)) { toast('Check-out must be after check-in', 'error'); return; }
  await run('UPDATE attendance SET checkin_time=?, checkout_time=? WHERE id=?', [inT, outT, id]);
  closeM('mo-tr-att-edit');
  toast('Record updated! ✅', 'success');
  loadTrainerCheckins();
  loadTrainerAttTable();
  dash();
};

window.deleteTrainerAtt = async function deleteTrainerAtt(id) {
  if (!confirm('Delete this attendance record?')) return;
  await run('DELETE FROM attendance WHERE id=?', [id]);
  toast('Deleted', 'info');
  loadTrainerCheckins();
  loadTrainerAttTable();
  dash();
};

// ════════════════════════════════════════════════════════════
//  FEATURE 3 — CLASS ROSTER
// ════════════════════════════════════════════════════════════

window.loadTrainerRosterClasses = async function loadTrainerRosterClasses() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;

  var cls = await (sid
    ? qry('SELECT c.* FROM classes c JOIN class_trainers ct ON ct.class_id=c.id WHERE ct.staff_id=? ' +
          'ORDER BY FIELD(c.day,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"), c.time', [sid])
    : qry('SELECT * FROM classes ORDER BY FIELD(day,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"), time'));

  var sel = _gel('tr-roster-class');
  if (!sel) return;

  if (!cls.length) {
    sel.innerHTML = '<option value="">— No classes assigned —</option>';
    var grid = _gel('tr-roster-grid');
    if (grid) grid.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><p>No classes assigned to you yet</p></div>';
    return;
  }

  sel.innerHTML = '<option value="">— Select a class —</option>' +
    cls.map(function(c) {
      var parts = (c.time||'00:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
      return '<option value="' + c.id + '">' + c.name + ' · ' + c.day + ' ' + ts + '</option>';
    }).join('');
};

window.loadClassRoster = async function loadClassRoster() {
  var cid  = parseInt(_gv('tr-roster-class')) || 0;
  var cu   = window.currentUser;
  var sid  = cu && cu.staff_id ? cu.staff_id : null;
  var grid = _gel('tr-roster-grid');
  var info = _gel('tr-roster-class-info');

  if (!cid) {
    if (grid) grid.innerHTML = '<div class="empty"><div class="empty-ico">📋</div><p>Select a class above</p></div>';
    if (info) info.style.display = 'none';
    return;
  }

  // Load class info
  var cls = (await qry('SELECT * FROM classes WHERE id=?', [cid]))[0];
  if (!cls) return;

  if (info) {
    info.style.display = '';
    var parts = (cls.time||'00:00').split(':');
    var h = parseInt(parts[0]), m = parts[1]||'00';
    var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
    info.innerHTML =
      '<div style="background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.04));border:1px solid rgba(249,115,22,.2);border-radius:12px;padding:16px;display:flex;align-items:center;gap:20px">' +
        '<div style="font-size:36px">🏋️</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:18px;font-weight:800">' + cls.name + '</div>' +
          '<div style="font-size:13px;color:var(--text-muted);margin-top:4px">' +
            '<span class="badge pending" style="font-size:11px">' + cls.day + '</span> &nbsp;' +
            '⏰ ' + ts + ' &nbsp;·&nbsp; ⏱ ' + (cls.duration||60) + ' min &nbsp;·&nbsp; 👥 Cap: ' + (cls.capacity||'—') +
          '</div>' +
        '</div>' +
        '<div id="tr-roster-count" style="text-align:right">' +
          '<div style="font-size:11px;color:var(--text-muted)">Enrolled</div>' +
          '<div style="font-size:28px;font-weight:800;color:var(--primary)">…</div>' +
        '</div>' +
      '</div>';
  }

  // Enrolled = all members whose trainer teaches this class (trainer_id -> class_trainers -> class)
  var members;
  if (sid) {
    members = await qry(
      'SELECT m.*, ms.status as ms_status, ms.end_date, p.name as pn, ' +
      '(SELECT checkin_time FROM attendance WHERE member_id=m.id ORDER BY checkin_time DESC LIMIT 1) as last_ci ' +
      'FROM members m ' +
      'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=' +
      '(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
      'LEFT JOIN plans p ON p.id=ms.plan_id ' +
      'WHERE m.trainer_id=? ORDER BY m.fname', [sid]
    );
  } else {
    // Admin fallback — show all members
    members = await qry(
      'SELECT m.*, ms.status as ms_status, ms.end_date, p.name as pn, ' +
      '(SELECT checkin_time FROM attendance WHERE member_id=m.id ORDER BY checkin_time DESC LIMIT 1) as last_ci ' +
      'FROM members m ' +
      'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=' +
      '(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
      'LEFT JOIN plans p ON p.id=ms.plan_id ORDER BY m.fname'
    );
  }

  // Update count
  var countEl = _gel('tr-roster-count');
  if (countEl) {
    countEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Enrolled</div>' +
      '<div style="font-size:28px;font-weight:800;color:var(--primary)">' + members.length + '</div>';
  }

  if (!grid) return;
  if (!members.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ico">👥</div><p>No members assigned to you</p></div>';
    return;
  }

  grid.innerHTML = members.map(function(m) {
    var lastCi  = m.last_ci ? new Date(m.last_ci) : null;
    var daysAgo = lastCi ? Math.floor((new Date() - lastCi) / 86400000) : null;
    var actCol  = daysAgo === null ? 'var(--text-muted)'
                : daysAgo === 0   ? 'var(--success)'
                : daysAgo <= 3    ? 'var(--primary)'
                : daysAgo <= 7    ? 'var(--warning)' : '#f43f5e';
    var actLbl  = daysAgo === null ? 'Never' : daysAgo === 0 ? 'Today ✅' : daysAgo + 'd ago';
    var msColor = m.ms_status === 'active' ? 'var(--success)' : m.ms_status === 'expired' ? '#f43f5e' : 'var(--warning)';

    return '<div class="eq-card" style="gap:8px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="mav" style="width:36px;height:36px;font-size:12px;flex-shrink:0">' + _ini(m.fname, m.lname) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + m.fname + ' ' + m.lname + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted)">' + (m.phone || m.email || '—') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">' +
        '<span style="color:var(--text-muted)">' + (m.pn || 'No plan') + '</span>' +
        '<span style="font-weight:700;color:' + msColor + ';text-transform:capitalize">' + (m.ms_status||'—') + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;font-size:12px">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + actCol + ';flex-shrink:0"></div>' +
        '<span style="color:var(--text-muted)">Last visit:</span>' +
        '<span style="font-weight:600;color:' + actCol + '">' + actLbl + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
};

// ════════════════════════════════════════════════════════════
//  FEATURE 4 — MY SCHEDULE / SHIFT CLOCK-IN
// ════════════════════════════════════════════════════════════

window.loadTrainerShiftStats = async function loadTrainerShiftStats() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  if (!sid) return;

  var monthStart = _td().slice(0,7) + '-01';

  // Check if currently clocked in (no checkout)
  var active = await qry(
    'SELECT * FROM staff_attendance WHERE staff_id=? AND checkout_time IS NULL ORDER BY checkin_time DESC LIMIT 1', [sid]
  );
  var isOnDuty = active && active.length > 0;

  var statusEl = _gel('tr-shift-status');
  var statusTxt = _gel('tr-shift-status-text');
  if (statusEl && statusTxt) {
    statusEl.style.background = isOnDuty
      ? 'linear-gradient(135deg,rgba(34,197,94,.12),rgba(34,197,94,.04))'
      : 'var(--surface2)';
    statusEl.style.border = '1px solid ' + (isOnDuty ? 'rgba(34,197,94,.3)' : 'var(--border)');
    statusTxt.innerHTML = isOnDuty
      ? '<span style="color:var(--success)">🟢 On Duty</span> <span style="font-size:13px;font-weight:400;color:var(--text-muted)">since ' + new Date(active[0].checkin_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</span>'
      : '<span style="color:var(--text-muted)">⚫ Off Duty</span>';
  }

  // Toggle clock in/out buttons
  var cinBtn = _gel('tr-shift-clockin-btn');
  var coutBtn = _gel('tr-shift-clockout-btn');
  if (cinBtn)  { cinBtn.disabled  = isOnDuty; cinBtn.style.opacity  = isOnDuty ? '0.5' : '1'; }
  if (coutBtn) { coutBtn.disabled = !isOnDuty; coutBtn.style.opacity = !isOnDuty ? '0.5' : '1'; }
  if (coutBtn && isOnDuty) coutBtn.dataset.attId = active[0].id;

  // This month's hours
  var rows = await qry(
    'SELECT checkin_time, checkout_time FROM staff_attendance WHERE staff_id=? AND DATE(checkin_time)>=? AND checkout_time IS NOT NULL',
    [sid, monthStart]
  );
  var totalMins = 0;
  (rows||[]).forEach(function(r) {
    var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
    if (mins > 0 && mins < 900) totalMins += mins;
  });
  var hrs  = Math.floor(totalMins / 60);
  var mins = totalMins % 60;

  var allSessions = await qry(
    'SELECT COUNT(*) as c FROM staff_attendance WHERE staff_id=? AND DATE(checkin_time)>=?', [sid, monthStart]
  );

  var hEl = _gel('tr-shift-hours');
  var sEl = _gel('tr-shift-sessions');
  if (hEl) hEl.textContent = hrs + 'h ' + mins + 'm';
  if (sEl) sEl.textContent = allSessions && allSessions[0] ? allSessions[0].c : 0;

  // Schedule text from staff record
  var staffRow = await qry('SELECT schedule FROM staff WHERE id=?', [sid]);
  var schEl = _gel('tr-shift-schedule-text');
  if (schEl && staffRow && staffRow[0]) {
    schEl.textContent = staffRow[0].schedule || '— Not set —';
  }

  // Pre-fill clock-in time
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+'T'+pad(now.getHours())+':'+pad(now.getMinutes());
  var si = _gel('tr-shift-in');  if (si && !si.value) si.value = dt;
  var so = _gel('tr-shift-out'); if (so) so.value = '';
};

window.trainerClockIn = async function trainerClockIn() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  if (!sid) { toast('No staff account linked', 'error'); return; }

  // Check not already clocked in
  var active = await qry('SELECT id FROM staff_attendance WHERE staff_id=? AND checkout_time IS NULL LIMIT 1', [sid]);
  if (active && active.length) { toast('You are already clocked in! Clock out first.', 'error'); return; }

  var inT   = _gv('tr-shift-in') || _ndt();
  var outT  = _gv('tr-shift-out') || null;
  var notes = _gv('tr-shift-notes') || '';

  await run('INSERT INTO staff_attendance(staff_id,checkin_time,checkout_time,notes) VALUES(?,?,?,?)',
    [sid, inT, outT||null, notes]);

  var nt = _gel('tr-shift-notes'); if (nt) nt.value = '';
  toast('Clocked in! 🟢', 'success');
  loadTrainerShiftStats();
  loadTrainerShifts();
};

window.trainerClockOut = async function trainerClockOut() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  var btn = _gel('tr-shift-clockout-btn');
  var attId = btn && btn.dataset.attId ? parseInt(btn.dataset.attId) : null;
  if (!attId) { toast('No active shift found', 'error'); return; }

  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':00';

  await run('UPDATE staff_attendance SET checkout_time=? WHERE id=?', [dt, attId]);
  toast('Clocked out! ⚫', 'success');
  loadTrainerShiftStats();
  loadTrainerShifts();
};

window.loadTrainerShifts = async function loadTrainerShifts() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  if (!sid) return;

  var rows = await qry(
    'SELECT * FROM staff_attendance WHERE staff_id=? ORDER BY checkin_time DESC LIMIT 60', [sid]
  );
  var tbl = _gel('tr-shift-table');
  if (!tbl) return;

  tbl.innerHTML = rows && rows.length ? rows.map(function(r) {
    var cin = new Date(r.checkin_time);
    var dateStr = cin.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
    var cinStr  = cin.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    var isActive = !r.checkout_time;
    var coutStr = isActive ? '<span class="badge active" style="font-size:10px">On duty</span>' : new Date(r.checkout_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    var dur = '—';
    if (!isActive) {
      var mins = Math.round((new Date(r.checkout_time) - new Date(r.checkin_time)) / 60000);
      dur = Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    }
    return '<tr>' +
      '<td style="font-weight:600">' + dateStr + '</td>' +
      '<td style="color:var(--primary);font-weight:700">' + cinStr + '</td>' +
      '<td>' + coutStr + '</td>' +
      '<td>' + dur + '</td>' +
      '<td style="color:var(--text-muted);font-size:12px">' + (r.notes||'—') + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
        '<button class="btn btn-sm btn-s" onclick="openTrainerShiftEdit(' + r.id + ',\'' + (r.checkin_time||'').replace('T',' ').slice(0,16) + '\',\'' + (r.checkout_time||'').replace('T',' ').slice(0,16) + '\',\'' + (r.notes||'').replace(/'/g,"\\'") + '\')">✏️</button>' +
        '<button class="btn btn-sm btn-d" onclick="deleteTrainerShift(' + r.id + ')">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="6"><div class="empty"><div class="empty-ico">🕐</div><p>No shift records yet</p></div></td></tr>';
};

window.openTrainerShiftEdit = function openTrainerShiftEdit(id, inTime, outTime, notes) {
  _gel('tr-shift-edit-id').value = id;
  var toLocal = function(s){ return (s||'').trim().replace(' ','T').slice(0,16); };
  var ei = _gel('tr-shift-edit-in');    if (ei) ei.value = toLocal(inTime);
  var eo = _gel('tr-shift-edit-out');   if (eo) eo.value = toLocal(outTime);
  var en = _gel('tr-shift-edit-notes'); if (en) en.value = notes || '';
  openM('mo-tr-shift-edit');
};

window.saveTrainerShift = async function saveTrainerShift() {
  var id   = _gv('tr-shift-edit-id');
  var inT  = _gv('tr-shift-edit-in');
  var outT = _gv('tr-shift-edit-out') || null;
  var notes= _gv('tr-shift-edit-notes') || '';
  if (!id || !inT) { toast('Clock-in time required', 'error'); return; }
  if (outT && new Date(outT) <= new Date(inT)) { toast('Clock-out must be after clock-in', 'error'); return; }
  await run('UPDATE staff_attendance SET checkin_time=?, checkout_time=?, notes=? WHERE id=?', [inT, outT, notes, id]);
  closeM('mo-tr-shift-edit');
  toast('Shift updated! ✅', 'success');
  loadTrainerShifts();
  loadTrainerShiftStats();
};

window.deleteTrainerShift = async function deleteTrainerShift(id) {
  if (!confirm('Delete this shift record?')) return;
  await run('DELETE FROM staff_attendance WHERE id=?', [id]);
  toast('Deleted', 'info');
  loadTrainerShifts();
  loadTrainerShiftStats();
};

// ── Override dashTrainer to also init the Overview tab state ──
var _origDashTrainer = window.dashTrainer;
window.dashTrainer = async function dashTrainer() {
  await _origDashTrainer();
  // Ensure Overview tab is visible by default on login
  switchTrainerTab('overview');
};

// ============================================================
//  TRAINER COACHING DASHBOARD (Members page)
// ============================================================
window.renderTrainerCoachingDashboard = async function renderTrainerCoachingDashboard(s, st) {
  var cu  = window.currentUser || {};
  var sid = cu.staff_id ? parseInt(cu.staff_id, 10) : null;
  var today = _td();

  // If staff_id is missing from the session, try to recover it from the DB
  if (!sid && cu.username) {
    var authRow = await qry('SELECT staff_id FROM auth_users WHERE username=?', [cu.username]);
    if (authRow[0] && authRow[0].staff_id) {
      sid = parseInt(authRow[0].staff_id, 10);
      cu.staff_id = sid;
      window.currentUser = cu;
      try { localStorage.setItem('fitcore_session', JSON.stringify(cu)); } catch(e) {}
    }
  }

  if (!sid) {
    // Still no staff_id — show empty state gracefully
    var grid = _gel('tr-coaching-cards');
    if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ico">&#128101;</div><p>No staff account linked. Contact admin.</p></div>';
    return;
  }

  var sql =
    'SELECT m.id, m.fname, m.lname, m.email, m.phone, m.status, m.medical_notes, m.trainer_notes, ' +
    'ms.status AS ms_status, ms.end_date, p.name AS pn, ' +
    '(SELECT checkin_time FROM attendance WHERE member_id=m.id ORDER BY checkin_time DESC LIMIT 1) AS last_ci, ' +
    '(SELECT COUNT(*) FROM attendance WHERE member_id=m.id AND DATE(checkin_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS checkins_30d, ' +
    '(SELECT COUNT(*) FROM attendance WHERE member_id=m.id AND DATE(checkin_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS checkins_7d, ' +
    '(SELECT goal FROM ai_recs WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) AS ai_goal, ' +
    '(SELECT bmi FROM ai_recs WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) AS ai_bmi, ' +
    '(SELECT experience FROM ai_recs WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) AS ai_exp, ' +
    '(SELECT goal_type FROM member_goals WHERE member_id=m.id AND achieved=0 ORDER BY created_at DESC LIMIT 1) AS goal_type, ' +
    '(SELECT ROUND(LEAST(100,GREATEST(0,(current_value/target_value)*100))) FROM member_goals WHERE member_id=m.id AND achieved=0 AND target_value>0 ORDER BY created_at DESC LIMIT 1) AS goal_pct ' +
    'FROM members m ' +
    'LEFT JOIN memberships ms ON ms.member_id=m.id AND ms.id=(SELECT id FROM memberships WHERE member_id=m.id ORDER BY created_at DESC LIMIT 1) ' +
    'LEFT JOIN plans p ON p.id=ms.plan_id ' +
    'WHERE m.trainer_id=?';
  // Always fetch the unfiltered total first so the Overview stat card stays correct
  var unfilteredTotal = await qry('SELECT COUNT(*) as c FROM members WHERE trainer_id=?', [sid]);
  var trMembersEl = _gel('tr-members');
  if (trMembersEl) trMembersEl.textContent = unfilteredTotal[0] ? unfilteredTotal[0].c : 0;

  var pr = [sid];
  if (s)  { sql += ' AND (m.fname LIKE ? OR m.lname LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)'; pr.push('%'+s+'%','%'+s+'%','%'+s+'%','%'+s+'%'); }
  if (st) { sql += ' AND m.status=?'; pr.push(st); }
  sql += ' ORDER BY m.fname';

  window._trainerCoachingData = await qry(sql, pr);
  _applyCoachingFilters(s, st);
};

window._applyCoachingFilters = function _applyCoachingFilters(s, st) {
  var data = window._trainerCoachingData || [];
  var today = _td();

  // Summary strip
  var total    = data.length;
  var active   = data.filter(function(m){ return m.status === 'active'; }).length;
  var todayIn  = data.filter(function(m){ return m.last_ci && (m.last_ci||'').slice(0,10) === today; }).length;
  var atRisk   = data.filter(function(m){ return parseInt(m.checkins_7d||0) === 0; }).length;

  // NOTE: tr-members (Overview stat card) is intentionally NOT updated here
  // because this function runs on filtered data; the true count is set by
  // renderTrainerCoachingDashboard using an unfiltered query.

  var strip = _gel('tr-coaching-strip');
  if (strip) strip.innerHTML =
    _coachStatCard('Total Members', total, 'Assigned to you', 'c1', '&#128101;') +
    _coachStatCard('Active', active, 'Active memberships', 'c2', '&#9989;') +
    _coachStatCard('Checked In Today', todayIn, 'From your members', 'c3', '&#128203;') +
    _coachStatCard('At Risk', atRisk, '0 visits this week', 'c4', '&#128680;');

  // Cards grid
  var grid = _gel('tr-coaching-cards');
  if (!grid) return;

  if (!data.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ico">&#128101;</div><p>No members found</p></div>';
    return;
  }

  grid.innerHTML = data.map(function(m) {
    var lastCi   = m.last_ci ? new Date(m.last_ci) : null;
    var daysAgo  = lastCi ? Math.floor((new Date() - lastCi) / 86400000) : null;
    var ciColor  = daysAgo === null ? 'var(--text-muted)'
                 : daysAgo === 0   ? 'var(--success)'
                 : daysAgo <= 3    ? 'var(--primary)'
                 : daysAgo <= 7    ? 'var(--warning)' : 'var(--danger)';
    var ciLabel  = daysAgo === null ? 'Never visited' : daysAgo === 0 ? 'Today' : daysAgo + 'd ago';

    // Activity bar (7 slots)
    var w7 = Math.min(7, parseInt(m.checkins_7d||0));
    var bar = '';
    for (var i = 0; i < 7; i++) {
      bar += '<div style="flex:1;height:8px;border-radius:4px;background:' + (i < w7 ? 'var(--primary)' : 'var(--border)') + '"></div>';
    }

    // Health flags
    var medHtml = '';
    if (m.medical_notes && m.medical_notes.trim() && m.medical_notes.toLowerCase() !== 'none') {
      var flags = m.medical_notes.split(/[,;.\n]+/).filter(function(f){ return f.trim().length > 0; }).slice(0,3);
      medHtml = '<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:8px 10px;margin-top:10px">' +
        '<div style="font-size:10px;font-weight:700;color:var(--danger);margin-bottom:4px">&#127973; Health Flags</div>' +
        flags.map(function(f){ return '<div style="font-size:11px;color:var(--text-muted)">- ' + f.trim() + '</div>'; }).join('') +
      '</div>';
    }

    // AI chips
    var chipHtml = '';
    if (m.ai_goal || m.ai_bmi) {
      var goalMap = { lose:'Lose Weight', muscle:'Gain Muscle', fit:'General Fitness' };
      var bmi = parseFloat(m.ai_bmi||0);
      var bmiColor = bmi < 18.5 ? 'var(--info)' : bmi < 25 ? 'var(--success)' : bmi < 30 ? 'var(--warning)' : 'var(--danger)';
      chipHtml = '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:10px">' +
        (m.ai_goal ? '<span style="font-size:10px;padding:3px 7px;border-radius:20px;background:rgba(249,115,22,.1);color:var(--primary);font-weight:600">&#127919; ' + (goalMap[m.ai_goal]||m.ai_goal) + '</span>' : '') +
        (bmi ? '<span style="font-size:10px;padding:3px 7px;border-radius:20px;background:rgba(99,102,241,.1);color:' + bmiColor + ';font-weight:600">&#128207; BMI ' + bmi.toFixed(1) + '</span>' : '') +
        (m.ai_exp ? '<span style="font-size:10px;padding:3px 7px;border-radius:20px;background:var(--surface2);color:var(--text-muted);font-weight:600">' + m.ai_exp + '</span>' : '') +
      '</div>';
    }

    // Goal progress
    var goalHtml = '';
    if (m.goal_type && m.goal_pct !== null && m.goal_pct !== undefined) {
      var pct = parseInt(m.goal_pct||0);
      var glabel = m.goal_type === 'weight_loss' ? '&#127939; Lose Weight' : m.goal_type === 'weight_gain' ? '&#128170; Gain Weight' : '&#127919; Custom Goal';
      goalHtml = '<div style="margin-top:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;margin-bottom:4px">' +
          '<span>' + glabel + '</span><span style="color:var(--primary)">' + pct + '%</span>' +
        '</div>' +
        '<div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--primary),var(--success));border-radius:3px;transition:width .3s"></div>' +
        '</div>' +
      '</div>';
    }

    // Expiry warning
    var expiryHtml = '';
    if (m.end_date) {
      var daysLeft = Math.ceil((new Date(m.end_date) - new Date()) / 86400000);
      if (daysLeft < 0) {
        expiryHtml = '<div style="margin-top:6px;padding:4px 8px;border-radius:6px;background:rgba(239,68,68,.1);font-size:11px;color:var(--danger);font-weight:600">&#128680; Expired</div>';
      } else if (daysLeft <= 7) {
        expiryHtml = '<div style="margin-top:6px;padding:4px 8px;border-radius:6px;background:rgba(245,158,11,.1);font-size:11px;color:var(--warning);font-weight:600">&#9203; Expires in ' + daysLeft + 'd</div>';
      }
    }

    // Trainer notes panel
    var notes = (m.trainer_notes||'').trim();
    var notesPreview = notes ? notes.split('\n').slice(0,2).join(' ') : '';
    var notesHtml = '<div style="margin-top:10px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer" onclick="openTrainerNotes(' + m.id + ',\'' + (m.fname+' '+m.lname).replace(/'/g,"\\'") + '\',\'' + notes.replace(/'/g,"\\'").replace(/\n/g,' ') + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<span style="font-size:11px;font-weight:700">&#128203; Coaching Notes</span>' +
        '<span style="font-size:10px;color:var(--primary)">Edit &#8594;</span>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' +
        (notesPreview || '<em>No notes yet -- tap to add</em>') +
      '</div>' +
    '</div>';

    var statusColors = { active:'var(--success)', expired:'var(--danger)', paused:'var(--warning)' };
    var sColor = statusColors[m.status] || 'var(--text-muted)';

    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:0">' +
      // Header
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
        '<div class="mav" style="flex-shrink:0;width:42px;height:42px;font-size:15px">' + _ini(m.fname,m.lname) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:14px">' + m.fname + ' ' + m.lname + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (m.email||m.phone||'') + '</div>' +
        '</div>' +
        '<span style="font-size:11px;font-weight:700;color:' + sColor + ';text-transform:capitalize">' + (m.status||'--') + '</span>' +
      '</div>' +
      // Plan + expiry
      '<div style="font-size:12px;color:var(--text-muted)">&#127915; ' + (m.pn||'No plan') + '</div>' +
      expiryHtml +
      // Attendance
      '<div style="margin-top:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">' +
          '<span style="font-weight:600">&#128202; Attendance</span>' +
          '<span style="color:' + ciColor + ';font-weight:600">' + ciLabel + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:3px;margin-bottom:4px">' + bar + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted)">' + (m.checkins_7d||0) + ' this week &nbsp;|&nbsp; ' + (m.checkins_30d||0) + ' this month</div>' +
      '</div>' +
      medHtml + chipHtml + goalHtml + notesHtml +
    '</div>';
  }).join('');
};

window._coachStatCard = function _coachStatCard(label, val, sub, cls, icon) {
  return '<div class="stat-card ' + cls + '">' +
    '<div class="stat-label">' + label + '</div>' +
    '<div class="stat-val">' + val + '</div>' +
    '<div class="stat-sub">' + sub + '</div>' +
    '<div class="stat-icon">' + icon + '</div>' +
  '</div>';
};

window.filterTrainerMembers = function filterTrainerMembers() {
  var s  = (_gel('tr-members-search')||{}).value || '';
  var st = (_gel('tr-members-status')||{}).value || '';
  _applyCoachingFilters(s, st);
};

window.openTrainerNotes = async function openTrainerNotes(memberId, memberName, currentNotes) {
  var idEl = _gel('tn-member-id');   if (idEl) idEl.value = memberId;
  var nmEl = _gel('tn-member-name'); if (nmEl) nmEl.textContent = memberName;
  var ntEl = _gel('tn-notes');
  if (ntEl) {
    var rows = await qry('SELECT trainer_notes FROM members WHERE id=?', [memberId]);
    ntEl.value = (rows && rows[0] ? rows[0].trainer_notes : '') || '';
  }
  openM('mo-trainer-notes');
};

window.saveTrainerNotes = async function saveTrainerNotes() {
  var id    = (_gel('tn-member-id')||{}).value;
  var notes = (_gel('tn-notes')||{}).value || '';
  if (!id) return;
  await run('UPDATE members SET trainer_notes=? WHERE id=?', [notes, id]);
  closeM('mo-trainer-notes');
  toast('Notes saved! &#128203;', 'success');
  renderTrainerCoachingDashboard(
    (_gel('tr-members-search')||{}).value||'',
    (_gel('tr-members-status')||{}).value||''
  );
};

// ============================================================
//  TRAINER ATTENDANCE PAGE
// ============================================================
window.loadTrainerAttendancePage = async function loadTrainerAttendancePage() {
  var cu  = window.currentUser;
  var sid = cu && cu.staff_id ? cu.staff_id : null;
  var today = _td();
  var weekStart = (function() {
    var d = new Date(); var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    var mon = new Date(d.setDate(diff));
    return mon.toISOString().split('T')[0];
  })();

  var membersSql =
    'SELECT m.id, m.fname, m.lname, m.medical_notes, ' +
    '(SELECT COUNT(*) FROM attendance WHERE member_id=m.id AND DATE(checkin_time)=?) AS today_ci, ' +
    '(SELECT COUNT(*) FROM attendance WHERE member_id=m.id AND DATE(checkin_time)>=?) AS week_ci, ' +
    '(SELECT id FROM attendance WHERE member_id=m.id AND checkout_time IS NULL ORDER BY checkin_time DESC LIMIT 1) AS live_att_id, ' +
    '(SELECT checkin_time FROM attendance WHERE member_id=m.id AND checkout_time IS NULL ORDER BY checkin_time DESC LIMIT 1) AS live_since ' +
    'FROM members m WHERE 1=1';
  var mpr = [today, weekStart];
  if (sid) { membersSql += ' AND m.trainer_id=?'; mpr.push(sid); }
  membersSql += ' ORDER BY m.fname';

  var members = await qry(membersSql, mpr);

  var todayTotal  = members.reduce(function(s,m){ return s + parseInt(m.today_ci||0); }, 0);
  var liveNow     = members.filter(function(m){ return m.live_att_id; }).length;
  var weekTotal   = members.reduce(function(s,m){ return s + parseInt(m.week_ci||0); }, 0);
  var absentCount = members.filter(function(m){ return parseInt(m.week_ci||0) === 0; }).length;

  var set = function(id,v){ var e=_gel(id); if(e) e.textContent=v; };
  set('tr-att-today',  todayTotal);
  set('tr-att-now',    liveNow);
  set('tr-att-week',   weekTotal);
  set('tr-att-absent', absentCount);

  var livePanel = _gel('tr-att-live-panel');
  if (livePanel) {
    var live = members.filter(function(m){ return m.live_att_id; });
    if (!live.length) {
      livePanel.innerHTML =
        '<div style="text-align:center;padding:24px 0;color:var(--text-muted)">' +
        '<div style="font-size:32px;margin-bottom:8px">&#127939;</div>' +
        '<div style="font-weight:600">Nobody checked in right now</div>' +
        '</div>';
    } else {
      livePanel.innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">' +
        live.map(function(m) {
          var since   = new Date(m.live_since);
          var elapsed = Math.floor((new Date() - since) / 60000);
          var elStr   = elapsed < 60 ? elapsed + ' min' : Math.floor(elapsed/60) + 'h ' + (elapsed%60) + 'm';
          var sinceStr = since.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          var med = (m.medical_notes||'').trim();
          var hasMed = med && med.toLowerCase() !== 'none' && med.length > 0;
          return '<div class="tr-live-card">' +
            '<div style="position:relative">' +
              '<div class="mav" style="width:42px;height:42px;font-size:15px;flex-shrink:0">' + _ini(m.fname,m.lname) + '</div>' +
              '<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:var(--success);border:2px solid var(--surface2)"></span>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:700;font-size:14px">' + m.fname + ' ' + m.lname + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted)">In since ' + sinceStr + ' - <span style="color:var(--success);font-weight:600">' + elStr + '</span></div>' +
              (hasMed ? '<div style="font-size:10px;margin-top:3px;color:var(--danger)">&#127973; ' + med.split(/[,;\n]/)[0].trim() + '</div>' : '') +
            '</div>' +
            '<button class="btn btn-sm btn-s" onclick="trainerQuickCheckout(' + m.live_att_id + ')" title="Check out">&#128682;</button>' +
          '</div>';
        }).join('') + '</div>';
    }
  }

  var absentList = _gel('tr-absent-list');
  if (absentList) {
    var absent = members.filter(function(m){ return parseInt(m.week_ci||0) === 0; });
    if (!absent.length) {
      absentList.innerHTML = '<div style="text-align:center;padding:12px;color:var(--success);font-weight:600">&#10003; All members visited this week!</div>';
    } else {
      absentList.innerHTML = absent.map(function(m) {
        return '<div class="tr-absent-row">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div class="mav" style="width:34px;height:34px;font-size:12px;background:rgba(239,68,68,.15);color:var(--danger)">' + _ini(m.fname,m.lname) + '</div>' +
            '<div>' +
              '<div style="font-weight:700;font-size:13px">' + m.fname + ' ' + m.lname + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted)">0 visits this week</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-p" onclick="trainerQuickCheckin(' + m.id + ')">&#10003; Check In</button>' +
        '</div>';
      }).join('');
    }
  }

  await rAtt('');
};

window.toggleAbsentPanel = function toggleAbsentPanel() {
  var panel = _gel('tr-absent-panel');
  if (!panel) return;
  var isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (isHidden) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.trainerQuickCheckout = async function trainerQuickCheckout(attId) {
  if (!attId) return;
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':00';
  await run('UPDATE attendance SET checkout_time=? WHERE id=?', [dt, attId]);
  toast('Checked out &#10003;', 'success');
  loadTrainerAttendancePage();
  dash();
};

window.trainerQuickCheckin = async function trainerQuickCheckin(memberId) {
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':00';
  var active = await qry('SELECT id FROM attendance WHERE member_id=? AND checkout_time IS NULL LIMIT 1', [memberId]);
  if (active && active.length) { toast('Member is already checked in!', 'error'); return; }
  await run('INSERT INTO attendance(member_id,checkin_time) VALUES(?,?)', [memberId, dt]);
  toast('Checked in! &#10003;', 'success');
  var ap = _gel('tr-absent-panel'); if (ap) ap.style.display = 'none';
  loadTrainerAttendancePage();
  dash();
};

// ============================================================
//  TRAINER CLASSES PAGE
// ============================================================
window.renderTrainerClasses = async function renderTrainerClasses() {
  var cu  = window.currentUser || {};
  var sid = cu.staff_id || null;
  var days     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var todayDow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  var cls = sid ? await qry(
    "SELECT c.* FROM classes c JOIN class_trainers ct ON ct.class_id=c.id " +
    "WHERE ct.staff_id=? " +
    "ORDER BY CASE c.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 " +
    "WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 " +
    "WHEN 'Saturday' THEN 6 ELSE 7 END, c.time",
    [sid]
  ) : [];

  // Today spotlight
  var spotlight = _gel('cls-today-spotlight');
  if (spotlight) {
    var todayCls = cls.filter(function(c){ return c.day === todayDow; });
    if (!todayCls.length) {
      spotlight.innerHTML =
        '<div style="padding:16px 20px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;gap:14px;margin-bottom:4px">' +
          '<div style="font-size:30px">&#128564;</div>' +
          '<div><div style="font-weight:700;font-size:15px">No classes today</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">Next: ' + _trainerNextClass(cls, todayDow) + '</div>' +
          '</div></div>';
    } else {
      spotlight.innerHTML = todayCls.map(function(c) {
        var parts = (c.time||'08:00').split(':');
        var h = parseInt(parts[0]), mn = parseInt(parts[1]||0);
        var ts = (h%12||12)+':'+String(mn).padStart(2,'0')+(h<12?' AM':' PM');
        var now = new Date();
        var clsDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mn, 0);
        var diffMins = Math.round((clsDt - now) / 60000);
        var statusStr, statusColor, statusBg;
        if (diffMins > 0 && diffMins <= 120) {
          var ahead = diffMins >= 60 ? Math.floor(diffMins/60)+'h '+(diffMins%60)+'m' : diffMins+' min';
          statusStr = 'Starts in ' + ahead; statusColor = 'var(--warning)'; statusBg = 'rgba(245,158,11,.1)';
        } else if (diffMins <= 0 && diffMins > -(c.duration||60)) {
          statusStr = 'In Progress'; statusColor = 'var(--danger)'; statusBg = 'rgba(239,68,68,.1)';
        } else if (diffMins <= 0) {
          statusStr = 'Completed'; statusColor = 'var(--success)'; statusBg = 'rgba(34,197,94,.1)';
        } else {
          statusStr = 'Today at ' + ts; statusColor = 'var(--primary)'; statusBg = 'rgba(249,115,22,.08)';
        }
        return '<div style="padding:20px;background:linear-gradient(135deg,rgba(249,115,22,.1),rgba(249,115,22,.03));border:1px solid rgba(249,115,22,.25);border-radius:14px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:10px">' +
          '<div style="font-size:40px">&#127947;</div>' +
          '<div style="flex:1;min-width:180px">' +
            '<div style="font-size:18px;font-weight:800">' + c.name + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-top:4px">&#9200; ' + ts + ' &nbsp;|&nbsp; &#9203; ' + (c.duration||60) + ' min &nbsp;|&nbsp; &#128101; Cap: ' + (c.capacity||'--') + '</div>' +
            '<div style="margin-top:8px;display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;color:' + statusColor + ';background:' + statusBg + '">' + statusStr + '</div>' +
          '</div>' +
          '<button class="btn btn-p" onclick="openClassAttendance(' + c.id + ')" style="white-space:nowrap;padding:10px 20px;font-size:14px">&#128203; Take Attendance</button>' +
        '</div>';
      }).join('');
    }
  }

  // Weekly grid (their classes only)
  var sg = _gel('sched-grid-trainer');
  if (!sg) return;
  if (!cls.length) {
    sg.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-muted)"><div style="font-size:36px;margin-bottom:10px">&#128203;</div><div style="font-size:15px;font-weight:600;margin-bottom:6px">No Classes Assigned Yet</div><div style="font-size:13px">Ask your admin to assign you to classes.</div></div>';
    return;
  }
  sg.innerHTML = days.map(function(d) {
    var dc = cls.filter(function(c){ return c.day === d; });
    var isToday = d === todayDow;
    if (!dc.length) return '';
    return '<div class="sched-day' + (isToday ? ' today' : '') + '">' +
      '<div class="sched-day-label">' + d.slice(0,3).toUpperCase() + (isToday ? ' \u00B7 Today' : '') + '</div>' +
      '<div class="sched-day-body">' +
      dc.map(function(c) {
        var parts = (c.time||'00:00').split(':');
        var h = parseInt(parts[0]), m = parts[1]||'00';
        var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
        return '<div class="cls-block">' +
          '<div class="cls-time">' + ts + '</div>' +
          '<div class="cls-name">' + c.name + '</div>' +
          '<div class="cls-det">\u23F1 ' + (c.duration||60) + ' min \u00B7 \uD83D\uDC65 ' + (c.capacity||'\u2014') + '</div>' +
          '<button class="btn btn-sm btn-p" onclick="openClassAttendance(' + c.id + ')" style="width:100%;margin-top:6px;font-size:11px">&#128203; Attend</button>' +
        '</div>';
      }).join('') + '</div></div>';
  }).join('');
};

window._trainerNextClass = function _trainerNextClass(cls, todayDow) {
  if (!cls || !cls.length) return 'none scheduled';
  var order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var todayIdx = order.indexOf(todayDow);
  for (var i = 1; i <= 7; i++) {
    var d = order[(todayIdx + i) % 7];
    var found = cls.filter(function(c){ return c.day === d; });
    if (found.length) {
      var parts = (found[0].time||'08:00').split(':');
      var h = parseInt(parts[0]), m = parts[1]||'00';
      return d + ' - ' + found[0].name + ' at ' + (h%12||12)+':'+m+(h<12?' AM':' PM');
    }
  }
  return 'none upcoming';
};

window.openClassAttendance = async function openClassAttendance(classId) {
  var cu  = window.currentUser || {};
  var sid = cu.staff_id || null;
  var clsRows = await qry('SELECT * FROM classes WHERE id=?', [classId]);
  var cls = clsRows && clsRows[0];
  if (!cls) return;
  var parts = (cls.time||'08:00').split(':');
  var h = parseInt(parts[0]), m = parts[1]||'00';
  var ts = (h%12||12)+':'+m+(h<12?' AM':' PM');
  var nameEl = _gel('ca-class-name'); if (nameEl) nameEl.textContent = cls.name;
  var metaEl = _gel('ca-class-meta'); if (metaEl) metaEl.textContent = cls.day + ' - ' + ts + ' - ' + (cls.duration||60) + ' min - Cap: ' + (cls.capacity||'--');
  var cidEl  = _gel('ca-class-id');   if (cidEl)  cidEl.value = classId;

  var members = sid ? await qry(
    'SELECT m.id, m.fname, m.lname, m.medical_notes, ' +
    '(SELECT id FROM attendance WHERE member_id=m.id AND DATE(checkin_time)=CURDATE() LIMIT 1) as today_att ' +
    'FROM members m WHERE m.trainer_id=? ORDER BY m.fname', [sid]
  ) : [];

  var listEl = _gel('ca-member-list');
  if (!listEl) return;
  if (!members.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">No members assigned to you yet.</div>';
  } else {
    listEl.innerHTML = members.map(function(mem) {
      var alreadyIn = !!mem.today_att;
      var med = (mem.medical_notes||'').trim();
      var hasMed = med && med.toLowerCase() !== 'none' && med.length > 2;
      return '<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface2);cursor:' + (alreadyIn?'default':'pointer') + ';opacity:' + (alreadyIn?'0.6':'1') + '">' +
        '<input type="checkbox" class="ca-check" data-id="' + mem.id + '" ' + (alreadyIn ? 'checked disabled' : 'checked') + ' style="width:16px;height:16px;accent-color:var(--primary);flex-shrink:0">' +
        '<div class="mav" style="width:32px;height:32px;font-size:11px;flex-shrink:0">' + _ini(mem.fname, mem.lname) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;font-size:13px">' + mem.fname + ' ' + mem.lname + '</div>' +
          (hasMed ? '<div style="font-size:10px;color:var(--danger)">&#127973; ' + med.split(/[,;\n]/)[0].trim() + '</div>' : '') +
        '</div>' +
        (alreadyIn ? '<span style="font-size:10px;color:var(--success);font-weight:700;white-space:nowrap">Already in</span>' : '') +
      '</label>';
    }).join('');
  }
  openM('mo-class-att');
};

window.caSelectAll = function caSelectAll(val) {
  document.querySelectorAll('.ca-check:not([disabled])').forEach(function(cb){ cb.checked = val; });
};

window.submitClassAttendance = async function submitClassAttendance() {
  var checks = document.querySelectorAll('.ca-check:not([disabled]):checked');
  var ids = [];
  checks.forEach(function(cb){ ids.push(parseInt(cb.dataset.id)); });
  if (!ids.length) { toast('No members selected', 'error'); return; }
  var now = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var dt  = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':00';
  var done = 0;
  for (var i = 0; i < ids.length; i++) {
    var existing = await qry('SELECT id FROM attendance WHERE member_id=? AND DATE(checkin_time)=CURDATE() LIMIT 1', [ids[i]]);
    if (!existing || !existing.length) {
      await run('INSERT INTO attendance(member_id, checkin_time) VALUES(?,?)', [ids[i], dt]);
      done++;
    }
  }
  closeM('mo-class-att');
  toast(done + ' member' + (done !== 1 ? 's' : '') + ' checked in! &#10003;', 'success');
  if (typeof loadTrainerAttendancePage === 'function') loadTrainerAttendancePage();
  dash();
};

// ── Nav override: trigger trainer-specific page loads ────────
var _origNav = window.nav || (typeof nav !== 'undefined' ? nav : null);
window.nav = function nav(p) {
  if (_origNav) _origNav(p);
  if (p === 'attendance') {
    var role = window.currentUser ? window.currentUser.role : '';
    if (role === 'trainer') {
      setTimeout(function(){ loadTrainerAttendancePage(); }, 80);
    }
  }
};
// ════════════════════════════════════════════════════════════
//  MY PROGRESS — Activity Rings, Streaks, Charts, Calendar
// ════════════════════════════════════════════════════════════

/* ── Helpers ──────────────────────────────────────────────── */
function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function _monthStart() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function _weekRange(weeksAgo) {
  var now = new Date();
  var day = now.getDay(); // 0=Sun
  var mon = new Date(now);
  mon.setDate(now.getDate() - day - (weeksAgo * 7));
  var sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end:   sun.toISOString().slice(0, 10)
  };
}

/* ── Open Weight Log Modal ────────────────────────────────── */
window.openProgressLog = function openProgressLog() {
  var el = _gel('wl-date');
  if (el) el.value = _todayStr();
  var tw = _gel('wl-weight');  if (tw) tw.value = '';
  var tn = _gel('wl-notes');   if (tn) tn.value = '';
  // Pre-fill target if a goal exists
  var cu = window.currentUser;
  if (cu && cu.member_id) {
    qry('SELECT target_value FROM member_goals WHERE member_id=? AND goal_type=? AND achieved=0 ORDER BY created_at DESC LIMIT 1',
      [cu.member_id, 'weight']).then(function(rows) {
      var tgt = _gel('wl-target');
      if (tgt) tgt.value = (rows && rows[0]) ? rows[0].target_value : '';
    });
  }
  openM('mo-log-weight');
};

/* ── Save Weight Log ──────────────────────────────────────── */
window.saveWeightLog = async function saveWeightLog() {
  var cu = window.currentUser;
  if (!cu || !cu.member_id) return;

  var weight  = parseFloat(_gv('wl-weight'));
  var date    = _gv('wl-date') || _todayStr();
  var target  = parseFloat(_gv('wl-target'));
  var notes   = _gv('wl-notes');

  if (!weight || isNaN(weight)) { toast('Please enter a weight value', 'error'); return; }

  // Upsert: check if goal row exists for this member
  var existing = await qry(
    'SELECT id, start_value FROM member_goals WHERE member_id=? AND goal_type=? ORDER BY created_at DESC LIMIT 1',
    [cu.member_id, 'weight']
  );

  if (existing && existing.length) {
    var gid = existing[0].id;
    var updateQ = 'UPDATE member_goals SET current_value=?, updated_at=NOW()';
    var params  = [weight];
    if (!isNaN(target)) { updateQ += ', target_value=?'; params.push(target); }
    if (notes)           { updateQ += ', notes=?';        params.push(notes);  }
    updateQ += ' WHERE id=?';
    params.push(gid);
    await run(updateQ, params);
  } else {
    var sv = !isNaN(target) ? weight : weight;
    var tv = !isNaN(target) ? target : null;
    await run(
      'INSERT INTO member_goals (member_id, goal_type, goal_label, start_value, target_value, current_value, unit, notes) VALUES (?,?,?,?,?,?,?,?)',
      [cu.member_id, 'weight', 'Weight Goal', sv, tv, weight, 'kg', notes || '']
    );
  }

  toast('Weight logged ✅', 'success');
  closeM('mo-log-weight');
  await loadProgressData();
};

/* ── Set ring offset ─────────────────────────────────────── */
function _setRing(id, pct) {
  var el = document.getElementById(id);
  if (!el) return;
  var circ = 289;
  var offset = circ - Math.min(pct, 1) * circ;
  el.style.strokeDashoffset = offset;
}

/* ── Main loader ─────────────────────────────────────────── */
window.loadProgressData = async function loadProgressData() {
  var cu = window.currentUser;
  if (!cu || cu.role !== 'user' || !cu.member_id) return;
  var mid = cu.member_id;

  var today = _todayStr();
  var monthStart = _monthStart();

  // ── Attendance data (all) ──
  var allAtt = await qry(
    'SELECT checkin_time, checkout_time FROM attendance WHERE member_id=? ORDER BY checkin_time ASC',
    [mid]
  );

  // ── Today's attendance ──
  var todayAtt = (allAtt || []).filter(function(r) {
    return r.checkin_time && r.checkin_time.slice(0, 10) === today;
  });

  // Duration today (minutes)
  var durToday = 0;
  todayAtt.forEach(function(r) {
    if (r.checkin_time && r.checkout_time) {
      var ci = new Date(r.checkin_time);
      var co = new Date(r.checkout_time);
      durToday += Math.max(0, (co - ci) / 60000);
    }
  });

  // ── Classes this month ──
  var classRows = await qry(
    "SELECT COUNT(*) as cnt FROM attendance WHERE member_id=? AND checkin_time >= ?",
    [mid, monthStart]
  );
  var classesThisMonth = (classRows && classRows[0]) ? (classRows[0].cnt || 0) : 0;

  // ── Monthly visits ──
  var monthAtt = (allAtt || []).filter(function(r) {
    return r.checkin_time && r.checkin_time.slice(0, 10) >= monthStart;
  });
  // Unique visit days
  var visitDays = {};
  monthAtt.forEach(function(r) { visitDays[r.checkin_time.slice(0,10)] = true; });
  var totalVisits = Object.keys(visitDays).length;

  // Total hours this month
  var totalMin = 0;
  monthAtt.forEach(function(r) {
    if (r.checkin_time && r.checkout_time) {
      var ci = new Date(r.checkin_time);
      var co = new Date(r.checkout_time);
      totalMin += Math.max(0, (co - ci) / 60000);
    }
  });
  var totalHours = (totalMin / 60).toFixed(1);

  // Est. calories (avg 400kcal/hr)
  var estCalMonth = Math.round(totalMin / 60 * 400);
  var estCalToday = Math.round(durToday / 60 * 400);

  // ── Update date label ──
  var dl = _gel('prog-date-label');
  if (dl) {
    var dn = new Date();
    dl.textContent = dn.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  }

  // ── Activity Rings ──
  // Classes ring: % of 12/month goal shown as today's checkin
  var classGoal = 12;
  _setRing('ring-classes', classesThisMonth / classGoal);
  var rcl = _gel('ring-classes-label');
  if (rcl) rcl.innerHTML = classesThisMonth + '<span style="font-size:13px;font-weight:500"></span>';
  var rcg = _gel('ring-classes-goal');
  if (rcg) rcg.textContent = 'Goal: ' + classGoal + '/mo';

  // Duration ring: % of 60min goal today
  var durGoal = 60;
  _setRing('ring-duration', durToday / durGoal);
  var rdl = _gel('ring-duration-label');
  if (rdl) rdl.innerHTML = Math.round(durToday) + '<span style="font-size:13px;font-weight:500">m</span>';
  var rdg = _gel('ring-duration-goal');
  if (rdg) rdg.textContent = 'Goal: ' + durGoal + 'm/day';

  // Calories ring: % of 500kcal goal today
  var calGoal = 500;
  _setRing('ring-calories', estCalToday / calGoal);
  var rkal = _gel('ring-calories-label');
  if (rkal) rkal.innerHTML = estCalToday + '<span style="font-size:13px;font-weight:500">kcal</span>';

  // Attendance ring: visits this month out of goal 20
  var attGoal = 20;
  _setRing('ring-attendance', totalVisits / attGoal);
  var ral = _gel('ring-attendance-label');
  if (ral) ral.innerHTML = totalVisits;
  var rag = _gel('ring-attendance-goal');
  if (rag) rag.textContent = 'Goal: ' + attGoal + '/mo';

  // ── Monthly summary ──
  var setT = function(id, v) { var e = _gel(id); if (e) e.textContent = v; };
  setT('ms-visits',  totalVisits);
  setT('ms-hours',   totalHours + 'h');
  setT('ms-classes', classesThisMonth);
  setT('ms-calories', estCalMonth > 0 ? (estCalMonth > 999 ? (estCalMonth/1000).toFixed(1)+'k' : estCalMonth) : '0');

  // ── Streak ──
  _renderStreak(allAtt || []);

  // ── Weekly bars ──
  var weeksAgo = parseInt((_gel('prog-week-select') || {}).value || '0', 10);
  _renderWeeklyBars(allAtt || [], weeksAgo);

  // ── Weight/body progress ──
  await _renderWeightChart(mid);

  // ── Attendance calendar ──
  _renderCalendar(allAtt || []);
};

/* ── Streak ──────────────────────────────────────────────── */
function _renderStreak(allAtt) {
  // Build set of unique visit dates
  var visitSet = {};
  allAtt.forEach(function(r) {
    if (r.checkin_time) visitSet[r.checkin_time.slice(0,10)] = true;
  });

  var today = new Date();
  var todayStr = today.toISOString().slice(0, 10);

  // Current streak: count backwards from today
  var streak = 0;
  var cursor = new Date(today);
  for (var i = 0; i < 365; i++) {
    var ds = cursor.toISOString().slice(0,10);
    if (visitSet[ds]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (ds === todayStr && i === 0) {
      // Today not visited yet — start counting from yesterday
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // Best streak: scan all
  var sortedDates = Object.keys(visitSet).sort();
  var best = 0, cur2 = 0, prev = null;
  sortedDates.forEach(function(d) {
    if (!prev) { cur2 = 1; }
    else {
      var diff = (new Date(d) - new Date(prev)) / 86400000;
      cur2 = diff === 1 ? cur2 + 1 : 1;
    }
    best = Math.max(best, cur2);
    prev = d;
  });

  var sv = _gel('streak-val');   if (sv) sv.textContent = streak;
  var sb = _gel('streak-best');  if (sb) sb.textContent = 'Best: ' + best + ' days';

  // Last visit
  var lastVisit = sortedDates.length ? sortedDates[sortedDates.length - 1] : null;
  var sl = _gel('streak-last');
  if (sl) {
    if (lastVisit) {
      var lv = new Date(lastVisit);
      sl.textContent = 'Last visit: ' + lv.toLocaleDateString('en-US', {month:'short', day:'numeric'});
    } else {
      sl.textContent = 'No visits yet';
    }
  }

  // Last 7 days dots
  var dotsWrap   = _gel('streak-dots');
  var labelsWrap = _gel('streak-dot-labels');
  if (!dotsWrap || !labelsWrap) return;
  dotsWrap.innerHTML = '';
  labelsWrap.innerHTML = '';
  var days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  for (var j = 6; j >= 0; j--) {
    var d = new Date(today);
    d.setDate(today.getDate() - j);
    var ds2 = d.toISOString().slice(0,10);
    var isToday = ds2 === todayStr;
    var hit = !!visitSet[ds2];
    var dot = document.createElement('div');
    dot.className = 'streak-dot ' + (isToday ? 'today' : (hit ? 'hit' : 'miss'));
    dot.textContent = hit ? '✓' : (isToday ? '●' : '·');
    dot.title = ds2;
    dotsWrap.appendChild(dot);

    var lbl = document.createElement('div');
    lbl.style.cssText = 'flex:1;text-align:center;font-size:9px;color:var(--text-muted)';
    lbl.textContent = days[d.getDay()];
    labelsWrap.appendChild(lbl);
  }
}

/* ── Weekly bars ─────────────────────────────────────────── */
function _renderWeeklyBars(allAtt, weeksAgo) {
  var range = _weekRange(weeksAgo);
  var barsWrap   = _gel('weekly-bars');
  var labelsWrap = _gel('weekly-bar-labels');
  if (!barsWrap || !labelsWrap) return;

  // Build visit durations per date in range
  var visitMin = {};
  allAtt.forEach(function(r) {
    if (!r.checkin_time) return;
    var ds = r.checkin_time.slice(0,10);
    if (ds >= range.start && ds <= range.end) {
      if (!visitMin[ds]) visitMin[ds] = 0;
      if (r.checkout_time) {
        var ci = new Date(r.checkin_time);
        var co = new Date(r.checkout_time);
        visitMin[ds] += Math.max(0, (co - ci) / 60000);
      } else {
        visitMin[ds] += 45; // default 45min if no checkout
      }
    }
  });

  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var start = new Date(range.start);
  var maxMin = Math.max(60, Math.max.apply(null, Object.values(visitMin).concat([0])));

  barsWrap.innerHTML = '';
  labelsWrap.innerHTML = '';

  for (var i = 0; i < 7; i++) {
    var d = new Date(start);
    d.setDate(start.getDate() + i);
    var ds = d.toISOString().slice(0,10);
    var min = visitMin[ds] || 0;
    var pct = min / maxMin;
    var todayS = _todayStr();

    var col = document.createElement('div');
    col.className = 'weekly-bar-col';

    var valD = document.createElement('div');
    valD.className = 'weekly-bar-val';
    valD.textContent = min > 0 ? Math.round(min) + 'm' : '';
    col.appendChild(valD);

    var bar = document.createElement('div');
    bar.className = 'weekly-bar-fill ' + (min > 0 ? 'attended' : 'rest');
    bar.style.height = (pct > 0 ? Math.max(4, pct * 80) : 4) + 'px';
    if (ds === todayS) bar.style.boxShadow = '0 0 6px rgba(249,115,22,.5)';
    col.appendChild(bar);

    barsWrap.appendChild(col);

    var lbl = document.createElement('div');
    lbl.style.cssText = 'flex:1;text-align:center;font-size:10px;color:' + (ds === todayS ? 'var(--primary)' : 'var(--text-muted)') + ';font-weight:' + (ds === todayS ? '700' : '400');
    lbl.textContent = days[d.getDay()];
    labelsWrap.appendChild(lbl);
  }
}

/* ── Weight Chart (SVG line chart) ──────────────────────── */
async function _renderWeightChart(mid) {
  var goal = (await qry(
    'SELECT * FROM member_goals WHERE member_id=? AND goal_type=? ORDER BY created_at ASC',
    [mid, 'weight']
  ));

  var wrap = _gel('weight-chart-wrap');
  var goalSection = _gel('weight-goal-section');
  if (!wrap) return;

  // Build data points from goal history (each row = a log entry as created_at)
  var points = [];
  if (goal && goal.length) {
    goal.forEach(function(g) {
      if (g.current_value) {
        points.push({
          date: (g.updated_at || g.created_at || '').slice(0,10),
          val:  parseFloat(g.current_value)
        });
      }
    });
    // Also add start_value as first point if available
    var first = goal[0];
    if (first.start_value && (!points.length || points[0].date !== (first.created_at||'').slice(0,10))) {
      points.unshift({
        date: (first.created_at||'').slice(0,10),
        val:  parseFloat(first.start_value)
      });
    }
  }

  if (!points.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-ico">⚖️</div><p>No weight logs yet. Click <b>+ Log Weight</b> to start.</p></div>';
    if (goalSection) goalSection.style.display = 'none';
    return;
  }

  // Deduplicate by date (keep last)
  var byDate = {};
  points.forEach(function(p) { byDate[p.date] = p.val; });
  var sorted = Object.keys(byDate).sort().map(function(d) { return { date:d, val:byDate[d] }; });

  if (sorted.length < 2) {
    // Only 1 point — show simple display
    wrap.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:40px;font-weight:800;color:var(--primary)">' + sorted[0].val + ' kg</div><div style="font-size:13px;color:var(--text-muted);margin-top:6px">Logged on ' + sorted[0].date + '</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">Add more logs to see trend chart</div></div>';
  } else {
    // Draw SVG line chart
    var W = 500, H = 100;
    var vals = sorted.map(function(p) { return p.val; });
    var minV = Math.min.apply(null, vals) - 2;
    var maxV = Math.max.apply(null, vals) + 2;
    var range = maxV - minV || 1;
    var n = sorted.length;
    var pts = sorted.map(function(p, i) {
      var x = (i / (n - 1)) * (W - 40) + 20;
      var y = H - ((p.val - minV) / range) * (H - 20) - 5;
      return { x: x, y: y, val: p.val, date: p.date };
    });

    var pathD = pts.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y; }).join(' ');
    var areaD = 'M' + pts[0].x + ' ' + (H + 5) + ' ' + pts.map(function(p) { return 'L' + p.x + ' ' + p.y; }).join(' ') + ' L' + pts[pts.length-1].x + ' ' + (H + 5) + ' Z';

    var svgDots = pts.map(function(p) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="var(--primary)" stroke="var(--surface)" stroke-width="2">' +
             '<title>' + p.date + ': ' + p.val + ' kg</title></circle>';
    }).join('');

    var labels = '';
    pts.forEach(function(p, i) {
      if (i === 0 || i === pts.length - 1 || pts.length <= 5) {
        labels += '<text x="' + p.x + '" y="' + (H + 18) + '" text-anchor="middle" font-size="9" fill="var(--text-muted)">' + p.date.slice(5) + '</text>';
        labels += '<text x="' + p.x + '" y="' + (p.y - 8) + '" text-anchor="middle" font-size="9" fill="var(--text-muted)">' + p.val + '</text>';
      }
    });

    wrap.innerHTML = '<svg class="weight-chart-svg" viewBox="0 0 ' + W + ' ' + (H+25) + '" height="130">' +
      '<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02"/></linearGradient></defs>' +
      '<path d="' + areaD + '" fill="url(#wg)"/>' +
      '<path d="' + pathD + '" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      svgDots + labels +
      '</svg>';
  }

  // Update goal progress bar
  var latestGoal = goal && goal.length ? goal[goal.length - 1] : null;
  if (latestGoal && latestGoal.start_value && latestGoal.target_value && latestGoal.current_value && goalSection) {
    goalSection.style.display = '';
    var sv = parseFloat(latestGoal.start_value);
    var tv = parseFloat(latestGoal.target_value);
    var cv = parseFloat(latestGoal.current_value);
    var totalChange = Math.abs(tv - sv);
    var doneChange  = Math.abs(cv - sv);
    var pct = totalChange > 0 ? Math.min(100, Math.round((doneChange / totalChange) * 100)) : 0;

    var pgp = _gel('weight-goal-pct');  if (pgp) pgp.textContent = pct + '%';
    var pgb = _gel('weight-goal-bar');  if (pgb) pgb.style.width = pct + '%';
    var pgs = _gel('weight-goal-start');   if (pgs) pgs.textContent = 'Start: ' + sv + ' kg';
    var pgc = _gel('weight-goal-current'); if (pgc) pgc.textContent = 'Current: ' + cv + ' kg';
    var pgt = _gel('weight-goal-target');  if (pgt) pgt.textContent = 'Target: ' + tv + ' kg';
  } else if (goalSection) {
    goalSection.style.display = 'none';
  }
}

/* ── Attendance Calendar (current month) ─────────────────── */
function _renderCalendar(allAtt) {
  var cal = _gel('attendance-calendar');
  var lbl = _gel('cal-month-label');
  if (!cal) return;

  var today = new Date();
  var year  = today.getFullYear();
  var month = today.getMonth();

  if (lbl) lbl.textContent = today.toLocaleDateString('en-US', { month:'long', year:'numeric' });

  // Collect visit dates this month
  var visitSet = {};
  allAtt.forEach(function(r) {
    if (!r.checkin_time) return;
    var d = new Date(r.checkin_time);
    if (d.getFullYear() === year && d.getMonth() === month) {
      visitSet[d.getDate()] = true;
    }
  });

  var firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var todayDate = today.getDate();

  var html = '';
  // Empty cells before first day
  for (var i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }
  // Day cells
  for (var d = 1; d <= daysInMonth; d++) {
    var isToday   = d === todayDate;
    var attended  = !!visitSet[d];
    var cls = isToday ? 'today' : (attended ? 'attended' : 'rest');
    var icon = attended ? '✓' : d;
    html += '<div class="cal-day ' + cls + '" title="' + year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0') + '">' + (attended && !isToday ? '✓' : d) + '</div>';
  }
  cal.innerHTML = html;
}

/* ── Patch switchProfileTab to include progress tab ────── */
(function() {
  var _origSPT = window.switchProfileTab;
  window.switchProfileTab = function switchProfileTab(tab) {
    var allTabs = ['info', 'payments', 'security', 'progress'];
    allTabs.forEach(function(t) {
      var btn   = _gel('profile-tab-' + t);
      var panel = _gel('profile-panel-' + t);
      if (btn) {
        btn.className = t === tab ? 'btn btn-p' : 'btn btn-s';
        btn.style.borderBottom = t === tab ? '3px solid var(--primary)' : '3px solid transparent';
      }
      if (panel) panel.style.display = t === tab ? '' : 'none';
    });
    if (tab === 'progress') {
      setTimeout(loadProgressData, 50);
    }
  };
})();

