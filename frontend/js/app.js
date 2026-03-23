// app.js — Alerta Ciudadana v2.4 (corregido)
'use strict';

const API = '/api/reportes';
const API_SEG = '/api/seguimiento';

const TIPOS = {
  bache:    { emoji:'🕳️', color:'#ef4444', label:'Bache'     },
  basura:   { emoji:'🗑️', color:'#8b5cf6', label:'Basura'    },
  drenaje:  { emoji:'🌊', color:'#0ea5e9', label:'Drenaje'   },
  agua:     { emoji:'💧', color:'#10b981', label:'Agua'      },
  luminaria:{ emoji:'💡', color:'#f59e0b', label:'Luminaria' },
  otro:     { emoji:'⚠️', color:'#6b7280', label:'Otro'      },
};
const SUBTIPOS = {
  bache:    ['Grieta','Hoyo profundo','Bache en cruce','Hundimiento'],
  basura:   ['Basura en vía','Contenedor lleno','Escombros','Animales muertos'],
  drenaje:  ['Tapón','Desbordamiento','Olor','Fuga de aguas negras'],
  agua:     ['Fuga de agua','Sin suministro','Agua contaminada','Presión baja'],
  luminaria:['Foco apagado','Poste caído','Cable expuesto','Parpadeo'],
  otro:     ['Banqueta dañada','Señalética','Árbol peligroso','Otro'],
};
const ESTADOS = {
  reportado:   { lbl:'Reportado',    cls:'est-reportado'   },
  revision:    { lbl:'En revisión',  cls:'est-revision'    },
  proceso:     { lbl:'En proceso',   cls:'est-proceso'     },
  solucionado: { lbl:'Solucionado',  cls:'est-solucionado' },
  cancelado:   { lbl:'Cancelado',    cls:'est-cancelado'   },
};
// Color del pin según estado
const ESTADO_PIN = {
  reportado:'#ef4444', revision:'#f59e0b',
  proceso:'#f97316',   solucionado:'#10b981', cancelado:'#6b7280'
};

// ── Estado global ─────────────────────────────────────────────
let map, clusters, heatLayer, osmTile, satTile;
let miMarkers = [];
let heatOn    = false;
let satOn     = false;
let filtro    = 'todos';
let gpsPos    = null;
let todosR    = [];
let modoPin   = false;

// ══ INIT ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  // Leer filtro desde URL (?tipo=bache)
  const urlTipo = new URLSearchParams(location.search).get('tipo');
  if (urlTipo && TIPOS[urlTipo]) {
    filtro = urlTipo;
    const btn = document.querySelector(`.cb[data-t="${urlTipo}"]`);
    if (btn) {
      document.querySelectorAll('.cb').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    }
  }

  cargarTodo();
  autoUbicar();
  setInterval(cargarTodo, 30000);
});

function cargarTodo() {
  return Promise.all([cargarMapa(), cargarStats()]);
}

// ══ AUTO-UBICACIÓN ════════════════════════════════════════════
function autoUbicar() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.flyTo([gpsPos.lat, gpsPos.lng], 15, { animate:true, duration:1.5 });
      dibujarMiPos(gpsPos.lat, gpsPos.lng);
      actualizarFormCoords(gpsPos.lat, gpsPos.lng);
    },
    () => {},
    { enableHighAccuracy:true, timeout:12000 }
  );
}

function dibujarMiPos(lat, lng) {
  miMarkers.forEach(l => map.removeLayer(l));
  miMarkers = [];
  const p = L.circleMarker([lat, lng], {
    radius:8, fillColor:'#2563eb', fillOpacity:1,
    color:'#fff', weight:3, zIndexOffset:1000,
  }).addTo(map);
  p.bindTooltip('📍 Tu ubicación actual', { direction:'top', offset:[0,-8] });
  const a = L.circleMarker([lat, lng], {
    radius:20, fillColor:'#2563eb', fillOpacity:0.12,
    color:'#2563eb', weight:1.5,
  }).addTo(map);
  miMarkers = [p, a];
}

