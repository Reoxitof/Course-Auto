// ============================================================
// ÉTAT & PERSISTANCE
// ============================================================
const STATE_KEY   = 'race_state';
const SESSION_KEY = 'race_session';

// --- Génération MDP ---
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// --- État par défaut ---
function defaultState() {
  return {
    adminPassword:     generatePassword(),
    spectatorPassword: generatePassword(),
    maxLaps: 10,
    raceRunning:  false,
    raceFinished: false,
    raceElapsed:  0,
    teams: [
      { id: 't1', name: 'Équipe Rouge', color: '#e74c3c' },
      { id: 't2', name: 'Équipe Bleue', color: '#3498db' },
      { id: 't3', name: 'Équipe Verte', color: '#2ecc71' },
    ],
    pilots: [
      { id: 'p1', name: 'Pilote 1', teamId: 't1' },
      { id: 'p2', name: 'Pilote 2', teamId: 't2' },
      { id: 'p3', name: 'Pilote 3', teamId: 't3' },
    ],
    lapData: {},
  };
}

// --- Chargement ---
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.spectatorPassword) s.spectatorPassword = generatePassword();
      if (!s.adminPassword)     s.adminPassword     = generatePassword();
      return s;
    }
  } catch (e) { /* corrompu */ }
  return defaultState();
}

function saveState() {
  state.raceElapsed = raceElapsed;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ============================================================
// SESSION (sessionStorage — dure le temps de l'onglet)
// ============================================================
function saveSession(role) {
  sessionStorage.setItem(SESSION_KEY, role);
}

function loadSession() {
  return sessionStorage.getItem(SESSION_KEY); // null si absent
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ============================================================
// VARIABLES GLOBALES
// ============================================================
let state       = loadState();
let currentRole = null;
let pendingRole = null;          // rôle en cours de saisie MDP
let timerInterval = null;
let raceElapsed   = 0;
let penaltyTargetId = null;
let selectedTeamColorValue = '#e74c3c';

// ============================================================
// LOGIN
// ============================================================
function login(role) {
  pendingRole = role;
  const isAdmin = role === 'admin';

  // Afficher étape 2
  document.getElementById('login-step-role').style.display = 'none';
  document.getElementById('login-step-pass').style.display = 'block';

  // Label + couleur du bouton
  const label = document.getElementById('login-role-label');
  label.textContent = isAdmin ? '👑 Connexion Admin' : '👁️ Connexion Spectateur';

  const btn = document.getElementById('login-confirm-btn');
  btn.className = 'btn-confirm ' + (isAdmin ? 'admin-mode' : 'spectator-mode');

  const input = document.getElementById('login-password');
  input.className = 'login-input ' + (isAdmin ? '' : 'spectator');
  input.value = '';
  document.getElementById('login-error').style.display = 'none';

  setTimeout(() => input.focus(), 50);
}

function backToRoleChoice() {
  pendingRole = null;
  document.getElementById('login-step-pass').style.display = 'none';
  document.getElementById('login-step-role').style.display = 'block';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
}

function confirmLogin() {
  const pass  = document.getElementById('login-password').value;
  const error = document.getElementById('login-error');
  const expected = pendingRole === 'admin' ? state.adminPassword : state.spectatorPassword;

  if (pass === expected) {
    currentRole = pendingRole;
    saveSession(currentRole);
    error.style.display = 'none';
    startApp();
  } else {
    error.style.display = 'block';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}

function logout() {
  currentRole = null;
  pendingRole = null;
  clearSession();
  stopTimer();
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  backToRoleChoice();
  document.body.classList.remove('is-admin');
}

// ============================================================
// DÉMARRAGE APP
// ============================================================
function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  if (currentRole === 'admin') {
    document.body.classList.add('is-admin');
    document.getElementById('role-badge').textContent = '👑 Admin';
    document.getElementById('role-badge').style.color = '#f39c12';
  } else {
    document.body.classList.remove('is-admin');
    document.getElementById('role-badge').textContent = '👁️ Spectateur';
    document.getElementById('role-badge').style.color = '#888';
  }

  initLapData();
  renderAll();

  // Restaurer le timer
  raceElapsed = state.raceElapsed || 0;
  if (state.raceRunning) {
    startTimer();
    setRaceButtons(false); // start caché, stop visible
  } else {
    updateTimerDisplay();
    setRaceButtons(true);  // start visible, stop caché
  }

  // Statut
  if (state.raceFinished)       setStatus('🏁 Terminée');
  else if (state.raceRunning)   setStatus('🟢 En course');
  else if (raceElapsed > 0)     setStatus('⏸ Pausée');
  else                          setStatus('En attente');
}

// Helpers boutons admin (sécurisé : ne touche rien si spectateur)
function setRaceButtons(showStart) {
  if (currentRole !== 'admin') return;
  document.getElementById('btn-start-race').style.display = showStart ? 'flex' : 'none';
  document.getElementById('btn-stop-race').style.display  = showStart ? 'none' : 'flex';
}

function setStatus(txt) {
  document.getElementById('race-status-display').textContent = txt;
}

// ============================================================
// TABS
// ============================================================
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-content-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'results') renderResults();
}

