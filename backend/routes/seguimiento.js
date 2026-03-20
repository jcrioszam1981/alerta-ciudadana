// backend/routes/seguimiento.js
// Sistema de actualizaciones con evidencia fotográfica y métricas de tiempo

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { run, get, all } = require('../db/database');
const { auth }          = require('../middleware/auth');

const router = express.Router();

// ── Uploads de evidencia ──────────────────────────────────────
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'evidencias');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `ev_${Date.now()}_${Math.random().toString(36).slice(2,7)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_, file, cb) => {
    const ok = /jpeg|jpg|png|webp/.test(file.mimetype);
    cb(ok ? null : new Error('Solo imágenes JPG/PNG/WEBP'), ok);
  }
});

// Helper notificación
async function notificar(usuarioId, reporteId, tipo, mensaje) {
  if (!usuarioId) return;
  try {
    await run(
      `INSERT INTO notificaciones (usuario_id, reporte_id, tipo, mensaje)
       VALUES (?, ?, ?, ?)`,
      [usuarioId, reporteId, tipo, mensaje]
    );
  } catch {}
}

// ============================================================
// POST /api/seguimiento/:id/actualizar
// Crear actualización con cambio de estado + evidencias
// ============================================================
router.post('/:id/actualizar',
  auth, auth.requireRol('admin', 'operador'),
  upload.array('evidencias', 4),
  async (req, res) => {
    try {
      const reporteId = parseInt(req.params.id);
      const { estado_nuevo, comentario, es_publico = 1 } = req.body;

      const ESTADOS_VALIDOS = ['reportado','revision','proceso','solucionado','cancelado'];
      if (!ESTADOS_VALIDOS.includes(estado_nuevo)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }

      // Obtener reporte actual
      const reporte = await get('SELECT * FROM reportes WHERE id = ?', [reporteId]);
      if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });

      // 1. Registrar actualización
      const { lastID: actId } = await run(
        `INSERT INTO actualizaciones
           (reporte_id, usuario_id, estado_nuevo, comentario, es_publico)
         VALUES (?, ?, ?, ?, ?)`,
        [reporteId, req.usuario.id, estado_nuevo,
         comentario?.trim() || null, es_publico ? 1 : 0]
      );

      // 2. Guardar evidencias (fotos)
      const evidenciasGuardadas = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = `/uploads/evidencias/${file.filename}`;
          const { lastID: evId } = await run(
            `INSERT INTO evidencias (actualizacion_id, reporte_id, url)
             VALUES (?, ?, ?)`,
            [actId, reporteId, url]
          );
          evidenciasGuardadas.push({ id: evId, url });
        }
      }

      // 3. Actualizar estado del reporte
      const updates  = ['estado = ?'];
      const params   = [estado_nuevo];

      if (estado_nuevo === 'solucionado') {
        updates.push("resuelto_en = datetime('now','localtime')");
      }
      if (estado_nuevo === 'reportado' || estado_nuevo === 'cancelado') {
        // Si se cancela o regresa a reportado, limpiar resuelto_en
        if (estado_nuevo === 'cancelado') updates.push("resuelto_en = NULL");
      }
      params.push(reporteId);
      await run(`UPDATE reportes SET ${updates.join(', ')} WHERE id = ?`, params);

      // 4. Historial legado (compatibilidad)
      await run(
        `INSERT INTO historial_estados
           (reporte_id, usuario_id, estado_anterior, estado_nuevo, comentario)
         VALUES (?, ?, ?, ?, ?)`,
        [reporteId, req.usuario.id, reporte.estado, estado_nuevo,
         comentario?.trim() || null]
      );

      // 5. Notificar al ciudadano
      if (reporte.usuario_id) {
        const msgs = {
          revision:    `Tu reporte ${reporte.folio} está siendo revisado.`,
          proceso:     `¡Tu reporte ${reporte.folio} está en proceso de atención!`,
          solucionado: `✅ Tu reporte ${reporte.folio} fue solucionado.`,
          cancelado:   `Tu reporte ${reporte.folio} fue cancelado.`,
        };
        if (msgs[estado_nuevo]) {
          await notificar(reporte.usuario_id, reporteId, 'estado_cambio', msgs[estado_nuevo]);
        }
      }

      // 6. Devolver actualización completa
      const actualizacion = await get(
        `SELECT a.*, u.nombre as operador_nombre
         FROM actualizaciones a
         LEFT JOIN usuarios u ON a.usuario_id = u.id
         WHERE a.id = ?`, [actId]
      );

      res.status(201).json({
        actualizacion,
        evidencias: evidenciasGuardadas,
        reporte_estado: estado_nuevo,
      });

    } catch (err) {
      console.error('Error actualizar:', err);
      res.status(500).json({ error: 'Error al guardar la actualización' });
    }
  }
);

// ============================================================
// GET /api/seguimiento/:id/historial
// Timeline completo de un reporte con evidencias
// ============================================================
router.get('/:id/historial', async (req, res) => {
  try {
    const id = req.params.id;

    // Reporte base
    const reporte = await get(
      `SELECT r.*,
              u.nombre as ciudadano_nombre,
              a.nombre as asignado_nombre
       FROM reportes r
       LEFT JOIN usuarios u ON r.usuario_id = u.id
       LEFT JOIN usuarios a ON r.asignado_a = a.id
       WHERE r.id = ?`, [id]
    );
    if (!reporte) return res.status(404).json({ error: 'No encontrado' });

    // Actualizaciones con evidencias
    const actualizaciones = await all(
      `SELECT a.*, u.nombre as operador_nombre, u.rol as operador_rol
       FROM actualizaciones a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.reporte_id = ?
       ORDER BY a.creado_en ASC`, [id]
    );

    // Cargar evidencias para cada actualización
    for (const act of actualizaciones) {
      act.evidencias = await all(
        `SELECT * FROM evidencias WHERE actualizacion_id = ? ORDER BY id ASC`,
        [act.id]
      );
    }

    // Métricas de tiempo
    const metricas = calcularMetricas(reporte, actualizaciones);

    res.json({ reporte, actualizaciones, metricas });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ============================================================
// GET /api/seguimiento/estadisticas
// Métricas globales de tiempos y seguimiento
// ============================================================
router.get('/estadisticas', async (req, res) => {
  try {
    const [
      tiempoPromedio,
      porEstado,
      distribucionTiempos,
      top10Lentos,
      eficienciaMensual,
      actividadOperadores
    ] = await Promise.all([

      // Tiempo promedio de resolución por tipo (en horas)
      all(`SELECT
             tipo,
             COUNT(*) as total,
             SUM(CASE WHEN estado='solucionado' THEN 1 ELSE 0 END) as resueltos,
             ROUND(AVG(CASE WHEN resuelto_en IS NOT NULL
               THEN (julianday(resuelto_en) - julianday(creado_en)) * 24
               END), 1) as horas_promedio,
             ROUND(MIN(CASE WHEN resuelto_en IS NOT NULL
               THEN (julianday(resuelto_en) - julianday(creado_en)) * 24
               END), 1) as horas_minimo,
             ROUND(MAX(CASE WHEN resuelto_en IS NOT NULL
               THEN (julianday(resuelto_en) - julianday(creado_en)) * 24
               END), 1) as horas_maximo
           FROM reportes
           GROUP BY tipo ORDER BY horas_promedio ASC`),

      // Conteo por estado
      all(`SELECT estado, COUNT(*) as total FROM reportes GROUP BY estado`),

      // Distribución: cuántos se resolvieron en <24h, 1-3d, 3-7d, >7d
      all(`SELECT
             CASE
               WHEN (julianday(resuelto_en) - julianday(creado_en)) < 1   THEN 'menos_24h'
               WHEN (julianday(resuelto_en) - julianday(creado_en)) < 3   THEN '1_a_3_dias'
               WHEN (julianday(resuelto_en) - julianday(creado_en)) < 7   THEN '3_a_7_dias'
               ELSE 'mas_7_dias'
             END as rango,
             COUNT(*) as total
           FROM reportes
           WHERE estado = 'solucionado' AND resuelto_en IS NOT NULL
           GROUP BY rango`),

      // Top 10 reportes más lentos en resolverse
      all(`SELECT id, folio, tipo, colonia,
                  ROUND((julianday(resuelto_en) - julianday(creado_en)), 1) as dias,
                  creado_en, resuelto_en
           FROM reportes
           WHERE estado = 'solucionado' AND resuelto_en IS NOT NULL
           ORDER BY dias DESC LIMIT 10`),

      // Eficiencia mensual
      all(`SELECT
             strftime('%Y-%m', creado_en) as mes,
             COUNT(*) as creados,
             SUM(CASE WHEN estado='solucionado' THEN 1 ELSE 0 END) as resueltos,
             ROUND(AVG(CASE WHEN resuelto_en IS NOT NULL
               THEN julianday(resuelto_en) - julianday(creado_en) END), 1) as dias_promedio
           FROM reportes
           WHERE creado_en >= date('now','-12 months')
           GROUP BY mes ORDER BY mes ASC`),

      // Actividad por operador
      all(`SELECT
             u.nombre,
             u.rol,
             COUNT(a.id) as actualizaciones,
             SUM(CASE WHEN a.estado_nuevo='solucionado' THEN 1 ELSE 0 END) as resueltos
           FROM actualizaciones a
           LEFT JOIN usuarios u ON a.usuario_id = u.id
           WHERE u.id IS NOT NULL
           GROUP BY a.usuario_id ORDER BY actualizaciones DESC LIMIT 10`)
    ]);

    // Reporte sin resolver más antiguo
    const masAntiguo = await get(
      `SELECT id, folio, tipo,
              ROUND(julianday('now') - julianday(creado_en), 0) as dias_abierto,
              creado_en, estado
       FROM reportes
       WHERE estado NOT IN ('solucionado','cancelado')
       ORDER BY creado_en ASC LIMIT 1`
    );

    // SLA: % resueltos en menos de 72h
    const sla = await get(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN (julianday(resuelto_en)-julianday(creado_en)) < 3 THEN 1 ELSE 0 END) as dentro_sla
       FROM reportes
       WHERE estado='solucionado' AND resuelto_en IS NOT NULL`
    );

    res.json({
      tiempoPromedio,
      porEstado,
      distribucionTiempos,
      top10Lentos,
      eficienciaMensual,
      actividadOperadores,
      masAntiguo: masAntiguo || null,
      sla: sla ? {
        total: sla.total,
        dentro: sla.dentro_sla || 0,
        porcentaje: sla.total > 0
          ? Math.round((sla.dentro_sla / sla.total) * 100) : 0
      } : { total:0, dentro:0, porcentaje:0 }
    });

  } catch (err) {
    console.error('seguimiento stats error:', err);
    res.status(500).json({ error: 'Error en estadísticas', detalle: err.message });
  }
});

