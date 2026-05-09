const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const STATE_FILE = path.join(__dirname, 'race_state.json');

// Lire l'état depuis le fichier
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

// Sauvegarder l'état dans le fichier
function writeState(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
}

// ===== API =====

// L'admin pousse son état vers le serveur
app.post('/api/state', (req, res) => {
  const { adminCode, state } = req.body;
  if (!adminCode || !state) return res.status(400).json({ error: 'Données manquantes' });

  const current = readState();
  // Vérifier que c'est bien l'admin
  if (current && current.adminCode !== adminCode) {
    return res.status(403).json({ error: 'Code admin invalide' });
  }

  writeState({ adminCode, state, updatedAt: Date.now() });
  res.json({ ok: true });
});

// Le spectateur (et l'admin) récupère l'état depuis le serveur
app.get('/api/state', (req, res) => {
  const data = readState();
  if (!data) return res.json({ state: null });
  res.json({ state: data.state, updatedAt: data.updatedAt });
});

// Toutes les autres routes → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
