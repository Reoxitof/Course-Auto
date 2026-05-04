// ===== STATE =====
const STATE_KEY = 'race_state';

let currentRole = null; // 'admin' | 'spectator'
let selectedTeamColor = '#e74c3c';
let penaltyTargetId = null;
let timerInterval = null;
let raceStartTime = null;
let raceElapsed = 0; // ms

// ===== PASSWORD GENERATOR =====
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pass = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  arr.forEach(b => { pass += chars[b % chars.length]; });
  return pass;
}

let state = loadState();

function defaultState() {
  return {
    adminPassword: generatePassword(8),
    spectatorPassword: generatePassword(8),
    maxLaps: 10,
    raceRunning: false,
    raceFinished: false,
    raceElapsed: 0,
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
    lapData: {}, // pilotId -> { laps: [ms, ...], penalty: ms, dnf: bool }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration: anciens états sans MDP spectateur
      if (!parsed.spectatorPassword) parsed.spectatorPassword = generatePassword(8);
      return parsed;
    }
  } catch(e) {}
  return defaultState();
}

function saveState() {
  state.raceElapsed = raceElapsed;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ===== LOGIN =====
function login(role) {
  // Hide both areas first
  document.getElementById('admin-pass-area').style.display = 'none';
  document.getElementById('spectator-pass-area').style.display = 'none';

  if (role === 'admin') {
    document.getElementById('admin-pass-area').style.display = 'block';
    document.getElementById('admin-password').focus();
  } else {
    document.getElementById('spectator-pass-area').style.display = 'block';
    document.getElementById('spectator-password').focus();
  }
}

function confirmAdmin() {
  const pass = document.getElementById('admin-password').value;
  if (pass === state.adminPassword) {
    currentRole = 'admin';
    document.getElementById('pass-error-admin').style.display = 'none';
    startApp();
  } else {
    document.getElementById('pass-error-admin').style.display = 'block';
    document.getElementById('admin-password').value = '';
  }
}

function confirmSpectator() {
  const pass = document.getElementById('spectator-password').value;
  if (pass === state.spectatorPassword) {
    currentRole = 'spectator';
    document.getElementById('pass-error-spectator').style.display = 'none';
    startApp();
  } else {
    document.getElementById('pass-error-spectator').style.display = 'block';
    document.getElementById('spectator-password').value = '';
  }
}

document.getElementById('admin-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAdmin();
});

document.getElementById('spectator-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmSpectator();
});

function logout() {
  currentRole = null;
  stopTimer();
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-pass-area').style.display = 'none';
  document.getElementById('spectator-pass-area').style.display = 'none';
  document.getElementById('admin-password').value = '';
  document.getElementById('spectator-password').value = '';
  document.body.classList.remove('is-admin');
}

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

  // Restore timer if race was running
  if (state.raceRunning) {
    raceElapsed = state.raceElapsed || 0;
    startTimer();
    document.getElementById('btn-start-race').style.display = 'none';
    document.getElementById('btn-stop-race').style.display = 'flex';
  } else {
    raceElapsed = state.raceElapsed || 0;
    updateTimerDisplay();
  }
}

// ===== TABS =====
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-content-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');

  if (name === 'results') renderResults();
}

// ===== RACE CONTROL =====
function startRace() {
  if (state.raceFinished) {
    showToast('Course terminée. Faites un reset pour recommencer.');
    return;
  }
  state.raceRunning = true;
  saveState();
  startTimer();
  document.getElementById('btn-start-race').style.display = 'none';
  document.getElementById('btn-stop-race').style.display = 'flex';
  document.getElementById('race-status-display').textContent = '🟢 En course';
  showToast('Course démarrée !');
  renderPilots();
}

function stopRace() {
  state.raceRunning = false;
  stopTimer();
  saveState();
  document.getElementById('btn-start-race').style.display = 'flex';
  document.getElementById('btn-stop-race').style.display = 'none';
  document.getElementById('race-status-display').textContent = '⏸ Pausée';
  showToast('Course mise en pause');
}

