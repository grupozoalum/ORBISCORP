import { initializeApp }             from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc, collection,
  onSnapshot, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit as fbLimit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage,
  ref as stRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { 
  getFunctions, 
  httpsCallable 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

/* ══ FIREBASE CONFIG ══ */
const FB_CONFIG = {
  apiKey: "AIzaSyAGH8YGQ66vCFXlJe4so2Vyvqvqv4GnTUs",
  authDomain: "tienda-en-linea-370f0.firebaseapp.com",
  projectId: "tienda-en-linea-370f0",
  storageBucket: "tienda-en-linea-370f0.firebasestorage.app",
  messagingSenderId: "796590648278",
  appId: "1:796590648278:web:d165be0c077b1049b61277",
  measurementId: "G-NJH78V7X1K"
};
const fbApp    = initializeApp(FB_CONFIG);
// Instancia secundaria SOLO para crear empleados sin desloguear al dueño
const fbAppSecundaria = initializeApp(FB_CONFIG, "secundaria");
const authSecundaria  = getAuth(fbAppSecundaria);
const auth     = getAuth(fbApp);
const db       = getFirestore(fbApp);
const storage  = getStorage(fbApp);

/* ══ COLECCIONES ══ */
const REF_CONTENT  = doc(db,        'web_content',   'orbiscorp');
const COL_LEADS    = collection(db, 'leads_orbiscorp');
const COL_PRODS    = collection(db, 'productos_orbis');
const COL_INVENTARIO_RIVG = collection(db, 'inventario_rivg'); // <-- INVENTARIO REAL (RIVG)
const COL_CLIENTS  = collection(db, 'clientes');

/* ══ CONSTANTES ══ */
const ADMIN_UID   = '4UrZQMY4SDXiZgz91yTuiBnf4PD3';
const WA_NUMBER   = '527712175423';
const LS_CART_KEY = 'orbiscorp_cart_v5';

/* ══ CATEGORÍAS ══ */
const CATS = ['EPP','Abrasivos','Soldadura','Herramientas','Ferretería'];
const CAT_META = {
  'EPP':          { icon:'🦺', slug:'epp', coverImg: 'https://i0.wp.com/www.segusa.com.mx/wp-content/uploads/2023/07/equipo-de-proteccion-personal-1.jpg?resize=1140%2C641&ssl=1' },
  'Abrasivos':    { icon:'🔴', slug:'abrasivos', coverImg: 'https://img.freepik.com/fotos-premium/conjunto-herramientas-abrasivas-sobre-fondo-metalico_275559-21886.jpg?w=2000' },
  'Soldadura':    { icon:'⚡', slug:'soldadura', coverImg: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=800&auto=format&fit=crop' },
  'Herramientas': { icon:'🔧', slug:'herramientas', coverImg: 'https://ferreterialider.com/wp-content/uploads/2022/08/Herramientas-para-la-casa-C-1.jpg' },
  'Ferretería':   { icon:'🔩', slug:'ferreteria', coverImg: 'https://media.istockphoto.com/photos/showcase-of-tool-store-picture-id499783122?k=20&m=499783122&s=612x612&w=0&h=DXKcz9yPzTLx4KvL6S1SJQfBuCYAq6dR7ZyEq8tVK6Q=' }
};
/* Lookup inverso: slug → nombre de categoría */
const SLUG_TO_CAT = Object.fromEntries(
  Object.entries(CAT_META).map(([k,v]) => [v.slug, k])
);

/* ══ VISTAS CONFIG ══ */
const VIEWS_CONFIG = {
  epp: {
    cat:'EPP', badge:'Protección Certificada · Envíos a todo México',
    title:'Equipo de Protección<br><em>Personal (EPP).</em>',
    desc:'Cascos, respiradores, guantes y lentes de seguridad industrial de cumplimiento normativo nacional e internacional.',
    stats:[{num:'100%',label:'Normados (NOM/ANSI)'},{num:'15+',label:'Marcas autorizadas'},{num:'24h',label:'Tiempo de respuesta'}],
    brands:['<img src="https://toppng.com/uploads/preview/3m-logo-11530964217mykbwogph0.png" alt="3M" class="marca-logo"> Distribuidor Autorizado','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Honeywell_logo.svg/300px-Honeywell_logo.svg.png" alt="Honeywell" class="marca-logo"> Partner Oficial','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/MSA_Safety_logo.svg/300px-MSA_Safety_logo.svg.png" alt="MSA Safety" class="marca-logo"> Autorizado','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Draeger_Logo.svg/300px-Draeger_Logo.svg.png" alt="Drager" class="marca-logo"> Representante'],
    breadcrumb:'🦺 Equipos de Protección Personal',
    sectionLabel:'Línea de Seguridad', sectionTitle:'Equipos EPP en Stock<br><em>disponibles al momento</em>',
    sectionSub:'Filtro exclusivo de artículos EPP. Agrega al carrito y confirma tu orden vía WhatsApp.',
    contactTitle:'¿Necesitas una cotización?', contactDesc:'Contáctanos y te respondemos en menos de 24 horas.',
    pageTitle:'OrbisCORP — EPP'
  },
  abrasivos: {
    cat:'Abrasivos', badge:'Discos de Alto Rendimiento · Calidad Industrial',
    title:'Discos de Corte y<br><em>Abrasivos Premium.</em>',
    desc:'Máxima remoción de material con el menor desgaste. Discos de corte ultrafinos, desbaste y laminados.',
    stats:[{num:'13k+',label:'RPM Soportadas'},{num:'Duramax',label:'Tecnología Aliada'},{num:'24h',label:'Surtido en Planta'}],
    brands:['<strong>Austromex</strong> Distribuidor Líder','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Bosch-Logo.svg/300px-Bosch-Logo.svg.png" alt="Bosch" class="marca-logo"> Premium Partner','<strong>Duramax</strong> Grano Abrasivo'],
    sectionLabel:'Línea Técnica', sectionTitle:'Abrasivos y Desbaste<br><em>de Alto Rendimiento</em>',
    sectionSub:'Filtro exclusivo de discos, copas y cepillos abrasivos para la industria metalmecánica.',
    contactTitle:'¿Cotización Técnica de Abrasivos?', contactDesc:'Surtimos volúmenes industriales para talleres mecánicos y manufactura.',
    pageTitle:'OrbisCORP — Abrasivos Industriales'
  },
  soldadura: {
    cat:'Soldadura', badge:'Suministro Metalmecánico e Industrial',
    title:'Equipos y Consumibles<br><em>de Soldadura.</em>',
    desc:'Inversores profesionales IGBT, electrodos estructurales normados, antorchas y caretas automáticas.',
    stats:[{num:'6013/7018',label:'Electrodos en Stock'},{num:'Miller/Infra',label:'Marcas distribuidas'},{num:'24h',label:'Entrega en Hidalgo'}],
    brands:['<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Lincoln_Electric_logo.svg/300px-Lincoln_Electric_logo.svg.png" alt="Lincoln Electric" class="marca-logo"> Suministro','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Miller_Electric_logo.svg/300px-Miller_Electric_logo.svg.png" alt="Miller" class="marca-logo"> Distribuidor Mayorista','<strong>CINASA</strong> Insumos Directos'],
    sectionLabel:'Línea de Procesos', sectionTitle:'Soldadura Estructural<br><em>disponible al momento</em>',
    sectionSub:'Inversores, microalambre, aporte de aleación y caretas certificadas.',
    contactTitle:'¿Cotización de Equipos de Soldadura?', contactDesc:'Contáctanos y te respondemos en menos de 24 horas.',
    pageTitle:'OrbisCORP — Soldadura Industrial'
  },
  herramientas: {
    cat:'Herramientas', badge:'Poder Manual y Eléctrico · Garantía de Fábrica',
    title:'Herramientas Profesionales<br><em>de Alto Torque.</em>',
    desc:'Amoladoras industriales, taladros percutores, juegos de llaves y equipo de torque para jornadas pesadas.',
    stats:[{num:'Heavy Duty',label:'Grado de Resistencia'},{num:'Bosch/Truper',label:'Líneas Oficiales'},{num:'24h',label:'Surtido Inmediato'}],
    brands:['<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Bosch-Logo.svg/300px-Bosch-Logo.svg.png" alt="Bosch" class="marca-logo"> Distribuidor Autorizado','<img src="https://www.truper.com/media/logo/stores/1/logo_truper_1.png" alt="Truper" class="marca-logo"> Distribuidor Mayorista','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Stanley_Tools_logo.svg/300px-Stanley_Tools_logo.svg.png" alt="Stanley" class="marca-logo"> Herramienta Manual'],
    breadcrumb:'🔧 Herramientas Manuales y Eléctricas',
    sectionLabel:'Línea de Fuerza', sectionTitle:'Herramientas de Alto Rendimiento<br><em>listas para operación</em>',
    sectionSub:'Equipos de poder eléctrico y herramienta mecánica manual para ensamble y mantenimiento.',
    contactTitle:'¿Necesitas Surtir Tu Taller?', contactDesc:'Armamos paquetes corporativos con descuentos por volumen.',
    pageTitle:'OrbisCORP — Herramientas'
  },
  ferreteria: {
    cat:'Ferretería', badge:'Fijaciones Mecánicas y Consumibles Estructurales',
    title:'Ferretería Industrial<br><em>y Material de Soporte.</em>',
    desc:'Tornillería de alta resistencia Grado 5 y 8, sistemas de anclaje químico y fijaciones mecánicas.',
    stats:[{num:'Grado 5 y 8',label:'Resistencia Mecánica'},{num:'Truper',label:'Soporte y Garantía'},{num:'Hidalgo',label:'Abasto al Estado'}],
    brands:['<img src="https://www.truper.com/media/logo/stores/1/logo_truper_1.png" alt="Truper" class="marca-logo"> Distribuidor Mayorista','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Fischerwerke_Logo.svg/300px-Fischerwerke_Logo.svg.png" alt="Fischer" class="marca-logo"> Anclajes Técnicos','<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Stanley_Tools_logo.svg/300px-Stanley_Tools_logo.svg.png" alt="Stanley" class="marca-logo"> Herrajes de Alta Gama'],
    breadcrumb:'🔩 Ferretería Industrial',
    sectionLabel:'Línea de Abasto', sectionTitle:'Ferretería Industrial<br><em>disponible al momento</em>',
    sectionSub:'Fijaciones estructurales, consumibles de taller y herrajes de ensamble pesado.',
    contactTitle:'¿Surtido Mensual de Consumibles?', contactDesc:'Envíenos sus listas de volumetría para un esquema de precios de mayoreo.',
    pageTitle:'OrbisCORP — Ferretería Industrial'
  }
};

const DEFAULT_CONTENT = {
  hero:    { title:'Todo el equipo que\nnecesitas, hoy.', desc:'EPP, Abrasivos, Soldadura, Herramientas y Ferretería de las mejores marcas del mercado.', statA:'500+', statB:'15+', statC:'24h' },
  contact: { heading:'¿Necesitas una cotización?', desc:'Contáctanos directamente o llena el formulario.', dir:'Carr. Cdad. Sahagún-Pachuca 190-Local D, El Saucillo, Hgo.', horario:'Lun – Vie · 08:00 – 18:00' }
};

/* ══ ESTADO GLOBAL ══ */
let siteData      = null;
let isAdmin       = false;
let currentUser   = null;   // auth.currentUser
let currentCustomer = null; // datos de Firestore del cliente
let cart          = [];
let allProducts   = [];
let categoryCovers = {};    // { cat: product | null }
let pmImgFile     = null;
let pmImgUrl      = '';
let _unsubProfile = null;   // unsub del listener de perfil de cliente
let _ptrActive    = false;  // guard para pull-to-refresh
window._currentCat = null;

/* ══════════════════════════════════════════════
   HELPERS GENERALES
═══════════════════════════════════════════════ */

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && document.activeElement !== el) el.textContent = value || '';
}

function catToId(cat) {
  // Convierte nombre de categoría a ID seguro para DOM: "Ferretería" → "ferreteria"
  return cat.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'_');
}

function fmtPrice(n) { return `$${Number(n || 0).toFixed(2)}`; }
function hayUsuarioLogueado() {
  // true si es cliente logueado O si es admin (el admin siempre debe ver precios)
  return !!(currentUser);
}
/* --- NUEVO: LÓGICA DE DESCUENTOS B2B --- */
function getPrecioData(basePrice) {
  // Sin precio asignado en lista
  if (basePrice === null || basePrice === undefined || basePrice === 0) {
    return { hasDiscount: false, original: null, final: null, pct: 0, sinPrecio: true };
  }
  // Descuento B2B para clientes registrados
  if (currentCustomer && currentCustomer.tiene_descuento === true && currentCustomer.porcentaje_descuento > 0) {
    const pct = Math.min(Math.max(currentCustomer.porcentaje_descuento, 1), 100);
    const final = basePrice - (basePrice * (pct / 100));
    return { hasDiscount: true, original: basePrice, final: final, pct: pct, sinPrecio: false };
  }
  return { hasDiscount: false, original: basePrice, final: basePrice, pct: 0, sinPrecio: false };
}

function renderPriceHTML(priceData, precioConIva = null) {
  if (!hayUsuarioLogueado()) {
    return `<span style="font-size:.75em; color:var(--orbis); font-weight:700; cursor:pointer;" onclick="openLoginCliente()">🔒 Inicia sesión para ver precio</span>`;
  }
  // Producto sin precio en la lista
  if (priceData.sinPrecio) {
    return `<span style="font-size:.72em; color:var(--text-3); font-family:var(--font-mono); font-weight:600;">Consultar precio</span>`;
  }
  // Precio con descuento B2B
  if (priceData.hasDiscount) {
    return `<div style="display:flex; flex-direction:column; line-height:1.1;">
              <span style="text-decoration:line-through; color:var(--text-3); font-size:0.65em; font-family:var(--font-mono);">${fmtPrice(priceData.original)}</span>
              <span style="color:var(--success); font-weight:700;">${fmtPrice(priceData.final)} <span style="background:var(--success); color:#fff; padding:2px 4px; border-radius:4px; font-size:0.6rem; vertical-align:middle; margin-left:4px;">-${priceData.pct}%</span></span>
              ${precioConIva ? `<span style="font-family:var(--font-mono); font-size:0.6em; color:var(--text-3); margin-top:2px;">$${(precioConIva * (1 - priceData.pct/100)).toFixed(2)} c/IVA</span>` : ''}
            </div>`;
  }
  // Precio normal — muestra precio sin IVA y con IVA debajo
  const ivaLine = precioConIva
    ? `<span style="font-family:var(--font-mono); font-size:0.58em; color:var(--text-3); display:block; margin-top:1px;">${fmtPrice(precioConIva)} c/IVA</span>`
    : '';
  return `${fmtPrice(priceData.final)}${ivaLine}`;
}
/* --------------------------------------- */

