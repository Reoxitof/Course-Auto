const express = require('express');
const path = require('path');

const app = express();

// Servir index.html et les fichiers statiques à la racine
app.use(express.static(path.join(__dirname)));

// Toutes les routes → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
