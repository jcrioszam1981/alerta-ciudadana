// backend/middleware/auth.js
// Middleware de autenticación JWT
// Uso: router.get('/ruta', auth, auth.requireRol('admin'), handler)

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'alerta_ciudadana_secret_2024_cambiar_en_produccion';

// ── Generar token ────────────────────────────────────────────
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    SECRET,
    { expiresIn: '24h' }
  );
}

// ── Middleware: verificar token ──────────────────────────────
function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  // También aceptar token en cookie (útil para panel admin SSR)
  const cookieToken = req.cookies?.token;
  const finalToken  = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    req.usuario = jwt.verify(finalToken, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Middleware: verificar rol ────────────────────────────────
auth.requireRol = (...roles) => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
  }
  next();
};

// ── Middleware: auth opcional (enriquece req.usuario si hay token) ─
auth.optional = (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (token) {
    try { req.usuario = jwt.verify(token, SECRET); } catch {}
  }
  next();
};

module.exports = { auth, generarToken, SECRET };