function getStockInfo(product) {
  const inv = (product.inventario !== undefined && product.inventario !== null) ? Number(product.inventario) : null;
  return {
    inv,
    label: inv === null ? '' : inv <= 0 ? 'SIN STOCK' : inv <= 5 ? `¡Solo ${inv} disponibles!` : `${inv} en stock`,
    cls:   inv === null ? '' : inv <= 0 ? 'out' : inv <= 5 ? 'low' : '',
    out:   inv !== null && inv <= 0
  };
}

function showToast(msg, icon = '✅', duration = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span><button class="toast-close" aria-label="Cerrar notificación">✕</button>`;
  toast.querySelector('.toast-close').onclick = () => dismissToast(toast);
  container.appendChild(toast);
  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;
}
function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.classList.add('out');
  setTimeout(() => toast.remove(), 310);
}

/* ══════════════════════════════════════════════
   ROUTER SPA
═══════════════════════════════════════════════ */

window.navigate = function(route, subFilter = null) {
  const validRoutes = ['home', 'epp', 'abrasivos', 'soldadura', 'herramientas', 'ferreteria'];
  if (!validRoutes.includes(route)) route = 'home';
  history.pushState({ route, subFilter }, '', `#${route}`);
  _applyRoute(route, subFilter);
};

window.addEventListener('popstate', (e) => {
  const r = location.hash.replace('#', '') || 'home';
  const subFilter = e.state ? e.state.subFilter : null;
  _applyRoute(r, subFilter);
});

