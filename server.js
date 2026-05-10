const express = require('express');
const path    = require('path');
const mysql   = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ===== CONNEXION MYSQL =====
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME     || 'reoxdnvn_courseauto',
  user:     process.env.DB_USER     || 'reoxdnvn_Reoxitof18',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
});

// Créer la table si elle n'existe pas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_state (
      id         INT PRIMARY KEY DEFAULT 1,
      admin_code VARCHAR(20)  NOT NULL,
      state_data MEDIUMTEXT   NOT NULL,
      updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('DB ready');
}

// ===== API =====

// Lire l'état
app.get('/api/state', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT state_data, updated_at FROM race_state WHERE id = 1');
    if (!rows.length) return res.json({ state: null });
    const state = JSON.parse(rows[0].state_data);
    res.json({ state, updatedAt: new Date(rows[0].updated_at).getTime() });
  } catch (e) {
    console.error('GET /api/state:', e.message);
    res.status(500).json({ error: 'Erreur lecture' });
  }
});

// Sauvegarder l'état (admin seulement)
app.post('/api/state', async (req, res) => {
  const { adminCode, state } = req.body;
  if (!adminCode || !state) return res.status(400).json({ error: 'Données manquantes' });

  try {
    // Vérifier que c'est bien l'admin
    const [rows] = await pool.query('SELECT admin_code FROM race_state WHERE id = 1');
    if (rows.length && rows[0].admin_code !== adminCode) {
      return res.status(403).json({ error: 'Code admin invalide' });
    }

    // INSERT ou UPDATE
    await pool.query(`
      INSERT INTO race_state (id, admin_code, state_data)
      VALUES (1, ?, ?)
      ON DUPLICATE KEY UPDATE admin_code = VALUES(admin_code), state_data = VALUES(state_data)
    `, [adminCode, JSON.stringify(state)]);

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/state:', e.message);
    res.status(500).json({ error: 'Erreur sauvegarde' });
  }
});

// Toutes les autres routes → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== DÉMARRAGE =====
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log('Server running on port ' + PORT)))
  .catch(e => {
    console.error('DB init failed:', e.message);
    process.exit(1);
  });