// ============================================================
// COURSE
// ============================================================
function startRace() {
  if (state.raceFinished) { showToast('Course terminée — faites un Reset'); return; }
  state.raceRunning = true;
  saveState();
  startTimer();
  setRaceButtons(false);
  setStatus('🟢 En course');
  showToast('Course démarrée !');
  renderPilots();
}

function stopRace() {
  state.raceRunning = false;
  stopTimer();
  saveState();
  setRaceButtons(true);
  setStatus('⏸ Pausée');
  showToast('Course en pause');
}

function resetRace() {
  if (!confirm('Réinitialiser toute la course ?')) return;
  state.raceRunning  = false;
  state.raceFinished = false;
  state.raceElapsed  = 0;
  state.lapData      = {};
  raceElapsed        = 0;
  stopTimer();
  initLapData();
  saveState();
  setRaceButtons(true);
  setStatus('En attente');
  updateTimerDisplay();
  renderAll();
  showToast('Course réinitialisée');
}

// ============================================================
// TIMER
// ============================================================
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const base = Date.now() - raceElapsed;
  timerInterval = setInterval(() => {
    raceElapsed = Date.now() - base;
    updateTimerDisplay();
    if (Math.floor(raceElapsed / 5000) !== Math.floor((raceElapsed - 50) / 5000)) saveState();
  }, 50);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  document.getElementById('global-timer').textContent = formatTime(raceElapsed);
}

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function formatTimeShort(ms) { return formatTime(ms); }
function pad(n) { return String(n).padStart(2, '0'); }

// ============================================================
// TOURS
// ============================================================
function initLapData() {
  state.pilots.forEach(p => {
    if (!state.lapData[p.id]) {
      state.lapData[p.id] = { laps: [], penalty: 0, dnf: false, lapStartTime: 0 };
    }
  });
}

function recordLap(pilotId) {
  if (!state.raceRunning) { showToast('La course n\'est pas démarrée'); return; }
  const data = state.lapData[pilotId];
  if (!data || data.dnf) return;

  const lapTime = raceElapsed - (data.lapStartTime || 0);
  data.laps.push(lapTime);
  data.lapStartTime = raceElapsed;

  const pilot = state.pilots.find(p => p.id === pilotId);
  showToast(`${pilot.name} — Tour ${data.laps.length}: ${formatTimeShort(lapTime)}`);

  if (data.laps.length >= state.maxLaps) checkRaceFinished();

  saveState();
  renderPilots();
  renderResults();
}

function checkRaceFinished() {
  const active = state.pilots.filter(p => !state.lapData[p.id]?.dnf);
  const allDone = active.every(p => (state.lapData[p.id]?.laps.length || 0) >= state.maxLaps);
  if (allDone) {
    state.raceFinished = true;
    state.raceRunning  = false;
    stopTimer();
    saveState();
    setStatus('🏁 Terminée');
    setRaceButtons(true);
    showToast('🏁 Course terminée !');
  }
}

// ============================================================
// PÉNALITÉ / DNF
// ============================================================
function openPenaltyModal(pilotId) {
  if (currentRole !== 'admin') return;
  penaltyTargetId = pilotId;
  const pilot = state.pilots.find(p => p.id === pilotId);
  document.getElementById('penalty-pilot-name').textContent = pilot.name;
  document.getElementById('penalty-seconds').value = 5;
  document.getElementById('penalty-modal').style.display = 'flex';
}

function closePenaltyModal() {
  document.getElementById('penalty-modal').style.display = 'none';
  penaltyTargetId = null;
}