function _applyRoute(route, subFilter = null) {
  const homeView = document.getElementById('view-home');
  const catView  = document.getElementById('view-category');

  // Actualizar links activos
  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  if (route === 'home') {
    homeView.classList.add('active');
    catView.classList.remove('active');
    window._currentCat = null;
    document.title = 'OrbisCORP — Tienda en Línea de Seguridad Industrial';
    document.getElementById('nav-cta-btn').textContent = 'Ver Catálogo →';
  } else {
    const cfg = VIEWS_CONFIG[route];
    if (!cfg) { _applyRoute('home'); return; }
    window._currentCat = route;
    homeView.classList.remove('active');
    catView.classList.add('active');
    document.title = cfg.pageTitle;
    document.getElementById('nav-cta-btn').textContent = `Ver ${cfg.cat} →`;
    _renderCategoryView(route, cfg, subFilter);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(initReveal, 120);
}

function _renderCategoryView(route, cfg, subFilter) {
  setText('#cat-hero-badge-text', cfg.badge);
  document.getElementById('cat-hero-title').innerHTML = cfg.title;
  document.getElementById('cat-hero-desc').textContent = cfg.desc;

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('cat-stat-a',       cfg.stats[0].num);
  setEl('cat-stat-a-label', cfg.stats[0].label);
  setEl('cat-stat-b',       cfg.stats[1].num);
  setEl('cat-stat-b-label', cfg.stats[1].label);
  setEl('cat-stat-c',       cfg.stats[2].num);
  setEl('cat-stat-c-label', cfg.stats[2].label);

  // Trust bar duplicada para marquee infinito
  const brandsHTML = [...cfg.brands, ...cfg.brands]
    .map(b => `<div class="trust-chip">${b}</div>`)
    .join('');
  document.getElementById('cat-trust-inner').innerHTML = brandsHTML;

  setEl('cat-breadcrumb-text', cfg.breadcrumb);
  setEl('cat-section-label',   cfg.sectionLabel);
  document.getElementById('cat-section-heading').innerHTML = cfg.sectionTitle;
  setEl('cat-section-sub',     cfg.sectionSub);
  setEl('cat-contact-title',   cfg.contactTitle);
  setEl('cat-contact-desc',    cfg.contactDesc);

  // Reset form
  // Reset form
  document.getElementById('cat-form-success').classList.remove('show');
  document.getElementById('cat-ct-form').style.display = '';

  _renderCategoryProducts(cfg.cat, subFilter);
}

/* ══════════════════════════════════════════════
   RENDER DE PRODUCTOS Y PAGINACIÓN
═══════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   RENDER DE PRODUCTOS Y PAGINACIÓN
═══════════════════════════════════════════════ */

window._currentPage = 1;
const ITEMS_PER_PAGE = 25; // Límite de productos por página

function _renderCategoryProducts(catName, subFilter = null) {
  const filtered = allProducts
    .filter(p => {
      // 1. Primero validamos que sea de la categoría principal (ej. EPP)
      if (p.categoria !== catName) return false;
      // 2. Si existe un subfiltro (ej. 'guante'), verificamos que el texto esté en su línea original o nombre
      if (subFilter) {
        const query = subFilter.toLowerCase();
        const subLinea = (p.subLinea || '').toLowerCase();
        const nombre = (p.nombre || '').toLowerCase();
        return subLinea.includes(query) || nombre.includes(query);
      }
      return true; // Si no hay subfiltro, mostramos toda la categoría
    })
    .sort((a, b) => (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0));

  // Cambiamos el título en pantalla para que el usuario sepa que está filtrado
  const displayTitle = subFilter ? `${catName} — Filtrado: ${subFilter.toUpperCase()}` : catName;

  const showcase = document.getElementById('categorias-showcase');
  if (!showcase) return;
  showcase.innerHTML = '';

  const meta = CAT_META[catName] || { icon: '📦', slug: '', coverImg: '' };

  if (!filtered.length) {
    showcase.innerHTML = _renderCatEmpty(catName, meta);
    return;
  }

  // Guardamos las variables de entorno para que la paginación sepa dónde estamos
  window._currentFilteredProducts = filtered;
  window._currentMeta = meta;

  // FIX: Solo regresamos a la página 1 si cambiamos de categoría o de filtro
  if (window._currentCatName !== catName || window._currentSubFilter !== subFilter) {
    window._currentPage = 1;
  }
  window._currentCatName = catName;
  window._currentSubFilter = subFilter; // Guardamos el filtro activo en memoria

  const coverProd = categoryCovers[catName] || filtered[0];
  const blockId   = `cat-block-${catToId(catName)}`;
  const block     = document.createElement('div');
  block.className = 'cat-gallery-block expanded';
  block.id        = blockId;

  block.innerHTML = `
    <div class="cat-gallery-header" onclick="toggleCat('${catName}')" role="button" aria-expanded="true" aria-controls="grid-panel-${catToId(catName)}">
      <div class="cat-gallery-header-left">
        <span style="font-size:1.4rem" aria-hidden="true">${meta.icon}</span>
        <span class="cat-gallery-title">${displayTitle}</span>
        <span class="cat-gallery-count" id="count-${catToId(catName)}">${filtered.length} producto${filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="cat-expand-hint">
        <span class="cat-expand-hint-text">Ocultar</span>
        <div class="cat-expand-arrow" aria-hidden="true">▼</div>
      </div>
    </div>
    <div id="cover-${catToId(catName)}" onclick="toggleCat('${catName}')" style="cursor:pointer">
      ${_renderCoverHTML(coverProd, catName, meta)}
    </div>
    <div class="cat-grid-panel" id="grid-panel-${catToId(catName)}" style="max-height:none !important; border-top-width:1px; overflow:visible;" role="region">
      <div class="cat-grid-inner">
        <div class="cat-grid-title" id="cat-grid-title-anchor">◈ Catálogo Exclusivo — ${catName}</div>
        
        <div class="cat-products-grid" id="grid-${catToId(catName)}"></div>
        
        <div id="pagination-container" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-top:32px; padding:20px 0; border-top: 1px solid var(--border);">
          <button id="btn-prev-page" class="btn-hero-secondary ripple-host" style="color:var(--orbis); border-color:var(--orbis); background:#fff; padding:10px 16px; min-height:auto;" onclick="goToPage(-1)">← Anterior</button>
          
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; flex:1; min-width:200px;">
            <div id="pagination-numbers" style="display:flex; gap:6px; align-items:center; justify-content:center; flex-wrap:wrap;"></div>
            <div style="font-family:var(--font-mono); font-size:0.65rem; color:var(--text-3); letter-spacing:0.05em; text-align:center;" id="pagination-info">Mostrando...</div>
          </div>

          <button id="btn-next-page" class="btn-hero-secondary ripple-host" style="color:var(--orbis); border-color:var(--orbis); background:#fff; padding:10px 16px; min-height:auto;" onclick="goToPage(1)">Siguiente →</button>
        </div>
        
      </div>
    </div>`;

  showcase.appendChild(block);
  
  // Renderizar la primera página al cargar
  _renderCurrentPage();
}

window.goToPage = function(direction) {
  window._currentPage += direction;
  _renderCurrentPage();
  const anchor = document.getElementById('cat-grid-title-anchor');
  if (anchor) { anchor.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};

window.goToSpecificPage = function(pageNum) {
  window._currentPage = pageNum;
  _renderCurrentPage();
  const anchor = document.getElementById('cat-grid-title-anchor');
  if (anchor) { anchor.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};

function _renderCurrentPage() {
  const grid = document.getElementById(`grid-${catToId(window._currentCatName)}`);
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  const info = document.getElementById('pagination-info');
  const numbersContainer = document.getElementById('pagination-numbers');
  
  if (!grid || !window._currentFilteredProducts) return;

  const totalItems = window._currentFilteredProducts.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  
  // Seguridad de límites
  if (window._currentPage < 1) window._currentPage = 1;
  if (window._currentPage > totalPages) window._currentPage = totalPages;

  const startIndex = (window._currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);

  const currentBatch = window._currentFilteredProducts.slice(startIndex, endIndex);
  
  // Reemplazo destructivo
  grid.innerHTML = currentBatch.map(p => _renderProductCard(p, window._currentCatName, window._currentMeta)).join('');

  if (btnPrev && btnNext && info && numbersContainer) {
    btnPrev.style.visibility = (window._currentPage <= 1) ? 'hidden' : 'visible';
    btnNext.style.visibility = (window._currentPage >= totalPages) ? 'hidden' : 'visible';
    
    if (totalItems <= ITEMS_PER_PAGE) {
        document.getElementById('pagination-container').style.display = 'none';
    } else {
        document.getElementById('pagination-container').style.display = 'flex';
        info.innerHTML = `(Mostrando ${startIndex + 1} – ${endIndex} de ${totalItems})`;
        
        // Generar los botones numéricos inteligentemente
        let numbersHTML = '';
        let startPage = Math.max(1, window._currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        
        if (endPage - startPage < 4) {
          startPage = Math.max(1, endPage - 4);
        }

        // Primer página y puntos suspensivos
        if (startPage > 1) {
          numbersHTML += `<button class="page-num-btn" onclick="goToSpecificPage(1)">1</button>`;
          if (startPage > 2) numbersHTML += `<span style="color:var(--text-3); font-weight:bold; padding:0 4px;">...</span>`;
        }
        
        // Números centrales
        for (let i = startPage; i <= endPage; i++) {
          const activeClass = (i === window._currentPage) ? 'active' : '';
          numbersHTML += `<button class="page-num-btn ${activeClass}" onclick="goToSpecificPage(${i})">${i}</button>`;
        }

        // Última página y puntos suspensivos
        if (endPage < totalPages) {
          if (endPage < totalPages - 1) numbersHTML += `<span style="color:var(--text-3); font-weight:bold; padding:0 4px;">...</span>`;
          numbersHTML += `<button class="page-num-btn" onclick="goToSpecificPage(${totalPages})">${totalPages}</button>`;
        }
        
        numbersContainer.innerHTML = numbersHTML;
    }
  }
}
function _renderCoverHTML(p, catName, meta) {
  const { label, cls } = getStockInfo(p);
  const imgHTML = p.imageUrl
    ? `<img src="${p.imageUrl}" alt="${p.nombre || catName}" loading="lazy">`
    : `<img src="${meta.coverImg}" alt="${catName}" loading="lazy" style="object-fit: cover !important; padding: 0 !important; width: 100%; height: 100%;">`;

  return `<div class="cat-cover-body">
    <div class="cat-product-img-wrap" id="imgwrap-${p.id}">
      ${imgHTML}
      <div class="admin-img-trigger" onclick="event.stopPropagation();triggerProdImgUp('${p.id}')" aria-label="Cambiar imagen del producto">
        <div class="admin-img-trigger-label" aria-hidden="true">Cambiar imagen</div>
        <input type="file" class="admin-img-input" accept="image/*" id="pimg-${p.id}" onchange="handleProdImgUp(this,'${p.id}')">
      </div>
    </div>
    <div class="cat-cover-info">
      <div>
        ${p.sku  ? `<div class="cat-product-sku">${p.sku}</div>` : ''}
        <h3 class="cat-product-name">${p.nombre || ''}</h3>
        <p class="cat-product-desc">${p.desc || ''}</p>
      </div>
      <div>
        <div class="cat-product-price">${renderPriceHTML(getPrecioData(p.precio), p.precio_con_iva)}<span> MXN / unidad</span></div>
        ${label ? `<div class="cat-product-stock ${cls}">${label}</div>` : ''}
        <div class="cat-cover-cta">
          <button class="btn-cover-explore" onclick="event.stopPropagation();toggleCat('${catName}')">Ver todos los productos ↓</button>
          <span class="cat-cover-meta">${hayUsuarioLogueado() ? `desde ${fmtPrice(getPrecioData(p.precio).final)} MXN` : '🔒 Precio con sesión iniciada'}</span>
        </div>
        <div class="cat-product-admin-bar">
          <button class="padmin-btn" onclick="event.stopPropagation();openProductModal('${p.id}')">✎ Editar</button>
          <button class="padmin-btn danger" onclick="event.stopPropagation();deleteProduct('${p.id}')">✕ Eliminar</button>
        </div>
      </div>
    </div>
  </div>`;
}

function _renderProductCard(p, catName, meta) {
  const { label, cls, out } = getStockInfo(p);
  const inCartItem = cart.find(c => c.id === p.id);
  const cartQty    = inCartItem ? inCartItem.qty : 0;
  const inv        = (p.inventario !== undefined && p.inventario !== null) ? Number(p.inventario) : null;
  const atLimit    = inv !== null && cartQty >= inv;
  const disabled   = out || atLimit;

  const btnTxt = out ? '✕ Sin stock' : inCartItem ? `✓ En carrito (${cartQty})` : '+ Añadir al carrito';

  /* Se agregó el onclick="openQV" al div principal y event.stopPropagation() a los botones */
  return `<div class="prod-card" id="pcard-${p.id}" onclick="openQV('${p.id}')" style="cursor: pointer;">
    <div class="prod-card-img">
      ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.nombre || ''}" loading="lazy">` : `<div class="img-placeholder" aria-hidden="true">${meta.icon}</div>`}
      <div class="admin-img-trigger" onclick="event.stopPropagation();triggerProdImgUp('${p.id}')">
        <div class="admin-img-trigger-label">Cambiar imagen</div>
        <input type="file" class="admin-img-input" accept="image/*" id="pimg-${p.id}" onchange="handleProdImgUp(this,'${p.id}')">
      </div>
    </div>
    <div class="prod-card-body">
      ${p.sku ? `<div class="prod-card-sku">${p.sku}</div>` : ''}
      <div class="prod-card-name">${p.nombre || ''}</div>
      <div class="prod-card-desc">${p.desc || ''}</div>
      <div class="prod-card-price">${renderPriceHTML(getPrecioData(p.precio), p.precio_con_iva)}<span> MXN</span></div>
      ${label ? `<div class="prod-card-stock ${cls}">${label}</div>` : ''}
      
      <button class="btn-add-card${inCartItem ? ' added' : ''}" id="btnadd-${p.id}"
              onclick="event.stopPropagation(); addToCart('${p.id}')" ${disabled ? 'disabled aria-disabled="true"' : ''}>
        ${btnTxt}
      </button>
      
      <div class="prod-card-admin-bar">
        <button class="padmin-btn" onclick="event.stopPropagation(); openProductModal('${p.id}')">✎ Editar</button>
        <button class="padmin-btn danger" onclick="event.stopPropagation(); deleteProduct('${p.id}')">✕ Eliminar</button>
      </div>
    </div>
  </div>`;
}

function _renderCatEmpty(catName, meta) {
  return `<div class="cat-gallery-block">
    <div class="cat-gallery-header" style="cursor:default">
      <div class="cat-gallery-header-left">
        <span style="font-size:1.4rem">${meta.icon}</span>
        <span class="cat-gallery-title">${catName}</span>
      </div>
    </div>
    <div class="cat-empty-state">
      <div class="cat-empty-icon">${meta.icon}</div>
      <div>
        <p class="cat-empty-text">SIN PRODUCTOS EN ESTA CATEGORÍA</p>
        ${isAdmin ? `<p style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-3);margin-top:6px;">Usa &quot;+ Producto&quot; en la barra de Admin para agregar.</p>` : ''}
      </div>
    </div>
  </div>`;
}

window.toggleCat = function(catName) {
  const block = document.getElementById(`cat-block-${catToId(catName)}`);
  if (!block) return;
  const expanded = block.classList.toggle('expanded');
  const header   = block.querySelector('.cat-gallery-header');
  if (header) header.setAttribute('aria-expanded', String(expanded));
};

/* ══════════════════════════════════════════════
   SHOWROOM (HOME)
═══════════════════════════════════════════════ */

function renderSkeletons() {
  const g = document.getElementById('showroom-grid');
  if (!g) return;
  g.innerHTML = CATS.map(() => `
    <div class="skeleton-card">
      <div class="skeleton-header"></div>
      <div style="aspect-ratio:16/10;background:linear-gradient(90deg,var(--border) 25%,var(--surface2) 50%,var(--border) 75%);background-size:200% 100%;animation:shimmer 1.6s infinite"></div>
      <div class="skeleton-body">
        <div class="skeleton-line sm"></div><div class="skeleton-line lg"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-footer"><div class="skeleton-price"></div><div class="skeleton-btn"></div></div>
      </div>
    </div>`).join('');
}

function renderShowroom() {
  const g = document.getElementById('showroom-grid');
  if (!g) return;
  g.innerHTML = CATS.map(catName => {
    const meta = CAT_META[catName];
    
    // Contamos cuántos productos hay en total en esta categoría
    const totalCatProds = allProducts.filter(p => p.categoria === catName).length;

    // Si la categoría no tiene absolutamente nada, mostramos la tarjeta vacía
    if (totalCatProds === 0) return _renderEmptyShowcaseCard(catName, meta);

    // NUEVO: Usamos SIEMPRE la imagen representativa premium de Unsplash
    // ignorando las fotos individuales de los productos para mantener el diseño uniforme.
    const galleryHTML = `
      <div class="sc-gallery-item">
        <img src="${meta.coverImg}" alt="${catName}" loading="lazy" style="object-fit: cover !important; padding: 0 !important; width: 100%; height: 100%;">
      </div>`;

    return `<div class="showcase-card" onclick="navigate('${meta.slug}')" role="article" tabindex="0"
                 aria-label="Ver categoría ${catName}"
                 onkeydown="if(event.key==='Enter')navigate('${meta.slug}')">
                 
      <div class="sc-cat-header">
        <div class="sc-cat-left">
          <span class="sc-cat-icon" aria-hidden="true">${meta.icon}</span>
          <span class="sc-cat-name">${catName}</span>
        </div>
        <span class="sc-cat-arrow" aria-hidden="true">→</span>
      </div>

      <div class="sc-img-wrap is-gallery">
        <div class="sc-gallery">
          ${galleryHTML}
        </div>
        <div class="sc-img-overlay" aria-hidden="true" style="pointer-events: none;">
          <span class="sc-img-badge">Explorar Catálogo →</span>
        </div>
      </div>

      <div class="sc-body" style="text-align: center; padding: 24px 20px;">
        <div class="sc-name" style="font-size: 1.25rem; margin-bottom: 6px;">Línea de ${catName}</div>
        <div class="sc-desc" style="margin-bottom: 0;">${totalCatProds} productos disponibles. Haz clic para explorar.</div>
      </div>

      <div class="sc-admin-bar" aria-hidden="true">
        <button class="padmin-btn" onclick="event.stopPropagation();navigate('${meta.slug}')">◈ Gestionar Catálogo</button>
      </div>
    </div>`;
  }).join('');
}

  // Temporizador para auto-deslizar las galerías cada 3.5 segundos sin errores
  if (window._galleryInterval) clearInterval(window._galleryInterval);
  window._galleryInterval = setInterval(() => {
    document.querySelectorAll('.sc-gallery').forEach(gallery => {
      let maxScroll = gallery.scrollWidth - gallery.clientWidth;
      if (maxScroll <= 0) return; // Si solo hay 1 foto, no hace nada
      
      let currentScroll = gallery.scrollLeft;
      let nextScroll = currentScroll + gallery.clientWidth;
      
      // Si llegó al final de las fotos, regresa a la primera
      if (nextScroll >= maxScroll + 5) {
        nextScroll = 0;
      }
      gallery.scrollTo({ left: nextScroll, behavior: 'smooth' });
    });
  }, 3500); 

function _renderEmptyShowcaseCard(catName, meta) {
  return `<div class="showcase-card" onclick="navigate('${meta.slug}')" role="article" tabindex="0" aria-label="${catName} — Sin productos aún">
    <div class="sc-cat-header">
      <div class="sc-cat-left"><span class="sc-cat-icon" aria-hidden="true">${meta.icon}</span><span class="sc-cat-name">${catName}</span></div>
      <span class="sc-cat-arrow" aria-hidden="true">→</span>
    </div>
    <div class="sc-img-wrap" style="display:flex;align-items:center;justify-content:center;min-height:160px;">
      <div class="sc-img-placeholder" aria-hidden="true">${meta.icon}</div>
    </div>
    <div class="sc-body">
      <div class="sc-name" style="color:var(--text-3)">Sin productos aún</div>
      <div class="sc-footer">
        <span style="font-family:var(--font-mono);font-size:.75rem;color:var(--text-3)">Próximamente</span>
        ${isAdmin ? `<button class="sc-cta ripple-host" onclick="event.stopPropagation();openProductModal(null)">+ Agregar</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════
   CARRITO — LÓGICA COMPLETA CON SINCRONIZACIÓN
═══════════════════════════════════════════════ */

/**
 * Guarda el carrito:
 *  - Siempre en localStorage (respaldo offline)
 *  - En Firestore si hay cliente autenticado
 */
let _cartSyncTimer = null;
async function persistCart() {
  // 1. Guardar localmente siempre
  try { localStorage.setItem(LS_CART_KEY, JSON.stringify(cart)); } catch (_) {}

  // 2. Sincronizar con Firestore si hay cliente (debounced 800ms para no saturar)
  if (currentCustomer?.uid) {
    clearTimeout(_cartSyncTimer);
    _cartSyncTimer = setTimeout(() => _syncCartToFirestore(), 800);
  }
}

async function _syncCartToFirestore() {
  if (!currentCustomer?.uid) return;
  updateSyncChip('syncing');
  try {
    await updateDoc(doc(db, 'clientes', currentCustomer.uid), {
      carrito:          cart,
      carritoUpdatedAt: serverTimestamp()
    });
    updateSyncChip('synced');
  } catch (e) {
    console.error('[CART] Error sincronizando con Firestore:', e);
    updateSyncChip('error');
  }
}

function updateSyncChip(state) {
  const chip = document.getElementById('cart-sync-chip');
  const txt  = document.getElementById('cart-sync-txt');
  if (!chip || !txt) return;
  chip.className = 'cart-sync-chip';
  if (state === 'synced') {
    chip.classList.add('synced');
    txt.textContent = '✓ Sincronizado con tu cuenta';
  } else if (state === 'syncing') {
    chip.classList.add('syncing');
    txt.textContent = 'Sincronizando...';
  } else if (state === 'error') {
    txt.textContent = '⚠ Error de sincronización';
  } else {
    txt.textContent = 'Inicia sesión para sincronizar';
  }
}

function loadCartFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

/**
 * Fusiona el carrito local con el de la nube.
 * Estrategia: quantity máxima, priorizando la nube para productos comunes.
 */
function mergeCarritos(local, cloud) {
  if (!local.length) return cloud;
  if (!cloud.length) return local;

  const merged = [...cloud];
  for (const localItem of local) {
    const existing = merged.find(c => c.id === localItem.id);
    if (existing) {
      // Tomar la cantidad mayor entre local y nube
      existing.qty = Math.max(existing.qty, localItem.qty);
    } else {
      merged.push(localItem);
    }
  }
  return merged;
}

function clearLocalCart() {
  try { localStorage.removeItem(LS_CART_KEY); } catch (_) {}
}

function updateCartUI() {
  window.__orbisCart = cart;

  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + getPrecioData(i.precio).final * i.qty, 0);

  // Badges de navegación
  ['cart-badge', 'mbn-cart-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent    = count;
    el.style.display  = count > 0 ? 'flex' : 'none';
  });

  // Cuerpo del carrito
  const body = document.getElementById('cart-body');
  const foot = document.getElementById('cart-foot');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">🛒</div>
        <p class="cart-empty-text">Tu carrito está vacío.<br>Explora nuestra tienda para encontrar lo que necesitas.</p>
      </div>`;
    if (foot) foot.style.display = 'none';
    return;
  }

  body.innerHTML = cart.map(item => {
    const inv       = item.inventario != null ? Number(item.inventario) : null;
    const atLimit   = inv !== null && item.qty >= inv;
    const catMeta   = CAT_META[item.categoria] || { icon: '📦' };

    return `<div class="cart-item" role="listitem">
      <div class="cart-item-img">
        ${item.imageUrl
          ? `<img src="${item.imageUrl}" alt="${item.nombre}" loading="lazy">`
          : `<div style="font-size:1.8rem;line-height:1;display:flex;align-items:center;justify-content:center;height:100%" aria-hidden="true">${catMeta.icon}</div>`}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name" title="${item.nombre}">${item.nombre}</div>
        ${item.sku ? `<div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-3);margin-bottom:2px">SKU: ${item.sku}</div>` : ''}
        <div class="cart-item-price">${renderPriceHTML({ ...getPrecioData(item.precio), original: item.precio * item.qty, final: getPrecioData(item.precio).final * item.qty })} MXN</div>
        <div class="cart-item-qty" role="group" aria-label="Cantidad de ${item.nombre}">
          <button class="qty-btn" onclick="changeQty('${item.id}',-1)" aria-label="Reducir cantidad">−</button>
          <span class="qty-val" aria-live="polite">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}',1)" ${atLimit ? 'disabled aria-disabled="true"' : ''} aria-label="Aumentar cantidad">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${item.id}')" aria-label="Eliminar ${item.nombre} del carrito">✕</button>
    </div>`;
  }).join('');

  if (foot) {
    foot.style.display = 'block';
    document.getElementById('cart-total').textContent = hayUsuarioLogueado() ? `${fmtPrice(total)} MXN` : '🔒 Inicia sesión';
    // Chip de sincronización
    updateSyncChip(currentCustomer ? 'synced' : 'local');
  }
}

window.addToCart = function(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const inv = p.inventario != null ? Number(p.inventario) : null;
  if (inv !== null && inv <= 0) { showToast('Producto sin stock disponible', '⚠️'); return; }

  const existing = cart.find(c => c.id === productId);
  if (existing) {
    if (inv !== null && existing.qty >= inv) { showToast('Máximo de stock alcanzado', '⚠️'); return; }
    existing.qty++;
  } else {
    cart.push({ ...p, qty: 1 });
  }

  persistCart();
  updateCartUI();
  _refreshProductCardBtn(productId);
  showToast(`"${p.nombre}" añadido`, '✅');
};

window.addToCartFromShowroom = function(productId, catName) {
  const p = categoryCovers[catName];
  if (!p || p.id !== productId) return;
  const inv = p.inventario != null ? Number(p.inventario) : null;
  if (inv !== null && inv <= 0) { showToast('Producto sin stock', '⚠️'); return; }

  const existing = cart.find(c => c.id === productId);
  if (existing) {
    if (inv !== null && existing.qty >= inv) { openCart(); return; }
    existing.qty++;
  } else {
    cart.push({ ...p, qty: 1 });
  }

  persistCart();
  updateCartUI();
  showToast(`"${p.nombre}" añadido`, '✅');
};

window.removeFromCart = function(productId) {
  cart = cart.filter(c => c.id !== productId);
  persistCart();
  updateCartUI();
  _refreshProductCardBtn(productId);
};

window.changeQty = function(productId, delta) {
  const item = cart.find(c => c.id === productId);
  if (!item) return;
  if (delta > 0) {
    const inv = item.inventario != null ? Number(item.inventario) : null;
    if (inv !== null && item.qty >= inv) { updateCartUI(); return; }
  }
  item.qty += delta;
  if (item.qty <= 0) { window.removeFromCart(productId); return; }
  persistCart();
  updateCartUI();
};

function _refreshProductCardBtn(productId) {
  const btn     = document.getElementById(`btnadd-${productId}`);
  if (!btn) return;
  const p       = allProducts.find(x => x.id === productId);
  const item    = cart.find(c => c.id === productId);
  const inv     = p?.inventario != null ? Number(p.inventario) : null;
  const out     = inv !== null && inv <= 0;
  const atLimit = inv !== null && (item?.qty || 0) >= inv;
  btn.className = `btn-add-card${item ? ' added' : ''}`;
  btn.textContent = out ? '✕ Sin stock' : item ? `✓ En carrito (${item.qty})` : '+ Añadir al carrito';
  btn.disabled = out || (atLimit && !out);
}

window.openCart  = () => {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-sidebar').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden'; /* <- Nuevo: Bloquea scroll en iOS */
  updateCartUI();
};
window.closeCart = () => {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-sidebar').classList.remove('open');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = ''; /* <- Nuevo: Libera scroll en iOS */
};

window.checkoutWhatsApp = function() {
  if (!cart.length) return;
  const total = cart.reduce((s, i) => s + getPrecioData(i.precio).final * i.qty, 0);

  let msg = '🛡️ *Hola OrbisCORP — Pedido desde la Tienda en Línea*\n\n';

  if (currentCustomer) {
    const fullName = [currentCustomer.nombre, currentCustomer.apellido].filter(Boolean).join(' ');
    msg += `*Datos del Solicitante:*\n`;
    msg += `  • *Nombre:* ${fullName || currentCustomer.email}\n`;
    if (currentCustomer.empresa) msg += `  • *Empresa:* ${currentCustomer.empresa}\n`;
    if (currentCustomer.puesto)  msg += `  • *Puesto:* ${currentCustomer.puesto}\n`;
    if (currentCustomer.rfc)     msg += `  • *RFC:* ${currentCustomer.rfc}\n`;
    msg += '\n';
  }

  msg += '*Productos solicitados:*\n';
  cart.forEach(i => {
    const pData = getPrecioData(i.precio);
    msg += `  • *${i.nombre}*`;
    if (i.sku) msg += ` (${i.sku})`;
    if (pData.hasDiscount) msg += ` [Aplica -${pData.pct}%]`;
    msg += ` × ${i.qty} = ${fmtPrice(pData.final * i.qty)} MXN\n`;
  });
  msg += `\n*Total estimado: ${fmtPrice(total)} MXN*\n`;
  msg += '\n¿Pueden confirmar disponibilidad y precio final? Gracias.';

  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.abrirModalCotizacion = function() {
  if (!cart.length) return;
  closeCart();

  const card      = document.getElementById('cot-cliente-card');
  const nombreEl  = document.getElementById('cot-cliente-nombre');
  const detalleEl = document.getElementById('cot-cliente-detalle');
  const emailEl   = document.getElementById('cot-email');
  const nomEl     = document.getElementById('cot-nombre');

  if (currentCustomer) {
    const fullName = [currentCustomer.nombre, currentCustomer.apellido].filter(Boolean).join(' ');
    const detalle  = [currentCustomer.empresa, currentCustomer.rfc].filter(Boolean).join(' · ');
    if (card)      card.style.display      = 'block';
    if (nombreEl)  nombreEl.textContent    = fullName || currentCustomer.email;
    if (detalleEl) detalleEl.textContent   = detalle  || 'Sin datos fiscales registrados';
    if (emailEl && !emailEl.value)  emailEl.value  = currentCustomer.email || '';
    if (nomEl   && !nomEl.value)    nomEl.value    = fullName || '';
  } else {
    if (card) card.style.display = 'none';
  }

  document.getElementById('modal-cotizacion').classList.add('open');
  setTimeout(() => emailEl?.focus(), 120);
};

window.cerrarModalCotizacion = function() {
  document.getElementById('modal-cotizacion').classList.remove('open');
  document.getElementById('cot-email').value  = '';
  document.getElementById('cot-nombre').value = '';
  document.getElementById('cot-err').classList.remove('show');
  document.getElementById('cot-success').style.display = 'none';
  document.getElementById('btn-enviar-cot').disabled    = false;
  document.getElementById('btn-enviar-cot').textContent = 'Enviar Cotización →';
};

window.enviarCotizacionPDF = async function() {
  const emailEl  = document.getElementById('cot-email');
  const nomEl    = document.getElementById('cot-nombre');
  const errEl    = document.getElementById('cot-err');
  const btnEl    = document.getElementById('btn-enviar-cot');
  const sucEl    = document.getElementById('cot-success');
  const email    = emailEl.value.trim();
  const nombre   = nomEl.value.trim();

  errEl.classList.remove('show');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Por favor ingresa un correo válido.';
    errEl.classList.add('show');
    emailEl.focus();
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = '⟳ Enviando...';

  try {
    const clientePayload = currentCustomer ? {
      uid:     currentCustomer.uid    || '',
      nombre:  [currentCustomer.nombre, currentCustomer.apellido].filter(Boolean).join(' ') || nombre,
      empresa: currentCustomer.empresa || '',
      puesto:  currentCustomer.puesto  || '',
      rfc:     currentCustomer.rfc     || ''
    } : { nombre };

    // Construimos lo que le vamos a mandar al servidor (sin envolverlo en "data")
    const payload = {
      items: cart.map(i => ({ productId: i.id, cantidad: i.qty || 1 })),
      correoInvitado: email,
      cliente: clientePayload
    };

    // ── LLAMADA OFICIAL DE FIREBASE (ESTO ARREGLA EL ERROR CORS Y EL 404) ──
    const fbFunctions = getFunctions(fbApp, 'us-central1');
    const generarCotizacionCall = httpsCallable(fbFunctions, 'generarCotizacion');
    
    // Ejecutamos la llamada al servidor
    const result = await generarCotizacionCall(payload);
    const res = result.data; 

    sucEl.textContent   = `✓ Cotización ${res.folio || ''} enviada a ${email}`;
    sucEl.style.display = 'block';
    showToast('Cotización enviada con éxito', '📄');
    setTimeout(() => { cerrarModalCotizacion(); closeCart(); }, 3200);

  } catch (e) {
    console.error('[COT ERROR]', e);
    errEl.textContent = 'Error al enviar. Por favor intenta de nuevo.';
    errEl.classList.add('show');
    btnEl.disabled    = false;
    btnEl.textContent = 'Enviar Cotización →';
  }
};
/* ══════════════════════════════════════════════
   QUICK VIEW
═══════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   QUICK VIEW Y SELECTOR DE CANTIDAD
═══════════════════════════════════════════════ */

let currentQvProductId = null;
let currentQvQty = 1;

window.openQV = function(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  
  currentQvProductId = productId;
  currentQvQty = 1; 

  const img = document.getElementById('qv-img');
  const ph  = document.getElementById('qv-placeholder');
  if (p.imageUrl) {
    img.src = p.imageUrl; img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (ph) { ph.textContent = CAT_META[p.categoria]?.icon || '📦'; ph.style.display = 'block'; }
  }

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('qv-cat-badge-icon', CAT_META[p.categoria]?.icon || '📦');
  setEl('qv-cat-badge-name', p.categoria || 'Categoría');
  setEl('qv-breadcrumb-cat', p.categoria || 'Catálogo');
  setEl('qv-product-name-el', p.nombre || '');
  setEl('qv-sku-tag', `SKU: ${p.sku || 'N/A'}`);
  setEl('qv-product-desc-el', p.desc || 'Producto de alta calidad industrial OrbisCORP.');
  setEl('qv-sucursal-large', p.almacen ? '📍 Disponible en: ' + p.almacen : '📍 Disponible en: Sucursal Pachuca');
  
  const pData = getPrecioData(p.precio);
  
  if (!hayUsuarioLogueado()) {
    document.getElementById('qv-price-number').innerHTML = `<span style="font-size:.55em; cursor:pointer;" onclick="closeQV();openLoginCliente()">🔒 Inicia sesión para ver el precio</span>`;
  } else if (pData.hasDiscount) {
    document.getElementById('qv-price-number').innerHTML = `<span style="text-decoration:line-through; font-size:1.2rem; color:var(--text-3); margin-right:8px;">${fmtPrice(pData.original)}</span><span style="color:var(--success)">${Number(pData.final).toFixed(2)}</span>`;
  } else {
    if (pData.sinPrecio) {
      document.getElementById('qv-price-number').innerHTML =
        `<span style="font-size:.55em; font-family:var(--font-mono); color:var(--text-2);">Consultar precio</span>`;
    } else {
      document.getElementById('qv-price-number').textContent = Number(pData.final || 0).toFixed(2);
    }
    // Mostrar precio con IVA debajo del precio principal
    const ivaEl = document.getElementById('qv-iva-note');
    if (ivaEl && p.precio_con_iva && !pData.sinPrecio) {
      ivaEl.textContent = `+ IVA · Precio total: ${fmtPrice(p.precio_con_iva)} MXN · El vendedor confirma el precio final.`;
    } else if (ivaEl) {
      ivaEl.textContent = '+ IVA · El vendedor confirma el precio final.';
    }
  }
  
  const stockPill = document.getElementById('qv-stock-pill');
  const stockText = document.getElementById('qv-stock-text');
  const atcBtn = document.getElementById('qv-atc-btn');
  const qtyInc = document.getElementById('qv-qty-inc');
  
  const inv = (p.inventario !== undefined && p.inventario !== null) ? Number(p.inventario) : null;
  const inCartItem = cart.find(c => c.id === productId);
  const cartQty = inCartItem ? inCartItem.qty : 0;
  
  if (inv !== null && inv <= 0) {
    stockPill.className = 'qv-stock-pill out';
    stockText.textContent = 'SIN STOCK';
    atcBtn.disabled = true;
    atcBtn.innerHTML = '✕ SIN STOCK DISPONIBLE';
    qtyInc.disabled = true;
  } else if (inv !== null && inv <= 5) {
    stockPill.className = 'qv-stock-pill low';
    stockText.textContent = `¡Solo ${inv} disponibles!`;
    atcBtn.disabled = false;
    atcBtn.innerHTML = inCartItem ? `✓ EN CARRITO (${cartQty})` : '🛒 Agregar al Carrito';
    qtyInc.disabled = currentQvQty + cartQty >= inv;
  } else {
    stockPill.className = 'qv-stock-pill in';
    stockText.textContent = 'EN STOCK';
    atcBtn.disabled = false;
    atcBtn.innerHTML = inCartItem ? `✓ EN CARRITO (${cartQty})` : '🛒 Agregar al Carrito';
    qtyInc.disabled = false;
  }

  _updateQvQtyUI(p.precio, inv, cartQty);

  const waBtn = document.getElementById('qv-wa-btn');
  if (waBtn) {
    waBtn.onclick = () => {
      const msg = `🛡️ *OrbisCORP* — Consulta de producto\n\n*${p.nombre}*\nSKU: ${p.sku || '—'}\nPrecio: ${fmtPrice(p.precio)} MXN\n\n¿Está disponible este producto?`;
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    };
  }

  if (atcBtn) {
    atcBtn.onclick = () => {
      _addQvToCart(p, inv);
    };
  }

  document.getElementById('quick-view-modal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // --- LÓGICA INTELIGENTE DE SCROLL ---
  setTimeout(() => {
    const col = document.getElementById('qv-details-col-el');
    const hint = document.getElementById('qv-scroll-hint');
    
    if (col && hint) {
      const checkScroll = () => {
        // Si llegamos al final, escondemos la flecha (margen de 10px por seguridad)
        if (col.scrollHeight - col.scrollTop <= col.clientHeight + 10) {
          hint.classList.add('hidden');
        } else {
          hint.classList.remove('hidden');
        }
      };
      
      col.scrollTop = 0; // reset al abrir
      checkScroll(); // verifica la longitud inicial
      col.onscroll = checkScroll; // monitorea mientras baja
    }
  }, 50);
};

// --- EL BOTÓN AHORA DESLIZA POR TI ---
window.qvScrollDown = function() {
  const col = document.getElementById('qv-details-col-el');
  if(col) {
    col.scrollTo({ top: col.scrollHeight, behavior: 'smooth' });
  }
};

window.closeQV = () => {
  document.getElementById('quick-view-modal')?.classList.remove('open');
  document.body.style.overflow = '';
};

window.qvChangeQty = function(delta) {
  const p = allProducts.find(x => x.id === currentQvProductId);
  if (!p) return;
  
  const inCartItem = cart.find(c => c.id === currentQvProductId);
  const cartQty = inCartItem ? inCartItem.qty : 0;
  const inv = (p.inventario !== undefined && p.inventario !== null) ? Number(p.inventario) : null;
  
  let newQty = currentQvQty + delta;
  
  if (newQty < 1) newQty = 1;
  if (inv !== null && (newQty + cartQty) > inv) {
    newQty = inv - cartQty;
    if (newQty < 1) newQty = 1; 
    showToast(`Solo quedan ${inv} unidades`, '⚠️');
  }
  
  currentQvQty = newQty;
  _updateQvQtyUI(p.precio, inv, cartQty);
};

function _updateQvQtyUI(precio, inv, cartQty) {
  const precioActivo = getPrecioData(precio).final;
  document.getElementById('qv-qty-num').textContent = currentQvQty;
  document.getElementById('qv-qty-total').textContent = hayUsuarioLogueado() ? `${fmtPrice(precioActivo * currentQvQty)} MXN` : '🔒 —';
  document.getElementById('qv-qty-dec').disabled = (currentQvQty <= 1);
  if (inv !== null && (currentQvQty + cartQty) >= inv) {
    document.getElementById('qv-qty-inc').disabled = true;
  } else {
    document.getElementById('qv-qty-inc').disabled = false;
  }
}

function _addQvToCart(p, inv) {
  const existing = cart.find(c => c.id === p.id);
  if (existing) {
    if (inv !== null && (existing.qty + currentQvQty) > inv) {
      showToast('Máximo de stock alcanzado', '⚠️');
      return;
    }
    existing.qty += currentQvQty;
  } else {
    cart.push({ ...p, qty: currentQvQty });
  }

  persistCart();
  updateCartUI();
  _refreshProductCardBtn(p.id);
  showToast(`"${p.nombre}" añadido`, '✅');
  closeQV(); 
}

/* ══════════════════════════════════════════════
   BÚSQUEDA
═══════════════════════════════════════════════ */

window.openSearch  = () => {
  document.getElementById('mobile-search-bar')?.classList.add('open');
  setTimeout(() => document.getElementById('search-input')?.focus(), 100);
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden'; /* ← FIX: Bloquea el scroll por completo */
};
window.closeSearch = () => {
  document.getElementById('mobile-search-bar')?.classList.remove('open');
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  const res = document.getElementById('search-results');
  if (res) res.innerHTML = '<div class="search-empty">Escribe para buscar productos</div>';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = ''; /* ← FIX: Libera el scroll al cerrar */
};
document.getElementById('mobile-search-bar')?.addEventListener('click', e => {
  if (e.target.id === 'mobile-search-bar') closeSearch();
});

document.getElementById('search-input')?.addEventListener('input', function () {
  const q   = this.value.toLowerCase().trim();
  const res = document.getElementById('search-results');
  if (!res) return;
  if (!q) { res.innerHTML = '<div class="search-empty">Escribe para buscar productos</div>'; return; }

  const matches = allProducts
    .filter(p => [p.nombre, p.sku, p.categoria, p.desc].some(v => (v || '').toLowerCase().includes(q)))
    .slice(0, 8);

  if (!matches.length) {
    res.innerHTML = `<div class="search-empty">Sin resultados para &quot;${q}&quot;</div>`;
    return;
  }
  res.innerHTML = matches.map(p => {
    const meta = CAT_META[p.categoria] || { icon: '📦' };
    
    // Botón exclusivo de Administrador para edición súper rápida
    const adminEditBtn = isAdmin 
      ? `<button class="padmin-btn" style="padding: 4px 10px; font-size: 0.65rem; min-height: auto; flex: 0 1 auto;" onclick="event.stopPropagation(); closeSearch(); openProductModal('${p.id}');">✎ Editar directo</button>` 
      : '';

    return `<div class="search-result-item" onclick="openQV('${p.id}');closeSearch();" role="option" tabindex="0" aria-label="${p.nombre}">
      ${p.imageUrl
        ? `<img class="sri-img" src="${p.imageUrl}" alt="${p.nombre}" loading="lazy">`
        : `<div class="sri-img" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem" aria-hidden="true">${meta.icon}</div>`}
      <div class="sri-info">
        <div class="sri-name">${p.nombre}</div>
        <div class="sri-cat">${p.categoria || ''} ${p.sku ? '· ' + p.sku : ''}</div>
        
                <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button class="sc-cta" style="background: var(--surface2); color: var(--orbis); border: 1px solid var(--border); padding: 4px 10px; font-size: 0.65rem; min-height: auto;" onclick="event.stopPropagation(); closeSearch(); navigate('${meta.slug}');">Ir a la línea ↗</button>
          ${adminEditBtn}
        </div>
      </div>
      <div class="sri-price" style="text-align: right;">${renderPriceHTML(getPrecioData(p.precio))}</div>
    </div>`;
  }).join('');
});

/* ══════════════════════════════════════════════
   FORMULARIOS DE CONTACTO
═══════════════════════════════════════════════ */

async function submitLead(formData) {
  const ref = await addDoc(COL_LEADS, {
    nombre:   formData.get('nombre')   || '',
    empresa:  formData.get('empresa')  || '',
    email:    formData.get('email')    || '',
    telefono: formData.get('telefono') || '',
    asunto:   formData.get('asunto')   || '',
    mensaje:  formData.get('mensaje')  || '',
    pagina:   window._currentCat || 'home',
    creadoEn: serverTimestamp()
  });
  return ref.id.slice(0, 8).toUpperCase();
}

function setupContactForm(formId, errId, successId, folioId, btnId, txtId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById(errId);
    errEl.classList.remove('show');
    const fd    = new FormData(form);
    if (!fd.get('nombre')?.trim() || !fd.get('email')?.trim() || !fd.get('asunto')) {
      errEl.classList.add('show'); return;
    }
    const btn = document.getElementById(btnId);
    const txt = document.getElementById(txtId);
    btn.disabled = true; txt.textContent = '⟳ Enviando...';
    try {
      const folio = await submitLead(fd);
      form.style.display = 'none';
      document.getElementById(folioId).textContent = folio;
      document.getElementById(successId).classList.add('show');
    } catch (_) {
      errEl.textContent = '⚠ Error al enviar. Intenta de nuevo.';
      errEl.classList.add('show');
      btn.disabled = false; txt.textContent = 'Enviar Cotización';
    }
  });
}

/* ══════════════════════════════════════════════
   AUTH — CLIENTES
   Flujo de carrito al autenticarse:
   1. El cliente inicia sesión
   2. Se lee su carrito de Firestore
   3. Se fusiona con el carrito local (si hay)
   4. La versión fusionada se guarda en Firestore y localStorage
   5. Al cerrar sesión, se limpia el carrito de memoria y localStorage
═══════════════════════════════════════════════ */

function updateCustomerNavBtn(customer) {
  const btn = document.getElementById('nav-client-auth');
  const mobBtn = document.getElementById('nav-mobile-auth'); // El nuevo botón móvil
  if (!btn) return;
  
  if (customer) {
    const firstName = (customer.nombre || customer.email || 'Mi Cuenta').split(' ')[0];
    btn.textContent  = `👤 ${firstName}`;
    btn.className    = 'nav-auth-btn logged-in';
    btn.setAttribute('aria-label', `Perfil de ${firstName}`);
    btn.onclick = (e) => { e.stopPropagation(); toggleUserDropdown(); };

    // Le pone un punto verde al ícono del celular
    if (mobBtn) {
      mobBtn.innerHTML = `<span aria-hidden="true">👤</span><span class="cart-badge" style="background:var(--success); color:transparent; width:12px; height:12px; top:-2px; right:-2px; border-color:#fff;"></span>`;
    }

    _populateUserDropdown(customer);
  } else {
    btn.textContent = '🔑 Entrar';
    btn.className   = 'nav-auth-btn';
    btn.setAttribute('aria-label', 'Iniciar sesión');
    btn.onclick = openLoginCliente;

    // Lo regresa a estado normal (sin punto verde)
    if (mobBtn) {
      mobBtn.innerHTML = `<span aria-hidden="true">👤</span>`;
    }
    closeUserDropdown();
  }
}

function _populateUserDropdown(customer) {
  const fullName = [customer.nombre, customer.apellido].filter(Boolean).join(' ') || customer.email || 'Mi Cuenta';
  const initial = (customer.nombre || customer.email || '?')[0].toUpperCase();
  const isOwner = customer.rolEmpresa === 'owner';
  const isEmpresa = !!customer.empresaId;

  const avatarEl = document.getElementById('nud-avatar');
  const nameEl   = document.getElementById('nud-name');
  const emailEl  = document.getElementById('nud-email');
  const chipEl   = document.getElementById('nud-role-chip');
  const empleadosItem = document.getElementById('nud-item-empleados');
  const consigItem    = document.getElementById('nud-item-consignacion');

  if (avatarEl) avatarEl.textContent = initial;
  if (nameEl)   nameEl.textContent   = fullName;
  if (emailEl)  emailEl.textContent  = customer.email || '';

  if (chipEl) {
    if (isEmpresa) {
      chipEl.style.display = 'inline-flex';
      chipEl.textContent = isOwner ? '👑 Dueño de empresa' : '👤 Empleado';
    } else {
      chipEl.style.display = 'none';
    }
  }

  // Solo el dueño ve el acceso rápido a gestión de empleados
  if (empleadosItem) empleadosItem.style.display = (isEmpresa && isOwner) ? 'flex' : 'none';
  // Dueño Y empleados pueden revisar el inventario en consignación de su empresa
  if (consigItem) consigItem.style.display = isEmpresa ? 'flex' : 'none';
}

window.toggleUserDropdown = function() {
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
};
window.closeUserDropdown = function() {
  document.getElementById('nav-user-dropdown')?.classList.remove('open');
};
// Cierra el dropdown al hacer clic fuera de él
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.nav-user-wrap');
  if (wrap && !wrap.contains(e.target)) closeUserDropdown();
});

function updatePerfilModalHeader(customer) {
  const firstName = (customer.nombre || '?')[0].toUpperCase();
  const fullName  = [customer.nombre, customer.apellido].filter(Boolean).join(' ') || customer.email;
  const hasFiscal = !!(customer.empresa || customer.rfc);

  const avatar  = document.getElementById('perfil-avatar');
  const nameH   = document.getElementById('perfil-nombre-header');
  const emailH  = document.getElementById('perfil-email-header');
  const badge   = document.getElementById('perfil-fiscal-badge');

  if (avatar)  { avatar.textContent = firstName; }
  if (nameH)   { nameH.textContent  = fullName; }
  if (emailH)  { emailH.textContent = customer.email || ''; }
  if (badge) {
    badge.className   = `fiscal-badge ${hasFiscal ? 'ok' : 'pending'}`;
    badge.textContent = hasFiscal ? '✓ Datos fiscales completos' : '⚠ Datos fiscales incompletos';
  }
}

window.handleAuthBtnClick = function() {
  if (currentCustomer) openPerfilModal();
  else openLoginCliente();
};

window.openLoginCliente = function() {
  _clearLoginClienteForm();
  document.getElementById('login-cliente-modal').classList.add('open');
  setTimeout(() => document.getElementById('lc-email')?.focus(), 120);
};

window.closeLoginCliente = function() {
  document.getElementById('login-cliente-modal').classList.remove('open');
  _clearLoginClienteForm();
};

function _clearLoginClienteForm() {
  ['lc-email', 'lc-pass'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const err = document.getElementById('lc-err');
  if (err) { err.classList.remove('show'); err.style.color = ''; err.textContent = ''; }
  const btn = document.getElementById('lc-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar a mi cuenta →'; }
}

window.doLoginCliente = async function() {
  const emailEl = document.getElementById('lc-email');
  const passEl  = document.getElementById('lc-pass');
  const errEl   = document.getElementById('lc-err');
  const btnEl   = document.getElementById('lc-btn');
  const email   = emailEl?.value.trim() || '';
  const pass    = passEl?.value || '';

  errEl.classList.remove('show');
  if (!email || !pass) {
    errEl.textContent = 'Ingresa tu correo y contraseña.';
    errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Verificando...';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, pass);
    closeLoginCliente();
    showToast('¡Bienvenido!', '👋');
  } catch (e) {
    const msgs = {
      'auth/invalid-credential':    'Correo o contraseña incorrectos.',
      'auth/user-not-found':        'No existe una cuenta con este correo.',
      'auth/wrong-password':        'Contraseña incorrecta.',
      'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
      'auth/user-disabled':         'Esta cuenta ha sido desactivada.'
    };
    errEl.textContent = msgs[e.code] || 'Error al iniciar sesión.';
    errEl.classList.add('show');
    btnEl.disabled = false; btnEl.textContent = 'Entrar a mi cuenta →';
  }
};

window.sendPasswordReset = async function() {
  const email  = document.getElementById('lc-email')?.value.trim() || '';
  const errEl  = document.getElementById('lc-err');
  errEl.style.color = '';
  errEl.classList.remove('show');

  if (!email) {
    errEl.textContent = 'Escribe tu correo arriba para recuperar la contraseña.';
    errEl.classList.add('show');
    document.getElementById('lc-email')?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    errEl.style.color = 'var(--success)';
    errEl.textContent = `✓ Correo de recuperación enviado a ${email}`;
    errEl.classList.add('show');
  } catch (e) {
    errEl.style.color = 'var(--danger)';
    errEl.textContent = 'No se encontró una cuenta con ese correo.';
    errEl.classList.add('show');
  }
};

window.switchToRegister = function() {
  closeLoginCliente();
  document.getElementById('rc-err').classList.remove('show');
  document.getElementById('register-cliente-modal').classList.add('open');
};
window.closeRegisterCliente = function() {
  document.getElementById('register-cliente-modal').classList.remove('open');
};
window.switchToLogin = function() {
  closeRegisterCliente();
  openLoginCliente();
};

window.evalPassStrength = function(val) {
  const bar  = document.getElementById('pass-strength-bar');
  const hint = document.getElementById('pass-strength-hint');
  if (!bar || !hint) return;
  if (!val) { bar.style.width = '0'; hint.textContent = 'Introduce una contraseña'; hint.style.color = ''; return; }

  let score = 0;
  if (val.length >= 6)           score++;
  if (val.length >= 10)          score++;
  if (/[A-Z]/.test(val))         score++;
  if (/[0-9]/.test(val))         score++;
  if (/[^A-Za-z0-9]/.test(val))  score++;

  const levels = [
    { w: '20%', color: '#EF4444', label: 'Muy débil' },
    { w: '40%', color: '#F59E0B', label: 'Débil' },
    { w: '60%', color: '#FBBF24', label: 'Regular' },
    { w: '80%', color: '#10B981', label: 'Buena' },
    { w: '100%',color: '#059669', label: 'Fuerte' }
  ];
  const lvl = Math.min(score - 1, 4);
  const l   = levels[Math.max(0, lvl)];
  bar.style.width      = l.w;
  bar.style.background = l.color;
  hint.textContent     = l.label;
  hint.style.color     = l.color;
};

window.doRegisterCliente = async function() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const btnEl = document.getElementById('rc-btn');
  const errEl = document.getElementById('rc-err');
  errEl.classList.remove('show');

  const nombre  = get('rc-nombre');
  const apellido= get('rc-apellido');
  const email   = get('rc-email');
  const pass    = document.getElementById('rc-pass')?.value || '';
  const pass2   = document.getElementById('rc-pass2')?.value || '';
  const empresa = get('rc-empresa');
  const puesto  = get('rc-puesto');
  const rfc     = get('rc-rfc');

  if (!nombre || !apellido || !email || !pass || !pass2) {
    errEl.textContent = 'Completa todos los campos obligatorios (*).'; errEl.classList.add('show'); return;
  }
  if (pass !== pass2) {
    errEl.textContent = 'Las contraseñas no coinciden.'; errEl.classList.add('show'); return;
  }
  if (pass.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; errEl.classList.add('show'); return;
  }
  if (rfc && rfc.length < 12) {
    errEl.textContent = 'El RFC debe tener al menos 12 caracteres.'; errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Creando cuenta...';
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid  = cred.user.uid;

    // Tomar el carrito local para migrarlo a la nube
    const localCart = loadCartFromLocalStorage();

    const clienteData = {
      uid, nombre, apellido, email, empresa, puesto, rfc,
      rol:             'cliente',
      carrito:         localCart,
      carritoUpdatedAt: serverTimestamp(),
      creadoEn:        serverTimestamp(),
      actualizadoEn:   serverTimestamp()
    };

    await setDoc(doc(db, 'clientes', uid), clienteData);
    closeRegisterCliente();
    showToast('¡Cuenta creada con éxito!', '✨');
  } catch (e) {
    const msgs = {
      'auth/email-already-in-use': 'El correo ya está registrado. Inicia sesión.',
      'auth/invalid-email':        'El correo no es válido.',
      'auth/weak-password':        'La contraseña es muy débil.'
    };
    errEl.textContent = msgs[e.code] || 'Error al crear la cuenta. Intenta de nuevo.';
    errEl.classList.add('show');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Crear mi cuenta →';
  }
};

window.openPerfilModal = function() {
  if (!currentCustomer) return;
  updatePerfilModalHeader(currentCustomer);
  document.getElementById('pf-nombre').value  = currentCustomer.nombre  || '';
  document.getElementById('pf-apellido').value = currentCustomer.apellido|| '';
  document.getElementById('pf-empresa').value  = currentCustomer.empresa || '';
  document.getElementById('pf-puesto').value   = currentCustomer.puesto  || '';
  document.getElementById('pf-rfc').value      = currentCustomer.rfc     || '';
  const empresaBox = document.getElementById('mi-empresa-section');
  if (currentCustomer.empresaId) {
    empresaBox.style.display = 'block';
    getDoc(doc(db, 'empresas', currentCustomer.empresaId)).then(snap => {
      document.getElementById('mi-empresa-nombre').textContent = snap.exists() ? snap.data().nombreEmpresa : 'Empresa';
    });
    const isOwner = currentCustomer.rolEmpresa === 'owner';

    const roleBadge = document.getElementById('emp-role-badge');
    if (roleBadge) {
      roleBadge.className = `emp-role-badge ${isOwner ? 'owner' : 'empleado'}`;
      roleBadge.textContent = isOwner ? '👑 Dueño' : '👤 Empleado';
    }

    document.getElementById('btn-registrar-empleado').style.display = isOwner ? 'block' : 'none';
    // Dueño Y empleados pueden ver el inventario en consignación de la empresa
    document.getElementById('btn-revisar-consignacion').style.display = 'block';

    const drawerLink = document.getElementById('drawer-link-consignacion');
    if (drawerLink) drawerLink.style.display = 'flex';

    const listaCont = document.getElementById('lista-empleados-empresa');
    if (isOwner) {
      cargarEmpleadosEmpresa();
    } else if (listaCont) {
      listaCont.innerHTML = `<div class="emp-list-empty">Solo el dueño de la cuenta puede ver la lista completa de empleados.</div>`;
    }
  } else {
    empresaBox.style.display = 'none';
  }
  document.getElementById('pf-err').classList.remove('show');
  document.getElementById('perfil-modal').classList.add('open');
};
window.closePerfilModal = () => document.getElementById('perfil-modal').classList.remove('open');

window.savePerfilData = async function() {
  const btnEl    = document.getElementById('pf-save-btn');
  const errEl    = document.getElementById('pf-err');
  const nombre   = document.getElementById('pf-nombre')?.value.trim()  || '';
  const apellido = document.getElementById('pf-apellido')?.value.trim()|| '';
  const empresa  = document.getElementById('pf-empresa')?.value.trim() || '';
  const puesto   = document.getElementById('pf-puesto')?.value.trim()  || '';
  const rfc      = document.getElementById('pf-rfc')?.value.trim()     || '';

  errEl.classList.remove('show');
  if (!nombre) {
    errEl.textContent = 'El nombre es obligatorio.'; errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Guardando...';
  try {
    await updateDoc(doc(db, 'clientes', currentCustomer.uid), {
      nombre, apellido, empresa, puesto, rfc,
      actualizadoEn: serverTimestamp()
    });
    showToast('Perfil actualizado', '✅');
    closePerfilModal();
  } catch (e) {
    console.error('[PERFIL]', e);
    errEl.textContent = 'Error al guardar. Intenta de nuevo.'; errEl.classList.add('show');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Guardar cambios →';
  }
};
window.abrirModalRegistrarEmpleado = function() {
  if (!currentCustomer || currentCustomer.rolEmpresa !== 'owner') { showToast('Solo el dueño de la empresa puede agregar empleados', '⚠️'); return; }
  ['re-nombre','re-apellido','re-email','re-pass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('re-err')?.classList.remove('show');
  document.getElementById('modal-registrar-empleado')?.classList.add('open');
  setTimeout(() => document.getElementById('re-nombre')?.focus(), 120);
};
window.cerrarModalRegistrarEmpleado = function() {
  document.getElementById('modal-registrar-empleado')?.classList.remove('open');
};

window.registrarEmpleado = async function() {
  if (!currentCustomer || currentCustomer.rolEmpresa !== 'owner') { showToast('Solo el dueño de la empresa puede agregar empleados', '⚠️'); return; }

  const nombre   = document.getElementById('re-nombre')?.value.trim()   || '';
  const apellido = document.getElementById('re-apellido')?.value.trim() || '';
  const email    = document.getElementById('re-email')?.value.trim()    || '';
  const pass     = document.getElementById('re-pass')?.value            || '';
  const errEl    = document.getElementById('re-err');
  const btnEl    = document.getElementById('re-save-btn');

  errEl.classList.remove('show');
  if (!nombre)               { errEl.textContent = 'El nombre es obligatorio.'; errEl.classList.add('show'); return; }
  if (!email || !email.includes('@')) { errEl.textContent = 'Ingresa un correo válido.'; errEl.classList.add('show'); return; }
  if (!pass || pass.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; errEl.classList.add('show'); return; }

  btnEl.disabled = true; btnEl.textContent = '⟳ Registrando...';
  try {
    const cred = await createUserWithEmailAndPassword(authSecundaria, email, pass);
    await setDoc(doc(db, 'clientes', cred.user.uid), {
      uid: cred.user.uid, nombre, apellido, email,
      empresaId: currentCustomer.empresaId, rolEmpresa: 'empleado',
      rol: 'cliente', carrito: [], creadoEn: serverTimestamp()
    });
    await signOut(authSecundaria); // limpia la sesión de la app secundaria
    showToast(`Empleado ${nombre} registrado`, '✅');
    cerrarModalRegistrarEmpleado();
    cargarEmpleadosEmpresa();
  } catch (e) {
    errEl.textContent = e.code === 'auth/email-already-in-use' ? 'Ese correo ya está registrado.' : 'Error al crear el empleado.';
    errEl.classList.add('show');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Registrar empleado →';
  }
};

window.cargarEmpleadosEmpresa = async function() {
  const cont = document.getElementById('lista-empleados-empresa');
  if (!cont || !currentCustomer?.empresaId) return;
  cont.innerHTML = `<div class="emp-list-empty">Cargando equipo...</div>`;
  const snap = await getDocs(query(collection(db,'clientes'), where('empresaId','==',currentCustomer.empresaId)));
  if (snap.empty) {
    cont.innerHTML = `<div class="emp-list-empty">Aún no hay empleados registrados.</div>`;
    return;
  }
  cont.innerHTML = '';
  snap.forEach(d => {
    const e = d.data();
    const nombreCompleto = [e.nombre, e.apellido].filter(Boolean).join(' ') || e.email;
    const inicial = (e.nombre || e.email || '?')[0].toUpperCase();
    cont.innerHTML += `<div class="emp-list-row">
      <div class="emp-avatar-sm">${inicial}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.rolEmpresa==='owner'?'👑':'👤'} ${nombreCompleto}</div>
        <div style="color:var(--text-3);font-size:.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.email}</div>
      </div>
    </div>`;
  });
};
window.verInventarioConsignacion = async function() {
  if (!currentCustomer?.empresaId) { showToast('Esta función es solo para cuentas de empresa', '⚠️'); return; }
  
  const snap = await getDocs(query(collection(db,'productos_consignacion'), where('empresaId','==',currentCustomer.empresaId)));
  
  if (snap.empty) { 
    showToast('No hay inventario en consignación registrado', 'ℹ️'); 
    return; 
  }

  // 1. Llenar los datos del encabezado
  const empresaTxt = currentCustomer.empresa || 'Empresa sin nombre';
  const clienteTxt = [currentCustomer.nombre, currentCustomer.apellido].filter(Boolean).join(' ') || currentCustomer.email;
  
  document.getElementById('consig-empresa-nombre').textContent = empresaTxt;
  document.getElementById('consig-cliente-nombre').textContent = clienteTxt;
  
  // Generar fecha actual formateada (ej. "21 de julio de 2026")
  const opcionesFecha = { year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('consig-fecha').textContent = new Date().toLocaleDateString('es-MX', opcionesFecha);

  // 2. Construir la lista de productos
  const listaContenedor = document.getElementById('consig-lista');
  listaContenedor.innerHTML = '';
  
  snap.forEach(d => { 
    const p = d.data(); 
    listaContenedor.innerHTML += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #fff; border: 1px solid var(--border); border-left: 4px solid var(--orbis); border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div>
          <div style="font-weight: 700; color: var(--text); font-size: 0.95rem; margin-bottom: 2px;">${p.producto}</div>
          <div style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-3); letter-spacing: 0.05em;">SKU: ${p.sku || 'N/A'}</div>
        </div>
        <div style="text-align: center; background: var(--surface2); padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);">
          <div style="font-size: 0.65rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Stock</div>
          <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: var(--orbis); line-height: 1;">${p.cantidad}</div>
        </div>
      </div>
    `; 
  });
  
  // 3. Ocultar el perfil y abrir el nuevo documento
  closePerfilModal();
  document.getElementById('modal-consignacion').classList.add('open');
};

