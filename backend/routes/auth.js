// backend/routes/auth.js
// Autenticación: registro, login, perfil, notificaciones

const express  = require('express');
const bcrypt   = require('bcrypt');
const { run, get, all } = require('../db/database');
const { auth, generarToken } = require('../middleware/auth');

const router = express.Router();
const SALT   = 10;

// ── POST /api/auth/registro ─────────────────────────────────
router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, telefono } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y password son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password debe tener al menos 6 caracteres' });
    }

    const existente = await get('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase()]);
    if (existente) return res.status(409).json({ error: 'Email ya registrado' });

    const hash = await bcrypt.hash(password, SALT);
    const { lastID } = await run(
      `INSERT INTO usuarios (nombre, email, password, telefono) VALUES (?,?,?,?)`,
      [nombre.trim(), email.toLowerCase().trim(), hash, telefono || null]
    );

    const usuario = await get(
      'SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = ?', [lastID]
    );
    const token = generarToken(usuario);

    res.status(201).json({ token, usuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password requeridos' });
    }

    const usuario = await get(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email.toLowerCase().trim()]
    );
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = generarToken(usuario);
    const { password: _, ...datos } = usuario;   // no devolver hash

    // Cookie httpOnly para panel admin
    res.cookie('token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict', maxAge: 86400000   // 24h
    });

    res.json({ token, usuario: datos });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensaje: 'Sesión cerrada' });
});

// ── GET /api/auth/perfil ─────────────────────────────────────
router.get('/perfil', auth, async (req, res) => {
  try {
    const usuario = await get(
      'SELECT id, nombre, email, rol, telefono, creado_en FROM usuarios WHERE id = ?',
      [req.usuario.id]
    );
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Sus reportes
    const reportes = await all(
      `SELECT id, tipo, estado, folio, creado_en
       FROM reportes WHERE usuario_id = ?
       ORDER BY creado_en DESC LIMIT 20`,
      [req.usuario.id]
    );

    res.json({ ...usuario, reportes });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// ── GET /api/auth/notificaciones ─────────────────────────────
router.get('/notificaciones', auth, async (req, res) => {
  try {
    const notifs = await all(
      `SELECT n.*, r.folio, r.tipo
       FROM notificaciones n
       LEFT JOIN reportes r ON n.reporte_id = r.id
       WHERE n.usuario_id = ?
       ORDER BY n.creado_en DESC LIMIT 30`,
      [req.usuario.id]
    );
    const noLeidas = notifs.filter(n => !n.leida).length;
    res.json({ notificaciones: notifs, no_leidas: noLeidas });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// ── PATCH /api/auth/notificaciones/leer ──────────────────────
router.patch('/notificaciones/leer', auth, async (req, res) => {
  try {
    await run(
      'UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?',
      [req.usuario.id]
    );
    res.json({ mensaje: 'Notificaciones marcadas como leídas' });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── GET /api/auth/usuarios  (solo admin) ─────────────────────
router.get('/usuarios', auth, auth.requireRol('admin'), async (req, res) => {
  try {
    const usuarios = await all(
      `SELECT id, nombre, email, rol, telefono, activo, creado_en
       FROM usuarios ORDER BY creado_en DESC`
    );
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ── PATCH /api/auth/usuarios/:id/rol  (solo admin) ───────────
router.patch('/usuarios/:id/rol', auth, auth.requireRol('admin'), async (req, res) => {
  try {
    const { rol } = req.body;
    const ROLES = ['ciudadano','operador','admin'];
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

    await run('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, req.params.id]);
    res.json({ mensaje: 'Rol actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
});

module.exports = router;
