# 🏛️ Alerta Ciudadana v2.0 — Plataforma Smart City

Sistema profesional de gestión de incidencias urbanas para ayuntamientos.

---

## 📁 Estructura del proyecto

```
alerta-ciudadana/
├── server.js                    ← Servidor Express principal
├── package.json
├── .env.example                 ← Copiar como .env
├── data/
│   └── alerta_ciudadana.db      ← SQLite (auto-generado)
├── uploads/                     ← Imágenes de reportes
├── backend/
│   ├── db/
│   │   ├── database.js          ← Conexión y helpers BD
│   │   └── schema.sql           ← Schema completo
│   ├── middleware/
│   │   └── auth.js              ← JWT + control de roles
│   └── routes/
│       ├── reportes.js          ← API CRUD reportes
│       └── auth.js              ← Login, registro, usuarios
└── frontend/
    ├── index.html               ← Portal ciudadano
    ├── admin.html               ← Panel administrativo
    └── js/
        └── app.js               ← Lógica del mapa y feed
```

---

## 🚀 Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu JWT_SECRET

# 3. Iniciar servidor
npm start

# Desarrollo (auto-reload)
npm run dev
```

Acceder en: http://localhost:3000

---

## 🔑 Credenciales por defecto

| URL              | Usuario             | Contraseña |
|------------------|---------------------|------------|
| /admin.html      | admin@ciudad.gob    | Admin2024! |

---

## 📡 API REST

### Reportes
| Método | Endpoint                        | Descripción                    |
|--------|---------------------------------|--------------------------------|
| GET    | /api/reportes                   | Listar con filtros y paginación |
| GET    | /api/reportes/mapa              | Datos ligeros para Leaflet     |
| GET    | /api/reportes/estadisticas      | Dashboard analítico            |
| GET    | /api/reportes/:id               | Detalle + historial            |
| POST   | /api/reportes                   | Crear reporte (multipart/form) |
| PATCH  | /api/reportes/:id/estado        | Cambiar estado (admin/operador)|
| POST   | /api/reportes/:id/voto          | Votar un reporte               |
| POST   | /api/reportes/:id/comentario    | Agregar comentario             |

### Autenticación
| Método | Endpoint                        | Descripción                    |
|--------|---------------------------------|--------------------------------|
| POST   | /api/auth/registro              | Crear cuenta ciudadano         |
| POST   | /api/auth/login                 | Obtener token JWT              |
| POST   | /api/auth/logout                | Cerrar sesión                  |
| GET    | /api/auth/perfil                | Perfil + mis reportes          |
| GET    | /api/auth/notificaciones        | Notificaciones del usuario     |
| GET    | /api/auth/usuarios              | Listar usuarios (admin)        |
| PATCH  | /api/auth/usuarios/:id/rol      | Cambiar rol (admin)            |

---

## 🗺️ Funcionalidades del mapa

- **Marcadores personalizados** por tipo con emoji
- **Clusters inteligentes** con contador de color azul
- **Heatmap** activable (botón 🔥)
- **Vista satélite** (botón 🛰️)
- **Animación ping** en reportes nuevos
- **Popup con foto** del reporte
- **Filtro por categoría** en tiempo real
- **Polling automático** cada 30 segundos

---

## 🔒 Sistema de roles

| Rol        | Puede hacer                                        |
|------------|--------------------------------------------------- |
| ciudadano  | Crear reportes, votar, comentar, ver notificaciones |
| operador   | Todo lo anterior + cambiar estado de reportes      |
| admin      | Todo lo anterior + gestionar usuarios y roles      |

---

## 📊 Analítica disponible

- Total por tipo de incidencia
- Distribución por estado
- Reportes por mes (12 meses)
- Top 10 colonias con más problemas
- Top 10 calles con más problemas
- Días promedio de resolución
- Exportación a CSV

---

## 🔄 Migración a PostgreSQL

Para migrar de SQLite a PostgreSQL:

1. Instalar: `npm install pg`
2. Reemplazar `backend/db/database.js` con driver `pg`
3. Adaptar `schema.sql`:
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
   - `datetime('now','localtime')` → `NOW()`
   - `strftime('%Y-%m', ...)` → `TO_CHAR(..., 'YYYY-MM')`
4. Configurar `DATABASE_URL` en `.env`

---

## 🚀 Despliegue en producción

```bash
# Variables críticas en .env
NODE_ENV=production
JWT_SECRET=string-muy-largo-y-aleatorio
CORS_ORIGIN=https://tu-dominio.com.mx

# Con PM2
npm install -g pm2
pm2 start server.js --name alerta-ciudadana
pm2 save
pm2 startup
```

---

## 📱 Responsivo móvil

- Layout de columna única en móvil
- Bottom navigation bar
- Modal de reporte slide-up nativo
- Captura de foto con cámara directa
- GPS de alta precisión