window.cerrarModalConsignacion = function() {
  document.getElementById('modal-consignacion').classList.remove('open');
};
window.doLogoutCliente = async function() {
  try {
    await signOut(auth);
    closePerfilModal();
    showToast('Sesión cerrada', '👋');
  } catch (e) {
    console.error('[AUTH]', e);
  }
};

window.handleMobileAuthNav = function() {
  if (currentCustomer) openPerfilModal();
  else openLoginCliente();
};

/* ══ LISTENER CENTRAL DE AUTH ══ */

let _initAuthResolved = false;
let _resolveAuthReady;
const authReadyPromise = new Promise(res => { _resolveAuthReady = res; });

onAuthStateChanged(auth, async (firebaseUser) => {
  // Limpiar listener de perfil anterior
  if (_unsubProfile) { _unsubProfile(); _unsubProfile = null; }

  currentUser = firebaseUser;

  if (!firebaseUser) {
    /* === SESIÓN CERRADA === */
    isAdmin         = false;
    currentCustomer = null;
    cart            = [];
    clearLocalCart();
    updateCustomerNavBtn(null);
    document.body.classList.remove('admin-mode');
    const toolbar = document.getElementById('admin-toolbar');
    if (toolbar) toolbar.classList.remove('active');
    document.documentElement.style.setProperty('--toolbar-h', '0px');
    const badge = document.getElementById('nav-admin-badge');
    if (badge) badge.style.display = 'none';
    deactivateFields();
    updateCartUI();
    // RE-RENDER AL SALIR:
    if (window._currentCat) _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat);
    else renderShowroom();
    if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
    return;
  }

  /* === SESIÓN ACTIVA === */

  // ─ Admin ─
  if (firebaseUser.uid === ADMIN_UID) {
    isAdmin         = true;
    currentCustomer = null;
    updateCustomerNavBtn(null);
    document.body.classList.add('admin-mode');
    const toolbar = document.getElementById('admin-toolbar');
    if (toolbar) toolbar.classList.add('active');
    document.documentElement.style.setProperty('--toolbar-h', '44px');
    const badge = document.getElementById('nav-admin-badge');
    if (badge) badge.style.display = 'inline-flex';
    activateFields();
    if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
    return;
  }

  // ─ Cliente ─
  isAdmin = false;
  document.body.classList.remove('admin-mode');
  document.getElementById('admin-toolbar')?.classList.remove('active');
  document.documentElement.style.setProperty('--toolbar-h', '0px');
  document.getElementById('nav-admin-badge') && (document.getElementById('nav-admin-badge').style.display = 'none');
  deactivateFields();

  // Suscribirse en tiempo real al perfil del cliente
  const clienteRef = doc(db, 'clientes', firebaseUser.uid);
  let firstSnapshot = true;

  _unsubProfile = onSnapshot(clienteRef, async (snap) => {
    if (!snap.exists()) {
      // El documento puede no existir si vino de otra plataforma
      currentCustomer = { uid: firebaseUser.uid, email: firebaseUser.email };
      updateCustomerNavBtn(currentCustomer);
      if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
      return;
    }

    const data = { uid: snap.id, ...snap.data() };
    currentCustomer = data;
    updateCustomerNavBtn(currentCustomer);
    updatePerfilModalHeader(currentCustomer);

    // RE-RENDER AL ENTRAR (Aplica descuentos visuales al instante):
    if (window._currentCat) _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat);
    else renderShowroom();
    updateCartUI();

    if (firstSnapshot) {
      firstSnapshot = false;
      /* === SINCRONIZACIÓN DE CARRITO AL INICIAR SESIÓN ===
         Estrategia: fusionar carrito local + carrito de la nube.
         La versión fusionada se sube a Firestore y reemplaza el localStorage. */
      const localCart = loadCartFromLocalStorage();
      const cloudCart = data.carrito || [];
      const merged    = mergeCarritos(localCart, cloudCart);

      if (merged.length > 0) {
        cart = merged;
        // Guardar el resultado fusionado tanto en LS como en Firestore
        try { localStorage.setItem(LS_CART_KEY, JSON.stringify(cart)); } catch (_) {}
        try {
          await updateDoc(clienteRef, { carrito: cart, carritoUpdatedAt: serverTimestamp() });
        } catch (_) {}
        updateCartUI();
        if (merged.length !== cloudCart.length) {
          showToast(`Carrito listo: ${merged.length} producto${merged.length > 1 ? 's' : ''}`, '🛒');
        }
      } else {
        cart = [];
        updateCartUI();
      }
      if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
    } else {
      // Actualizaciones posteriores del perfil (nombre, empresa, etc.) — NO tocar el carrito
      // para evitar sobrescribir cambios locales en vuelo
    }
  }, (err) => {
    console.error('[PROFILE LISTENER]', err);
    if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
  });
});

