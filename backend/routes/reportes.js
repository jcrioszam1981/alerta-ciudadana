// backend/routes/reportes.js
// API completa de reportes: CRUD + estados + analítica

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { run, get, all } = require('../db/database');
const { auth }          = require('../middleware/auth');

const router = express.Router();

// ── Configuración de uploads ─────────────────────────────────
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `reporte_${Date.now()}_${Math.random().toString(36).slice(2,8)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_, file, cb) => {
    const ok = /jpeg|jpg|png|webp/.test(file.mimetype);
    cb(ok ? null : new Error('Solo imágenes JPG/PNG/WEBP'), ok);
  }
});

// ── Helper: crear notificación ───────────────────────────────
async function notificar(usuarioId, reporteId, tipo, mensaje) {
  if (!usuarioId) return;
  await run(
    `INSERT INTO notificaciones (usuario_id, reporte_id, tipo, mensaje)
     VALUES (?, ?, ?, ?)`,
    [usuarioId, reporteId, tipo, mensaje]
  );
}

// ============================================================
// GET /api/reportes  — Listar con filtros
// ============================================================
router.get('/', auth.optional, async (req, res) => {
  try {
    const {
      tipo, estado, prioridad, colonia, calle,
      desde, hasta,
      lat, lng, radio,          // filtro geográfico (km)
      page = 1, limit = 50,
      orden = 'creado_en', dir = 'DESC'
    } = req.query;

    const condiciones = [];
    const params      = [];

    if (tipo)      { condiciones.push('r.tipo = ?');      params.push(tipo);      }
    if (estado)    { condiciones.push('r.estado = ?');    params.push(estado);    }
    if (prioridad) { condiciones.push('r.prioridad = ?'); params.push(prioridad); }
    if (colonia)   { condiciones.push('r.colonia LIKE ?'); params.push(`%${colonia}%`); }
    if (calle)     { condiciones.push('r.calle LIKE ?');   params.push(`%${calle}%`);   }
    if (desde)     { condiciones.push("r.creado_en >= ?"); params.push(desde);    }
    if (hasta)     { condiciones.push("r.creado_en <= ?"); params.push(hasta);    }

    // Filtro geográfico básico (caja delimitadora)
    if (lat && lng && radio) {
      const R   = parseFloat(radio);
      const Lat = parseFloat(lat);
      const Lng = parseFloat(lng);
      const dLat = R / 111;
      const dLng = R / (111 * Math.cos(Lat * Math.PI / 180));
      condiciones.push('r.latitud BETWEEN ? AND ? AND r.longitud BETWEEN ? AND ?');
      params.push(Lat - dLat, Lat + dLat, Lng - dLng, Lng + dLng);
    }

    const where   = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
    const orderBy = ['creado_en','votos','vistas','prioridad'].includes(orden) ? orden : 'creado_en';
    const orderDir= dir === 'ASC' ? 'ASC' : 'DESC';
    const offset  = (parseInt(page) - 1) * parseInt(limit);

    const sql = `
      SELECT r.*,
             u.nombre AS ciudadano_nombre,
             a.nombre AS asignado_nombre
      FROM   reportes r
      LEFT JOIN usuarios u ON r.usuario_id = u.id
      LEFT JOIN usuarios a ON r.asignado_a = a.id
      ${where}
      ORDER BY r.${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;

    const [rows, total] = await Promise.all([
      all(sql, [...params, parseInt(limit), offset]),
      get(`SELECT COUNT(*) as n FROM reportes r ${where}`, params)
    ]);

    res.json({ total: total.n, pagina: parseInt(page), datos: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// ============================================================
// GET /api/reportes/mapa  — Solo coords (liviano para Leaflet)
// ============================================================
router.get('/mapa', async (req, res) => {
  try {
    const { tipo, estado } = req.query;
    const cond   = [];
    const params = [];
    if (tipo)   { cond.push('tipo = ?');   params.push(tipo);   }
    if (estado) { cond.push('estado = ?'); params.push(estado); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    const rows = await all(
      `SELECT id, tipo, subtipo, estado, prioridad, latitud, longitud,
              foto_url, folio, creado_en, votos
       FROM reportes ${where}
       ORDER BY creado_en DESC LIMIT 2000`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener datos del mapa' });
  }
});

// ============================================================
// GET /api/reportes/estadisticas  — Dashboard analítico
// ============================================================
router.get('/estadisticas', async (req, res) => {
  try {
    // Ejecutar cada query de forma independiente con fallback a []/{} si falla
    const safe = (fn) => fn.catch(e => { console.warn('stats query warn:', e.message); return null; });

    const [porTipo, porEstado, porMes, topColonias, topCalles, resumen] = await Promise.all([

      safe(all(`SELECT tipo, COUNT(*) as total,
                  SUM(CASE WHEN estado='solucionado' THEN 1 ELSE 0 END) as solucionados
                FROM reportes GROUP BY tipo ORDER BY total DESC`)),

      safe(all(`SELECT estado, COUNT(*) as total
                FROM reportes GROUP BY estado ORDER BY total DESC`)),

      safe(all(`SELECT strftime('%Y-%m', creado_en) as mes, COUNT(*) as total
                FROM reportes
                WHERE creado_en >= date('now','-12 months')
                GROUP BY mes ORDER BY mes ASC`)),

      safe(all(`SELECT colonia, COUNT(*) as total
                FROM reportes WHERE colonia IS NOT NULL AND colonia != ''
                GROUP BY colonia ORDER BY total DESC LIMIT 10`)),

      safe(all(`SELECT calle, COUNT(*) as total
                FROM reportes WHERE calle IS NOT NULL AND calle != ''
                GROUP BY calle ORDER BY total DESC LIMIT 10`)),

      safe(get(`SELECT
                  COUNT(*) as total,
                  SUM(CASE WHEN estado='reportado'   THEN 1 ELSE 0 END) as reportados,
                  SUM(CASE WHEN estado='revision'    THEN 1 ELSE 0 END) as en_revision,
                  SUM(CASE WHEN estado='proceso'     THEN 1 ELSE 0 END) as en_proceso,
                  SUM(CASE WHEN estado='solucionado' THEN 1 ELSE 0 END) as solucionados,
                  SUM(CASE WHEN estado='cancelado'   THEN 1 ELSE 0 END) as cancelados,
                  ROUND(AVG(CASE WHEN estado='solucionado'
                    THEN (julianday(resuelto_en) - julianday(creado_en)) END), 1) as dias_promedio_resolucion
                FROM reportes`))
    ]);

    // tendencia: últimos 30 días con reportes — query simple y segura
    const tendencia = await safe(all(
      `SELECT date(creado_en) as fecha, COUNT(*) as total
       FROM reportes
       WHERE creado_en >= date('now','-30 days')
       GROUP BY date(creado_en)
       ORDER BY fecha ASC`
    ));

    res.json({
      porTipo:     porTipo     || [],
      porEstado:   porEstado   || [],
      porMes:      porMes      || [],
      topColonias: topColonias || [],
      topCalles:   topCalles   || [],
      resumen:     resumen     || { total:0, reportados:0, en_revision:0, en_proceso:0, solucionados:0, cancelados:0 },
      tendencia:   tendencia   || [],
    });
  } catch (err) {
    console.error('estadisticas error:', err);
    res.status(500).json({ error: 'Error en estadísticas', detalle: err.message });
  }
});

// ============================================================
// GET /api/reportes/:id  — Detalle
// ============================================================
router.get('/:id', auth.optional, async (req, res) => {
  try {
    // Incrementar vistas
    await run('UPDATE reportes SET vistas = vistas + 1 WHERE id = ?', [req.params.id]);

    const reporte = await get(
      `SELECT r.*, u.nombre AS ciudadano_nombre, a.nombre AS asignado_nombre
       FROM reportes r
       LEFT JOIN usuarios u ON r.usuario_id = u.id
       LEFT JOIN usuarios a ON r.asignado_a = a.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

    const [historial, comentarios] = await Promise.all([
      all(`SELECT h.*, u.nombre FROM historial_estados h
           LEFT JOIN usuarios u ON h.usuario_id = u.id
           WHERE h.reporte_id = ? ORDER BY h.creado_en ASC`, [req.params.id]),
      all(`SELECT c.*, u.nombre FROM comentarios c
           LEFT JOIN usuarios u ON c.usuario_id = u.id
           WHERE c.reporte_id = ? AND (c.es_publico = 1 OR ?)
           ORDER BY c.creado_en ASC`,
          [req.params.id, req.usuario?.rol === 'admin' || req.usuario?.rol === 'operador' ? 1 : 0])
    ]);

    res.json({ ...reporte, historial, comentarios });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
});

// ============================================================
// POST /api/reportes  — Crear reporte
// ============================================================
router.post('/', auth.optional, upload.single('foto'), async (req, res) => {
  try {
    const { tipo, subtipo, descripcion, latitud, longitud, direccion, colonia, calle } = req.body;

    if (!tipo || !latitud || !longitud) {
      return res.status(400).json({ error: 'Campos requeridos: tipo, latitud, longitud' });
    }

    const foto_url   = req.file ? `/uploads/${req.file.filename}` : null;
    const usuario_id = req.usuario?.id || null;

    const { lastID } = await run(
      `INSERT INTO reportes
         (usuario_id, tipo, subtipo, descripcion, latitud, longitud,
          direccion, colonia, calle, foto_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuario_id, tipo, subtipo || null, descripcion || null,
       parseFloat(latitud), parseFloat(longitud),
       direccion || null, colonia || null, calle || null, foto_url]
    );

    // Registrar historial inicial
    await run(
      `INSERT INTO historial_estados (reporte_id, usuario_id, estado_anterior, estado_nuevo, comentario)
       VALUES (?, ?, NULL, 'reportado', 'Reporte creado')`,
      [lastID, usuario_id]
    );

    const reporte = await get('SELECT * FROM reportes WHERE id = ?', [lastID]);
    res.status(201).json(reporte);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear reporte' });
  }
});

// ============================================================
// PATCH /api/reportes/:id/estado  — Cambiar estado (admin/operador)
// ============================================================
router.patch('/:id/estado', auth, auth.requireRol('admin','operador'), async (req, res) => {
  try {
    const { estado, comentario, prioridad, asignado_a } = req.body;
    const ESTADOS = ['reportado','revision','proceso','solucionado','cancelado'];

    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const reporte = await get('SELECT * FROM reportes WHERE id = ?', [req.params.id]);
    if (!reporte) return res.status(404).json({ error: 'No encontrado' });

    // Campos a actualizar
    const updates  = ['estado = ?'];
    const values   = [estado];

    if (prioridad) { updates.push('prioridad = ?');   values.push(prioridad); }
    if (asignado_a !== undefined) { updates.push('asignado_a = ?'); values.push(asignado_a || null); }
    if (estado === 'solucionado') { updates.push("resuelto_en = datetime('now','localtime')"); }

    values.push(req.params.id);
    await run(`UPDATE reportes SET ${updates.join(', ')} WHERE id = ?`, values);

    // Historial
    await run(
      `INSERT INTO historial_estados
         (reporte_id, usuario_id, estado_anterior, estado_nuevo, comentario)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.usuario.id, reporte.estado, estado, comentario || null]
    );

    // Notificar al ciudadano
    if (reporte.usuario_id) {
      const msgs = {
        revision:    'Tu reporte está siendo revisado por el equipo municipal.',
        proceso:     '¡Tu reporte está en proceso de atención!',
        solucionado: '¡Tu reporte ha sido solucionado! Gracias por tu participación.',
        cancelado:   'Tu reporte fue cancelado. Consulta los comentarios para más detalles.'
      };
      if (msgs[estado]) {
        await notificar(reporte.usuario_id, reporte.id, 'estado_cambio',
          `Folio ${reporte.folio}: ${msgs[estado]}`);
      }
    }

    const actualizado = await get('SELECT * FROM reportes WHERE id = ?', [req.params.id]);
    res.json(actualizado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// ============================================================
// POST /api/reportes/:id/voto  — Votar un reporte
// ============================================================
router.post('/:id/voto', auth.optional, async (req, res) => {
  try {
    const ip = req.ip;
    const uid = req.usuario?.id;

    if (!uid && !ip) return res.status(400).json({ error: 'Identificación requerida' });

    // Anti-duplicado
    const yaVoto = await get(
      `SELECT id FROM votos WHERE reporte_id = ? AND (usuario_id = ? OR ip = ?)`,
      [req.params.id, uid || 0, ip]
    );
    if (yaVoto) return res.status(409).json({ error: 'Ya votaste por este reporte' });

    await run(
      'INSERT INTO votos (reporte_id, usuario_id, ip) VALUES (?,?,?)',
      [req.params.id, uid || null, ip]
    );
    const { changes } = await run(
      'UPDATE reportes SET votos = votos + 1 WHERE id = ?',
      [req.params.id]
    );
    if (!changes) return res.status(404).json({ error: 'Reporte no encontrado' });

    const r = await get('SELECT votos FROM reportes WHERE id = ?', [req.params.id]);
    res.json({ votos: r.votos });
  } catch (err) {
    res.status(500).json({ error: 'Error al votar' });
  }
});

// ============================================================
// POST /api/reportes/:id/comentario
// ============================================================
router.post('/:id/comentario', auth, async (req, res) => {
  try {
    const { texto, es_publico = false } = req.body;
    if (!texto?.trim()) return res.status(400).json({ error: 'Texto requerido' });

    const esAdmin = ['admin','operador'].includes(req.usuario.rol);
    const publico = esAdmin ? (es_publico ? 1 : 0) : 1;

    const { lastID } = await run(
      `INSERT INTO comentarios (reporte_id, usuario_id, texto, es_publico)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, req.usuario.id, texto.trim(), publico]
    );
    const comentario = await get(
      `SELECT c.*, u.nombre FROM comentarios c
       LEFT JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.id = ?`, [lastID]
    );
    res.status(201).json(comentario);
  } catch (err) {
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

module.exports = router;