function resetRace() {
  if (!confirm('Réinitialiser toute la course ?')) return;
  state.raceRunning = false;
  state.raceFinished = false;
  state.raceElapsed = 0;
  state.lapData = {};
  raceElapsed = 0;
  stopTimer();
  initLapData();
  saveState();
  document.getElementById('btn-start-race').style.display = 'flex';
  document.getElementById('btn-stop-race').style.display = 'none';
  document.getElementById('race-status-display').textContent = 'En attente';
  updateTimerDisplay();
  renderAll();
  showToast('Course réinitialisée');
}

// ===== TIMER =====
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const base = Date.now() - raceElapsed;
  timerInterval = setInterval(() => {
    raceElapsed = Date.now() - base;
    updateTimerDisplay();
    // Auto-save every 5s
    if (Math.floor(raceElapsed / 5000) !== Math.floor((raceElapsed - 50) / 5000)) {
      saveState();
    }
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
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function formatTimeShort(ms) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ===== LAP DATA =====
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

  const now = raceElapsed;
  const lapTime = now - (data.lapStartTime || 0);
  data.laps.push(lapTime);
  data.lapStartTime = now;

  const pilot = state.pilots.find(p => p.id === pilotId);
  showToast(`${pilot.name} — Tour ${data.laps.length}: ${formatTimeShort(lapTime)}`);

  // Check if finished
  if (data.laps.length >= state.maxLaps) {
    checkRaceFinished();
  }

  saveState();
  renderPilots();
  renderResults();
}

function checkRaceFinished() {
  const activePilots = state.pilots.filter(p => !state.lapData[p.id]?.dnf);
  const allFinished = activePilots.every(p => (state.lapData[p.id]?.laps.length || 0) >= state.maxLaps);
  if (allFinished) {
    state.raceFinished = true;
    state.raceRunning = false;
    stopTimer();
    saveState();
    document.getElementById('race-status-display').textContent = '🏁 Terminée';
    document.getElementById('btn-start-race').style.display = 'flex';
    document.getElementById('btn-stop-race').style.display = 'none';
    showToast('🏁 Course terminée !');
  }
}

// ===== PENALTY / DNF =====
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
  state.lapData[penaltyTargetId].penalty = (state.lapData[penaltyTargetId].penalty || 0) + (secs * 1000);
  const pilot = state.pilots.find(p => p.id === penaltyTargetId);
  showToast(`+${secs}s pénalité pour ${pilot.name}`);
  saveState();
  closePenaltyModal();
  renderPilots();
  renderResults();
}

function applyDNF() {
  if (!penaltyTargetId) return;
  state.lapData[penaltyTargetId].dnf = true;
  const pilot = state.pilots.find(p => p.id === penaltyTargetId);
  showToast(`🚫 DNF — ${pilot.name} abandonne`);
  saveState();
  closePenaltyModal();
  checkRaceFinished();
  renderPilots();
  renderResults();
}