/* ══════════════════════════════════════════════
   AUTH — ADMIN
═══════════════════════════════════════════════ */

window.openLogin  = () => document.getElementById('login-modal').classList.add('open');
window.closeLogin = () => {
  document.getElementById('login-modal').classList.remove('open');
  document.getElementById('l-email').value = '';
  document.getElementById('l-pass').value  = '';
  document.getElementById('l-err').classList.remove('show');
};

window.doAdminLogin = async function() {
  const email = document.getElementById('l-email')?.value.trim() || '';
  const pass  = document.getElementById('l-pass')?.value || '';
  const errEl = document.getElementById('l-err');
  errEl.classList.remove('show');

  if (!email || !pass) { errEl.classList.add('show'); return; }
  try {
    await setPersistence(auth, browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (cred.user.uid !== ADMIN_UID) {
      await signOut(auth);
      errEl.textContent = 'No tienes permisos de administrador.';
      errEl.classList.add('show'); return;
    }
    closeLogin();
  } catch (e) {
    errEl.textContent = 'Credenciales incorrectas.';
    errEl.classList.add('show');
  }
};

window.doAdminLogout = async function() {
  await signOut(auth);
  showToast('Sesión de admin cerrada', '👋');
};

/* ══════════════════════════════════════════════
   CAMPOS EDITABLES — ADMIN CMS
═══════════════════════════════════════════════ */

function activateFields() {
  document.querySelectorAll('[data-field]').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('input', _handleFieldEdit);
  });
}
function deactivateFields() {
  document.querySelectorAll('[data-field]').forEach(el => {
    el.setAttribute('contenteditable', 'false');
    el.removeEventListener('input', _handleFieldEdit);
  });
}
function _handleFieldEdit(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  clearTimeout(e.target._debounce);
  e.target._debounce = setTimeout(async () => {
    const [section, key] = field.split('.');
    const val = e.target.textContent.trim();
    if (!siteData) siteData = {};
    if (!siteData[section]) siteData[section] = {};
    siteData[section][key] = val;
    setSaveStatus('saving');
    try {
      await updateDoc(REF_CONTENT, { [`${section}.${key}`]: val });
      setSaveStatus('saved');
    } catch (_) { setSaveStatus('error'); }
  }, 900);
}
function setSaveStatus(state) {
  const wrap = document.getElementById('save-status-wrap');
  const txt  = document.getElementById('save-txt');
  if (!wrap || !txt) return;
  wrap.className  = state;
  txt.textContent = { saving: 'Guardando...', saved: 'Guardado ✓', error: 'Error al guardar' }[state] || 'Listo';
  if (state === 'saved') setTimeout(() => { wrap.className = ''; txt.textContent = 'Listo'; }, 2800);
}

