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
import {
  desdeInventario, enriquecer, agruparVariantes,
  prepararConsulta, coincide, puntaje, corregirConsulta, textoBusqueda,
  USOS, USOS_POR_ID
} from './catalogo.js';

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
const functionsClient = getFunctions(fbApp, 'us-central1');

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
const LS_FAV_KEY      = 'orbiscorp_favoritos_v1';
const LS_VISTOS_KEY   = 'orbiscorp_vistos_v1';
const LS_NOTA_KEY     = 'orbiscorp_nota_pedido_v1';
const LS_BUSQ_KEY     = 'orbiscorp_busquedas_v1';

/* ══ CATEGORÍAS ══ */
const CATS = ['EPP','Abrasivos','Soldadura','Herramientas','Ferretería'];
/* Las portadas ya no se enlazan a fotos de bancos de imágenes (iStock con marca
   de agua, freepik…): se arman con las fotos reales del catálogo o con un
   ícono propio cuando la categoría todavía no tiene fotos. */
const CAT_META = {
  'EPP':          { icon:'🦺', slug:'epp',          tono:'#2F3BA2' },
  'Abrasivos':    { icon:'🔴', slug:'abrasivos',    tono:'#B4472B' },
  'Soldadura':    { icon:'⚡', slug:'soldadura',    tono:'#C27C0E' },
  'Herramientas': { icon:'🔧', slug:'herramientas', tono:'#1F6F5C' },
  'Ferretería':   { icon:'🔩', slug:'ferreteria',   tono:'#4A5178' }
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

VIEWS_CONFIG.buscar = {
  cat: '*',
  contactTitle: '¿No encontraste lo que buscas?',
  contactDesc: 'Muchas piezas las conseguimos sobre pedido. Escríbenos y te respondemos en menos de 24 horas.',
  pageTitle: 'OrbisCORP — Catálogo completo'
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
let _grupos       = new Map(); // variantes: grupo → productos
let favoritos     = new Set(_leerLS(LS_FAV_KEY, []));
let vistos        = _leerLS(LS_VISTOS_KEY, []);
window._currentCat = null;

/* ══════════════════════════════════════════════
   HELPERS GENERALES
═══════════════════════════════════════════════ */

function _leerLS(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_) { return def; } }
function _guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
function _reagrupar() { _grupos = agruparVariantes(allProducts); }
function _varianteDe(p) { return p?._grupo ? (_grupos.get(p._grupo) || []) : []; }

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && document.activeElement !== el) el.textContent = value || '';
}

function catToId(cat) {
  // Convierte nombre de categoría a ID seguro para DOM: "Ferretería" → "ferreteria"
  return cat.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'_');
}