// ══ MAPA ══════════════════════════════════════════════════════
function initMap() {
  map = L.map('map', { center:[20.5888,-100.3899], zoom:13, zoomControl:false });

  osmTile = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { attribution:'© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19 }
  ).addTo(map);

  satTile = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution:'© Esri', maxZoom:19 }
  );

  clusters = L.markerClusterGroup({
    maxClusterRadius:48, showCoverageOnHover:false, spiderfyOnMaxZoom:true,
    iconCreateFunction: mkCluster,
  });
  map.addLayer(clusters);
  L.control.zoom({ position:'bottomright' }).addTo(map);

  map.on('move', () => {
    if (!modoPin) return;
    const c = map.getCenter();
    const el = document.getElementById('mini-coords');
    if (el) el.textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  });
}

function mkCluster(cl) {
  const n = cl.getChildCount();
  const s = n > 100 ? 46 : n > 20 ? 38 : 30;
  return L.divIcon({
    html: `<div style="width:${s}px;height:${s}px;background:rgba(37,99,235,.9);border:2.5px solid rgba(255,255,255,.8);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${s>38?12:10}px;box-shadow:0 2px 10px rgba(37,99,235,.4);">${n}</div>`,
    className:'', iconSize:[s,s], iconAnchor:[s/2,s/2],
  });
}

// Pin con color según ESTADO
function mkIcon(tipo, estado, isNew) {
  if (typeof estado === 'boolean') { isNew = estado; estado = 'reportado'; }
  estado = estado || 'reportado';
  const t        = TIPOS[tipo] || TIPOS.otro;
  const pinColor = ESTADO_PIN[estado] || '#ef4444';
  const solved   = estado === 'solucionado';
  const ring     = isNew
    ? `<div style="position:absolute;inset:-5px;border:2px solid ${pinColor};border-radius:50%;animation:ping .9s 4;opacity:.7"></div>`
    : '';
  const inner = solved
    ? `<span style="font-size:15px;font-weight:700;color:white">✓</span>`
    : `<span style="transform:rotate(45deg);font-size:13px">${t.emoji}</span>`;
  const glow = solved
    ? `box-shadow:0 3px 16px rgba(16,185,129,.65);`
    : `box-shadow:0 3px 12px rgba(0,0,0,.22);`;
  return L.divIcon({
    html: `<div style="position:relative;">${ring}
      <div style="width:32px;height:32px;background:${pinColor};border-radius:50% 50% 50% 2px;transform:rotate(-45deg);border:2.5px solid rgba(255,255,255,.9);${glow}display:flex;align-items:center;justify-content:center;">${inner}</div>
    </div>`,
    className:'', iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-34],
  });
}

// ══ DATOS DEL MAPA ════════════════════════════════════════════
async function cargarMapa() {
  try {
    const qs = filtro !== 'todos' ? `?tipo=${filtro}` : '';
    todosR = await fetch(`${API}/mapa${qs}`).then(r => r.json());
    renderMarcadores(todosR);
    if (heatOn) renderHeat(todosR);
  } catch(e) { console.error('mapa:', e); }
}

function renderMarcadores(rs) {
  clusters.clearLayers();
  rs.forEach(r => {
    const t        = TIPOS[r.tipo] || TIPOS.otro;
    const est      = ESTADOS[r.estado] || ESTADOS.reportado;
    const pinColor = ESTADO_PIN[r.estado] || '#ef4444';
    const isSolved = r.estado === 'solucionado';

    const m = L.marker([r.latitud, r.longitud], { icon: mkIcon(r.tipo, r.estado) });

    // Días que tardó en resolverse (si aplica)
    const diasResol = (isSolved && r.resuelto_en && r.creado_en)
      ? Math.round((new Date(r.resuelto_en) - new Date(r.creado_en)) / 86400000 * 10) / 10
      : null;

    const fotoHtml = r.foto_url
      ? `<img src="${r.foto_url}" style="width:100%;height:85px;object-fit:cover;border-radius:8px 8px 0 0;display:block" onerror="this.style.display='none'"/>`
      : '';

    const resolHtml = isSolved && diasResol !== null
      ? `<div style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);border-radius:7px;padding:5px 9px;margin:5px 0;font-size:.71rem;color:#10b981;font-weight:600">✅ Resuelto en ${diasResol} día${diasResol!==1?'s':''}</div>`
      : '';

    m.bindPopup(`
      ${fotoHtml}
      <div style="padding:9px 11px 11px">
        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${t.color};margin-bottom:2px">${t.emoji} ${t.label}</div>
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.68rem;font-weight:700;background:${pinColor}22;color:${pinColor};margin-bottom:4px">${est.lbl}</span>
        ${resolHtml}
        <p style="font-size:.8rem;color:#4a5168;margin:4px 0 6px;line-height:1.4">${r.descripcion||r.subtipo||'Sin descripción'}</p>
        <div style="display:flex;justify-content:space-between;font-size:.7rem;color:#8b93a5;margin-bottom:7px">
          <span style="font-family:monospace">${r.folio||'#'+r.id}</span>
          <span>▲ ${r.votos||0}</span>
        </div>
        <button class="pop-btn" onclick="verDetRico(${r.id})">Ver detalle completo →</button>
      </div>`, { maxWidth:245, minWidth:195 });

    clusters.addLayer(m);
  });
}