/* ══════════════════════════════════════════════
   MODAL PRODUCTO — ADMIN
═══════════════════════════════════════════════ */

window.openProductModal = function(productId) {
  if (!isAdmin) return;
  const titleEl = document.getElementById('pm-title-el');

  if (productId) {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    if (titleEl) titleEl.textContent = '◈ Editar Producto';
    document.getElementById('pm-id').value          = productId;
    document.getElementById('pm-nombre').value      = p.nombre    || '';
    document.getElementById('pm-desc').value        = p.desc      || '';
    document.getElementById('pm-precio').value      = p.precio    || '';
    document.getElementById('pm-sku').value         = p.sku       || '';
    document.getElementById('pm-inventario').value  = p.inventario ?? 0;
    document.getElementById('pm-cat').value         = p.categoria || '';
    document.getElementById('pm-portada').value     = p.esPortada ? '1' : '0';
    const prev = document.getElementById('pm-preview');
    const hint = document.getElementById('pm-upload-hint');
    pmImgUrl = p.imageUrl || '';
    if (p.imageUrl) { prev.src = p.imageUrl; prev.style.display = 'block'; if (hint) hint.style.display = 'none'; }
    else            { prev.style.display = 'none'; if (hint) hint.style.display = 'block'; }
  } else {
    if (titleEl) titleEl.textContent = '◈ Nuevo Producto';
    ['pm-id','pm-nombre','pm-desc','pm-precio','pm-sku'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('pm-inventario').value = '0';
    document.getElementById('pm-cat').value        = '';
    document.getElementById('pm-portada').value    = '0';
    document.getElementById('pm-preview').style.display = 'none';
    const hint = document.getElementById('pm-upload-hint');
    if (hint) hint.style.display = 'block';
    pmImgFile = null; pmImgUrl = '';
    const fileInput = document.getElementById('pm-img-file');
    if (fileInput) fileInput.value = ''; // Vacía la selección para el nuevo producto
  }
  document.getElementById('pm-err').classList.remove('show');
  document.getElementById('prod-modal').classList.add('open');
};

window.closeProdModal = () => {
  document.getElementById('prod-modal').classList.remove('open');
  pmImgFile = null;
  const fileInput = document.getElementById('pm-img-file');
  if (fileInput) fileInput.value = ''; // Obliga al navegador a "olvidar" la imagen anterior
};

window.pmImgSelect = function(input) {
  const file = input.files[0];
  if (!file) return;
  pmImgFile = file;
  const prev = document.getElementById('pm-preview');
  const hint = document.getElementById('pm-upload-hint');
  const reader = new FileReader();
  reader.onload = e => {
    prev.src = e.target.result;
    prev.style.display = 'block';
    if (hint) hint.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.triggerProdImgUp = function(productId) {
  if (!isAdmin) return;
  const inp = document.getElementById(`pimg-${productId}`);
  inp?.click();
};

window.handleProdImgUp = async function(input, productId) {
  const file = input.files[0];
  if (!file) return;
  setSaveStatus('saving');
  try {
    const ext = file.name.split('.').pop();
    const ref = stRef(storage, `productos/${productId}_${Date.now()}.${ext}`);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    
    try {
      await updateDoc(doc(db, 'productos_orbis', productId), { imageUrl: url });
    } catch (err) {
      await updateDoc(doc(db, 'productos', productId), { imageUrl: url });
    }

    const idx = allProducts.findIndex(p => p.id === productId);
    if (idx > -1) allProducts[idx].imageUrl = url;
    Object.keys(categoryCovers).forEach(cat => {
      if (categoryCovers[cat]?.id === productId) categoryCovers[cat].imageUrl = url;
    });
    if (window._currentCat) {
      _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat, window._currentSubFilter);
    }
    renderShowroom();
    setSaveStatus('saved');
    showToast('Imagen actualizada', '🖼️');
  } catch (e) {
    console.error('[IMG UP]', e);
    setSaveStatus('error');
    showToast('Error al subir imagen', '❌');
  }
  input.value = ''; // reset para poder subir la misma imagen de nuevo
};

window.saveProducto = async function() {
  const nombre    = document.getElementById('pm-nombre')?.value.trim()         || '';
  const cat       = document.getElementById('pm-cat')?.value                   || '';
  const precio    = parseFloat(document.getElementById('pm-precio')?.value)    || 0;
  const sku       = document.getElementById('pm-sku')?.value.trim()            || '';
  const inventario= parseInt(document.getElementById('pm-inventario')?.value)  || 0;
  const desc      = document.getElementById('pm-desc')?.value.trim()           || '';
  const esPortada = document.getElementById('pm-portada')?.value === '1';
  const errEl     = document.getElementById('pm-err');
  const btnEl     = document.getElementById('pm-save');

  errEl.classList.remove('show');
  if (!nombre || !cat || isNaN(precio) || precio < 0 || !sku) {
    errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Guardando...';
  setSaveStatus('saving');

  try {
    let imageUrl = pmImgUrl;
    if (pmImgFile) {
      const ext = pmImgFile.name.split('.').pop();
      const ref = stRef(storage, `productos/nuevo_${Date.now()}.${ext}`);
      await uploadBytes(ref, pmImgFile);
      imageUrl = await getDownloadURL(ref);
    }

    const data = { nombre, categoria: cat, precio, sku, inventario, desc, imageUrl, esPortada, updatedAt: serverTimestamp() };
    const existId = document.getElementById('pm-id').value;

    if (existId) {
      try {
        // 1. Intentamos actualizar en la colección de productos manuales
        await updateDoc(doc(db, 'productos_orbis', existId), data);
      } catch (error) {
        // 2. Si tira error de que no lo encuentra, es porque viene del ERP
        if (error.code === 'not-found') {
          await updateDoc(doc(db, 'productos', existId), data);
        } else {
          throw error; // Si es otro error de red o permisos, que lo suelte
        }
      }
      
      const idx = allProducts.findIndex(p => p.id === existId);
      if (idx > -1) allProducts[idx] = { ...allProducts[idx], ...data, id: existId };
    } else {
      data.creadoEn = serverTimestamp();
      const newRef  = await addDoc(COL_PRODS, data);
      allProducts.unshift({ ...data, id: newRef.id });
    }

    pmImgFile = null; pmImgUrl = imageUrl;
    await _reloadCovers();
    if (window._currentCat) _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat, window._currentSubFilter);
    setSaveStatus('saved');
    closeProdModal();
    showToast(`"${nombre}" guardado`, '✅');
  } catch (e) {
    console.error('[SAVE PROD]', e);
    setSaveStatus('error');
    showToast('Error al guardar el producto', '❌');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Guardar →';
  }
};

window.deleteProduct = async function(productId) {
  if (!isAdmin) return;
  if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'productos_orbis', productId));
    allProducts = allProducts.filter(p => p.id !== productId);
    // Limpiar del carrito si estaba
    const wasInCart = cart.some(c => c.id === productId);
    cart = cart.filter(c => c.id !== productId);
    if (wasInCart) { persistCart(); updateCartUI(); }
    if (window._currentCat) _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat, window._currentSubFilter);
    await _reloadCovers();
    showToast('Producto eliminado', '🗑️');
  } catch (e) {
    console.error('[DEL PROD]', e);
    showToast('Error al eliminar', '❌');
  }
};

