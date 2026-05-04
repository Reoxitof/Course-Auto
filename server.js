const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== POSTGRES =====
const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'postgres-ghzw.internal',
  port:     parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB       || 'mydb',
  user:     process.env.POSTGRES_USER     || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'LQPZsmNPPgwiRNL8',
  ssl: false,
});

// Créer la table si elle n'existe pas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           SERIAL PRIMARY KEY,
      admin_code   VARCHAR(10) NOT NULL UNIQUE,
      spectator_code VARCHAR(10) NOT NULL UNIQUE,
      state_data   TEXT,
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('DB ready');
}

// ===== API =====

// Créer une session → retourne les deux codes
app.post('/api/session/create', async (req, res) => {
  try {
    const adminCode     = randomCode();
    const spectatorCode = randomCode();
    await pool.query(
      'INSERT INTO sessions (admin_code, spectator_code, state_data) VALUES ($1, $2, $3)',
      [adminCode, spectatorCode, JSON.stringify({ teams: [], lapData: {}, maxLaps: 10, raceRunning: false, raceFinished: false, raceElapsed: 0 })]
    );
    res.json({ adminCode, spectatorCode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur création session' });
  }
});

// Valider un code → retourne le rôle et le state
app.post('/api/session/join', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code manquant' });
  try {
    const upper = code.toUpperCase();
    const r = await pool.query(
      'SELECT * FROM sessions WHERE admin_code=$1 OR spectator_code=$1',
      [upper]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Code invalide' });
    const session = r.rows[0];
    const role = session.admin_code === upper ? 'admin' : 'spectator';
    const state = JSON.parse(session.state_data || '{}');
    state.adminCode     = session.admin_code;
    state.spectatorCode = session.spectator_code;
    res.json({ role, state, sessionId: session.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder le state
app.post('/api/session/save', async (req, res) => {
  const { sessionId, state } = req.body;
  if (!sessionId || !state) return res.status(400).json({ error: 'Données manquantes' });
  try {
    await pool.query(
      'UPDATE sessions SET state_data=$1, updated_at=NOW() WHERE id=$2',
      [JSON.stringify(state), sessionId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

// Lire le state (pour les spectateurs qui se synchronisent)
app.get('/api/session/:id/state', async (req, res) => {
  try {
    const r = await pool.query('SELECT state_data FROM sessions WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Session introuvable' });
    res.json(JSON.parse(r.rows[0].state_data || '{}'));
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture' });
  }
});

// ===== UTILS =====
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ===== DÉMARRAGE =====
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
}).catch(e => {
  console.error('DB init failed:', e.message);
  process.exit(1);
});
