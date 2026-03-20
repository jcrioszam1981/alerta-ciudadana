// server.js  — Servidor principal Alerta Ciudadana v2.0
 
require('dotenv').config();
 
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const path         = require('path');
const http         = require('http');
 
const { initDB }       = require('./backend/db/database');
const reportesRouter    = require('./backend/routes/reportes');
const seguimientoRouter = require('./backend/routes/seguimiento');
const authRouter       = require('./backend/routes/auth');
 
const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;
 
// ── Middleware de seguridad ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,     // Leaflet necesita inline scripts
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
 
// ── Rate limiting simple (sin dependencias externas) ─────────
const requestCounts = new Map();
app.use('/api', (req, res, next) => {
  const key   = req.ip;
  const now   = Date.now();
  const entry = requestCounts.get(key) || { count: 0, reset: now + 60000 };
 
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  requestCounts.set(key, entry);
 
  if (entry.count > 120) {   // 120 req/min por IP
    return res.status(429).json({ error: 'Demasiadas solicitudes, espera un momento' });
  }
  next();
});
 
// ── Archivos estáticos ──────────────────────────────────────
// index: false evita que Express sirva index.html automáticamente
// así las rutas explícitas abajo controlan qué se muestra en /
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'frontend'), { index: false }));
 
// ── Rutas API ────────────────────────────────────────────────
app.use('/api/reportes', reportesRouter);
app.use('/api/auth',       authRouter);
app.use('/api/seguimiento', seguimientoRouter);
const setupRouter = require('./backend/routes/setup');
app.use('/api/setup', setupRouter);
 
// ── Rutas frontend (SPA fallback) ────────────────────────────
app.get('/admin*', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'admin.html'))
);
app.get('/mapa', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);
app.get('/mapa*', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);
// Ruta raíz → página de bienvenida
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'welcome.html'))
);
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);
 
// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() })
);
 
// ── Manejo de errores global ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Imagen demasiado grande (máx 5MB)' });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});
 
// ── Arranque ─────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log(`\n🚀 Alerta Ciudadana v2.0`);
      console.log(`📡 Servidor: http://localhost:${PORT}`);
      console.log(`🗺️  Mapa:     http://localhost:${PORT}`);
      console.log(`⚙️  Admin:    http://localhost:${PORT}/admin.html`);
      console.log(`🔑 API:      http://localhost:${PORT}/api/reportes\n`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar:', err);
    process.exit(1);
  }
}
 
start();