window.showLeads = async function() {
  if (!isAdmin) return;
  try {
    const snap = await getDocs(COL_LEADS);
    if (snap.empty) { alert('Sin leads aún.'); return; }
    let msg = '📋 LEADS ORBISCORP\n\n';
    snap.forEach(d => {
      const l = d.data();
      msg += `[${d.id.slice(0,6).toUpperCase()}] ${l.nombre} | ${l.email} | ${l.asunto}\n`;
    });
    alert(msg);
  } catch (e) {
    console.error('[LEADS]', e);
    showToast('Error al cargar leads', '❌');
  }
};

window.reloadData = async function() {
  await loadAllProducts();
  await _reloadCovers();
  if (window._currentCat) _renderCategoryProducts(VIEWS_CONFIG[window._currentCat]?.cat, window._currentSubFilter);
  else renderShowroom();
  showToast('Catálogo actualizado', '↺');
};

/* ══════════════════════════════════════════════
   CARGA DE DATOS
═══════════════════════════════════════════════ */

async function loadAllProducts() {
  allProducts = [];

  // 1. INTENTAR CARGAR PRODUCTOS MANUALES (ORBIS)
  try {
    const snapOrbis = await getDocs(COL_PRODS);
    snapOrbis.forEach(d => allProducts.push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('[PRODS MANUALES] Error:', e.message);
  }

  // 2. INTENTAR CARGAR INVENTARIO REAL (RIVG) CON CLASIFICACIÓN INTELIGENTE
  //    Esquema de este documento: { codigo, descripcion, cantidad }
  //    Al no traer línea/categoría desde el origen, clasificamos por
  //    palabras clave dentro de la descripción del producto.
  try {
    const snapMasivos = await getDocs(COL_INVENTARIO_RIVG);
    snapMasivos.forEach(d => {
      const data = d.data();

      const descripcionOriginal = (data.descripcion || '').trim();
      const codigoOriginal      = (data.codigo || d.id || '').toString().trim();
      const cantidadOriginal    = Number(data.cantidad || 0);

      if (!descripcionOriginal) return; // sin descripción no es vendible

      const descLower = descripcionOriginal.toLowerCase();

      let finalCategory = 'Ferretería'; // Por defecto, si no cuadra, es Ferretería

      // 🦺 AGRUPAR EPP
      if ([
        'casco','cachucha','guante','manga','arnes','arnés','altura','cuerpo completo',
        'lente','goggle','careta','facial','orejera','tapon','tapón','auditivo','respirador',
        'mascarilla','cartucho','filtro','chaleco','bota','borcegui','zapato','calzado',
        'impermeable','gabardina','mandil','barbiquejo','absorbedor','eslinga','sujetador',
        'linea de vida','línea de vida','protector','epp'
      ].some(w => descLower.includes(w))) {
        finalCategory = 'EPP';
      }
      // 🔴 AGRUPAR ABRASIVOS
      else if ([
        'disco de corte','disco diam','abrasivo','desbaste','lija','rueda flap',
        'disco de lija','banda de lija'
      ].some(w => descLower.includes(w))) {
        finalCategory = 'Abrasivos';
      }
      // ⚡ AGRUPAR SOLDADURA
      else if ([
        'soldar','soldadura','electrodo','careta para soldador','careta para soldar','cautin','cautín'
      ].some(w => descLower.includes(w))) {
        finalCategory = 'Soldadura';
      }
      // 🔧 AGRUPAR HERRAMIENTAS
      else if ([
        'bosch','dremel','taladro','esmeril','amoladora','atornillador','rotomartillo',
        'broca','desarmador','llave','pinza','martillo','sierra','segueta','cincel',
        'flexometro','flexómetro','nivel','multimetro','multímetro','cautin','herramienta',
        'juego de escobillas','portaescobillas','inducido','rodamiento'
      ].some(w => descLower.includes(w))) {
        finalCategory = 'Herramientas';
      }

      // Construimos el producto para la tienda web
      // precio_unitario viene del JSON que generamos con el PDF de precios.
      // Si es null o 0 el producto se muestra con "Consultar precio".
      const precioUnitario = data.precio_unitario
        ? Number(data.precio_unitario)
        : (data.precio ? Number(data.precio) : null);
      const precioConIva   = data.precio_total_iva ? Number(data.precio_total_iva) : null;

      allProducts.push({
        id: d.id,
        nombre: descripcionOriginal,
        categoria: finalCategory,
        subLinea: 'Inventario RIVG',
        almacen: data.almacen || 'Sucursal Principal',
        precio:        precioUnitario,          // sin IVA — base para descuentos B2B
        precio_con_iva: precioConIva,           // con 16 % IVA — se muestra al usuario final
        sin_precio:    !precioUnitario,         // flag para UI
        nota:          data.nota || null,       // "Sin precio en lista" / "Código no encontrado"
        inventario: Math.floor(cantidadOriginal),
        desc: `Código: ${codigoOriginal}`,
        sku: codigoOriginal,
        imageUrl: data.imageUrl || '',
        esPortada: data.esPortada || false
      });
    });
  } catch (e) {
    console.error('[INVENTARIO_RIVG] Error:', e.message);
  }

  window._allProductsCache = allProducts;
}

async function _reloadCovers() {
  await Promise.allSettled(CATS.map(_loadCoverForCategory));
  renderShowroom();
}

async function _loadCoverForCategory(catName) {
  try {
    // Primero buscar producto marcado como portada
    const q1   = query(COL_PRODS, where('categoria','==',catName), where('esPortada','==',true), fbLimit(1));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const d = snap1.docs[0];
      categoryCovers[catName] = { id: d.id, ...d.data() };
      return;
    }
    // Fallback: primer producto de la categoría del cache local
    const fallback = allProducts.find(p => p.categoria === catName);
    categoryCovers[catName] = fallback || null;
  } catch (_) {
    categoryCovers[catName] = null;
  }
}