function renderHeat(rs) {
  if (heatLayer) map.removeLayer(heatLayer);
  heatLayer = L.heatLayer(rs.map(r => [r.latitud, r.longitud, 0.8]), {
    radius:26, blur:18, maxZoom:15,
    gradient:{ 0.2:'#0ea5e9', 0.5:'#f59e0b', 0.8:'#f97316', 1:'#ef4444' }
  }).addTo(map);
}

// ══ ESTADÍSTICAS ══════════════════════════════════════════════
async function cargarStats() {
  try {
    const d = await fetch(`${API}/estadisticas`).then(r => r.json());

    // Total
    const elTotal = document.getElementById('st-total');
    if (elTotal) elTotal.textContent = d.resumen?.total ?? 0;

    // Por tipo
    const elTipos = document.getElementById('st-tipos');
    if (!elTipos) return;
    const tipos = d.porTipo || [];
    if (!tipos.length) {
      elTipos.innerHTML = `<div class="sr"><span class="sl" style="font-size:.73rem;color:var(--muted)">Sin reportes aún</span></div>`;
      return;
    }
    elTipos.innerHTML = tipos.slice(0,5).map(t => {
      const inf = TIPOS[t.tipo] || TIPOS.otro;
      return `<div class="sr">
        <span class="sd" style="background:${inf.color}"></span>
        <span class="sl">${inf.label}</span>
        <span class="sn">${t.total}</span>
      </div>`;
    }).join('');
  } catch(e) { console.error('stats:', e); }
}

// ══ CONTROLES MAPA ════════════════════════════════════════════
function setF(tipo, btn) {
  filtro = tipo;
  document.querySelectorAll('.cb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  cargarMapa();
}

function toggleHeat() {
  heatOn = !heatOn;
  const btn = document.getElementById('btn-heat');
  if (btn) btn.classList.toggle('on', heatOn);
  heatOn ? renderHeat(todosR) : heatLayer && (map.removeLayer(heatLayer), heatLayer=null);
}

function toggleSat() {
  satOn = !satOn;
  const btn = document.getElementById('btn-sat');
  if (btn) btn.classList.toggle('on', satOn);
  satOn ? (osmTile.remove(), satTile.addTo(map)) : (satTile.remove(), osmTile.addTo(map));
}

function irGPS() {
  if (gpsPos) {
    map.flyTo([gpsPos.lat, gpsPos.lng], 16, { animate:true, duration:1.2 });
  } else {
    autoUbicar();
    toast('Buscando tu ubicación...', '');
  }
}

function refreshAll() { cargarTodo(); toast('✓ Mapa actualizado', 'ok'); }

// ══ GPS / UBICACIÓN FORMULARIO ════════════════════════════════
function pedirGPS() {
  const lp = document.getElementById('lp');
  const lc = document.getElementById('lc-txt');
  if (!navigator.geolocation) {
    if (lp) lp.className = 'lp err';
    if (lc) lc.textContent = 'GPS no disponible';
    return;
  }
  if (lp) lp.className = 'lp wait';
  if (lc) lc.textContent = 'Obteniendo GPS...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsPos = { lat:pos.coords.latitude, lng:pos.coords.longitude };
      actualizarFormCoords(gpsPos.lat, gpsPos.lng);
      map.panTo([gpsPos.lat, gpsPos.lng], { animate:true });
      if (lp) lp.className = 'lp ok';
    },
    () => {
      if (lp) lp.className = 'lp err';
      if (lc) lc.textContent = 'Sin GPS — usa "Mover en mapa"';
    },
    { enableHighAccuracy:true, timeout:12000 }
  );
}

