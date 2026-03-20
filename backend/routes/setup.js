// backend/routes/setup.js
// Ruta temporal para crear admin en producción
// ELIMINAR después de usarla
 
const express = require('express');
const bcrypt  = require('bcrypt');
const { run, get } = require('../db/database');
 
const router = express.Router();
 
// GET /api/setup/admin  — crea o resetea el admin
router.get('/admin', async (req, res) => {
  // Clave de seguridad para que nadie más la use
  const key = req.query.key;
  if (key !== 'setup_alerta_2024') {
    return res.status(403).json({ error: 'Clave incorrecta' });
  }
 
  try {
    const password = 'Admin2024!';
    const hash     = await bcrypt.hash(password, 10);
 
    const existente = await get("SELECT id FROM usuarios WHERE email = 'admin@ciudad.gob'");
 
    if (existente) {
      await run("UPDATE usuarios SET password = ?, rol = 'admin' WHERE email = 'admin@ciudad.gob'", [hash]);
      res.json({ ok: true, accion: 'actualizado', email: 'admin@ciudad.gob', password });
    } else {
      await run(
        "INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Administrador', 'admin@ciudad.gob', ?, 'admin')",
        [hash]
      );
      res.json({ ok: true, accion: 'creado', email: 'admin@ciudad.gob', password });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
 
module.exports = router;