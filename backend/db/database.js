// backend/db/database.js
// Compatible con Railway (SQLite en /tmp o ruta configurable)

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

// En Railway el filesystem es efímero → usar /tmp
// En local → usar ./data/
const isProduction = process.env.NODE_ENV === 'production';
const DB_DIR  = isProduction
  ? '/tmp'
  : path.join(__dirname, '..', '..', 'data');

const DB_PATH     = path.join(DB_DIR, 'alerta_ciudadana.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Crear directorio si no existe (solo en local)
if (!isProduction && !fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Crear directorio de uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const evidDir = path.join(uploadDir, 'evidencias');
if (!fs.existsSync(evidDir)) fs.mkdirSync(evidDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('❌ Error BD:', err.message); process.exit(1); }
  console.log('✅ BD conectada:', DB_PATH);
});

function initDB() {
  return new Promise((resolve, reject) => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = ON');
      db.run('PRAGMA journal_mode = WAL');
      db.exec(schema, err => {
        if (err && err.message && err.message.includes('already exists')) {
          console.log('✅ Schema ya existente');
          resolve();
        } else if (err) {
          console.error('❌ Error schema:', err.message);
          reject(err);
        } else {
          console.log('✅ Schema inicializado');
          resolve();
        }
      });
    });
  });
}

const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { err ? rej(err) : res({ lastID: this.lastID, changes: this.changes }); })
);
const get = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row))
);
const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
);

module.exports = { db, initDB, run, get, all };