function usarGPS() {
  if (gpsPos) {
    actualizarFormCoords(gpsPos.lat, gpsPos.lng);
    map.flyTo([gpsPos.lat, gpsPos.lng], 16, { animate:true });
    toast('📍 Usando tu ubicación GPS', 'ok');
  } else {
    pedirGPS();
  }
}

function actualizarFormCoords(lat, lng) {
  const latF = document.getElementById('f-lat');
  const lngF = document.getElementById('f-lng');
  const lc   = document.getElementById('lc-txt');
  const lp   = document.getElementById('lp');
  if (latF) latF.value = parseFloat(lat).toFixed(6);
  if (lngF) lngF.value = parseFloat(lng).toFixed(6);
  if (lc)   lc.textContent = `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
  if (lp)   lp.className = 'lp ok';
}

// ══ MODO MOVER PIN ════════════════════════════════════════════
function iniciarMoverPin() {
  modoPin = true;
  document.getElementById('drawer-nuevo').style.transform =
    window.innerWidth >= 580 ? 'translateX(-50%) translateY(100%)' : 'translateY(100%)';
  document.getElementById('ov-nuevo').classList.remove('open');
  document.getElementById('cpin').classList.add('show');
  document.getElementById('minibar').classList.add('show');
  const c = map.getCenter();
  const mc = document.getElementById('mini-coords');
  if (mc) mc.textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  toast('Mueve el mapa y confirma la ubicación 📌', '');
}

function confirmarPin() {
  const c = map.getCenter();
  actualizarFormCoords(c.lat, c.lng);
  modoPin = false;
  document.getElementById('drawer-nuevo').style.transform = '';
  document.getElementById('ov-nuevo').classList.add('open');
  document.getElementById('cpin').classList.remove('show');
  document.getElementById('minibar').classList.remove('show');
  toast('📍 Ubicación confirmada', 'ok');
}

// ══ DRAWER NUEVO REPORTE ══════════════════════════════════════
function abrirNuevo() {
  document.getElementById('ov-nuevo').classList.add('open');
  document.getElementById('drawer-nuevo').classList.add('open');
  if (gpsPos) {
    actualizarFormCoords(gpsPos.lat, gpsPos.lng);
  } else {
    const c = map.getCenter();
    actualizarFormCoords(c.lat, c.lng);
    pedirGPS();
  }
}

function cerrarNuevo() {
  document.getElementById('ov-nuevo').classList.remove('open');
  document.getElementById('drawer-nuevo').classList.remove('open');
  document.getElementById('cpin').classList.remove('show');
  document.getElementById('minibar').classList.remove('show');
  document.getElementById('drawer-nuevo').style.transform = '';
  modoPin = false;
}

// ══ FORMULARIO ════════════════════════════════════════════════
function pickTipo(tipo, el) {
  document.getElementById('f-tipo').value = tipo;
  document.querySelectorAll('.ttile').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  const sel = document.getElementById('f-sub');
  sel.innerHTML = `<option value="">Selecciona subtipo...</option>` +
    (SUBTIPOS[tipo]||[]).map(s => `<option value="${s}">${s}</option>`).join('');
}

// Guarda qué input tiene la foto seleccionada (cam o gal)
let fotoOrigen = null;

function prevFoto(input, origen) {
  const f = input.files[0];
  if (!f) return;
  fotoOrigen = origen; // 'cam' o 'gal'
  const rd = new FileReader();
  rd.onload = e => {
    const img   = document.getElementById('pz-img');
    const clear = document.getElementById('pz-clear');
    img.src   = e.target.result;
    img.style.display   = 'block';
    clear.style.display = 'block';
    // Ocultar los botones y mostrar preview
    document.getElementById('pz-cam-btn').style.display = 'none';
    document.getElementById('pz-gal-btn').style.display = 'none';
  };
  rd.readAsDataURL(f);
}

function limpiarFoto() {
  // Limpiar ambos inputs
  const cam = document.getElementById('f-foto-cam');
  const gal = document.getElementById('f-foto-gal');
  if (cam) cam.value = '';
  if (gal) gal.value = '';
  fotoOrigen = null;
  // Restaurar UI
  document.getElementById('pz-img').style.display   = 'none';
  document.getElementById('pz-clear').style.display = 'none';
  document.getElementById('pz-cam-btn').style.display = '';
  document.getElementById('pz-gal-btn').style.display = '';
}

async function enviar(e) {
  e.preventDefault();
  const tipo = document.getElementById('f-tipo').value;
  const lat  = document.getElementById('f-lat').value;
  const lng  = document.getElementById('f-lng').value;
  if (!tipo) { toast('Selecciona una categoría', 'err'); return; }
  if (!lat || !lng) { toast('Ubica el problema en el mapa', 'err'); return; }

  const btn = document.getElementById('btn-env');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Enviando...';
  try {
    const fd = new FormData();
    fd.append('tipo',        tipo);
    fd.append('subtipo',     document.getElementById('f-sub').value);
    fd.append('descripcion', document.getElementById('f-desc').value);
    fd.append('latitud',     lat);
    fd.append('longitud',    lng);
    // Tomar foto del input que esté activo (cámara o galería)
    const fotoCam = document.getElementById('f-foto-cam');
    const fotoGal = document.getElementById('f-foto-gal');
    const foto = (fotoCam && fotoCam.files[0]) || (fotoGal && fotoGal.files[0]) || null;
    if (foto) fd.append('foto', foto);

    const res  = await fetch(API, { method:'POST', body:fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar');

    toast(`✅ Reporte enviado — ${data.folio}`, 'ok');
    cerrarNuevo();
    document.getElementById('form-rep').reset();
    document.querySelectorAll('.ttile').forEach(t => t.classList.remove('sel'));
    limpiarFoto();

    clusters.addLayer(L.marker([parseFloat(lat), parseFloat(lng)], {
      icon: mkIcon(tipo, 'reportado', true)
    }));
    map.flyTo([parseFloat(lat), parseFloat(lng)], 16, { animate:true, duration:1 });
    cargarTodo();
  } catch(err) {
    toast('❌ ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>📤</span> Enviar reporte';
  }
}

// ══ DETALLE RICO (con seguimiento) ════════════════════════════
async function verDetRico(id) {
  // Cerrar popup del mapa primero
  map.closePopup();

  const ovDet  = document.getElementById('ov-det');
  const drwDet = document.getElementById('drawer-det');
  const detCon = document.getElementById('det-content');
  if (!ovDet || !drwDet || !detCon) return;

  ovDet.classList.add('open');
  drwDet.classList.add('open');
  detCon.innerHTML = `
    <div style="padding:20px">
      <div style="height:120px;border-radius:12px;margin-bottom:12px;background:#f0f2f5;animation:sh 1.2s infinite"></div>
      <div style="height:14px;width:60%;border-radius:8px;background:#f0f2f5;margin-bottom:8px;animation:sh 1.2s infinite"></div>
      <div style="height:80px;border-radius:8px;background:#f0f2f5;animation:sh 1.2s infinite"></div>
    </div>`;

  try {
    const [rBase, segData] = await Promise.all([
      fetch(`${API}/${id}`).then(r => r.json()),
      fetch(`${API_SEG}/${id}/historial`).then(r => r.json()).catch(() => ({ actualizaciones:[], metricas:null })),
    ]);

    // Validar que la respuesta sea correcta
    if (!rBase || rBase.error) throw new Error(rBase?.error || 'Reporte no encontrado');

    const t        = TIPOS[rBase.tipo] || TIPOS.otro;
    const est      = ESTADOS[rBase.estado] || ESTADOS.reportado;
    const pinColor = ESTADO_PIN[rBase.estado] || '#ef4444';
    const isSolved = rBase.estado === 'solucionado';
    const metricas = segData.metricas || null;
    const acts     = segData.actualizaciones || [];

    // Foto de evidencia del cierre
    const actCierre = acts.filter(a => a.estado_nuevo === 'solucionado').pop();
    const evCierre  = actCierre?.evidencias?.[0] || null;

    // Antes / después
    let fotoBloque = '';
    if (rBase.foto_url && evCierre) {
      fotoBloque = `
        <div style="margin:0 0 12px">
          <div style="font-size:.69rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:7px">📸 Antes / Después</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div>
              <img src="${rBase.foto_url}" style="width:100%;height:80px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'"/>
              <div style="font-size:.65rem;color:var(--muted);text-align:center;margin-top:3px">Antes</div>
            </div>
            <div>
              <img src="${evCierre.url}" style="width:100%;height:80px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'"/>
              <div style="font-size:.65rem;color:var(--muted);text-align:center;margin-top:3px">Después</div>
            </div>
          </div>
        </div>`;
    } else if (rBase.foto_url) {
      fotoBloque = `<img src="${rBase.foto_url}" style="width:100%;height:130px;object-fit:cover;border-radius:20px 20px 0 0" onerror="this.style.display='none'"/>`;
    }

    // Métricas
    let metHtml = '';
    if (metricas) {
      metHtml = `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px">
        ${isSolved && metricas.dias_resolucion != null
          ? `<div style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:7px 11px;flex:1;min-width:80px"><div style="font-size:1.3rem;font-weight:700;color:#10b981;font-family:monospace">${metricas.dias_resolucion}d</div><div style="font-size:.65rem;color:var(--muted)">Resolución</div></div>`
          : `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:7px 11px;flex:1;min-width:80px"><div style="font-size:1.3rem;font-weight:700;color:#ef4444;font-family:monospace">${metricas.dias_abierto}d</div><div style="font-size:.65rem;color:var(--muted)">Días abierto</div></div>`}
        <div style="background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:8px;padding:7px 11px;flex:1;min-width:80px"><div style="font-size:1.3rem;font-weight:700;font-family:monospace">${metricas.num_actualizaciones}</div><div style="font-size:.65rem;color:var(--muted)">Actualizaciones</div></div>
        ${metricas.sla_ok != null ? `<div style="background:${metricas.sla_ok?'rgba(16,185,129,.12)':'rgba(239,68,68,.1)'};border:1px solid ${metricas.sla_ok?'rgba(16,185,129,.25)':'rgba(239,68,68,.2)'};border-radius:8px;padding:7px 11px;flex:1;min-width:80px"><div style="font-size:1rem;font-weight:700;color:${metricas.sla_ok?'#10b981':'#ef4444'}">${metricas.sla_ok?'✅':'⚠️'} SLA</div><div style="font-size:.65rem;color:var(--muted)">${metricas.sla_ok?'En plazo':'Fuera'}</div></div>` : ''}
      </div>`;
    }

    // Timeline actualizaciones
    const TL_COL = {reportado:'#ef4444',revision:'#f59e0b',proceso:'#f97316',solucionado:'#10b981',cancelado:'#6b7280'};
    const TL_LAB = {reportado:'Reportado',revision:'En revisión',proceso:'En proceso',solucionado:'Solucionado',cancelado:'Cancelado'};
    let tlHtml = '';
    if (acts.length) {
      tlHtml = `
        <div style="font-size:.69rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Seguimiento</div>
        <div style="position:relative;padding-left:20px;margin-bottom:12px">
          <div style="position:absolute;left:6px;top:0;bottom:0;width:2px;background:rgba(255,255,255,.08)"></div>
          ${acts.map(a => {
            const col = TL_COL[a.estado_nuevo]||'#6b7280';
            const evs = (a.evidencias||[]).map(e =>
              `<img src="${e.url}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,.1)" onclick="window.open('${e.url}','_blank')" onerror="this.style.display='none'"/>`
            ).join('');
            return `<div style="position:relative;margin-bottom:10px">
              <div style="position:absolute;left:-17px;top:3px;width:8px;height:8px;border-radius:50%;background:${col}"></div>
              <div style="font-size:.78rem;font-weight:600;color:${col}">${TL_LAB[a.estado_nuevo]||a.estado_nuevo}</div>
              ${a.comentario ? `<div style="font-size:.75rem;color:rgba(255,255,255,.55);margin:2px 0 4px;line-height:1.4">${a.comentario}</div>` : ''}
              ${evs ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">${evs}</div>` : ''}
              <div style="font-size:.65rem;color:var(--muted)">${timeAgo(a.creado_en)}${a.operador_nombre?' · '+a.operador_nombre:''}</div>
            </div>`;
          }).join('')}
        </div>`;
    }

    detCon.innerHTML = `
      ${rBase.foto_url && !evCierre ? fotoBloque : ''}
      <div class="det-body">
        <div class="dh" style="margin:0 auto 12px"></div>
        ${rBase.foto_url && evCierre ? fotoBloque : ''}
        <div class="det-top">
          <span class="det-badge" style="background:color-mix(in srgb,${t.color} 10%,white);color:${t.color}">${t.emoji} ${t.label}</span>
          <span class="det-est" style="margin-left:auto;padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:${pinColor}22;color:${pinColor}">${est.lbl}</span>
        </div>
        <div class="det-folio">${rBase.folio||'#'+rBase.id}</div>
        ${rBase.descripcion ? `<p class="det-desc">${rBase.descripcion}</p>` : ''}
        <div class="det-meta">
          ${rBase.colonia ? `<span>📍 ${rBase.colonia}</span>` : ''}
          ${rBase.calle   ? `<span>🛣 ${rBase.calle}</span>`   : ''}
          <span>🕐 ${timeAgo(rBase.creado_en)}</span>
          <span>▲ ${rBase.votos||0} apoyos</span>
        </div>
        ${metHtml}
        ${tlHtml}
        <button class="btn-vote" onclick="votar(${rBase.id},this)">▲ Apoyar este reporte &nbsp;·&nbsp; <span>${rBase.votos||0}</span></button>
      </div>`;

    map.flyTo([rBase.latitud, rBase.longitud], 17, { animate:true, duration:1 });

  } catch(e) {
    console.error('verDetRico error:', e);
    detCon.innerHTML = `
      <div style="padding:24px;text-align:center">
        <div style="font-size:2rem;margin-bottom:8px">⚠️</div>
        <div style="color:var(--red);font-size:0.88rem;margin-bottom:12px">Error al cargar el reporte</div>
        <button class="btn-vote" onclick="cerrarDet()">Cerrar</button>
      </div>`;
  }
}