function applyPenalty() {
  if (!penaltyTargetId) return;
  const secs = parseInt(document.getElementById('penalty-seconds').value) || 0;
  state.lapData[penaltyTargetId].penalty = (state.lapData[penaltyTargetId].penalty || 0) + secs * 1000;
  const pilot = state.pilots.find(p => p.id === penaltyTargetId);
  showToast(`+${secs}s pénalité — ${pilot.name}`);
  saveState(); closePenaltyModal(); renderPilots(); renderResults();
}

function applyDNF() {
  if (!penaltyTargetId) return;
  state.lapData[penaltyTargetId].dnf = true;
  const pilot = state.pilots.find(p => p.id === penaltyTargetId);
  showToast(`🚫 DNF — ${pilot.name}`);
  saveState(); closePenaltyModal(); checkRaceFinished(); renderPilots(); renderResults();
}

// ============================================================
// RENDU PILOTES
// ============================================================
function renderPilots() {
  const grid = document.getElementById('pilots-grid');
  grid.innerHTML = '';

  if (!state.pilots.length) {
    grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px;">Aucun pilote — allez dans ⚙️ Config</p>';
    return;
  }

  state.pilots.forEach(pilot => {
    const team  = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data  = state.lapData[pilot.id] || { laps: [], penalty: 0, dnf: false };
    const lapCount   = data.laps.length;
    const lastLap    = lapCount > 0 ? data.laps[lapCount - 1] : null;
    const isDNF      = data.dnf;
    const isFinished = lapCount >= state.maxLaps;
    const canLap     = state.raceRunning && !isDNF && !isFinished && currentRole === 'admin';

    let badge = '';
    if (isDNF)           badge = '<span class="dnf-badge">🚫 DNF</span>';
    else if (isFinished) badge = '<span class="pilot-penalty-badge" style="color:var(--green);background:rgba(46,204,113,.15);">🏁 Terminé</span>';
    else if (data.penalty > 0) badge = `<span class="pilot-penalty-badge">+${data.penalty/1000}s pén.</span>`;

    const card = document.createElement('div');
    card.className = 'pilot-card' + (isDNF ? ' dnf' : '');
    card.style.background   = `linear-gradient(135deg,${color}18,${color}08)`;
    card.style.borderColor  = isDNF ? '#ff444444' : `${color}44`;

    card.innerHTML = `
      <div class="pilot-card-header">
        <div class="pilot-color-bar" style="background:${color}"></div>
        <div class="pilot-info">
          <div class="pilot-name">${pilot.name}</div>
          <div class="pilot-team">${team ? team.name : 'Sans équipe'}</div>
          ${badge}
        </div>
        <div class="pilot-lap-info">
          <div class="pilot-lap-count" style="color:${color}">${lapCount}</div>
          <div class="pilot-lap-label">/ ${state.maxLaps} tours</div>
          ${lastLap !== null ? `<div class="pilot-last-time">${formatTimeShort(lastLap)}</div>` : ''}
        </div>
      </div>
      <div class="pilot-card-actions">
        <button class="btn-lap" style="background:${color}${canLap?'cc':'44'}"
          ${canLap ? `onclick="recordLap('${pilot.id}')"` : 'disabled'}>
          ${isDNF ? '🚫 DNF' : isFinished ? '🏁 Fini' : '⏱ Tour'}
        </button>
        ${currentRole === 'admin' ? `<button class="btn-penalty-open" onclick="openPenaltyModal('${pilot.id}')">⚠️</button>` : ''}
      </div>`;

    grid.appendChild(card);
  });

  const maxDone = Math.max(0, ...state.pilots.map(p => state.lapData[p.id]?.laps.length || 0));
  document.getElementById('current-lap-display').textContent = Math.min(maxDone + 1, state.maxLaps);
  document.getElementById('max-laps-display').textContent    = state.maxLaps;
}