// ===== RENDER PILOTS =====
function renderPilots() {
  const grid = document.getElementById('pilots-grid');
  grid.innerHTML = '';

  if (state.pilots.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px;">Aucun pilote configuré.<br>Allez dans ⚙️ Config pour en ajouter.</p>';
    return;
  }

  state.pilots.forEach(pilot => {
    const team = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data = state.lapData[pilot.id] || { laps: [], penalty: 0, dnf: false };
    const lapCount = data.laps.length;
    const lastLap = lapCount > 0 ? data.laps[lapCount - 1] : null;
    const isDNF = data.dnf;
    const isFinished = lapCount >= state.maxLaps;
    const canLap = state.raceRunning && !isDNF && !isFinished && currentRole === 'admin';

    const card = document.createElement('div');
    card.className = 'pilot-card' + (isDNF ? ' dnf' : '');
    card.style.background = `linear-gradient(135deg, ${color}18, ${color}08)`;
    card.style.borderColor = isDNF ? '#ff444444' : `${color}44`;

    let statusBadge = '';
    if (isDNF) statusBadge = '<span class="dnf-badge">🚫 DNF</span>';
    else if (isFinished) statusBadge = '<span class="pilot-penalty-badge" style="color:var(--green); background:rgba(46,204,113,0.15);">🏁 Terminé</span>';
    else if (data.penalty > 0) statusBadge = `<span class="pilot-penalty-badge">+${data.penalty/1000}s pén.</span>`;

    card.innerHTML = `
      <div class="pilot-card-header">
        <div class="pilot-color-bar" style="background:${color};"></div>
        <div class="pilot-info">
          <div class="pilot-name">${pilot.name}</div>
          <div class="pilot-team">${team ? team.name : 'Sans équipe'}</div>
          ${statusBadge}
        </div>
        <div class="pilot-lap-info">
          <div class="pilot-lap-count" style="color:${color};">${lapCount}</div>
          <div class="pilot-lap-label">/ ${state.maxLaps} tours</div>
          ${lastLap !== null ? `<div class="pilot-last-time">${formatTimeShort(lastLap)}</div>` : ''}
        </div>
      </div>
      <div class="pilot-card-actions">
        <button class="btn-lap" style="background:${color}${canLap ? 'cc' : '44'};"
          ${canLap ? `onclick="recordLap('${pilot.id}')"` : 'disabled'}
          ${!canLap && currentRole === 'admin' ? 'title="Course non démarrée ou pilote terminé"' : ''}>
          ${isDNF ? '🚫 DNF' : isFinished ? '🏁 Fini' : '⏱ Tour'}
        </button>
        ${currentRole === 'admin' ? `<button class="btn-penalty-open" onclick="openPenaltyModal('${pilot.id}')">⚠️</button>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });

  // Update current lap display
  const maxLapDone = Math.max(0, ...state.pilots.map(p => state.lapData[p.id]?.laps.length || 0));
  document.getElementById('current-lap-display').textContent = Math.min(maxLapDone + 1, state.maxLaps);
  document.getElementById('max-laps-display').textContent = state.maxLaps;
}

