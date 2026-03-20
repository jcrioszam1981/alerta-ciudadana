// reset-admin.js
// Ejecutar: node reset-admin.js
// Resetea la contraseña del admin y verifica la BD

const bcrypt = require('bcrypt');
const path   = require('path');

const DB_PATH = path.join(__dirname, 'data', 'alerta_ciudadana.db');

async function main() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) { console.error('❌ No se pudo abrir la BD:', err.message); process.exit(1); }
    console.log('✅ BD conectada:', DB_PATH);
  });

  const run = (sql, p=[]) => new Promise((res,rej) =>
    db.run(sql, p, function(err){ err ? rej(err) : res(this); })
  );
  const get = (sql, p=[]) => new Promise((res,rej) =>
    db.get(sql, p, (err,row) => err ? rej(err) : res(row))
  );
  const all = (sql, p=[]) => new Promise((res,rej) =>
    db.all(sql, p, (err,rows) => err ? rej(err) : res(rows))
  );

  try {
    // 1. Verificar tablas
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('\n📋 Tablas en la BD:', tables.map(t=>t.name).join(', '));

    // 2. Contar reportes
    const cnt = await get('SELECT COUNT(*) as n FROM reportes');
    console.log('📊 Reportes en BD:', cnt.n);

    // 3. Generar hash nuevo para "Admin2024!"
    const NUEVA_PASS = 'Admin2024!';
    const hash = await bcrypt.hash(NUEVA_PASS, 10);
    console.log('\n🔑 Nuevo hash generado para:', NUEVA_PASS);

    // 4. Verificar si existe el admin
    const admin = await get("SELECT * FROM usuarios WHERE email='admin@ciudad.gob'");

    if (admin) {
      // Actualizar hash
      await run("UPDATE usuarios SET password=? WHERE email='admin@ciudad.gob'", [hash]);
      console.log('✅ Contraseña del admin ACTUALIZADA');
    } else {
      // Crear admin
      await run(
        "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)",
        ['Administrador', 'admin@ciudad.gob', hash, 'admin']
      );
      console.log('✅ Admin CREADO desde cero');
    }

    // 5. Verificar login
    const adminNuevo = await get("SELECT * FROM usuarios WHERE email='admin@ciudad.gob'");
    const ok = await bcrypt.compare(NUEVA_PASS, adminNuevo.password);
    console.log('🔐 Login de prueba:', ok ? '✅ FUNCIONA' : '❌ FALLA');

    // 6. Resumen
    console.log('\n═══════════════════════════════');
    console.log('  URL Admin:    http://localhost:3000/admin.html');
    console.log('  Email:        admin@ciudad.gob');
    console.log('  Contraseña:   Admin2024!');
    console.log('  Reportes BD:  ' + cnt.n);
    console.log('═══════════════════════════════\n');

  } catch(e) {
    console.error('❌ Error:', e.message);
  } finally {
    db.close();
  }
}

main();