// ============================================================
// RENDU RÉSULTATS
// ============================================================
function renderResults() {
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';

  const sorted = [...state.pilots].sort((a, b) => {
    const da = state.lapData[a.id] || { laps:[], penalty:0, dnf:false };
    const db = state.lapData[b.id] || { laps:[], penalty:0, dnf:false };
    if (da.dnf && !db.dnf) return 1;
    if (!da.dnf && db.dnf) return -1;
    if (db.laps.length !== da.laps.length) return db.laps.length - da.laps.length;
    return totalTime(da) - totalTime(db);
  });

  sorted.forEach((pilot, idx) => {
    const team  = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data  = state.lapData[pilot.id] || { laps:[], penalty:0, dnf:false };
    const pos   = idx + 1;
    const posClass = pos===1?'pos-1':pos===2?'pos-2':pos===3?'pos-3':'pos-other';
    const best  = data.laps.length ? Math.min(...data.laps) : null;
    const total = totalTime(data);
    const statusHtml = data.dnf
      ? '<span class="status-dnf">DNF</span>'
      : data.laps.length >= state.maxLaps
        ? '<span class="status-finished">Terminé</span>'
        : '<span class="status-racing">En course</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pos-badge ${posClass}">${data.dnf?'—':pos}</span></td>
      <td style="font-weight:700">${pilot.name}</td>
      <td><span class="team-dot" style="background:${color}"></span>${team?team.name:'—'}</td>
      <td>${data.laps.length} / ${state.maxLaps}</td>
      <td style="font-family:'Courier New',monospace">${best!==null?formatTimeShort(best):'—'}</td>
      <td style="font-family:'Courier New',monospace;font-weight:700">${data.laps.length?formatTimeShort(total):'—'}</td>
      <td style="color:var(--orange)">${data.penalty>0?'+'+data.penalty/1000+'s':'—'}</td>
      <td>${statusHtml}</td>`;
    tbody.appendChild(tr);
  });

  renderLapHistory();
}

function totalTime(data) {
  if (data.dnf) return Infinity;
  return data.laps.reduce((a, b) => a + b, 0) + (data.penalty || 0);
}

function renderLapHistory() {
  const container = document.getElementById('lap-history');
  container.innerHTML = '';
  state.pilots.forEach(pilot => {
    const team  = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data  = state.lapData[pilot.id] || { laps:[] };
    if (!data.laps.length) return;
    const best = Math.min(...data.laps);
    const div  = document.createElement('div');
    div.className = 'lap-history-pilot';
    div.innerHTML = `
      <div class="lap-history-pilot-header">
        <span class="team-dot" style="background:${color}"></span>
        ${pilot.name}
        ${data.dnf?'<span class="dnf-badge" style="margin-left:8px">DNF</span>':''}
      </div>
      <div class="lap-history-laps">
        ${data.laps.map((t,i)=>`<span class="lap-chip${t===best?' best':''}">T${i+1}: ${formatTimeShort(t)}</span>`).join('')}
      </div>`;
    container.appendChild(div);
  });
}

// ============================================================
// SETTINGS
// ============================================================
function applyLaps() {
  const val = parseInt(document.getElementById('setting-laps').value);
  if (val >= 1 && val <= 99) {
    state.maxLaps = val;
    saveState(); renderAll();
    showToast(`Tours : ${val}`);
  }
}

function changePassword() {
  const val = document.getElementById('setting-password').value.trim();
  if (val.length < 3) { showToast('Min 3 caractères'); return; }
  state.adminPassword = val;
  saveState();
  document.getElementById('setting-password').value = '';
  renderPasswordDisplay();
  showToast('MDP admin mis à jour');
}

function changeSpectatorPassword() {
  const val = document.getElementById('setting-spectator-password').value.trim();
  if (val.length < 3) { showToast('Min 3 caractères'); return; }
  state.spectatorPassword = val;
  saveState();
  document.getElementById('setting-spectator-password').value = '';
  renderPasswordDisplay();
  showToast('MDP spectateur mis à jour');
}

function regenAdminPassword() {
  state.adminPassword = generatePassword();
  saveState(); renderPasswordDisplay();
  showToast('Nouveau MDP admin généré');
}

function regenSpectatorPassword() {
  state.spectatorPassword = generatePassword();
  saveState(); renderPasswordDisplay();
  showToast('Nouveau MDP spectateur généré');
}

function togglePasswordDisplay(spanId, btn) {
  const span = document.getElementById(spanId);
  if (span.dataset.hidden === 'true') {
    span.textContent   = span.dataset.value;
    span.dataset.hidden = 'false';
    btn.textContent    = '🙈';
  } else {
    span.dataset.value  = span.textContent;
    span.textContent    = '••••••••';
    span.dataset.hidden = 'true';
    btn.textContent     = '👁';
  }
}

function renderPasswordDisplay() {
  const a = document.getElementById('current-admin-pass');
  const s = document.getElementById('current-spectator-pass');
  if (a) { a.dataset.value = state.adminPassword;     a.textContent = '••••••••'; a.dataset.hidden = 'true'; }
  if (s) { s.dataset.value = state.spectatorPassword; s.textContent = '••••••••'; s.dataset.hidden = 'true'; }
  document.querySelectorAll('.btn-eye').forEach(b => b.textContent = '👁');
}

// ============================================================
// ÉQUIPES
// ============================================================
function selectTeamColor(color, btn) {
  selectedTeamColorValue = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
}

function addTeam() {
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) { showToast('Entrez un nom'); return; }
  if (state.teams.length >= 10) { showToast('Max 10 équipes'); return; }
  state.teams.push({ id: 't' + Date.now(), name, color: selectedTeamColorValue });
  document.getElementById('new-team-name').value = '';
  saveState(); renderTeamsList(); renderPilotTeamSelect();
  showToast(`Équipe "${name}" ajoutée`);
}

function deleteTeam(id) {
  state.teams  = state.teams.filter(t => t.id !== id);
  state.pilots = state.pilots.filter(p => p.teamId !== id);
  initLapData(); saveState();
  renderTeamsList(); renderPilotsList(); renderPilotTeamSelect(); renderPilots();
}

function renderTeamsList() {
  const list = document.getElementById('teams-list');
  list.innerHTML = '';
  state.teams.forEach(team => {
    const div = document.createElement('div');
    div.className = 'team-item';
    div.innerHTML = `
      <span class="team-color-dot" style="background:${team.color}"></span>
      <span class="team-item-name">${team.name}</span>
      <button class="btn-delete" onclick="deleteTeam('${team.id}')">✕</button>`;
    list.appendChild(div);
  });
}

// ============================================================
// PILOTES
// ============================================================
function addPilot() {
  const name   = document.getElementById('new-pilot-name').value.trim();
  const teamId = document.getElementById('new-pilot-team').value;
  if (!name)   { showToast('Entrez un nom'); return; }
  if (!teamId) { showToast('Sélectionnez une équipe'); return; }
  const id = 'p' + Date.now();
  state.pilots.push({ id, name, teamId });
  state.lapData[id] = { laps:[], penalty:0, dnf:false, lapStartTime:0 };
  document.getElementById('new-pilot-name').value = '';
  saveState(); renderPilotsList(); renderPilots();
  showToast(`Pilote "${name}" ajouté`);
}

function deletePilot(id) {
  state.pilots = state.pilots.filter(p => p.id !== id);
  delete state.lapData[id];
  saveState(); renderPilotsList(); renderPilots();
}

function renderPilotsList() {
  const list = document.getElementById('pilots-list');
  list.innerHTML = '';
  state.pilots.forEach(pilot => {
    const team  = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const div   = document.createElement('div');
    div.className = 'pilot-item';
    div.innerHTML = `
      <span class="team-color-dot" style="background:${color}"></span>
      <span class="pilot-item-name">${pilot.name}</span>
      <span class="pilot-item-team">${team?team.name:'—'}</span>
      <button class="btn-delete" onclick="deletePilot('${pilot.id}')">✕</button>`;
    list.appendChild(div);
  });
}

function renderPilotTeamSelect() {
  const sel = document.getElementById('new-pilot-team');
  sel.innerHTML = '<option value="">-- Équipe --</option>';
  state.teams.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team.id; opt.textContent = team.name;
    sel.appendChild(opt);
  });
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderPilots();
  renderResults();
  if (currentRole === 'admin') {
    renderTeamsList();
    renderPilotsList();
    renderPilotTeamSelect();
    renderPasswordDisplay();
    document.getElementById('setting-laps').value = state.maxLaps;
  }
  document.getElementById('max-laps-display').textContent = state.maxLaps;
}

// ============================================================
// TOAST
// ============================================================
let toastTimeout = null;
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
// ANTI-SCROLL MOBILE
// ============================================================
document.addEventListener('touchend', e => {
  if (e.target.tagName === 'BUTTON') e.preventDefault();
}, { passive: false });

// ============================================================
// INIT — attend que le DOM soit prêt
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Touche Entrée sur le champ MDP login
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmLogin();
  });

  // Sélectionner la première couleur
  document.querySelectorAll('.color-swatch')[0]?.classList.add('active');

  // Restaurer la session si elle existe
  const savedRole = loadSession();
  if (savedRole) {
    currentRole = savedRole;
    startApp();
  }
  // Sinon on reste sur l'écran de login (déjà visible par défaut)
});