// ===== RENDER RESULTS =====
function renderResults() {
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';

  // Sort: DNF last, then by laps desc, then by total time asc
  const sorted = [...state.pilots].sort((a, b) => {
    const da = state.lapData[a.id] || { laps: [], penalty: 0, dnf: false };
    const db = state.lapData[b.id] || { laps: [], penalty: 0, dnf: false };
    if (da.dnf && !db.dnf) return 1;
    if (!da.dnf && db.dnf) return -1;
    if (db.laps.length !== da.laps.length) return db.laps.length - da.laps.length;
    return totalTime(da) - totalTime(db);
  });

  sorted.forEach((pilot, idx) => {
    const team = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data = state.lapData[pilot.id] || { laps: [], penalty: 0, dnf: false };
    const pos = idx + 1;
    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : 'pos-other';
    const bestLap = data.laps.length > 0 ? Math.min(...data.laps) : null;
    const total = totalTime(data);
    const statusText = data.dnf ? '<span class="status-dnf">DNF</span>' :
      data.laps.length >= state.maxLaps ? '<span class="status-finished">Terminé</span>' :
      '<span class="status-racing">En course</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pos-badge ${posClass}">${data.dnf ? '—' : pos}</span></td>
      <td style="font-weight:700;">${pilot.name}</td>
      <td><span class="team-dot" style="background:${color};"></span>${team ? team.name : '—'}</td>
      <td>${data.laps.length} / ${state.maxLaps}</td>
      <td style="font-family:'Courier New',monospace;">${bestLap !== null ? formatTimeShort(bestLap) : '—'}</td>
      <td style="font-family:'Courier New',monospace; font-weight:700;">${data.laps.length > 0 ? formatTimeShort(total) : '—'}</td>
      <td style="color:var(--accent2);">${data.penalty > 0 ? '+' + (data.penalty/1000) + 's' : '—'}</td>
      <td>${statusText}</td>
    `;
    tbody.appendChild(tr);
  });

  renderLapHistory();
}

function totalTime(data) {
  if (data.dnf) return Infinity;
  const raw = data.laps.reduce((a, b) => a + b, 0);
  return raw + (data.penalty || 0);
}

function renderLapHistory() {
  const container = document.getElementById('lap-history');
  container.innerHTML = '';

  state.pilots.forEach(pilot => {
    const team = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const data = state.lapData[pilot.id] || { laps: [] };
    if (data.laps.length === 0) return;

    const bestLap = Math.min(...data.laps);

    const div = document.createElement('div');
    div.className = 'lap-history-pilot';
    div.innerHTML = `
      <div class="lap-history-pilot-header">
        <span class="team-dot" style="background:${color};"></span>
        ${pilot.name}
        ${data.dnf ? '<span class="dnf-badge" style="margin-left:8px;">DNF</span>' : ''}
      </div>
      <div class="lap-history-laps">
        ${data.laps.map((t, i) => `
          <span class="lap-chip ${t === bestLap ? 'best' : ''}">
            T${i+1}: ${formatTimeShort(t)}
          </span>
        `).join('')}
      </div>
    `;
    container.appendChild(div);
  });
}

// ===== SETTINGS =====
function applyLaps() {
  const val = parseInt(document.getElementById('setting-laps').value);
  if (val >= 1 && val <= 99) {
    state.maxLaps = val;
    saveState();
    renderAll();
    showToast(`Nombre de tours: ${val}`);
  }
}

function changePassword() {
  const val = document.getElementById('setting-password').value.trim();
  if (val.length >= 3) {
    state.adminPassword = val;
    saveState();
    document.getElementById('setting-password').value = '';
    renderPasswordDisplay();
    showToast('Mot de passe admin mis à jour');
  } else {
    showToast('Mot de passe trop court (min 3 caractères)');
  }
}

function changeSpectatorPassword() {
  const val = document.getElementById('setting-spectator-password').value.trim();
  if (val.length >= 3) {
    state.spectatorPassword = val;
    saveState();
    document.getElementById('setting-spectator-password').value = '';
    renderPasswordDisplay();
    showToast('Mot de passe spectateur mis à jour');
  } else {
    showToast('Mot de passe trop court (min 3 caractères)');
  }
}

function regenAdminPassword() {
  state.adminPassword = generatePassword(8);
  saveState();
  renderPasswordDisplay();
  showToast('Nouveau MDP admin généré');
}

function regenSpectatorPassword() {
  state.spectatorPassword = generatePassword(8);
  saveState();
  renderPasswordDisplay();
  showToast('Nouveau MDP spectateur généré');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function togglePasswordDisplay(spanId, btn) {
  const span = document.getElementById(spanId);
  if (span.dataset.hidden === 'true') {
    span.textContent = span.dataset.value;
    span.dataset.hidden = 'false';
    btn.textContent = '🙈';
  } else {
    span.dataset.value = span.textContent;
    span.textContent = '••••••••';
    span.dataset.hidden = 'true';
    btn.textContent = '👁';
  }
}

function renderPasswordDisplay() {
  const adminEl = document.getElementById('current-admin-pass');
  const spectEl = document.getElementById('current-spectator-pass');
  if (adminEl) {
    adminEl.textContent = '••••••••';
    adminEl.dataset.value = state.adminPassword;
    adminEl.dataset.hidden = 'true';
  }
  if (spectEl) {
    spectEl.textContent = '••••••••';
    spectEl.dataset.value = state.spectatorPassword;
    spectEl.dataset.hidden = 'true';
  }
  // Reset eye buttons
  document.querySelectorAll('.btn-eye').forEach(b => b.textContent = '👁');
}

// ===== TEAMS =====
let selectedTeamColorValue = '#e74c3c';

function selectTeamColor(color, btn) {
  selectedTeamColorValue = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
}

function addTeam() {
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) { showToast('Entrez un nom d\'équipe'); return; }
  if (state.teams.length >= 10) { showToast('Maximum 10 équipes'); return; }

  const id = 't' + Date.now();
  state.teams.push({ id, name, color: selectedTeamColorValue });
  document.getElementById('new-team-name').value = '';
  saveState();
  renderTeamsList();
  renderPilotTeamSelect();
  showToast(`Équipe "${name}" ajoutée`);
}

function deleteTeam(id) {
  state.teams = state.teams.filter(t => t.id !== id);
  state.pilots = state.pilots.filter(p => p.teamId !== id);
  initLapData();
  saveState();
  renderTeamsList();
  renderPilotsList();
  renderPilotTeamSelect();
  renderPilots();
}

function renderTeamsList() {
  const list = document.getElementById('teams-list');
  list.innerHTML = '';
  state.teams.forEach(team => {
    const div = document.createElement('div');
    div.className = 'team-item';
    div.innerHTML = `
      <span class="team-color-dot" style="background:${team.color};"></span>
      <span class="team-item-name">${team.name}</span>
      <button class="btn-delete" onclick="deleteTeam('${team.id}')">✕</button>
    `;
    list.appendChild(div);
  });
}

// ===== PILOTS =====
function addPilot() {
  const name = document.getElementById('new-pilot-name').value.trim();
  const teamId = document.getElementById('new-pilot-team').value;
  if (!name) { showToast('Entrez un nom de pilote'); return; }
  if (!teamId) { showToast('Sélectionnez une équipe'); return; }

  const id = 'p' + Date.now();
  state.pilots.push({ id, name, teamId });
  state.lapData[id] = { laps: [], penalty: 0, dnf: false, lapStartTime: 0 };
  document.getElementById('new-pilot-name').value = '';
  saveState();
  renderPilotsList();
  renderPilots();
  showToast(`Pilote "${name}" ajouté`);
}

function deletePilot(id) {
  state.pilots = state.pilots.filter(p => p.id !== id);
  delete state.lapData[id];
  saveState();
  renderPilotsList();
  renderPilots();
}

function renderPilotsList() {
  const list = document.getElementById('pilots-list');
  list.innerHTML = '';
  state.pilots.forEach(pilot => {
    const team = state.teams.find(t => t.id === pilot.teamId);
    const color = team ? team.color : '#888';
    const div = document.createElement('div');
    div.className = 'pilot-item';
    div.innerHTML = `
      <span class="team-color-dot" style="background:${color};"></span>
      <span class="pilot-item-name">${pilot.name}</span>
      <span class="pilot-item-team">${team ? team.name : '—'}</span>
      <button class="btn-delete" onclick="deletePilot('${pilot.id}')">✕</button>
    `;
    list.appendChild(div);
  });
}

function renderPilotTeamSelect() {
  const sel = document.getElementById('new-pilot-team');
  sel.innerHTML = '<option value="">-- Équipe --</option>';
  state.teams.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team.id;
    opt.textContent = team.name;
    sel.appendChild(opt);
  });
}

// ===== RENDER ALL =====
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

// ===== TOAST =====
let toastTimeout = null;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== ANTI-SCROLL PROTECTION (mobile) =====
// Prevent accidental scroll when tapping buttons
document.addEventListener('touchmove', function(e) {
  // Allow scroll only in scrollable containers
  const scrollable = e.target.closest('#results-table-container, .lap-history-section, .settings-section, .teams-list, .pilots-list, .tabs');
  if (!scrollable) {
    // Only prevent if not in a scrollable area
  }
}, { passive: true });

// Prevent double-tap zoom on buttons
document.addEventListener('touchend', function(e) {
  if (e.target.tagName === 'BUTTON') {
    e.preventDefault();
  }
}, { passive: false });

// ===== INIT =====
// Pre-select first color swatch
document.querySelectorAll('.color-swatch')[0]?.classList.add('active');