/* ══════════════════════════════════════════════
   UTILIDADES DE UI
═══════════════════════════════════════════════ */

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('done');
  setTimeout(() => { loader.style.display = 'none'; }, 700);
}

function initReveal() {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
    { threshold: 0.06, rootMargin: '0px 0px -20px 0px' }
  );
  document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
}

window.scrollToCatalog = () => {
  const id = window._currentCat ? 'cat-catalog' : 'catalogo';
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};
window.scrollToContact = () => {
  const id = window._currentCat ? 'cat-contacto' : 'contacto';
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

window.waFabClick = () => {
  if (cart.length) { window.checkoutWhatsApp(); return; }
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola OrbisCORP, me interesa conocer su catálogo de productos de seguridad industrial.')}`, '_blank');
};
window.toggleCatalogPopup = () => {
  const popup = document.getElementById('catalog-popup');
  const backdrop = document.getElementById('catalog-popup-backdrop');
  const isOpen = popup?.classList.contains('open');
  
  if (isOpen) {
    window.closeCatalogPopup();
  } else {
    popup?.classList.add('open');
    backdrop?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
};

window.closeCatalogPopup = () => {
  document.getElementById('catalog-popup')?.classList.remove('open');
  document.getElementById('catalog-popup-backdrop')?.classList.remove('open');
  document.body.style.overflow = '';
};

window.toggleDrawer = () => {
  const d        = document.getElementById('mobile-drawer');
  const b        = document.getElementById('ham-btn');
  const backdrop = document.getElementById('drawer-backdrop');
  const open     = d?.classList.toggle('open');
  if (b)        { b.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); }
  if (backdrop)   backdrop.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
};
window.closeDrawer = () => {
  document.getElementById('mobile-drawer')?.classList.remove('open');
  document.getElementById('drawer-backdrop')?.classList.remove('open');
  const b = document.getElementById('ham-btn');
  if (b) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
  document.body.style.overflow = '';
};

/* ── Ripple effect ── */
document.addEventListener('click', e => {
  const btn = e.target.closest('.ripple-host');
  if (!btn || !document.body.contains(btn)) return;
  const rect = btn.getBoundingClientRect();
  const d    = Math.max(rect.width, rect.height);
  const wave = document.createElement('span');
  wave.className  = 'ripple-wave';
  wave.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - d/2}px;top:${e.clientY - rect.top - d/2}px;position:absolute;pointer-events:none;`;
  btn.appendChild(wave);
  setTimeout(() => wave.remove(), 660);
}, true);

/* ── Scroll handlers ── */
window.addEventListener('scroll', () => {
  document.getElementById('back-to-top')?.classList.toggle('show', window.scrollY > 400);
  document.getElementById('main-nav')?.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeQV();
    closeSearch();
    window.closeCart?.();
    window.closeDrawer?.();
    window.closeCatalogPopup?.();
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
});

/* ── Trust bar infinita ── */
(function initTrustBar() {
  const orig = document.getElementById('trust-inner-orig');
  if (!orig) return;
  // Duplicamos solo el contenido interno para evitar que se apilen dos contenedores
  orig.innerHTML += orig.innerHTML;
})();


/* ══════════════════════════════════════════════
   INICIALIZACIÓN DE LA APLICACIÓN
═══════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Aplicar la ruta actual (o 'home' por defecto)
  _applyRoute(location.hash.replace('#', '') || 'home');
  
  // 2. Esperar a que Firebase Auth determine el estado del usuario
  await authReadyPromise;
  
  // 3. Cargar el catálogo completo y portadas
  await reloadData();
  
  // 4. Ocultar la pantalla de carga inicial
  setTimeout(hideLoader, 600);
});

/* ══════════════════════════════════════════════
   ASISTENTE VIRTUAL GEMINI (CON LÍMITE DE CRÉDITOS)
═══════════════════════════════════════════════ */
const fbFunctions = getFunctions(fbApp, 'us-central1');
const chatAsistenteCall = httpsCallable(fbFunctions, 'chatAsistente');

window.historialChat = []; // Memoria a corto plazo del bot
window.mensajesEnviados = 0; // Contador de mensajes del usuario
const MAX_MENSAJES = 5; // Límite de preguntas gratuitas permitidas

window.toggleChatbot = () => {
  const win = document.getElementById('chatbot-window');
  win.classList.toggle('open');
  if (win.classList.contains('open')) {
    setTimeout(() => document.getElementById('chat-input').focus(), 100);
  }
};

window.enviarMensajeChat = async () => {
  if (window.mensajesEnviados >= MAX_MENSAJES) return; // Bloqueo de seguridad

  const input = document.getElementById('chat-input');
  const texto = input.value.trim();
  if(!texto) return;
  
  window.mensajesEnviados++; // Sumamos 1 al contador
  
  const msgsDiv = document.getElementById('chat-messages');
  
  // 1. Dibujar mensaje del usuario en pantalla
  msgsDiv.innerHTML += `<div class="msg user">${texto}</div>`;
  input.value = '';
  msgsDiv.scrollTop = msgsDiv.scrollHeight;
  
  // 2. Indicador de que Gemini está pensando
  const typingId = "typing-" + Date.now();
  msgsDiv.innerHTML += `<div class="msg bot" id="${typingId}">✨ Pensando...</div>`;
  msgsDiv.scrollTop = msgsDiv.scrollHeight;
  
  try {
    // 3. RAG LOCAL MEJORADO: Filtro con inyección de contexto
    const historialCorto = window.historialChat.slice(-4);
    let textoBusqueda = texto.toLowerCase();
    
    // Truco: Si el usuario busca procesos específicos, le inyectamos palabras relacionadas
    // para que el filtro atrape los productos correctos de seguridad.
    if (textoBusqueda.includes('soldar') || textoBusqueda.includes('soldadura')) {
        textoBusqueda += " carnaza careta electrodo inversor cuero ignifugo";
    }

    const palabrasClave = textoBusqueda.split(/[ \n,.-]+/).filter(p => p.length > 3);
    
    const productosRelevantes = allProducts.filter(p => {
      const textoProducto = `${p.nombre} ${p.categoria} ${p.desc}`.toLowerCase();
      return palabrasClave.some(palabra => textoProducto.includes(palabra));
    }).slice(0, 20); // Aumentamos a 20 para darle más opciones a la IA (sigue siendo muy barato en tokens)

    const inventarioActual = productosRelevantes.length > 0
      ? productosRelevantes.map(p => `[ID:${p.id}] ${p.nombre} | STOCK: ${p.stock || p.existencia || p.cantidad || 0} | ${(p.desc || '').substring(0, 45)}`).join('\n')
      : "No se encontraron productos exactos en la base de datos. Sugiere navegar por el menú o contactar a un asesor.";

    // 4. Mandar el texto, la memoria CORTA y el inventario FILTRADO a Firebase
    const result = await chatAsistenteCall({ 
      mensaje: texto, 
      historial: historialCorto,
      catalogoWeb: inventarioActual
    });
    const respuestaBot = result.data.respuesta;
    
    // 4. Borrar "Pensando...", limpiar texto (negritas/saltos)
    document.getElementById(typingId).remove();
    let textoLimpio = respuestaBot.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // MAGIA: Detectar [PRODUCTO:id] y convertirlo en una hermosa tarjeta HTML
    textoLimpio = textoLimpio.replace(/\[PRODUCTO:([^\]]+)\]/g, (match, id) => {
      const p = allProducts.find(x => x.id === id.trim());
      if (!p) return ""; // Si el bot inventa un ID por error, lo ignoramos
      
      const precioFinal = getPrecioData(p.precio).final;
      const imgSrc = p.imageUrl || 'https://via.placeholder.com/80?text=📦';
      
      return `
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin: 12px 0; box-shadow: 0 4px 12px rgba(47,59,162,0.08); text-align: left; width: 100%; box-sizing: border-box;">
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 10px;">
          <img src="${imgSrc}" style="width: 50px; height: 50px; object-fit: contain; border-radius: 8px; background: #fff; border: 1px solid var(--border); flex-shrink: 0;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-family: var(--font-body); font-size: 0.85rem; font-weight: 700; color: var(--text); line-height: 1.2; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.nombre}</div>
            <div style="font-family: var(--font-display); font-size: 0.85rem; color: var(--orbis); font-weight: 700;">${hayUsuarioLogueado() ? `$${precioFinal.toFixed(2)} <span style="font-size: 0.65rem; color: var(--text-3); font-weight: 400;">MXN</span>` : '🔒 Inicia sesión para ver precio'}</div>
          </div>
        </div>
        <button class="btn-add-card ripple-host" style="width: 100%; min-height: 36px; font-size: 0.75rem; padding: 6px;" onclick="addToCart('${p.id}')">+ Agregar al Carrito</button>
      </div>`;
    });

    // NUEVA MAGIA: Detectar [VER_MAS:categoria:palabra] y crear el botón de redirección
    textoLimpio = textoLimpio.replace(/\[VER_MAS:([^:]+):([^\]]+)\]/g, (match, cat, palabra) => {
      return `<button class="sc-cta ripple-host" style="width: 100%; margin-top: 10px; background: var(--orbis-light); color: var(--orbis); border: 1.5px solid var(--orbis-mid); font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px;" onclick="navigate('${cat.trim()}', '${palabra.trim()}'); toggleChatbot();">Ver más sobre ${palabra.trim()} <span>→</span></button>`;
    });

    msgsDiv.innerHTML += `<div class="msg bot">${textoLimpio}</div>`;
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
    
    // 5. Guardar en memoria para que no pierda el hilo
    window.historialChat.push({ role: "user", parts: [{ text: texto }] });
    window.historialChat.push({ role: "model", parts: [{ text: respuestaBot }] });
    
    // 6. Verificar si ya alcanzó el límite para bloquearlo
    if (window.mensajesEnviados >= MAX_MENSAJES) {
      input.disabled = true;
      input.placeholder = "Límite de consultas alcanzado.";
      input.style.backgroundColor = "var(--surface2)";
      document.querySelector('.chat-input-area button').disabled = true;
      
      msgsDiv.innerHTML += `<div class="msg bot" style="background: var(--orbis-light); border-color: var(--orbis-mid);">
        Has alcanzado el límite de consultas gratuitas por esta sesión. Para brindarte una atención más personalizada y tomar tu pedido, por favor comunícate con un asesor. 
        <br><br>
        <button class="btn-qv-whatsapp ripple-host" style="width:100%; font-size: 0.75rem; padding: 8px; min-height: auto;" onclick="waFabClick()">💬 Hablar por WhatsApp</button>
      </div>`;
      msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }
    
  } catch (error) {
    console.error("Error en Chat:", error);
    document.getElementById(typingId)?.remove();
    msgsDiv.innerHTML += `<div class="msg bot" style="color:var(--danger)">⚠ Tuvimos un error de conexión, intenta de nuevo en un momento.</div>`;
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
  }
};