function cerrarDet() {
  const ov  = document.getElementById('ov-det');
  const drw = document.getElementById('drawer-det');
  if (ov)  ov.classList.remove('open');
  if (drw) drw.classList.remove('open');
}

// ══ VOTAR ═════════════════════════════════════════════════════
async function votar(id, btn) {
  try {
    const res  = await fetch(`${API}/${id}/voto`, { method:'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Ya votaste por este reporte', 'err'); return; }
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = data.votos;
    toast('▲ Voto registrado', 'ok');
  } catch { toast('Error al votar', 'err'); }
}

// ══ BÚSQUEDA ══════════════════════════════════════════════════
function buscar(q) {
  if (!q.trim()) { renderMarcadores(todosR); return; }
  const ql = q.toLowerCase();
  const filtrados = todosR.filter(r =>
    (r.colonia||'').toLowerCase().includes(ql) ||
    (r.calle||'').toLowerCase().includes(ql) ||
    (r.descripcion||'').toLowerCase().includes(ql) ||
    (r.folio||'').toLowerCase().includes(ql) ||
    (r.tipo||'').toLowerCase().includes(ql)
  );
  renderMarcadores(filtrados);
  if (filtrados.length > 0) {
    map.fitBounds(L.latLngBounds(filtrados.map(r => [r.latitud, r.longitud])), { padding:[40,40] });
  }
}

// ══ HELPERS ═══════════════════════════════════════════════════
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  const container = document.getElementById('toasts');
  if (container) container.appendChild(el);
  setTimeout(() => {
    el.style.opacity    = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function timeAgo(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60)      return 'ahora';
  if (s < 3600)    return `${Math.floor(s/60)}min`;
  if (s < 86400)   return `${Math.floor(s/3600)}h`;
  if (s < 2592000) return `${Math.floor(s/86400)}d`;
  return new Date(d).toLocaleDateString('es-MX', { day:'numeric', month:'short' });
}

document.head.insertAdjacentHTML('beforeend', `<style>
  @keyframes ping { 0%{transform:scale(1);opacity:.7} 70%{transform:scale(2.2);opacity:0} 100%{transform:scale(2.2);opacity:0} }
  @keyframes sh   { 0%{opacity:1} 50%{opacity:.5} 100%{opacity:1} }
</style>`);