function fmtPrice(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ══ ESCAPES ══
   Todo texto que venga de la base de datos, del usuario o de la IA pasa por
   aquí antes de ir a innerHTML. Sin esto, un nombre de producto o de
   empleado con "<img onerror=...>" ejecutaría código en la tienda. */
function escHTML(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* Para valores dentro de onclick="fn('...')" */
function escJS(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/'/g, "\\'")
    .replace(/"/g, '&quot;').replace(/</g, '\\x3c').replace(/[\r\n]+/g, ' ');
}
/* Minúsculas y sin acentos: "Ferretería" y "ferreteria" son lo mismo */
function normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function _imgTag(src, alt, extra = '') {
  return `<img src="${escHTML(src)}" alt="${escHTML(alt)}" loading="lazy" decoding="async"${extra}>`;
}
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
    return `<span style="font-size:.75em; color:var(--orbis); font-weight:700; cursor:pointer;" onclick="event.stopPropagation();openLoginCliente()">🔒 Inicia sesión para ver precio</span>`;
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
  toast.innerHTML = `<span class="toast-icon"></span><span class="toast-msg"></span><button class="toast-close" aria-label="Cerrar notificación">✕</button>`;
  toast.querySelector('.toast-icon').textContent = icon;
  toast.querySelector('.toast-msg').textContent  = msg;
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

/* ══════════════════════════════════════════════════════════════
   VISTA DE CATEGORÍA v2
   Estado de filtros en un solo objeto (F), reflejado en la URL:
   #epp?linea=Guantes,Calzado&marca=MSA&stock=1&orden=nombre&q=nitrilo&pag=2
═══════════════════════════════════════════════════════════════ */

const RUTAS = ['home', 'buscar', 'epp', 'abrasivos', 'soldadura', 'herramientas', 'ferreteria'];
const CAT_TITULO = {
  'EPP':          'Equipo de protección personal',
  'Abrasivos':    'Abrasivos y discos',
  'Soldadura':    'Soldadura',
  'Herramientas': 'Herramientas',
  'Ferretería':   'Ferretería industrial',
  '*':            'Todo el catálogo'
};
const ITEMS_PER_PAGE = 24;
const ORDENES = {
  'relevancia':  'Relevancia',
  'nombre':      'Nombre (A–Z)',
  'existencia':  'Más existencia',
  'precio-asc':  'Menor precio',
  'precio-desc': 'Mayor precio'
};

const F = { subs: new Set(), marcas: new Set(), cats: new Set(), usos: new Set(), q: '', _qCorr: null, stock: false, orden: 'relevancia' };
window._F = F;
window._currentPage = 1;
const _gruposAbiertos = new Set();
let _buscaMarca = '';
let _vistaLista = (() => { try { return localStorage.getItem('oc_vista') === 'lista'; } catch (_) { return false; } })();

/* ── Íconos (trazo lineal, heredan el color del texto) ── */
const _svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICO = {
  buscar:   _svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  filtros:  _svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  cuadros:  _svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  lista:    _svg('<path d="M9 6h11M9 12h11M9 18h11"/><rect x="3.5" y="4.5" width="3" height="3" rx=".8"/><rect x="3.5" y="10.5" width="3" height="3" rx=".8"/><rect x="3.5" y="16.5" width="3" height="3" rx=".8"/>'),
  cerrar:   _svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  izq:      _svg('<path d="m15 6-6 6 6 6"/>'),
  der:      _svg('<path d="m9 6 6 6-6 6"/>'),
  carrito:  _svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1.8 1.8 0 0 0 1.8 1.4h8.4a1.8 1.8 0 0 0 1.8-1.4L21.5 7H6.2"/>'),
  candado:  _svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  whatsapp: _svg('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.5 9.5c.3 2 1.9 3.8 4 4.4l1-1.1 1.8.7-.4 1.5c-3.4.3-7.3-3.6-7-7l1.5-.4.7 1.8z"/>'),
  vacio:    _svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 11h5"/>'),
  corazon:  _svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  campana:  _svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  rayo:     _svg('<path d="M13 2.5 5.5 13H11l-1 8.5L18.5 11H13z"/>'),
  compartir:_svg('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4"/>'),
  reloj:    _svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')
};

const ICO_CAT = {
  'EPP':          _svg('<path d="M3 17.5h18"/><path d="M4.5 17.5a7.5 7.5 0 0 1 15 0"/><path d="M10 10.2V7.5a2 2 0 0 1 4 0v2.7"/>'),
  'Abrasivos':    _svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>'),
  'Soldadura':    _svg('<path d="M13 2.5 5.5 13H11l-1 8.5L18.5 11H13z"/>'),
  'Herramientas': _svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  'Ferretería':   _svg('<path d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7z"/><circle cx="12" cy="12" r="3.5"/>')
};
const ICO_USO = {
  soldadura:    _svg('<path d="M5 19 15 9"/><path d="m14 6 4 4"/><path d="M17 3l4 4-3 3-4-4z"/><path d="M4 14l1 2M2.5 18l2-.5M7 21l-.5-2"/>'),
  alturas:      _svg('<path d="M12 2.5v4"/><circle cx="12" cy="9" r="2.5"/><path d="M8 21l2-6h4l2 6"/><path d="M7 13c1.5-1.3 3-2 5-2s3.5.7 5 2"/>'),
  respiratoria: _svg('<path d="M5 10c0-3 3-5 7-5s7 2 7 5v2c0 4-3 7-7 7s-7-3-7-7z"/><path d="M9 13h6M9 16h6"/>'),
  quimicos:     _svg('<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
  ruido:        _svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  corte:        _svg('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8.5 15.5 19 4M15.5 15.5 5 4"/>'),
  visibilidad:  _svg('<path d="M6 3h4l2 3 2-3h4l1 18H5z"/><path d="M5.5 12h13M5.2 16h13.6"/>'),
  lluvia:       _svg('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 0 4 0"/>'),
  electricidad: _svg('<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>')
};

/* ── Rutas ─────────────────────────────────────────────────────── */

/**
 * Navega a una ruta con un filtro opcional:
 *   - string                      → búsqueda de texto ("guantes")
 *   - { sub } / { marca } / { q } → formatos del menú y del asistente
 *   - { subs:[], marcas:[], stock, orden, q, pagina }
 */
window.navigate = function(route, filtro = null) {
  if (!RUTAS.includes(route)) route = 'home';
  history.pushState({ route }, '', `${location.pathname}#${route}`);
  closeDrawer?.();
  closeCatalogPopup?.();
  _applyRoute(route, filtro);
};

function _normFiltro(f) {
  const base = { subs: [], marcas: [], cats: [], usos: [], q: '', stock: false, orden: 'relevancia', pagina: 1 };
  if (!f) return base;
  if (typeof f === 'string') return { ...base, q: f };
  return {
    subs:   f.subs   || (f.sub   ? [f.sub]   : []),
    marcas: f.marcas || (f.marca ? [f.marca] : []),
    cats:   f.cats   || (f.cat   ? [f.cat]   : []),
    usos:   (f.usos  || (f.uso   ? [f.uso]   : [])).filter(u => USOS_POR_ID[u]),
    q:      f.q || '',
    stock:  !!f.stock,
    orden:  ORDENES[f.orden] ? f.orden : 'relevancia',
    pagina: Number(f.pagina) || 1
  };
}

function _cargarFiltros(f) {
  const n = _normFiltro(f);
  F.subs = new Set(n.subs);
  F.marcas = new Set(n.marcas);
  F.cats = new Set(n.cats);
  F.usos = new Set(n.usos);
  F.q = String(n.q).slice(0, 60);
  F._qCorr = null;
  F.stock = n.stock;
  F.orden = n.orden;
  window._currentPage = n.pagina;
  _buscaMarca = '';
  _gruposAbiertos.clear();
}

/* Lee "#epp?linea=A,B&marca=C" → { route, filtro } */
function _leerHash() {
  const [r, qs = ''] = location.hash.replace(/^#/, '').split('?');
  const route = RUTAS.includes(r) ? r : 'home';
  if (!qs) return { route, filtro: null };
  const p = {};
  qs.split('&').filter(Boolean).forEach(par => {
    const [k, v = ''] = par.split('=');
    p[k] = v.split(',').map(x => { try { return decodeURIComponent(x); } catch (_) { return x; } }).filter(Boolean);
  });
  return { route, filtro: {
    subs: p.linea || [], marcas: p.marca || [], cats: p.cat || [], usos: p.uso || [], q: (p.q || []).join(','),
    stock: (p.stock || [])[0] === '1', orden: (p.orden || [])[0], pagina: (p.pag || [])[0]
  } };
}

function _syncURL() {
  if (!window._currentCat) return;
  const enc = s => [...s].map(encodeURIComponent).join(',');
  const partes = [];
  if (F.subs.size)   partes.push('linea=' + enc(F.subs));
  if (F.marcas.size) partes.push('marca=' + enc(F.marcas));
  if (F.cats.size)   partes.push('cat=' + enc(F.cats));
  if (F.usos.size)   partes.push('uso=' + enc(F.usos));
  if (F.q)           partes.push('q=' + encodeURIComponent(F.q));
  if (F.stock)       partes.push('stock=1');
  if (F.orden !== 'relevancia') partes.push('orden=' + F.orden);
  if (window._currentPage > 1)  partes.push('pag=' + window._currentPage);
  const h = `#${window._currentCat}${partes.length ? '?' + partes.join('&') : ''}`;
  if (location.hash !== h) {
    try { history.replaceState({ route: window._currentCat }, '', `${location.pathname}${location.search}${h}`); } catch (_) {}
  }
}

window.addEventListener('popstate', () => {
  const { route, filtro } = _leerHash();
  _applyRoute(route, filtro);
});

function _applyRoute(route, filtro = null) {
  const homeView = document.getElementById('view-home');
  const catView  = document.getElementById('view-category');

  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  cerrarFiltros();

  if (route === 'home') {
    homeView.classList.add('active');
    catView.classList.remove('active');
    window._currentCat = null;
    window._currentCatName = null;
    document.title = 'OrbisCORP — Tienda en Línea de Seguridad Industrial';
    document.getElementById('nav-cta-btn').textContent = 'Ver Catálogo →';
  } else {
    const cfg = VIEWS_CONFIG[route];
    if (!cfg) { _applyRoute('home'); return; }
    window._currentCat = route;
    homeView.classList.remove('active');
    catView.classList.add('active');
    document.title = `${CAT_TITULO[cfg.cat] || cfg.cat} — OrbisCORP`;
    document.getElementById('nav-cta-btn').textContent = 'Solicitar cotización';
    _cargarFiltros(filtro);
    _renderCategoryView(route, cfg);
  }

  window.scrollTo(0, 0);
  document.body.classList.toggle('fab-hero', route === 'home');
  setTimeout(initReveal, 120);
}

function _renderCategoryView(route, cfg) {
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const titulo = CAT_TITULO[cfg.cat] || cfg.cat;
  setEl('oc-migas-actual', titulo);
  setEl('oc-cat-titulo',   titulo);
  setEl('cat-contact-title', cfg.contactTitle);
  setEl('cat-contact-desc',  cfg.contactDesc);

  document.getElementById('cat-form-success').classList.remove('show');
  document.getElementById('cat-ct-form').style.display = '';

  const buscador = document.getElementById('oc-buscar-cat');
  if (buscador) { buscador.value = F.q; buscador.placeholder = cfg.cat === '*' ? 'Buscar en todo el catálogo' : `Buscar en ${cfg.cat}`; }
  _pintarVistaToggle();
  _renderCategoryProducts(cfg.cat);
}

/* ── Motor de filtrado ─────────────────────────────────────────── */

function _palabrasQ() { return prepararConsulta(F._qCorr || F.q); }
const _enCat = (p, catName) => catName === '*' || p.categoria === catName;

/* ¿El producto pasa los filtros? `omitir` excluye un grupo para calcular
   sus propios conteos (así "Marca" muestra cuántos hay de cada marca
   dentro de las líneas elegidas, y viceversa). */
function _pasa(p, catName, omitir, palabras) {
  if (!_enCat(p, catName)) return false;
  if (palabras.length && !coincide(p, palabras)) return false;
  if (omitir !== 'cat'  && F.cats.size && !F.cats.has(p.categoria)) return false;
  if (omitir !== 'uso'  && F.usos.size && ![...F.usos].every(u => (p.usos || []).includes(u))) return false;
  if (omitir !== 'sub'   && F.subs.size   && !F.subs.has(p.subcategoria)) return false;
  if (omitir !== 'marca' && F.marcas.size && !F.marcas.has(p.marca))      return false;
  if (omitir !== 'stock' && F.stock && !(Number(p.inventario) > 0))       return false;
  return true;
}

function _ordenar(lista) {
  const nombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base', numeric: true });  // "modelo 2" antes que "modelo 10"
  const precio = p => { const d = getPrecioData(p.precio); return d.sinPrecio ? null : d.final; };
  const hay    = p => (Number(p.inventario) > 0 ? 1 : 0);
  switch (F.orden) {
    case 'nombre':     return lista.sort(nombre);
    case 'existencia': return lista.sort((a, b) => (Number(b.inventario) || 0) - (Number(a.inventario) || 0) || nombre(a, b));
    case 'precio-asc':
    case 'precio-desc': {
      const s = F.orden === 'precio-asc' ? 1 : -1;
      return lista.sort((a, b) => {
        const pa = precio(a), pb = precio(b);
        if (pa == null && pb == null) return nombre(a, b);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * s;
      });
    }
    default: {
      // Con búsqueda: lo que mejor coincide. Sin búsqueda: existencia, foto, lo más nuevo
      const q = F._qCorr || F.q;
      if (q) {
        const t = prepararConsulta(q);
        return lista.sort((a, b) => puntaje(b, q, t) - puntaje(a, q, t) || nombre(a, b));
      }
      return lista.sort((a, b) => hay(b) - hay(a) || (!!b.imageUrl - !!a.imageUrl) || (b._ts || 0) - (a._ts || 0) || nombre(a, b));
    }
  }
}

function _aplicarFiltros(catName) {
  const palabras = _palabrasQ();
  return _ordenar(allProducts.filter(p => _pasa(p, catName, null, palabras)));
}

/* Opciones de un grupo: orden estable (por total en la categoría) con el
   conteo que resulta de los demás filtros activos. */
function _facetas(catName, campo, omitir, seleccion) {
  const palabras = _palabrasQ();
  const total = new Map(), actual = new Map();
  allProducts.forEach(p => {
    const v = p[campo];
    if (!v || !_enCat(p, catName)) return;
    total.set(v, (total.get(v) || 0) + 1);
    if (_pasa(p, catName, omitir, palabras)) actual.set(v, (actual.get(v) || 0) + 1);
  });
  seleccion.forEach(v => { if (!total.has(v)) total.set(v, 0); });
  return [...total.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
    .map(([v]) => [v, actual.get(v) || 0]);
}

/* Facetas de "necesidad": un producto puede tener varios usos */
function _facetasUsos(catName) {
  const palabras = _palabrasQ();
  const total = new Map(), actual = new Map();
  allProducts.forEach(p => {
    if (!_enCat(p, catName)) return;
    const pasa = _pasa(p, catName, 'uso', palabras);
    (p.usos || []).forEach(u => {
      total.set(u, (total.get(u) || 0) + 1);
      if (pasa) actual.set(u, (actual.get(u) || 0) + 1);
    });
  });
  F.usos.forEach(u => { if (!total.has(u)) total.set(u, 0); });
  return [...total.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => [u, actual.get(u) || 0]);
}

/* ── Render principal ──────────────────────────────────────────── */

function _renderCategoryProducts(catName) {
  window._currentCatName = catName;
  window._currentMeta = CAT_META[catName] || { icon: '📦', slug: '' };
  _renderTabs(catName);

  const grid = document.getElementById('categorias-showcase');
  if (!grid) return;

  if (!allProducts.length) {
    grid.className = 'oc-grid';
    grid.innerHTML = '<div class="oc-card oc-card--esqueleto"></div>'.repeat(8);
    document.getElementById('oc-cat-resumen').textContent = 'Cargando catálogo…';
    return;
  }
  _reaplicarFiltros();
}

function _reaplicarFiltros() {
  const catName = window._currentCatName;
  if (!catName || !allProducts.length) return;
  _renderOrden();
  F._qCorr = null;
  let lista = _aplicarFiltros(catName);
  // Sin resultados por un error de dedo: probamos con la palabra más parecida
  if (!lista.length && F.q) {
    const corr = corregirConsulta(F.q, allProducts.filter(p => _enCat(p, catName)));
    if (corr) { F._qCorr = corr; lista = _aplicarFiltros(catName); if (!lista.length) F._qCorr = null; }
  }
  window._currentFilteredProducts = lista;
  _renderResumen(catName);
  _renderFiltros(catName);
  _renderActivos();
  _renderNotaDescuento();
  _renderCurrentPage();
  _syncURL();
}

function _renderNotaDescuento() {
  const el = document.getElementById('oc-nota-desc');
  if (!el) return;
  const pct = getPrecioData(100).pct;
  el.hidden = !pct;
  el.textContent = pct ? `Tu descuento de cliente del ${pct}% ya está aplicado` : '';
}

function _renderTabs(catName) {
  const nav = document.getElementById('oc-cat-tabs');
  if (!nav) return;
  const todo = `<a class="oc-tab${catName === '*' ? ' is-activa' : ''}" href="#buscar" ${catName === '*' ? 'aria-current="page"' : ''}
               onclick="event.preventDefault();navigate('buscar')"><span>Todo</span><span class="oc-tab__n">${allProducts.length.toLocaleString('es-MX')}</span></a>`;
  nav.innerHTML = todo + CATS.map(c => {
    const slug = CAT_META[c].slug;
    const n = allProducts.reduce((s, p) => s + (p.categoria === c ? 1 : 0), 0);
    const activa = c === catName;
    return `<a class="oc-tab${activa ? ' is-activa' : ''}" href="#${slug}" ${activa ? 'aria-current="page"' : ''}
               onclick="event.preventDefault();navigate('${slug}')">
      <span>${c}</span>${n ? `<span class="oc-tab__n">${n.toLocaleString('es-MX')}</span>` : ''}
    </a>`;
  }).join('');
  const activa = nav.querySelector('.is-activa');
  if (activa) nav.scrollLeft = Math.max(0, activa.offsetLeft - 24);
}

function _renderResumen(catName) {
  let total = 0, conStock = 0;
  allProducts.forEach(p => {
    if (!_enCat(p, catName)) return;
    total++;
    if (Number(p.inventario) > 0) conStock++;
  });
  const el = document.getElementById('oc-cat-resumen');
  if (el) el.textContent = `${total.toLocaleString('es-MX')} productos, ${conStock.toLocaleString('es-MX')} con existencia`;
}

function _renderOrden() {
  const sel = document.getElementById('oc-orden');
  if (!sel) return;
  const conPrecio = hayUsuarioLogueado();
  if (!conPrecio && F.orden.startsWith('precio')) F.orden = 'relevancia';
  sel.innerHTML = Object.entries(ORDENES)
    .filter(([k]) => conPrecio || !k.startsWith('precio'))
    .map(([k, v]) => `<option value="${k}"${k === F.orden ? ' selected' : ''}>${v}</option>`).join('');
}

function _grupoHTML(id, titulo, opciones, seleccion, accion, conBuscador) {
  if (opciones.length < 2 && !seleccion.size) return '';
  const LIM = 6;
  const filtro = conBuscador ? normTxt(_buscaMarca).trim() : '';
  const visibles = filtro ? opciones.filter(([n]) => normTxt(n).includes(filtro)) : opciones;
  const abierto = _gruposAbiertos.has(id) || !!filtro;
  const recortar = !abierto && visibles.length > LIM + 2;
  const mostrar = recortar ? visibles.filter(([n], i) => i < LIM || seleccion.has(n)) : visibles;
  const ocultas = visibles.length - mostrar.length;

  const items = mostrar.map(([nom, n]) => {
    const on = seleccion.has(nom);
    const off = !on && n === 0;
    return `<li><label class="oc-check${off ? ' is-off' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} onchange="${accion}('${escJS(nom)}')">
        <span class="oc-check__caja" aria-hidden="true"></span>
        <span class="oc-check__txt">${escHTML(nom)}</span>
        <span class="oc-check__n">${n.toLocaleString('es-MX')}</span>
      </label></li>`;
  }).join('');

  const mas = ocultas > 0
    ? `<button type="button" class="oc-grupo__mas" onclick="verMasGrupo('${id}')">Ver ${ocultas} más</button>`
    : (_gruposAbiertos.has(id) && !filtro && visibles.length > LIM + 2
        ? `<button type="button" class="oc-grupo__mas" onclick="verMasGrupo('${id}')">Ver menos</button>` : '');

  return `<section class="oc-grupo" aria-labelledby="oc-g-${id}">
      <h3 class="oc-grupo__tit" id="oc-g-${id}">${titulo}${seleccion.size ? `<span class="oc-grupo__sel">${seleccion.size}</span>` : ''}</h3>
      ${conBuscador && opciones.length > 8 ? `<div class="oc-grupo__buscar">${ICO.buscar}<input type="search" id="oc-buscar-marca" placeholder="Buscar marca" value="${escHTML(_buscaMarca)}" oninput="filtrarMarcas(this.value)" aria-label="Buscar marca"></div>` : ''}
      <ul class="oc-grupo__lista">${items || '<li class="oc-grupo__vacio">Ninguna marca coincide</li>'}</ul>
      ${mas}
    </section>`;
}

function _grupoHTMLUsos(opciones, seleccion) {
  if (!opciones.length) return '';
  const items = opciones.map(([nom, n, id]) => {
    const on = seleccion.has(nom), off = !on && n === 0;
    return `<li><label class="oc-check${off ? ' is-off' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} onchange="toggleFiltroUso('${id}')">
        <span class="oc-check__caja" aria-hidden="true"></span>
        <span class="oc-check__txt">${escHTML(nom)}</span>
        <span class="oc-check__n">${n.toLocaleString('es-MX')}</span>
      </label></li>`;
  }).join('');
  return `<section class="oc-grupo"><h3 class="oc-grupo__tit">Necesidad${seleccion.size ? `<span class="oc-grupo__sel">${seleccion.size}</span>` : ''}</h3>
      <ul class="oc-grupo__lista">${items}</ul></section>`;
}

function _renderFiltros(catName) {
  const cont = document.getElementById('oc-filtros-cuerpo');
  if (!cont) return;

  const subs   = _facetas(catName, 'subcategoria', 'sub',   F.subs);
  const marcas = _facetas(catName, 'marca',        'marca', F.marcas);
  const cats   = catName === '*' ? _facetas(catName, 'categoria', 'cat', F.cats) : [];
  const usosF  = _facetasUsos(catName).map(([u, n]) => [USOS_POR_ID[u].nombre, n, u]);
  const selUsos = new Set([...F.usos].map(u => USOS_POR_ID[u]?.nombre));
  const palabras = _palabrasQ();
  const conStock = allProducts.reduce((s, p) => s + (_pasa(p, catName, 'stock', palabras) && Number(p.inventario) > 0 ? 1 : 0), 0);

  cont.innerHTML =
    `<section class="oc-grupo">
       <h3 class="oc-grupo__tit">Disponibilidad</h3>
       <label class="oc-switch">
         <input type="checkbox" role="switch" ${F.stock ? 'checked' : ''} onchange="setSoloStock(this.checked)">
         <span class="oc-switch__pista" aria-hidden="true"></span>
         <span class="oc-check__txt">Solo con existencia</span>
         <span class="oc-check__n">${conStock.toLocaleString('es-MX')}</span>
       </label>
     </section>` +
    (cats.length ? _grupoHTML('cat', 'Categoría', cats, F.cats, 'toggleFiltroCat', false) : '') +
    _grupoHTMLUsos(usosF, selUsos) +
    _grupoHTML('linea', 'Línea', subs, F.subs, 'toggleFiltroSub', false) +
    _grupoHTML('marca', 'Marca', marcas, F.marcas, 'toggleFiltroMarca', true);

  const n = (window._currentFilteredProducts || []).length;
  const verBtn = document.getElementById('oc-ver-n');
  if (verBtn) verBtn.textContent = n ? `Ver ${n.toLocaleString('es-MX')} producto${n === 1 ? '' : 's'}` : 'Sin resultados';

  const activos = F.subs.size + F.marcas.size + F.cats.size + F.usos.size + (F.stock ? 1 : 0);
  const badge = document.getElementById('oc-filtros-n');
  if (badge) { badge.textContent = activos; badge.hidden = !activos; }
}

function _renderActivos() {
  const cont = document.getElementById('oc-activos');
  if (!cont) return;
  const pills = [];
  F.subs.forEach(v => pills.push(['sub', v, v]));
  F.marcas.forEach(v => pills.push(['marca', v, v]));
  F.cats.forEach(v => pills.push(['cat', v, v]));
  F.usos.forEach(v => pills.push(['uso', v, USOS_POR_ID[v]?.nombre || v]));
  if (F.stock) pills.push(['stock', '', 'Con existencia']);
  if (F.q) pills.push(['q', '', F._qCorr ? `“${F._qCorr}” (buscaste “${F.q}”)` : `“${F.q}”`]);
  cont.innerHTML = pills.length
    ? pills.map(([t, v, label]) =>
        `<button type="button" class="oc-pill" onclick="quitarFiltro('${t}','${escJS(v)}')" aria-label="Quitar filtro ${escHTML(label)}">${escHTML(label)}${ICO.cerrar}</button>`
      ).join('') + `<button type="button" class="oc-pill-limpiar" onclick="limpiarFiltros()">Quitar filtros</button>`
    : '';
}

function _renderCurrentPage() {
  const grid  = document.getElementById('categorias-showcase');
  if (!grid) return;
  const lista = window._currentFilteredProducts || [];
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  window._currentPage = Math.min(Math.max(1, window._currentPage || 1), paginas);
  const ini = (window._currentPage - 1) * ITEMS_PER_PAGE;
  const fin = Math.min(ini + ITEMS_PER_PAGE, total);

  const totalEl = document.getElementById('oc-total');
  if (totalEl) totalEl.textContent = total === 1 ? '1 producto' : `${total.toLocaleString('es-MX')} productos`;

  if (!total) {
    grid.className = 'oc-grid';
    grid.innerHTML = `<div class="oc-vacio">
        ${ICO.vacio}
        <h3>${F.q ? `Nada coincide con “${escHTML(F.q)}”` : 'Ningún producto coincide'}</h3>
        <p>Quita algún filtro o prueba con otra palabra. Si no lo encuentras, pregúntanos: muchas piezas las conseguimos sobre pedido.</p>
        <div class="oc-vacio__acciones">
          <button type="button" class="oc-btn" onclick="limpiarFiltros()">Quitar filtros</button>
          <button type="button" class="oc-btn oc-btn--sec" onclick="pedirPorWhatsApp()">${ICO.whatsapp}Preguntar por WhatsApp</button>
        </div>
      </div>`;
    _renderPaginacion(1, 0, 0, 0);
    return;
  }

  grid.className = `oc-grid${_vistaLista ? ' es-lista' : ''}`;
  grid.innerHTML = lista.slice(ini, fin)
    .map(p => _renderProductCard(p, window._currentCatName, window._currentMeta)).join('');
  _renderPaginacion(paginas, ini, fin, total);
}

function _renderPaginacion(paginas, ini, fin, total) {
  const nav = document.getElementById('pagination-container');
  if (!nav) return;
  if (!total) { nav.innerHTML = ''; return; }
  const info = `<p class="oc-pag__info">Mostrando ${(ini + 1).toLocaleString('es-MX')}–${fin.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')}</p>`;
  if (paginas <= 1) { nav.innerHTML = info; return; }

  const cur = window._currentPage;
  const set = new Set([1, paginas, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= paginas));
  const nums = [...set].sort((a, b) => a - b);
  let html = '', prev = 0;
  nums.forEach(n => {
    if (n - prev > 1) html += '<span class="oc-pag__gap" aria-hidden="true">…</span>';
    html += `<button type="button" class="oc-pag__num${n === cur ? ' is-actual' : ''}" ${n === cur ? 'aria-current="page"' : ''} onclick="goToSpecificPage(${n})" aria-label="Página ${n}">${n}</button>`;
    prev = n;
  });

  nav.innerHTML = `
    <div class="oc-pag__ctrl">
      <button type="button" class="oc-pag__flecha" ${cur <= 1 ? 'disabled' : ''} onclick="goToPage(-1)" aria-label="Página anterior">${ICO.izq}<span>Anterior</span></button>
      <div class="oc-pag__nums">${html}</div>
      <button type="button" class="oc-pag__flecha" ${cur >= paginas ? 'disabled' : ''} onclick="goToPage(1)" aria-label="Página siguiente"><span>Siguiente</span>${ICO.der}</button>
    </div>${info}`;
}

function _irAResultados() {
  const ancla = document.getElementById('oc-resultados');
  if (!ancla) return;
  const top = ancla.getBoundingClientRect().top + window.scrollY - (document.getElementById('main-nav')?.offsetHeight || 68) - 12;
  if (window.scrollY > top) {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, top);
    document.documentElement.style.scrollBehavior = '';
  }
}

window.goToPage = function(dir) {
  window._currentPage += dir;
  _renderCurrentPage(); _syncURL(); _irAResultados();
};
window.goToSpecificPage = function(n) {
  window._currentPage = n;
  _renderCurrentPage(); _syncURL(); _irAResultados();
};

/* ── Acciones de filtros ───────────────────────────────────────── */

function _alternar(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
function _filtrosCambiaron() { window._currentPage = 1; _reaplicarFiltros(); }

window.toggleFiltroSub   = v => { _alternar(F.subs, v);   _filtrosCambiaron(); };
window.toggleFiltroMarca = v => { _alternar(F.marcas, v); _filtrosCambiaron(); };
window.toggleFiltroCat   = v => { _alternar(F.cats, v);   _filtrosCambiaron(); };
window.toggleFiltroUso   = v => { _alternar(F.usos, v);   _filtrosCambiaron(); };
window.setSoloStock      = on => { F.stock = !!on; _filtrosCambiaron(); };
window.setOrden          = v => { F.orden = ORDENES[v] ? v : 'relevancia'; _filtrosCambiaron(); };

let _qTimer = null;
window.buscarEnCategoria = function(v) {
  clearTimeout(_qTimer);
  _qTimer = setTimeout(() => { F.q = String(v || '').trim().slice(0, 60); _filtrosCambiaron(); }, 220);
};
window.setFiltroQ = v => {
  F.q = String(v || '').trim().slice(0, 60);
  const b = document.getElementById('oc-buscar-cat'); if (b) b.value = F.q;
  _filtrosCambiaron();
};

window.quitarFiltro = function(tipo, v) {
  if (tipo === 'sub') F.subs.delete(v);
  else if (tipo === 'marca') F.marcas.delete(v);
  else if (tipo === 'cat') F.cats.delete(v);
  else if (tipo === 'uso') F.usos.delete(v);
  else if (tipo === 'stock') F.stock = false;
  else if (tipo === 'q') return window.setFiltroQ('');
  _filtrosCambiaron();
};

window.limpiarFiltros = function() {
  F.subs.clear(); F.marcas.clear(); F.cats.clear(); F.usos.clear(); F.stock = false; F.q = ''; F._qCorr = null; _buscaMarca = '';
  const b = document.getElementById('oc-buscar-cat'); if (b) b.value = '';
  _filtrosCambiaron();
};

window.filtrarMarcas = function(v) {
  _buscaMarca = v;
  _renderFiltros(window._currentCatName);
  const input = document.getElementById('oc-buscar-marca');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
};

window.verMasGrupo = function(id) {
  _alternar(_gruposAbiertos, id);
  _renderFiltros(window._currentCatName);
};

function _pintarVistaToggle() {
  document.getElementById('oc-vista-cuadricula')?.setAttribute('aria-pressed', String(!_vistaLista));
  document.getElementById('oc-vista-lista')?.setAttribute('aria-pressed', String(_vistaLista));
}
window.setVista = function(modo) {
  _vistaLista = modo === 'lista';
  try { localStorage.setItem('oc_vista', _vistaLista ? 'lista' : 'cuadricula'); } catch (_) {}
  _pintarVistaToggle();
  _renderCurrentPage();
};

/* Panel de filtros en celular (hoja inferior) */
window.abrirFiltros = function() {
  document.getElementById('oc-filtros')?.classList.add('open');
  document.getElementById('oc-filtros-fondo')?.classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.cerrarFiltros = function() {
  const panel = document.getElementById('oc-filtros');
  if (!panel?.classList.contains('open')) return;
  panel.classList.remove('open');
  document.getElementById('oc-filtros-fondo')?.classList.remove('open');
  document.body.style.overflow = '';
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarFiltros(); });

/* WhatsApp desde la categoría */
window.pedirPorWhatsApp = function() {
  const cat = window._currentCatName || '';
  let msg = `Hola OrbisCORP, busco un producto${cat && cat !== '*' ? ` de ${cat}` : ''} que no encontré en la tienda`;
  if (F.q) msg += `: "${F.q}"`;
  msg += '. ¿Lo tienen o lo pueden conseguir?';
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};
window.consultarProducto = function(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const msg = `Hola OrbisCORP, ¿cuándo tendrán disponible este producto?\n\n*${p.nombre}*\nSKU: ${p.sku || '—'}\n${_urlProducto(p.id)}`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};

/* ── Tarjeta de producto ───────────────────────────────────────── */

function _stockHTML(p) {
  const inv = p.inventario != null ? Number(p.inventario) : null;
  if (inv === null) return '';
  if (inv <= 0) return '<span class="oc-stock is-agotado">Agotado</span>';
  if (inv === 1) return '<span class="oc-stock is-poco">Última pieza</span>';
  if (inv <= 5)  return `<span class="oc-stock is-poco">Últimas ${inv} piezas</span>`;
  return `<span class="oc-stock">${inv.toLocaleString('es-MX')} en existencia</span>`;
}

function _precioCardHTML(p) {
  if (!hayUsuarioLogueado()) {
    return `<button type="button" class="oc-precio-lock" onclick="openLoginCliente()">${ICO.candado}<span>Inicia sesión para ver precio</span></button>`;
  }
  const pd = getPrecioData(p.precio);
  if (pd.sinPrecio) return '<p class="oc-precio is-consultar">Precio a consultar</p>';
  return `<p class="oc-precio">
      ${pd.hasDiscount ? `<s>${fmtPrice(pd.original)}</s>` : ''}
      <strong>${fmtPrice(pd.final)}</strong><span class="oc-precio__iva">+ IVA</span>
    </p>`;
}

function _accionesCardHTML(p) {
  const id   = escJS(p.id);
  const inv  = p.inventario != null ? Number(p.inventario) : null;
  const item = cart.find(c => c.id === p.id);
  if (inv !== null && inv <= 0) {
    return `<button type="button" class="oc-add oc-add--sec" onclick="abrirAvisame('${id}')">${ICO.campana}<span>Avísame cuando llegue</span></button>`;
  }
  if (item) {
    const tope = inv !== null && item.qty >= inv;
    return `<div class="oc-qty" role="group" aria-label="Cantidad en el carrito">
        <button type="button" onclick="changeQty('${id}',-1)" aria-label="Quitar una pieza">−</button>
        <span aria-live="polite"><b>${item.qty}</b> en carrito</span>
        <button type="button" onclick="changeQty('${id}',1)" ${tope ? 'disabled' : ''} aria-label="Agregar una pieza">+</button>
      </div>`;
  }
  return `<button type="button" class="oc-add" onclick="addToCart('${id}')">${ICO.carrito}<span>Agregar<span class="oc-add__largo"> al carrito</span></span></button>`;
}

function _renderProductCard(p, catName, meta) {
  const id   = escJS(p.id);
  const idH  = escHTML(p.id);
  const href = `?p=${encodeURIComponent(p.id)}`;
  const pd   = getPrecioData(p.precio);
  const agotado = p.inventario != null && Number(p.inventario) <= 0;
  const media = p.imageUrl
    ? _imgTag(p.imageUrl, p.nombre || '')
    : `<span class="oc-card__sinfoto">${ICO_CAT[p.categoria] || ICO_CAT['Ferretería']}</span>`;

  const vars = _varianteDe(p);
  const esFav = favoritos.has(p.id);
  return `<article class="oc-card${agotado ? ' is-agotado' : ''}">
    <div class="oc-card__mediawrap">
      <a class="oc-card__media" href="${href}" onclick="event.preventDefault();openQV('${id}')" tabindex="-1" aria-hidden="true">${media}</a>
      <button type="button" class="oc-fav" data-fav="${idH}" aria-pressed="${esFav}" onclick="event.stopPropagation();toggleFav('${id}')" aria-label="${esFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}">${ICO.corazon}</button>
      <div class="admin-img-trigger" onclick="event.stopPropagation();triggerProdImgUp('${id}')">
        <div class="admin-img-trigger-label">Cambiar imagen</div>
        <input type="file" class="admin-img-input" accept="image/*" id="pimg-${idH}" onclick="event.stopPropagation()" onchange="handleProdImgUp(this,'${id}')">
      </div>
    </div>
    <div class="oc-card__body">
      <div class="oc-card__info">
        <div class="oc-card__meta">
          ${p.marca ? `<span class="oc-card__marca">${escHTML(p.marca)}</span>` : '<span></span>'}
          ${p.sku ? `<span class="oc-card__sku" title="Código">${escHTML(p.sku)}</span>` : ''}
        </div>
        <h3 class="oc-card__nombre"><a href="${href}" onclick="event.preventDefault();openQV('${id}')">${escHTML(p.nombre)}</a></h3>
        ${vars.length > 1 ? `<button type="button" class="oc-card__var" onclick="openQV('${id}')">Disponible en ${vars.length} ${p._tipoVariante || 'opciones'}</button>` : ''}
        ${_stockHTML(p)}
      </div>
      <div class="oc-card__pie">
        ${_precioCardHTML(p)}
        <div class="oc-card__accion" data-acc="${idH}">${_accionesCardHTML(p)}</div>
      </div>
      <div class="prod-card-admin-bar">
        <button class="padmin-btn" onclick="openProductModal('${id}')">✎ Editar</button>
        <button class="padmin-btn danger" onclick="deleteProduct('${id}')">✕ Eliminar</button>
      </div>
    </div>
  </article>`;
}

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

/* Portada de categoría: collage con fotos reales del catálogo; si no hay
   fotos todavía, un ícono propio sobre el color de la categoría. */
function _portadaCategoria(catName) {
  const meta = CAT_META[catName];
  const fotos = allProducts.filter(p => p.categoria === catName && p.imageUrl)
    .sort((a, b) => (b.esPortada - a.esPortada) || ((Number(b.inventario) > 0) - (Number(a.inventario) > 0)))
    .slice(0, 4);
  if (fotos.length >= 1) {
    const cls = fotos.length >= 4 ? 'is-4' : fotos.length >= 2 ? 'is-2' : 'is-1';
    return `<div class="sc-collage ${cls}">${fotos.slice(0, fotos.length >= 4 ? 4 : fotos.length >= 2 ? 2 : 1).map(p => _imgTag(p.imageUrl, p.nombre)).join('')}</div>`;
  }
  const lineas = [...new Set(allProducts.filter(p => p.categoria === catName && p.subcategoria).map(p => p.subcategoria))].slice(0, 4);
  return `<div class="sc-portada" style="--tono:${meta.tono}">
      <span class="sc-portada__ico">${ICO_CAT[catName]}</span>
      ${lineas.length ? `<ul class="sc-portada__lineas">${lineas.map(l => `<li>${escHTML(l)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

function renderShowroom() {
  const g = document.getElementById('showroom-grid');
  if (!g) return;
  g.innerHTML = CATS.map(catName => {
    const meta = CAT_META[catName];
    const totalCatProds = allProducts.filter(p => p.categoria === catName).length;
    if (totalCatProds === 0) return _renderEmptyShowcaseCard(catName, meta);
    const conStock = allProducts.filter(p => p.categoria === catName && Number(p.inventario) > 0).length;

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
        ${_portadaCategoria(catName)}
        <div class="sc-img-overlay" aria-hidden="true" style="pointer-events: none;">
          <span class="sc-img-badge">Explorar catálogo →</span>
        </div>
      </div>
      <div class="sc-body" style="text-align: center; padding: 24px 20px;">
        <div class="sc-name" style="font-size: 1.25rem; margin-bottom: 6px;">${CAT_TITULO[catName] || catName}</div>
        <div class="sc-desc" style="margin-bottom: 0;">${totalCatProds.toLocaleString('es-MX')} productos · ${conStock.toLocaleString('es-MX')} con existencia</div>
      </div>
      <div class="sc-admin-bar" aria-hidden="true">
        <button class="padmin-btn" onclick="event.stopPropagation();navigate('${meta.slug}')">◈ Gestionar Catálogo</button>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   HOME: necesidades, destacados y vistos recientemente
═══════════════════════════════════════════════ */

function _miniCardHTML(p) {
  const id = escJS(p.id);
  const pd = getPrecioData(p.precio);
  const precio = !hayUsuarioLogueado() ? '<span class="mini__lock">Precio con sesión</span>'
    : pd.sinPrecio ? '<span class="mini__lock">Precio a consultar</span>' : `<strong>${fmtPrice(pd.final)}</strong>`;
  const media = p.imageUrl ? _imgTag(p.imageUrl, p.nombre) : `<span class="mini__sinfoto">${ICO_CAT[p.categoria] || ICO_CAT['Ferretería']}</span>`;
  return `<button type="button" class="mini" onclick="openQV('${id}')">
      <span class="mini__media">${media}</span>
      <span class="mini__marca">${escHTML(p.marca || p.subcategoria || p.categoria || '')}</span>
      <span class="mini__nombre">${escHTML(p.nombre)}</span>
      <span class="mini__pie">${precio}${Number(p.inventario) > 0 ? '' : '<em>Agotado</em>'}</span>
    </button>`;
}

function _destacados() {
  // Primero lo que el admin marcó, luego lo que tiene foto, luego lo de más valor en existencia
  const pts = p => (p.destacado || p.esPortada ? 1e7 : 0) + (p.imageUrl ? 1e6 : 0) - (p._calidad?.sinNombre ? 5e5 : 0)
    + (Number(p.precio) || 0) * Math.min(Number(p.inventario) || 0, 20);
  const porCat = {};
  allProducts.filter(p => Number(p.inventario) > 0)
    .sort((a, b) => pts(b) - pts(a) || (Number(b.inventario) - Number(a.inventario)))
    .forEach(p => { (porCat[p.categoria] ||= []).push(p); });
  // Alternamos categorías para que no salgan 12 guantes seguidos
  const out = [], vistosGrupo = new Set();
  for (let r = 0; out.length < 12 && r < 30; r++) {
    CATS.forEach(c => {
      const lista = porCat[c] || [];
      while (lista.length) {
        const p = lista.shift();
        const g = p._grupo || p.id;
        if (vistosGrupo.has(g)) continue;
        vistosGrupo.add(g); out.push(p); break;
      }
    });
  }
  return out.slice(0, 12);
}

function renderHome() {
  const nec = document.getElementById('home-necesidades-grid');
  if (nec && allProducts.length) {
    const cuenta = u => allProducts.reduce((s, p) => s + ((p.usos || []).includes(u) ? 1 : 0), 0);
    nec.innerHTML = USOS.map(u => [u, cuenta(u.id)]).filter(([, n]) => n > 0).map(([u, n]) =>
      `<button type="button" class="nec" onclick="navigate('buscar', { uso: '${u.id}' })">
         <span class="nec__ico">${ICO_USO[u.id] || ''}</span>
         <span class="nec__txt"><strong>${u.nombre}</strong><small>${u.sub}</small></span>
         <span class="nec__n">${n}</span>
       </button>`).join('');
  }
  const dest = document.getElementById('home-destacados-fila');
  if (dest && allProducts.length) dest.innerHTML = _destacados().map(_miniCardHTML).join('');

  const rec = document.getElementById('home-recientes');
  const recFila = document.getElementById('home-recientes-fila');
  if (rec && recFila) {
    const lista = vistos.map(id => allProducts.find(p => p.id === id)).filter(Boolean).slice(0, 12);
    rec.hidden = !lista.length;
    recFila.innerHTML = lista.map(_miniCardHTML).join('');
  }
}

window.borrarVistos = function() {
  vistos = []; _guardarLS(LS_VISTOS_KEY, vistos); renderHome();
};
function _registrarVisto(id) {
  vistos = [id, ...vistos.filter(x => x !== id)].slice(0, 20);
  _guardarLS(LS_VISTOS_KEY, vistos);
}

/* Desplazar carruseles con flechas (escritorio) */
window.moverFila = function(id, dir) {
  const el = document.getElementById(id);
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
};

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

/* Lo que se guarda de cada producto en el carrito: lo justo para mostrarlo.
   Precio y stock se refrescan contra el catálogo cada vez que carga. */
function _itemCarrito(p, qty) {
  return {
    id: p.id, qty,
    nombre: p.nombre || '', sku: p.sku || '', categoria: p.categoria || '',
    imageUrl: p.imageUrl || '',
    precio: p.precio ?? null, precio_con_iva: p.precio_con_iva ?? null,
    inventario: p.inventario ?? null
  };
}
function _slimCart() { return cart.map(i => _itemCarrito(i, i.qty)); }

/* Pone al día precios, stock y nombres del carrito con el catálogo vigente.
   Antes el carrito guardaba una foto vieja del producto para siempre. */
function _rehidratarCarrito() {
  if (!allProducts.length || !cart.length) return;
  const mapa = new Map(allProducts.map(p => [p.id, p]));
  let ajustado = false;
  cart = cart.map(item => {
    const p = mapa.get(item.id);
    if (!p) return item;
    const nuevo = _itemCarrito(p, item.qty);
    const inv = nuevo.inventario != null ? Number(nuevo.inventario) : null;
    if (inv !== null && inv > 0 && nuevo.qty > inv) { nuevo.qty = inv; ajustado = true; }
    return nuevo;
  });
  if (ajustado) showToast('Ajustamos cantidades del carrito al stock disponible', 'ℹ️');
  try { localStorage.setItem(LS_CART_KEY, JSON.stringify(_slimCart())); } catch (_) {}
}

async function persistCart() {
  // 1. Guardar localmente siempre
  try { localStorage.setItem(LS_CART_KEY, JSON.stringify(_slimCart())); } catch (_) {}

  // 2. Sincronizar con Firestore si hay cliente (debounced 800ms para no saturar)
  if (currentCustomer?.uid) {
    clearTimeout(_cartSyncTimer);
    _cartSyncTimer = setTimeout(() => _syncCartToFirestore(), 800);
  }
}

async function _syncCartToFirestore() {
  _cartSyncTimer = null;
  if (!currentCustomer?.uid) return;
  updateSyncChip('syncing');
  try {
    /* setDoc con merge: si el perfil no existe lo crea, si existe solo toca estos campos */
    await setDoc(doc(db, 'clientes', currentCustomer.uid), {
      carrito:          _slimCart(),
      carritoUpdatedAt: serverTimestamp()
    }, { merge: true });
    updateSyncChip('synced');
  } catch (e) {
    console.error('[CART] Error sincronizando con Firestore:', e?.code, e);
    updateSyncChip('error');
  }
}

window.vaciarCarrito = function() {
  if (!cart.length || !confirm('¿Vaciar el carrito?')) return;
  const ids = cart.map(c => c.id);
  cart = [];
  persistCart();
  updateCartUI();
  ids.forEach(_refreshProductCardBtn);
};

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

  const count     = cart.reduce((s, i) => s + i.qty, 0);
  const conPrecio = cart.filter(i => !getPrecioData(i.precio).sinPrecio);
  const total     = conPrecio.reduce((s, i) => s + getPrecioData(i.precio).final * i.qty, 0);
  const pendientes = cart.length - conPrecio.length;

  // Badges de navegación
  ['cart-badge', 'mbn-cart-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent    = count > 99 ? '99+' : count;
    el.style.display  = count > 0 ? 'flex' : 'none';
  });

  const body = document.getElementById('cart-body');
  const foot = document.getElementById('cart-foot');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">🛒</div>
        <p class="cart-empty-text">Tu carrito está vacío.<br>Explora nuestra tienda para encontrar lo que necesitas.</p>
        <button class="sc-cta ripple-host" style="margin-top:18px" onclick="closeCart();navigate('home');setTimeout(scrollToCatalog,200)">Explorar catálogo →</button>
      </div>`;
    if (foot) foot.style.display = 'none';
    return;
  }

  body.innerHTML = cart.map(item => {
    const inv     = item.inventario != null ? Number(item.inventario) : null;
    const atLimit = inv !== null && item.qty >= inv;
    const catMeta = CAT_META[item.categoria] || { icon: '📦' };
    const id      = escJS(item.id);
    const nombre  = escHTML(item.nombre);
    const pd      = getPrecioData(item.precio);
    const precio  = pd.sinPrecio
      ? renderPriceHTML(pd)
      : renderPriceHTML({ ...pd, original: pd.original * item.qty, final: pd.final * item.qty }) + (hayUsuarioLogueado() ? ' MXN' : '');

    return `<div class="cart-item" role="listitem">
      <div class="cart-item-img">
        ${item.imageUrl
          ? _imgTag(item.imageUrl, item.nombre)
          : `<div style="font-size:1.8rem;line-height:1;display:flex;align-items:center;justify-content:center;height:100%" aria-hidden="true">${catMeta.icon}</div>`}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name" title="${nombre}">${nombre}</div>
        ${item.sku ? `<div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-3);margin-bottom:2px">SKU: ${escHTML(item.sku)}</div>` : ''}
        <div class="cart-item-price">${precio}</div>
        <div class="cart-item-qty" role="group" aria-label="Cantidad de ${nombre}">
          <button class="qty-btn" onclick="changeQty('${id}',-1)" aria-label="Reducir cantidad">−</button>
          <input class="qty-val" type="number" inputmode="numeric" min="1" ${inv !== null && inv > 0 ? `max="${inv}"` : ''} value="${item.qty}" onchange="setQty('${id}', this.value)" aria-label="Cantidad de ${nombre}">
          <button class="qty-btn" onclick="changeQty('${id}',1)" ${atLimit ? 'disabled aria-disabled="true"' : ''} aria-label="Aumentar cantidad">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${id}')" aria-label="Eliminar ${nombre} del carrito">✕</button>
    </div>`;
  }).join('');

  if (foot) {
    foot.style.display = 'block';
    const totalEl = document.getElementById('cart-total');
    const ivaEl = document.getElementById('cart-total-iva');
    if (hayUsuarioLogueado()) {
      totalEl.textContent = `${fmtPrice(total)} MXN`;
      totalEl.title = pendientes ? `${pendientes} producto(s) con precio por confirmar` : '';
      if (ivaEl) ivaEl.textContent = total ? `${fmtPrice(total * 1.16)} MXN con IVA · ${count} pieza${count === 1 ? '' : 's'}` : '';
    } else {
      totalEl.textContent = '🔒 Inicia sesión';
      if (ivaEl) ivaEl.textContent = `${count} pieza${count === 1 ? '' : 's'} en tu carrito`;
    }
    const notaEl = document.getElementById('cart-nota');
    if (notaEl && document.activeElement !== notaEl) notaEl.value = _notaPedido();
    const nota = document.getElementById('cart-pendientes');
    if (nota) {
      nota.textContent = pendientes && hayUsuarioLogueado()
        ? `+ ${pendientes} producto${pendientes > 1 ? 's' : ''} con precio por confirmar`
        : '';
      nota.style.display = nota.textContent ? 'block' : 'none';
    }
    updateSyncChip(currentCustomer ? (_cartSyncTimer ? 'syncing' : 'synced') : 'local');
  }
}

window.setQty = function(productId, valor) {
  const item = cart.find(c => c.id === productId);
  if (!item) return;
  let n = Math.floor(Number(valor));
  if (!Number.isFinite(n) || n < 0) n = item.qty;
  if (n === 0) { window.removeFromCart(productId); return; }
  const inv = item.inventario != null ? Number(item.inventario) : null;
  if (inv !== null && inv > 0 && n > inv) { n = inv; showToast(`Solo hay ${inv} en existencia`, '⚠️'); }
  item.qty = n;
  persistCart();
  updateCartUI();
  _refreshProductCardBtn(productId);
};

function _notaPedido() { return String(_leerLS(LS_NOTA_KEY, '') || ''); }
window.guardarNotaPedido = v => _guardarLS(LS_NOTA_KEY, String(v || '').slice(0, 500));

window.compartirCarrito = async function() {
  if (!cart.length) return;
  const lista = cart.map(i => `${i.sku || i.id}*${i.qty}`).join(';');
  const url = `${location.origin}${location.pathname}?carrito=${encodeURIComponent(lista)}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Lista de productos OrbisCORP', text: 'Esta es la lista que necesitamos:', url }); return; }
    await navigator.clipboard.writeText(url);
    showToast('Enlace copiado: compártelo por WhatsApp o correo', '🔗');
  } catch (_) { /* el usuario canceló */ }
};

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
    cart.push(_itemCarrito(p, 1));
  }

  persistCart();
  updateCartUI();
  _refreshProductCardBtn(productId);
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
  _refreshProductCardBtn(productId);
};

function _refreshProductCardBtn(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  document.querySelectorAll(`[data-acc="${CSS.escape(productId)}"]`).forEach(el => { el.innerHTML = _accionesCardHTML(p); });
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
  const conSesion = hayUsuarioLogueado();
  let total = 0, pendientes = 0;

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
    msg += ` × ${i.qty}`;
    if (conSesion) {
      if (pData.sinPrecio) { msg += ' — precio por confirmar'; pendientes++; }
      else {
        if (pData.hasDiscount) msg += ` [-${pData.pct}%]`;
        msg += ` = ${fmtPrice(pData.final * i.qty)} MXN`;
        total += pData.final * i.qty;
      }
    }
    msg += '\n';
  });
  if (conSesion) {
    msg += `\n*Total estimado: ${fmtPrice(total)} MXN + IVA*\n`;
    if (pendientes) msg += `_(${pendientes} producto(s) con precio por confirmar)_\n`;
  }
  const notaPedido = _notaPedido().trim();
  if (notaPedido) msg += `\n*Notas del pedido:* ${notaPedido}\n`;
  msg += '\n¿Pueden confirmar disponibilidad y precio final? Gracias.';

  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errEl.textContent = 'Por favor ingresa un correo válido.';
    errEl.classList.add('show');
    emailEl.focus();
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = '⟳ Generando PDF...';

  try {
    /* El servidor identifica al cliente por su sesión: solo mandamos el nombre
       para el caso de invitados. Precios y descuentos se calculan allá. */
    const payload = {
      items: cart.map(i => ({ productId: i.id, cantidad: i.qty || 1 })),
      correoInvitado: email,
      cliente: { nombre }
    };

    const generarCotizacionCall = httpsCallable(functionsClient, 'generarCotizacion');
    const { data: res } = await generarCotizacionCall(payload);

    let txt = `✓ Cotización ${res.folio || ''} enviada a ${email}`;
    if (res.omitidos) txt += ` (${res.omitidos} producto(s) ya no están disponibles y se omitieron)`;
    sucEl.textContent   = txt;
    sucEl.style.display = 'block';
    showToast('Cotización enviada. Revisa tu correo (y la carpeta de spam).', '📄', 5000);
    setTimeout(() => { cerrarModalCotizacion(); closeCart(); }, 3200);

  } catch (e) {
    console.error('[COT ERROR]', e);
    const legibles = ['functions/resource-exhausted', 'functions/invalid-argument', 'functions/not-found'];
    errEl.textContent = legibles.includes(e?.code) && e.message
      ? e.message
      : 'No pudimos enviar la cotización. Intenta de nuevo o pídela por WhatsApp.';
    errEl.classList.add('show');
    btnEl.disabled    = false;
    btnEl.textContent = 'Enviar Cotización →';
  }
};

/* ══════════════════════════════════════════════
   QUICK VIEW Y SELECTOR DE CANTIDAD
═══════════════════════════════════════════════ */

let currentQvProductId = null;
let currentQvQty = 1;

/* Ficha técnica: datos reales y ordenados en lugar de un párrafo genérico */
function _renderFicha(p) {
  const dl = document.getElementById('qv-ficha');
  if (!dl) return;
  const inv = p.inventario != null ? Number(p.inventario) : null;
  const sp = p.specs || {};
  const usos = (p.usos || []).map(u => USOS_POR_ID[u]?.nombre).filter(Boolean).join(', ');
  const filas = [
    ['Código',        p.sku],
    ['Marca',         p.marca],
    ['Línea',         p.subcategoria],
    ['Categoría',     p.categoria ? (CAT_TITULO[p.categoria] || p.categoria) : null],
    ['Talla',         sp.talla],
    ['Color',         sp.color],
    ['Medidas',       sp.medidas],
    ['Contenido',     sp.contenido],
    ['Reducción de ruido', sp.reduccion],
    ['Modelo',        sp.modelo],
    ['Ideal para',    usos],
    ['Existencia',    inv === null ? null : inv <= 0 ? 'Agotado' : `${inv.toLocaleString('es-MX')} ${p.unidad === 'Par' ? (inv === 1 ? 'par' : 'pares') : (inv === 1 ? 'pieza' : 'piezas')}`],
    ['Se vende por',  p.unidad || 'Pieza']
  ].filter(([, v]) => v);
  dl.innerHTML = filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${escHTML(v)}</dd></div>`).join('');
}

/* Selector de talla / color: cada opción es un producto con su propio código y stock */
function _renderVariantesQV(p) {
  const cont = document.getElementById('qv-variantes');
  if (!cont) return;
  const vars = _varianteDe(p);
  if (vars.length < 2) { cont.innerHTML = ''; cont.hidden = true; return; }
  const titulo = p._tipoVariante === 'tallas' ? 'Talla' : p._tipoVariante === 'colores' ? 'Color' : 'Opciones';
  cont.hidden = false;
  cont.innerHTML = `<div class="qv-var__tit">${titulo}: <strong>${escHTML(p._variante || '')}</strong></div>
    <div class="qv-var__ops" role="radiogroup" aria-label="${titulo}">
      ${vars.map(v => {
        const sinStock = v.inventario != null && Number(v.inventario) <= 0;
        const actual = v.id === p.id;
        return `<button type="button" role="radio" aria-checked="${actual}" class="qv-var__op${actual ? ' is-actual' : ''}${sinStock ? ' is-agotado' : ''}"
                  onclick="openQV('${escJS(v.id)}')" title="${sinStock ? 'Agotado' : escHTML(`${v.inventario ?? ''} en existencia`)}">${escHTML(v._variante || v.sku)}</button>`;
      }).join('')}
    </div>`;
}

/* "También te puede interesar": misma línea, otro modelo, con existencia primero */
function _renderRelacionadosQV(p) {
  const cont = document.getElementById('qv-relacionados');
  if (!cont) return;
  const mismoGrupo = new Set(_varianteDe(p).map(v => v.id));
  const vistosG = new Set();
  const cand = allProducts.filter(x => x.id !== p.id && !mismoGrupo.has(x.id) && x.categoria === p.categoria &&
      (x.subcategoria && x.subcategoria === p.subcategoria || (p.usos || []).some(u => (x.usos || []).includes(u))))
    .sort((a, b) => ((Number(b.inventario) > 0) - (Number(a.inventario) > 0)) || (!!b.imageUrl - !!a.imageUrl) ||
                    ((b.subcategoria === p.subcategoria) - (a.subcategoria === p.subcategoria)))
    .filter(x => { const g = x._grupo || x.id; if (vistosG.has(g)) return false; vistosG.add(g); return true; })
    .slice(0, 8);
  cont.hidden = !cand.length;
  cont.innerHTML = cand.length ? `<h3 class="qv-rel__tit">También te puede interesar</h3>
    <div class="qv-rel__fila">${cand.map(_miniCardHTML).join('')}</div>` : '';
}

/* Datos estructurados del producto para Google */
function _jsonLdProducto(p) {
  let el = document.getElementById('ld-producto');
  if (!p) { el?.remove(); return; }
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-producto'; document.head.appendChild(el); }
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, sku: p.sku, description: p.desc,
    category: [p.categoria, p.subcategoria].filter(Boolean).join(' > '), url: _urlProducto(p.id) };
  if (p.marca) ld.brand = { '@type': 'Brand', name: p.marca };
  if (p.imageUrl) ld.image = p.imageUrl;
  el.textContent = JSON.stringify(ld);
}

function _urlProducto(id) {
  return `${location.origin}${location.pathname}?p=${encodeURIComponent(id)}`;
}

window.openQV = function(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  currentQvProductId = productId;
  currentQvQty = 1;

  const img = document.getElementById('qv-img');
  const ph  = document.getElementById('qv-placeholder');
  if (p.imageUrl) {
    img.src = p.imageUrl; img.alt = p.nombre || ''; img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  } else {
    img.removeAttribute('src'); img.style.display = 'none';
    if (ph) { ph.innerHTML = ICO_CAT[p.categoria] || ICO_CAT['Ferretería']; ph.style.display = 'block'; }
  }

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('qv-cat-badge-icon', CAT_META[p.categoria]?.icon || '📦');
  setEl('qv-cat-badge-name', p.categoria || 'Categoría');
  setEl('qv-breadcrumb-cat', [p.categoria, p.subcategoria].filter(Boolean).join(' › ') || 'Catálogo');
  setEl('qv-product-name-el', p.nombre || '');
  setEl('qv-sku-tag', `SKU: ${p.sku || 'N/A'}`);
  const descEl = document.getElementById('qv-product-desc-el');
  if (descEl) { descEl.textContent = p.desc || ''; descEl.hidden = !p.desc; }
  _renderFicha(p);
  _renderVariantesQV(p);
  _renderRelacionadosQV(p);
  _registrarVisto(p.id);
  _jsonLdProducto(p);
  if (!window._tituloAntesQV) window._tituloAntesQV = document.title;
  document.title = `${p.nombre} — OrbisCORP`;

  const favBtn = document.getElementById('qv-fav-btn');
  if (favBtn) {
    favBtn.dataset.fav = p.id;
    favBtn.setAttribute('aria-pressed', String(favoritos.has(p.id)));
    favBtn.onclick = () => toggleFav(p.id);
  }
  setEl('qv-sucursal-large', '📍 Disponible en: ' + (p.almacen && p.almacen !== 'Sucursal Principal' ? p.almacen : 'Sucursal Pachuca'));

  const pData   = getPrecioData(p.precio);
  const priceEl = document.getElementById('qv-price-number');
  const ivaEl   = document.getElementById('qv-iva-note');
  const ivaTxt  = (factor) => p.precio_con_iva && !pData.sinPrecio
    ? `Más IVA: ${fmtPrice(p.precio_con_iva * factor)} MXN en total. El vendedor confirma el precio final.`
    : 'Más IVA. El vendedor confirma el precio final.';

  if (!hayUsuarioLogueado()) {
    priceEl.innerHTML = `<span style="font-size:.55em; cursor:pointer;" onclick="closeQV();openLoginCliente()">🔒 Inicia sesión para ver el precio</span>`;
    if (ivaEl) ivaEl.textContent = 'Crea tu cuenta gratis para ver precios y descuentos.';
  } else if (pData.sinPrecio) {
    priceEl.innerHTML = `<span style="font-size:.55em; font-family:var(--font-mono); color:var(--text-2);">Consultar precio</span>`;
    if (ivaEl) ivaEl.textContent = 'Pídelo por WhatsApp o en tu cotización y te damos el precio.';
  } else if (pData.hasDiscount) {
    priceEl.textContent = fmtPrice(pData.final).slice(1);
    if (ivaEl) ivaEl.textContent = `Precio de lista ${fmtPrice(pData.original)}, con tu descuento del ${pData.pct}%. ` + ivaTxt(1 - pData.pct / 100);
  } else {
    priceEl.textContent = fmtPrice(pData.final).slice(1);
    if (ivaEl) ivaEl.textContent = ivaTxt(1);
  }

  document.querySelector('#quick-view-modal .qv-price-display')?.classList.toggle('sin-precio', !hayUsuarioLogueado() || pData.sinPrecio);

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
    atcBtn.textContent = '✕ SIN STOCK DISPONIBLE';
    qtyInc.disabled = true;
  } else {
    const bajo = inv !== null && inv <= 5;
    stockPill.className = `qv-stock-pill ${bajo ? 'low' : 'in'}`;
    stockText.textContent = inv === null ? 'DISPONIBLE' : bajo ? `¡Solo ${inv} disponibles!` : `${inv} EN STOCK`;
    atcBtn.disabled = false;
    atcBtn.textContent = inCartItem ? `✓ EN CARRITO (${cartQty}) · AGREGAR MÁS` : '🛒 Agregar al Carrito';
    qtyInc.disabled = inv !== null && currentQvQty + cartQty >= inv;
  }

  _updateQvQtyUI(p.precio, inv, cartQty);

  const waBtn = document.getElementById('qv-wa-btn');
  if (waBtn) {
    waBtn.onclick = () => {
      let msg = `🛡️ *OrbisCORP* — Consulta de producto\n\n*${p.nombre}*\nSKU: ${p.sku || '—'}\n`;
      if (hayUsuarioLogueado() && !pData.sinPrecio) msg += `Precio: ${fmtPrice(pData.final)} MXN + IVA\n`;
      msg += `${_urlProducto(p.id)}\n\n¿Está disponible este producto?`;
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    };
  }

  const shareBtn = document.getElementById('qv-share-btn');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      const url = _urlProducto(p.id);
      try {
        if (navigator.share) { await navigator.share({ title: p.nombre, text: `${p.nombre} — OrbisCORP`, url }); return; }
        await navigator.clipboard.writeText(url);
        showToast('Enlace copiado al portapapeles', '🔗');
      } catch (_) { /* el usuario canceló */ }
    };
  }

  if (atcBtn) atcBtn.onclick = () => _addQvToCart(p, inv);
  if (atcBtn && inv !== null && inv <= 0) {
    atcBtn.disabled = false;
    atcBtn.textContent = '🔔 Avísame cuando llegue';
    atcBtn.onclick = () => abrirAvisame(p.id);
  }

  // La barra de direcciones apunta al producto: se puede copiar y compartir
  try { history.replaceState(history.state, '', `${location.pathname}?p=${encodeURIComponent(p.id)}${location.hash}`); } catch (_) {}

  document.getElementById('quick-view-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.querySelector('#quick-view-modal .qv-close-fab')?.focus({ preventScroll: true }), 60);

  // --- LÓGICA INTELIGENTE DE SCROLL ---
  setTimeout(() => {
    const col = document.getElementById('qv-details-col-el');
    const hint = document.getElementById('qv-scroll-hint');
    if (col && hint) {
      const checkScroll = () => {
        if (col.scrollHeight - col.scrollTop <= col.clientHeight + 10) hint.classList.add('hidden');
        else hint.classList.remove('hidden');
      };
      col.scrollTop = 0;
      checkScroll();
      col.onscroll = checkScroll;
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
  const modal = document.getElementById('quick-view-modal');
  if (!modal?.classList.contains('open')) return;
  modal.classList.remove('open');
  if (window._tituloAntesQV) { document.title = window._tituloAntesQV; window._tituloAntesQV = null; }
  _jsonLdProducto(null);
  if (!window._currentCat) renderHome();   // refresca "vistos recientemente"
  document.body.style.overflow = '';
  if (location.search.includes('p=')) {
    try { history.replaceState(history.state, '', `${location.pathname}${location.hash}`); } catch (_) {}
  }
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
    cart.push(_itemCarrito(p, currentQvQty));
  }

  persistCart();
  updateCartUI();
  _refreshProductCardBtn(p.id);
  showToast(`"${p.nombre}" añadido`, '✅');
  closeQV(); 
}

/* ══════════════════════════════════════════════
   MODALES GENERADOS (favoritos, pedido rápido, avísame)
═══════════════════════════════════════════════ */

function _modal(id, titulo, cuerpo, pie = '', ancho = 'wide') {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.id = id; m.className = 'modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-panel ${ancho}">
      <div class="modal-head"><span class="modal-head-title">${titulo}</span>
        <button class="modal-close" onclick="document.getElementById('${id}').classList.remove('open')" aria-label="Cerrar">✕</button></div>
      <div class="modal-body">${cuerpo}</div>
      ${pie ? `<div class="modal-foot">${pie}</div>` : ''}
    </div>`;
  m.classList.add('open');
  return m;
}
const _cerrarModal = id => document.getElementById(id)?.classList.remove('open');

/* ── Favoritos (se guardan en este dispositivo) ── */
function _pintarFavBadge() {
  const n = favoritos.size;
  ['fav-badge', 'mbn-fav-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : n;
    el.style.display = n ? 'flex' : 'none';
  });
}
window.toggleFav = function(id) {
  const p = allProducts.find(x => x.id === id);
  if (favoritos.has(id)) { favoritos.delete(id); showToast('Quitado de favoritos', '♡'); }
  else { favoritos.add(id); showToast(`"${p?.nombre || 'Producto'}" en favoritos`, '♥'); }
  _guardarLS(LS_FAV_KEY, [...favoritos]);
  _pintarFavBadge();
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
    b.setAttribute('aria-pressed', String(favoritos.has(id)));
    if (b.classList.contains('oc-fav')) b.setAttribute('aria-label', favoritos.has(id) ? 'Quitar de favoritos' : 'Guardar en favoritos');
  });
  if (document.getElementById('modal-favoritos')?.classList.contains('open')) abrirFavoritos();
};
window.abrirFavoritos = function() {
  closeCatalogPopup?.(); closeDrawer?.();
  const lista = [...favoritos].map(id => allProducts.find(p => p.id === id)).filter(Boolean);
  const cuerpo = lista.length ? `<ul class="fav-lista">${lista.map(p => {
      const id = escJS(p.id);
      const pd = getPrecioData(p.precio);
      const agotado = p.inventario != null && Number(p.inventario) <= 0;
      const precio = !hayUsuarioLogueado() ? 'Inicia sesión para ver precio' : pd.sinPrecio ? 'Precio a consultar' : `${fmtPrice(pd.final)} + IVA`;
      return `<li class="fav-item">
        <button type="button" class="fav-item__media" onclick="_cerrarFavYVer('${id}')">${p.imageUrl ? _imgTag(p.imageUrl, p.nombre) : (ICO_CAT[p.categoria] || '')}</button>
        <div class="fav-item__info">
          <button type="button" class="fav-item__nombre" onclick="_cerrarFavYVer('${id}')">${escHTML(p.nombre)}</button>
          <span class="fav-item__meta">${escHTML(p.sku || '')} · ${precio}</span>
          ${agotado ? '<span class="oc-stock is-agotado">Agotado</span>' : _stockHTML(p)}
        </div>
        <div class="fav-item__acc">
          ${agotado ? `<button type="button" class="oc-btn oc-btn--sec" onclick="abrirAvisame('${id}')">Avísame</button>`
                    : `<button type="button" class="oc-btn" onclick="addToCart('${id}')">Agregar</button>`}
          <button type="button" class="fav-item__quitar" onclick="toggleFav('${id}')" aria-label="Quitar ${escHTML(p.nombre)} de favoritos">✕</button>
        </div>
      </li>`;
    }).join('')}</ul>`
    : `<div class="vacio-suave">${ICO.corazon}<p>Aún no tienes favoritos. Toca el corazón en cualquier producto para guardarlo aquí y pedirlo después.</p></div>`;
  const pie = lista.length ? `<button class="mcancel-btn" onclick="compartirFavoritos()">Compartir lista</button>
      <button class="msave-btn" onclick="favoritosAlCarrito()">Agregar todos al carrito</button>` : '';
  _modal('modal-favoritos', `♥ Mis favoritos (${lista.length})`, cuerpo, pie);
};
window._cerrarFavYVer = id => { _cerrarModal('modal-favoritos'); openQV(id); };
window.favoritosAlCarrito = function() {
  let n = 0;
  [...favoritos].forEach(id => {
    const p = allProducts.find(x => x.id === id);
    if (!p || (p.inventario != null && Number(p.inventario) <= 0) || cart.some(c => c.id === id)) return;
    cart.push(_itemCarrito(p, 1)); n++; _refreshProductCardBtn(id);
  });
  persistCart(); updateCartUI();
  showToast(n ? `${n} producto${n === 1 ? '' : 's'} agregado${n === 1 ? '' : 's'} al carrito` : 'Tus favoritos ya estaban en el carrito o están agotados', n ? '🛒' : 'ℹ️');
  if (n) { _cerrarModal('modal-favoritos'); openCart(); }
};
window.compartirFavoritos = async function() {
  const lista = [...favoritos].map(id => allProducts.find(p => p.id === id)).filter(Boolean).map(p => `${p.sku || p.id}*1`).join(';');
  const url = `${location.origin}${location.pathname}?carrito=${encodeURIComponent(lista)}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Productos OrbisCORP', url }); return; }
    await navigator.clipboard.writeText(url); showToast('Enlace de la lista copiado', '🔗');
  } catch (_) {}
};

/* ── Pedido rápido por código (para compradores que ya saben lo que quieren) ── */
let _indiceSku = null;
const _normCod = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
const _sinSep  = s => _normCod(s).replace(/[\s\-\/.]/g, '');
function _buscarPorCodigo(cod) {
  if (!_indiceSku || _indiceSku.n !== allProducts.length) {
    const a = new Map(), b = new Map();
    allProducts.forEach(p => { a.set(_normCod(p.sku), p); a.set(_normCod(p.id), p); if (_sinSep(p.sku)) b.set(_sinSep(p.sku), p); });
    _indiceSku = { a, b, n: allProducts.length };
  }
  return _indiceSku.a.get(_normCod(cod)) || _indiceSku.b.get(_sinSep(cod)) || null;
}
function _parsearPedido(texto) {
  return String(texto || '').split(/\r?\n|;/).map(l => l.trim()).filter(Boolean).slice(0, 200).map(linea => {
    const limpio = linea.replace(/\t/g, ' ').replace(/\s+/g, ' ').replace(/[,]\s*(\d+)$/, ' $1').trim();
    let p = _buscarPorCodigo(limpio);
    if (p) return { linea, p, qty: 1 };
    for (const re of [/^(.*\S)[\s*×]+(\d{1,5})$/, /^(.*?)[\s*x×]+(\d{1,5})$/i]) {
      const m = limpio.match(re);
      if (m && (p = _buscarPorCodigo(m[1]))) return { linea, p, qty: Number(m[2]) };
    }
    const m2 = limpio.match(/^(\d{1,5})\s*[x×*]?\s+(.+)$/i);
    if (m2 && (p = _buscarPorCodigo(m2[2]))) return { linea, p, qty: Number(m2[1]) };
    return { linea, p: null, qty: 0 };
  });
}
let _pedidoRevisado = [];
window.abrirPedidoRapido = function(texto = '', aviso = '') {
  closeCatalogPopup?.(); closeDrawer?.(); closeCart?.();
  const cuerpo = `${aviso ? `<p class="pr-aviso">${escHTML(aviso)}. Revísala y agrégala a tu carrito.</p>` : ''}
    <p class="pr-ayuda">Pega tu lista: <b>un producto por renglón</b>, con el código y la cantidad. Puedes copiar las columnas directo desde Excel.</p>
    <textarea id="pr-texto" class="pr-texto" rows="7" spellcheck="false" placeholder="3M 6001   4&#10;51-670-9   12&#10;8372 x 3">${escHTML(texto)}</textarea>
    <div id="pr-resultado" class="pr-resultado" aria-live="polite"></div>`;
  const pie = `<button class="mcancel-btn" onclick="revisarPedidoRapido()">Revisar lista</button>
    <button class="msave-btn" id="pr-agregar" onclick="agregarPedidoRapido()" disabled>Agregar al carrito</button>`;
  _modal('modal-pedido-rapido', '⚡ Pedido rápido por código', cuerpo, pie);
  if (texto) revisarPedidoRapido();
  else setTimeout(() => document.getElementById('pr-texto')?.focus(), 120);
};
window.revisarPedidoRapido = function() {
  const texto = document.getElementById('pr-texto')?.value || '';
  const out = document.getElementById('pr-resultado');
  if (!allProducts.length) { out.innerHTML = '<p class="pr-ayuda">Cargando catálogo, intenta en un momento…</p>'; return; }
  _pedidoRevisado = _parsearPedido(texto);
  const ok = _pedidoRevisado.filter(x => x.p);
  const mal = _pedidoRevisado.filter(x => !x.p);
  out.innerHTML = !_pedidoRevisado.length ? '' : `
    <div class="pr-resumen"><b>${ok.length}</b> encontrado${ok.length === 1 ? '' : 's'}${mal.length ? ` · <span class="pr-mal">${mal.length} sin encontrar</span>` : ''}</div>
    <ul class="pr-lista">
      ${_pedidoRevisado.map(({ linea, p, qty }) => {
        if (!p) return `<li class="pr-fila is-mal"><span class="pr-cod">${escHTML(linea)}</span><span 
