-- ============================================================
-- ALERTA CIUDADANA - Schema Completo v2.0
-- Compatible con SQLite3 (migrable a PostgreSQL)
-- ============================================================

-- ============================================================
-- TABLA: usuarios (ciudadanos y administradores)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,               -- bcrypt hash
  rol         TEXT NOT NULL DEFAULT 'ciudadano' CHECK(rol IN ('ciudadano','operador','admin')),
  telefono    TEXT,
  token_push  TEXT,                        -- para notificaciones push futuras
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- TABLA: reportes
-- ============================================================
CREATE TABLE IF NOT EXISTS reportes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL CHECK(tipo IN ('bache','basura','drenaje','agua','luminaria','otro')),
  subtipo       TEXT,
  descripcion   TEXT,
  latitud       REAL NOT NULL,
  longitud      REAL NOT NULL,
  direccion     TEXT,                      -- geocodificación inversa
  colonia       TEXT,
  calle         TEXT,
  foto_url      TEXT,
  estado        TEXT NOT NULL DEFAULT 'reportado'
                CHECK(estado IN ('reportado','revision','proceso','solucionado','cancelado')),
  prioridad     TEXT NOT NULL DEFAULT 'normal'
                CHECK(prioridad IN ('baja','normal','alta','critica')),
  asignado_a    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  folio         TEXT UNIQUE,              -- número de caso ciudadano
  votos         INTEGER NOT NULL DEFAULT 0,
  vistas        INTEGER NOT NULL DEFAULT 0,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resuelto_en   TEXT
);

-- ============================================================
-- TABLA: historial_estados (auditoría de cambios)
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_estados (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id  INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  estado_anterior TEXT,
  estado_nuevo    TEXT NOT NULL,
  comentario  TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- TABLA: votos (ciudadanos que apoyan un reporte)
-- ============================================================
CREATE TABLE IF NOT EXISTS votos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id  INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ip          TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(reporte_id, usuario_id)
);

-- ============================================================
-- TABLA: notificaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS notificaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  reporte_id  INTEGER REFERENCES reportes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,              -- 'estado_cambio','asignacion','comentario'
  mensaje     TEXT NOT NULL,
  leida       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- TABLA: comentarios internos (operadores/admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS comentarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id  INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  texto       TEXT NOT NULL,
  es_publico  INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- ÍNDICES para rendimiento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reportes_tipo     ON reportes(tipo);
CREATE INDEX IF NOT EXISTS idx_reportes_estado   ON reportes(estado);
CREATE INDEX IF NOT EXISTS idx_reportes_colonia  ON reportes(colonia);
CREATE INDEX IF NOT EXISTS idx_reportes_coords   ON reportes(latitud, longitud);
CREATE INDEX IF NOT EXISTS idx_reportes_creado   ON reportes(creado_en);
CREATE INDEX IF NOT EXISTS idx_historial_reporte ON historial_estados(reporte_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario     ON notificaciones(usuario_id, leida);

-- ============================================================
-- TRIGGERS: auto-actualizar timestamps y folio
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_reporte_folio
AFTER INSERT ON reportes
BEGIN
  UPDATE reportes
  SET folio = printf('AC-%04d-%06d', strftime('%Y', 'now'), NEW.id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reporte_updated
AFTER UPDATE ON reportes
BEGIN
  UPDATE reportes SET actualizado_en = datetime('now','localtime')
  WHERE id = NEW.id;
END;

-- ============================================================
-- DATOS INICIALES
-- ============================================================
-- Admin por defecto: admin@ciudad.gob / Admin2024!
INSERT OR IGNORE INTO usuarios (nombre, email, password, rol)
VALUES (
  'Administrador',
  'admin@ciudad.gob',
  '$2b$10$YQs8P1zQ5RKjGv9wZmK0COOHQjqYLSfg6vlcWTR1gf2n4Xo7pDhgu',
  'admin'
);

-- ============================================================
-- TABLA: actualizaciones (v2.1) — seguimiento con evidencia
-- ============================================================
CREATE TABLE IF NOT EXISTS actualizaciones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id    INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  estado_nuevo  TEXT NOT NULL,
  comentario    TEXT,
  es_publico    INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- TABLA: evidencias — fotos adjuntas a actualizaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS evidencias (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  actualizacion_id INTEGER NOT NULL REFERENCES actualizaciones(id) ON DELETE CASCADE,
  reporte_id       INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  descripcion      TEXT,
  creado_en        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_act_reporte  ON actualizaciones(reporte_id);
CREATE INDEX IF NOT EXISTS idx_evid_reporte ON evidencias(reporte_id);
CREATE INDEX IF NOT EXISTS idx_evid_act     ON evidencias(actualizacion_id);