// ── Helper: calcular métricas de tiempo de un reporte ─────────
function calcularMetricas(reporte, actualizaciones) {
  const ahora      = new Date();
  const creado     = new Date(reporte.creado_en);
  const resuelto   = reporte.resuelto_en ? new Date(reporte.resuelto_en) : null;
  const horasTotal = Math.round((ahora - creado) / 36e5);
  const diasTotal  = Math.round(horasTotal / 24);

  // Tiempo en cada estado
  const tiemposPorEstado = {};
  let prev = { estado: 'reportado', fecha: creado };

  for (const act of actualizaciones) {
    const fecha = new Date(act.creado_en);
    const horas = Math.round((fecha - prev.fecha) / 36e5);
    tiemposPorEstado[prev.estado] = (tiemposPorEstado[prev.estado] || 0) + horas;
    prev = { estado: act.estado_nuevo, fecha };
  }
  // Estado actual hasta ahora (o hasta resolución)
  const finUltimo = resuelto || ahora;
  const horasUltimo = Math.round((finUltimo - prev.fecha) / 36e5);
  tiemposPorEstado[prev.estado] = (tiemposPorEstado[prev.estado] || 0) + horasUltimo;

  return {
    horas_abierto:       horasTotal,
    dias_abierto:        diasTotal,
    resuelto:            !!resuelto,
    horas_resolucion:    resuelto ? Math.round((resuelto - creado) / 36e5) : null,
    dias_resolucion:     resuelto ? Math.round((resuelto - creado) / 36e5 / 24 * 10) / 10 : null,
    num_actualizaciones: actualizaciones.length,
    tiempo_por_estado:   tiemposPorEstado,
    sla_ok:              resuelto
      ? (resuelto - creado) / 36e5 < 72   // SLA: resolver en menos de 72 horas
      : null,
  };
}

module.exports = router;
