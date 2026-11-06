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
        if (!p) return `<li class="pr-fila is-mal"><span class="pr-cod">${escHTML(linea)}</span><span class="pr-nom">No encontramos ese código. Revísalo o pídelo por WhatsApp.</span></li>`;
        const inv = p.inventario != null ? Number(p.inventario) : null;
        const nota = inv !== null && inv <= 0 ? '<em class="pr-mal">Agotado</em>'
          : inv !== null && qty > inv ? `<em class="pr-warn">Solo hay ${inv}</em>` : '';
        return `<li class="pr-fila"><span class="pr-cod">${escHTML(p.sku)}</span><span class="pr-nom">${escHTML(p.nombre)}</span><span class="pr-qty">× ${qty}</span>${nota}</li>`;
      }).join('')}
    </ul>`;
  const btn = document.getElementById('pr-agregar');
  const agregables = ok.filter(x => !(x.p.inventario != null && Number(x.p.inventario) <= 0));
  if (btn) { btn.disabled = !agregables.length; btn.textContent = agregables.length ? `Agregar ${agregables.length} al carrito` : 'Agregar al carrito'; }
};
window.agregarPedidoRapido = function() {
  let n = 0, ajustados = 0;
  _pedidoRevisado.filter(x => x.p).forEach(({ p, qty }) => {
    const inv = p.inventario != null ? Number(p.inventario) : null;
    if (inv !== null && inv <= 0) return;
    const item = cart.find(c => c.id === p.id);
    let total = (item ? item.qty : 0) + Math.max(1, qty);
    if (inv !== null && total > inv) { total = inv; ajustados++; }
    if (item) item.qty = total; else cart.push(_itemCarrito(p, total));
    n++; _refreshProductCardBtn(p.id);
  });
  persistCart(); updateCartUI();
  _cerrarModal('modal-pedido-rapido');
  showToast(`${n} producto${n === 1 ? '' : 's'} en tu carrito${ajustados ? ` (${ajustados} ajustado${ajustados === 1 ? '' : 's'} al stock)` : ''}`, '🛒', 4500);
  openCart();
};

/* ── Avísame cuando llegue (queda como prospecto en leads_orbiscorp) ── */
window.abrirAvisame = function(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const email = currentCustomer?.email || currentUser?.email || '';
  const nombre = [currentCustomer?.nombre, currentCustomer?.apellido].filter(Boolean).join(' ');
  const cuerpo = `<p class="pr-ayuda">Te escribimos en cuanto <b>${escHTML(p.nombre)}</b> (${escHTML(p.sku)}) vuelva a estar disponible. Si es urgente, muchas piezas las conseguimos sobre pedido.</p>
    <div class="mfield"><label for="av-nombre">Nombre</label><input id="av-nombre" type="text" autocomplete="name" value="${escHTML(nombre)}" placeholder="Juan García"></div>
    <div class="mfield"><label for="av-email">Correo *</label><input id="av-email" type="email" autocomplete="email" value="${escHTML(email)}" placeholder="tu@correo.com"></div>
    <div class="mfield"><label for="av-qty">¿Cuántas piezas necesitas?</label><input id="av-qty" type="number" min="1" value="1" inputmode="numeric"></div>
    <div class="merror" id="av-err" role="alert"></div>`;
  const pie = `<button class="mcancel-btn" onclick="consultarProducto('${escJS(p.id)}')">Preguntar por WhatsApp</button>
    <button class="msave-btn" id="av-btn" onclick="enviarAvisame('${escJS(p.id)}')">Avísame →</button>`;
  _modal('modal-avisame', '🔔 Avísame cuando llegue', cuerpo, pie, '');
  setTimeout(() => document.getElementById(email ? 'av-qty' : 'av-email')?.focus(), 120);
};
window.enviarAvisame = async function(id) {
  const p = allProducts.find(x => x.id === id);
  const email = document.getElementById('av-email')?.value.trim() || '';
  const nombre = document.getElementById('av-nombre')?.value.trim() || '';
  const qty = Math.max(1, Math.floor(Number(document.getElementById('av-qty')?.value) || 1));
  const err = document.getElementById('av-err');
  const btn = document.getElementById('av-btn');
  err.classList.remove('show');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Escribe un correo válido.'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = '⟳ Enviando...';
  const datos = {
    nombre: nombre || email, empresa: currentCustomer?.empresa || '', email, telefono: currentCustomer?.telefono || '',
    asunto: 'Otro', mensaje: `[AVISO DE DISPONIBILIDAD] ${p?.nombre} — código ${p?.sku} — necesita ${qty} pieza(s).`
  };
  try {
    await submitLead({ get: k => datos[k] ?? '' });
    _cerrarModal('modal-avisame');
    showToast('Listo, te avisamos en cuanto llegue', '🔔', 4500);
  } catch (e) {
    console.error('[AVISAME]', e?.code, e);
    err.textContent = 'No pudimos registrar el aviso. Pregúntanos por WhatsApp y te respondemos.';
    err.classList.add('show');
    btn.disabled = false; btn.textContent = 'Avísame →';
  }
};

/* ══════════════════════════════════════════════
   BÚSQUEDA
═══════════════════════════════════════════════ */

window.openSearch  = () => {
  document.getElementById('mobile-search-bar')?.classList.add('open');
  const res0 = document.getElementById('search-results');
  if (res0 && !document.getElementById('search-input')?.value) res0.innerHTML = _sugerenciasBusqueda();
  setTimeout(() => document.getElementById('search-input')?.focus(), 100);
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden'; /* ← FIX: Bloquea el scroll por completo */
};
window.closeSearch = () => {
  document.getElementById('mobile-search-bar')?.classList.remove('open');
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  const res = document.getElementById('search-results');
  if (res) res.innerHTML = _sugerenciasBusqueda();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = ''; /* ← FIX: Libera el scroll al cerrar */
};
document.getElementById('mobile-search-bar')?.addEventListener('click', e => {
  if (e.target.id === 'mobile-search-bar') closeSearch();
});

let _searchTimer = null;
document.getElementById('search-input')?.addEventListener('input', function () {
  clearTimeout(_searchTimer);
  const valor = this.value;
  _searchTimer = setTimeout(() => _ejecutarBusqueda(valor), 120);
});
document.getElementById('search-input')?.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const v = e.currentTarget.value.trim();
  if (v) verTodosResultados(v);
});

const _textoBusqueda = textoBusqueda;

window.guardarBusqueda = function(q) {
  q = String(q || '').trim().slice(0, 60);
  if (q.length < 2) return;
  const prev = _leerLS(LS_BUSQ_KEY, []).filter(x => normTxt(x) !== normTxt(q));
  _guardarLS(LS_BUSQ_KEY, [q, ...prev].slice(0, 8));
};
window.verTodosResultados = function(q) {
  guardarBusqueda(q);
  closeSearch();
  navigate('buscar', { q });
};
window.buscarSugerencia = function(q) {
  const inp = document.getElementById('search-input');
  if (inp) { inp.value = q; inp.focus(); }
  _ejecutarBusqueda(q);
};

function _sugerenciasBusqueda() {
  const recientes = _leerLS(LS_BUSQ_KEY, []);
  const chip = (txt, accion) => `<button type="button" class="search-chip" onclick="${accion}">${escHTML(txt)}</button>`;
  return `<div class="search-sug">
      ${recientes.length ? `<div class="search-sug__tit">Búsquedas recientes</div>
        <div class="search-sug__chips">${recientes.map(q => chip(q, `buscarSugerencia('${escJS(q)}')`)).join('')}</div>` : ''}
      <div class="search-sug__tit">Compra por necesidad</div>
      <div class="search-sug__chips">${USOS.map(u => chip(u.nombre, `closeSearch();navigate('buscar',{uso:'${u.id}'})`)).join('')}</div>
      <p class="search-sug__tip">Busca por nombre, marca, talla o código (por ejemplo <b>3M 6001</b>, <b>guante talla 9</b> o <b>carbones GWS</b>).
        ¿Tienes una lista? Usa el <a href="#" onclick="event.preventDefault();closeSearch();abrirPedidoRapido()">pedido rápido por código</a>.</p>
    </div>`;
}

function _ejecutarBusqueda(valor) {
  const res = document.getElementById('search-results');
  if (!res) return;
  const qRaw = String(valor || '').trim();
  if (!qRaw) { res.innerHTML = _sugerenciasBusqueda(); return; }
  if (!allProducts.length) { res.innerHTML = '<div class="search-empty">Cargando catálogo…</div>'; return; }

  /* Todas las palabras deben coincidir, cada una por cualquiera de sus
     sinónimos ("lentes" encuentra goggles y anteojos), sin importar
     acentos, plurales ni mayúsculas. Si no hay nada, corregimos el dedazo. */
  let terminos = prepararConsulta(qRaw), corr = null;
  let hits = allProducts.filter(p => coincide(p, terminos));
  if (!hits.length) {
    corr = corregirConsulta(qRaw, allProducts);
    if (corr) { terminos = prepararConsulta(corr); hits = allProducts.filter(p => coincide(p, terminos)); }
  }
  const qEf = corr || qRaw;
  hits.sort((a, b) => puntaje(b, qEf, terminos) - puntaje(a, qEf, terminos));
  const total   = hits.length;
  const matches = hits.slice(0, 10);

  if (!matches.length) {
    res.innerHTML = `<div class="search-empty">Sin resultados para &quot;${escHTML(qRaw)}&quot;
      <br><small style="display:block;margin-top:8px">Prueba con otra palabra,
      <a style="color:var(--orbis);font-weight:700;cursor:pointer" onclick="closeSearch();toggleChatbot()">pregúntale al asistente ✨</a>
      o <a style="color:var(--orbis);font-weight:700;cursor:pointer" onclick="closeSearch();pedirPorWhatsApp()">pídelo por WhatsApp</a>.</small></div>`;
    return;
  }

  const encabezado = `<div class="search-count">${corr ? `Mostrando resultados para «${escHTML(corr)}» · ` : ''}${total} resultado${total === 1 ? '' : 's'}</div>`;
  const pie = total > matches.length || corr
    ? `<button type="button" class="search-ver-todos" onclick="verTodosResultados('${escJS(qEf)}')">Ver los ${total} resultados con filtros →</button>` : '';

  res.innerHTML = encabezado + matches.map(p => {
    const meta = CAT_META[p.categoria] || { icon: '📦' };
    const id   = escJS(p.id);
    const { label, cls } = getStockInfo(p);
    const vars = _varianteDe(p);
    const adminEditBtn = isAdmin
      ? `<button class="padmin-btn" style="padding: 4px 10px; font-size: 0.65rem; min-height: auto; flex: 0 1 auto;" onclick="event.stopPropagation(); closeSearch(); openProductModal('${id}');">✎ Editar directo</button>`
      : '';
    const abrir = `guardarBusqueda('${escJS(qRaw)}');openQV('${id}');closeSearch();`;

    return `<div class="search-result-item" onclick="${abrir}" role="option" tabindex="0"
                 onkeydown="if(event.key==='Enter'){event.stopPropagation();${abrir}}" aria-label="${escHTML(p.nombre)}">
      ${p.imageUrl
        ? `<img class="sri-img" src="${escHTML(p.imageUrl)}" alt="" loading="lazy" decoding="async">`
        : `<div class="sri-img" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem" aria-hidden="true">${meta.icon}</div>`}
      <div class="sri-info">
        <div class="sri-name">${escHTML(p.nombre)}</div>
        <div class="sri-cat">${escHTML(p.subcategoria || p.categoria || '')}${p.marca ? ' · ' + escHTML(p.marca) : ''}${p.sku ? ' · ' + escHTML(p.sku) : ''}</div>
        ${label ? `<div class="sri-stock ${cls}">${label}</div>` : ''}${vars.length > 1 ? `<div class="sri-var">${vars.length} ${p._tipoVariante || 'opciones'}</div>` : ''}
        ${adminEditBtn ? `<div style="display: flex; gap: 6px; margin-top: 6px;">${adminEditBtn}</div>` : ''}
      </div>
      <div class="sri-price" style="text-align: right;">${renderPriceHTML(getPrecioData(p.precio))}</div>
    </div>`;
  }).join('') + pie;
}

/* ══════════════════════════════════════════════
   FORMULARIOS DE CONTACTO
═══════════════════════════════════════════════ */

async function submitLead(formData) {
  const campo = (k, max) => String(formData.get(k) || '').trim().slice(0, max);
  const ref = await addDoc(COL_LEADS, {
    nombre:   campo('nombre', 120),
    empresa:  campo('empresa', 120),
    email:    campo('email', 254).toLowerCase(),
    telefono: campo('telefono', 30),
    asunto:   campo('asunto', 80),
    mensaje:  campo('mensaje', 2000),
    pagina:   window._currentCat || 'home',
    uid:      currentUser?.uid || null,
    creadoEn: serverTimestamp()
  });
  return ref.id.slice(0, 8).toUpperCase();
}

/* Antes esta función existía pero nadie la llamaba: el formulario recargaba
   la página y el prospecto se perdía. Ahora sí se conecta (ver abajo). */
function setupContactForm(formId, errId, successId, folioId, btnId, txtId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById(errId);
    errEl.classList.remove('show');
    const fd    = new FormData(form);

    // Honeypot: un humano nunca llena este campo invisible
    if (fd.get('website')) {
      form.style.display = 'none';
      document.getElementById(successId).classList.add('show');
      return;
    }

    if (!fd.get('nombre')?.trim() || !fd.get('email')?.trim() || !fd.get('asunto')) {
      errEl.textContent = '⚠ Completa los campos obligatorios.';
      errEl.classList.add('show'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fd.get('email').trim())) {
      errEl.textContent = '⚠ Revisa que el correo esté bien escrito.';
      errEl.classList.add('show'); return;
    }

    const btn = document.getElementById(btnId);
    const txt = document.getElementById(txtId);
    btn.disabled = true; txt.textContent = '⟳ Enviando...';
    try {
      const folio = await submitLead(fd);
      form.reset();
      form.style.display = 'none';
      document.getElementById(folioId).textContent = folio;
      document.getElementById(successId).classList.add('show');
      showToast('¡Recibimos tu mensaje! Te contactamos en menos de 24 h.', '📨');
    } catch (err) {
      console.error('[LEAD]', err?.code, err);
      errEl.textContent = '⚠ Error al enviar. Intenta de nuevo o escríbenos por WhatsApp.';
      errEl.classList.add('show');
    } finally {
      btn.disabled = false; txt.textContent = 'Enviar Cotización';
    }
  });
}
setupContactForm('home-ct-form', 'home-form-err', 'home-form-success', 'home-f-folio', 'hbtn-sub', 'hsub-txt');
setupContactForm('cat-ct-form',  'cat-form-err',  'cat-form-success',  'cat-f-folio',  'cbtn-sub', 'csub-txt');

/* Rellena los formularios de contacto con los datos del cliente con sesión */
function _prellenarContacto(c) {
  if (!c) return;
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ');
  [['hf-nom', nombre], ['hf-emp', c.empresa], ['hf-mail', c.email], ['hf-tel', c.telefono],
   ['cf-nom', nombre], ['cf-emp', c.empresa], ['cf-mail', c.email], ['cf-tel', c.telefono]]
    .forEach(([id, v]) => { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; });
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
  setTimeout(() => window._ajustarNav?.(), 0);
  const btn = document.getElementById('nav-client-auth');
  const mobBtn = document.getElementById('nav-mobile-auth'); // El nuevo botón móvil
  if (!btn) return;
  
  if (customer) {
    /* Si todavia no tenemos el nombre, decimos "Mi cuenta": nunca el correo
       completo, que desbordaba la barra de navegacion. */
    const firstName = customer.nombre
      ? String(customer.nombre).split(' ')[0]
      : 'Mi cuenta';
    btn.textContent  = `👤 ${firstName}`;
    btn.title        = customer.email || '';
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
    ['drawer-link-empresa', 'drawer-link-consignacion'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.getElementById('modal-empresa')?.classList.remove('open');

    // Lo regresa a estado normal (sin punto verde)
    if (mobBtn) {
      mobBtn.innerHTML = `<span aria-hidden="true">👤</span>`;
    }
    closeUserDropdown();
  }
}

function _populateUserDropdown(customer) {
  const fullName = [customer.nombre, customer.apellido].filter(Boolean).join(' ') || 'Mi cuenta';
  const initial  = (customer.nombre || customer.email || '?')[0].toUpperCase();

  /* Aviso si el perfil aun no tiene datos, con acceso directo a completarlo */
  const avisoEl = document.getElementById('nud-perfil-incompleto');
  if (avisoEl) avisoEl.style.display = customer.nombre ? 'none' : 'flex';
  const isOwner = customer.rolEmpresa === 'owner';
  const isEmpresa = !!customer.empresaId;

  const avatarEl = document.getElementById('nud-avatar');
  const nameEl   = document.getElementById('nud-name');
  const emailEl  = document.getElementById('nud-email');
  const chipEl   = document.getElementById('nud-role-chip');
  const empleadosItem = document.getElementById('nud-item-empleados');
  const consigItem    = document.getElementById('nud-item-consignacion');
  const empresaItem   = document.getElementById('nud-item-empresa');
  const drawerEmp     = document.getElementById('drawer-link-empresa');

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
  // Portal de la cuenta de empresa (dueño y empleados)
  if (empresaItem) empresaItem.style.display = isEmpresa ? 'flex' : 'none';
  if (drawerEmp)   drawerEmp.style.display   = isEmpresa ? '' : 'none';
  const drawerConsig = document.getElementById('drawer-link-consignacion');
  if (drawerConsig) drawerConsig.style.display = isEmpresa ? '' : 'none';
}

window.toggleUserDropdown = function() {
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd) return;
  const abierto = dd.classList.toggle('open');
  /* En celular el menú se comporta como hoja inferior y necesita fondo */
  document.getElementById('nud-backdrop')?.classList.toggle('open', abierto);
  document.body.classList.toggle('nud-abierto', abierto);
  document.body.style.overflow = (abierto && window.innerWidth <= 768) ? 'hidden' : '';
};
window.closeUserDropdown = function() {
  document.getElementById('nav-user-dropdown')?.classList.remove('open');
  document.getElementById('nud-backdrop')?.classList.remove('open');
  document.body.classList.remove('nud-abierto');
  document.body.style.overflow = '';
};
// Cierra el menú al tocar fuera. Se excluye el botón de cuenta del celular,
// que vive fuera de .nav-user-wrap y si no se cerraría en el mismo toque.
document.addEventListener('click', (e) => {
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd || !dd.classList.contains('open')) return;
  const wrap   = document.querySelector('.nav-user-wrap');
  const movil  = document.getElementById('nav-mobile-auth');
  if (wrap && wrap.contains(e.target)) return;
  if (movil && movil.contains(e.target)) return;
  closeUserDropdown();
});
// Escape también lo cierra
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserDropdown();
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
  if (!currentCustomer) { openLoginCliente(); return; }
  /* Con sesion iniciada desplegamos el menu (tambien en celular, donde antes
     saltaba directo al formulario sin dejar ver las opciones). */
  toggleUserDropdown();
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
  const emailPrevio = document.getElementById('lc-email')?.value.trim() || '';
  closeLoginCliente();
  _clearRegisterClienteForm();
  if (emailPrevio) {
    const rcEmail = document.getElementById('rc-email');
    if (rcEmail) rcEmail.value = emailPrevio;   // no hacerle escribir el correo otra vez
  }
  document.getElementById('register-cliente-modal').classList.add('open');
  setTimeout(() => document.getElementById('rc-nombre')?.focus(), 140);
};

window.closeRegisterCliente = function() {
  document.getElementById('register-cliente-modal').classList.remove('open');
};

/* Deja el formulario de registro como nuevo: campos vacíos, ojitos cerrados,
   medidor de seguridad en cero y sin mensajes de error colgados. */
function _clearRegisterClienteForm() {
  ['rc-nombre','rc-apellido','rc-email','rc-pass','rc-pass2','rc-empresa','rc-puesto','rc-rfc']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  ['rc-pass','rc-pass2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.type = 'password';
  });
  document.querySelectorAll('#register-cliente-modal .pass-eye').forEach(b => {
    b.textContent = '👁'; b.classList.remove('on');
    b.setAttribute('aria-label', 'Mostrar contraseña');
  });

  const err = document.getElementById('rc-err');
  if (err) { err.classList.remove('show'); err.textContent = ''; err.style.color = ''; }

  const btn = document.getElementById('rc-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Crear mi cuenta →'; }

  const hint = document.getElementById('pass-match-hint');
  if (hint) { hint.textContent = ''; hint.classList.remove('ok','bad'); }

  evalPassStrength('');
}
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

  /* Si ya escribió la confirmación, revalidarla al vuelo */
  if (typeof window.checkPassMatch === 'function') window.checkPassMatch();
};

window.doRegisterCliente = async function() {
  const get   = id => document.getElementById(id)?.value.trim() || '';
  const btnEl = document.getElementById('rc-btn');
  const errEl = document.getElementById('rc-err');
  const showErr = msg => { errEl.textContent = msg; errEl.classList.add('show'); errEl.scrollIntoView({ behavior:'smooth', block:'center' }); };
  errEl.classList.remove('show');
  errEl.style.color = '';

  const nombre   = get('rc-nombre');
  const apellido = get('rc-apellido');
  const email    = get('rc-email').toLowerCase();
  const pass     = document.getElementById('rc-pass')?.value  || '';
  const pass2    = document.getElementById('rc-pass2')?.value || '';
  const empresa  = get('rc-empresa');
  const puesto   = get('rc-puesto');
  const rfc      = get('rc-rfc');

  /* ── Validaciones, señalando el campo exacto ── */
  const focusId = id => setTimeout(() => document.getElementById(id)?.focus(), 60);

  if (!nombre)   { showErr('Escribe tu nombre.');            return focusId('rc-nombre'); }
  if (!apellido) { showErr('Escribe tu apellido.');          return focusId('rc-apellido'); }
  if (!email)    { showErr('Escribe tu correo electrónico.'); return focusId('rc-email'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showErr('Ese correo no parece válido. Revisa que esté bien escrito.');
    return focusId('rc-email');
  }
  if (!pass)  { showErr('Crea una contraseña.'); return focusId('rc-pass'); }
  if (pass.length < 6) {
    showErr('La contraseña debe tener al menos 6 caracteres.');
    return focusId('rc-pass');
  }
  if (!pass2) { showErr('Confirma tu contraseña.'); return focusId('rc-pass2'); }
  if (pass !== pass2) {
    showErr('Las contraseñas no coinciden. Toca el 👁 para revisarlas.');
    return focusId('rc-pass2');
  }
  if (rfc && (rfc.length < 12 || rfc.length > 13)) {
    showErr('El RFC debe tener 12 o 13 caracteres (o déjalo vacío).');
    return focusId('rc-rfc');
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Creando cuenta...';

  let cred = null;
  try {
    await setPersistence(auth, browserLocalPersistence);
    cred = await createUserWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error('[registro] error de autenticación:', e?.code, e);
    const msgs = {
      'auth/email-already-in-use':  'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
      'auth/invalid-email':         'El correo no es válido. Revisa que esté bien escrito.',
      'auth/weak-password':         'La contraseña es muy débil. Usa al menos 6 caracteres.',
      'auth/network-request-failed':'Sin conexión estable. Revisa tu internet e inténtalo otra vez.',
      'auth/too-many-requests':     'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
      'auth/operation-not-allowed': 'El registro está temporalmente deshabilitado. Escríbenos por WhatsApp y te damos de alta.'
    };
    showErr(msgs[e?.code] || 'No pudimos crear la cuenta. Inténtalo de nuevo o escríbenos por WhatsApp.');
    btnEl.disabled = false; btnEl.textContent = 'Crear mi cuenta →';

    if (e?.code === 'auth/email-already-in-use') {
      setTimeout(() => {
        switchToLogin();
        const lc = document.getElementById('lc-email');
        if (lc) lc.value = email;
        document.getElementById('lc-pass')?.focus();
      }, 1800);
    }
    return;
  }

  /* ── La cuenta YA existe en este punto. El guardado del perfil
        no debe poder tumbar el registro: si falla, reintentamos
        y de todos modos dejamos pasar al cliente. ── */
  const uid = cred.user.uid;
  const clienteData = {
    uid, nombre, apellido, email, empresa, puesto, rfc,
    rol:              'cliente',
    carrito:          loadCartFromLocalStorage(),
    carritoUpdatedAt: serverTimestamp(),
    creadoEn:         serverTimestamp(),
    actualizadoEn:    serverTimestamp()
  };

  let perfilGuardado = false;
  for (let intento = 1; intento <= 3 && !perfilGuardado; intento++) {
    try {
      await setDoc(doc(db, 'clientes', uid), clienteData);
      perfilGuardado = true;
    } catch (e) {
      console.error(`[registro] fallo al guardar perfil (intento ${intento}):`, e?.code, e);
      if (intento < 3) await new Promise(r => setTimeout(r, 700 * intento));
    }
  }

  closeRegisterCliente();
  btnEl.disabled = false; btnEl.textContent = 'Crear mi cuenta →';

  if (perfilGuardado) {
    showToast(`¡Bienvenido, ${nombre}! Tu cuenta está lista.`, '✨');
  } else {
    /* Sesión iniciada, pero los datos fiscales no se guardaron.
       Lo dejamos pendiente y lo reintentamos en segundo plano. */
    window._perfilPendiente = clienteData;
    showToast('Cuenta creada. Guardaremos tus datos en un momento.', '⏳');
    setTimeout(() => reintentarGuardarPerfil(), 4000);
  }
};

/* Reintento silencioso del perfil si Firestore falló al registrarse */
window.reintentarGuardarPerfil = async function() {
  const data = window._perfilPendiente;
  if (!data || !auth.currentUser || auth.currentUser.uid !== data.uid) return;
  try {
    await setDoc(doc(db, 'clientes', data.uid), data);
    window._perfilPendiente = null;
    showToast('Tus datos quedaron guardados.', '✅');
  } catch (e) {
    console.error('[registro] reintento de perfil fallido:', e?.code, e);
  }
};

/* ══ MOSTRAR / OCULTAR CONTRASEÑA (👁) ══ */
window.togglePass = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  if (btn) {
    btn.textContent = visible ? '👁' : '🙈';
    btn.classList.toggle('on', !visible);
    btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    btn.setAttribute('title',      visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  }
  /* Devolver el cursor al final para no perder el punto de escritura */
  const pos = input.value.length;
  input.focus();
  try { input.setSelectionRange(pos, pos); } catch (_) {}
};

/* ══ AVISO EN VIVO DE COINCIDENCIA DE CONTRASEÑAS ══ */
window.checkPassMatch = function() {
  const hint = document.getElementById('pass-match-hint');
  if (!hint) return;
  const a = document.getElementById('rc-pass')?.value  || '';
  const b = document.getElementById('rc-pass2')?.value || '';

  hint.classList.remove('ok', 'bad');
  if (!b) { hint.textContent = ''; return; }
  if (a === b) { hint.textContent = '✓ Las contraseñas coinciden'; hint.classList.add('ok'); }
  else         { hint.textContent = '✕ Las contraseñas no coinciden'; hint.classList.add('bad'); }
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

/* ══ GUARDAR PERFIL ══
   No confiamos en el código de error para decidir si el documento existe:
   Firestore evalúa las reglas ANTES de comprobar la existencia, así que un
   updateDoc sobre un documento inexistente devuelve 'permission-denied'
   (porque resource.data es null y la regla revienta), no 'not-found'.
   Por eso preguntamos primero con getDoc. */
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
  if (rfc && (rfc.length < 12 || rfc.length > 13)) {
    errEl.textContent = 'El RFC debe tener 12 o 13 caracteres (o déjalo vacío).';
    errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Guardando...';
  const ref    = doc(db, 'clientes', currentCustomer.uid);
  const campos = { nombre, apellido, empresa, puesto, rfc, actualizadoEn: serverTimestamp() };

  try {
    let existe = false;
    try { existe = (await getDoc(ref)).exists(); }
    catch (eLect) { console.warn('[PERFIL] no se pudo leer el perfil:', eLect?.code); }

    if (existe) {
      await updateDoc(ref, campos);
    } else {
      await _crearPerfilBase(ref, campos);
    }

    /* Reflejar los cambios de inmediato aunque el listener tarde en llegar */
    currentCustomer = { ...currentCustomer, nombre, apellido, empresa, puesto, rfc };
    updateCustomerNavBtn(currentCustomer);
    updatePerfilModalHeader(currentCustomer);

    showToast('Perfil actualizado', '✅');
    closePerfilModal();
  } catch (e) {
    console.error('[PERFIL] no se pudo guardar:', e?.code, e);
    errEl.textContent = e?.code === 'permission-denied'
      ? 'Las reglas de Firestore están rechazando el guardado. Revisa que estén publicadas.'
      : 'Error al guardar. Revisa tu conexión e intenta de nuevo.';
    errEl.classList.add('show');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Guardar cambios →';
  }
};

/* Crea el perfil que faltaba. Intenta primero con rol:'cliente'; si las reglas
   todavía no aceptan ese campo, reintenta sin él en vez de dejar al usuario
   atrapado. Así funciona con las reglas nuevas y con las viejas. */
async function _crearPerfilBase(ref, campos) {
  const base = {
    uid:              currentCustomer.uid,
    email:            currentCustomer.email || auth.currentUser?.email || '',
    carrito:          loadCartFromLocalStorage(),
    carritoUpdatedAt: serverTimestamp(),
    creadoEn:         serverTimestamp(),
    ...campos
  };
  try {
    await setDoc(ref, { ...base, rol: 'cliente' }, { merge: true });
    return;
  } catch (e) {
    if (e?.code !== 'permission-denied') throw e;
    console.warn('[PERFIL] las reglas rechazan el campo "rol"; reintentando sin él.');
  }
  try {
    await setDoc(ref, base, { merge: true });
    return;
  } catch (e) {
    if (e?.code !== 'permission-denied') throw e;
    console.warn('[PERFIL] el merge fue rechazado; el documento quizá sí exista.');
  }
  /* Si llegamos aquí, lo más probable es que el documento exista pero la
     lectura fallara. Tocamos solo los campos de la lista blanca. */
  await _guardarSoloCamposPermitidos(ref, campos);
}

/* Ultimo recurso: si el merge fue rechazado puede ser que el documento SI
   exista pero la lectura fallara. En ese caso solo tocamos los campos de la
   lista blanca, que es lo unico que la regla de update permite. */
async function _guardarSoloCamposPermitidos(ref, campos) {
  await updateDoc(ref, campos);
}

/* ══ DIAGNOSTICO ══
   Ejecuta  diagnosticarPerfil()  en la consola del navegador para saber
   exactamente que esta fallando, sin tener que adivinar. */
window.diagnosticarPerfil = async function() {
  const linea = '─'.repeat(52);
  console.log('%c DIAGNOSTICO DE PERFIL ', 'background:#2F3BA2;color:#fff;font-weight:bold;padding:2px 6px');
  console.log(linea);

  const u = auth.currentUser;
  if (!u) { console.log('❌ No hay sesion iniciada. Entra con tu cuenta primero.'); return; }
  console.log('✅ Sesion iniciada');
  console.log('   uid:  ', u.uid);
  console.log('   email:', u.email);

  const ref = doc(db, 'clientes', u.uid);

  // 1. Lectura
  let snap = null;
  try {
    snap = await getDoc(ref);
    console.log(snap.exists()
      ? '✅ El documento del perfil EXISTE'
      : '⚠️  El documento del perfil NO EXISTE (se creara al guardar)');
    if (snap.exists()) console.log('   campos:', Object.keys(snap.data()).join(', '));
  } catch (e) {
    console.log('❌ No se puede LEER el perfil:', e?.code);
    console.log('   → Las reglas no estan publicadas o el uid no coincide.');
    return;
  }

  // 2. Escritura de prueba (solo toca actualizadoEn, que esta en la lista blanca)
  try {
    if (snap.exists()) {
      await updateDoc(ref, { actualizadoEn: serverTimestamp() });
      console.log('✅ Escritura permitida. Las reglas estan bien publicadas.');
    } else {
      console.log('ℹ️  Sin documento no se puede probar el update.');
      console.log('   Guarda tus datos desde "Mi perfil" y se creara solo.');
    }
  } catch (e) {
    console.log('❌ Escritura RECHAZADA:', e?.code);
    console.log('   → Publica firestore.rules en Firebase Console:');
    console.log('     Firestore Database → pestaña Reglas → pegar → Publicar');
  }

  console.log(linea);
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
    if (document.getElementById('modal-empresa')?.classList.contains('open')) { CE.equipo = null; _ceRender(); _ceCargar().then(_ceRender); }
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
  try {
    const snap = await getDocs(query(collection(db, 'clientes'), where('empresaId', '==', currentCustomer.empresaId)));
    if (snap.empty) {
      cont.innerHTML = `<div class="emp-list-empty">Aún no hay empleados registrados.</div>`;
      return;
    }
    cont.innerHTML = snap.docs.map(d => {
      const e = d.data();
      const nombreCompleto = [e.nombre, e.apellido].filter(Boolean).join(' ') || e.email || '';
      const inicial = (e.nombre || e.email || '?')[0].toUpperCase();
      return `<div class="emp-list-row">
        <div class="emp-avatar-sm">${escHTML(inicial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.rolEmpresa === 'owner' ? '👑' : '👤'} ${escHTML(nombreCompleto)}</div>
          <div style="color:var(--text-3);font-size:.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHTML(e.email)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[EMPLEADOS]', err?.code, err);
    cont.innerHTML = `<div class="emp-list-empty">No se pudo cargar el equipo.</div>`;
  }
};

window.verInventarioConsignacion = async function() {
  if (!currentCustomer?.empresaId) { showToast('Esta función es solo para cuentas de empresa', '⚠️'); return; }

  let snap;
  try {
    snap = await getDocs(query(collection(db, 'productos_consignacion'), where('empresaId', '==', currentCustomer.empresaId)));
  } catch (err) {
    console.error('[CONSIGNACIÓN]', err?.code, err);
    showToast('No se pudo consultar la consignación', '⚠️');
    return;
  }

  if (snap.empty) {
    showToast('No hay inventario en consignación registrado', 'ℹ️');
    return;
  }

  const empresaTxt = currentCustomer.empresa || 'Empresa sin nombre';
  const clienteTxt = [currentCustomer.nombre, currentCustomer.apellido].filter(Boolean).join(' ') || currentCustomer.email;
  document.getElementById('consig-empresa-nombre').textContent = empresaTxt;
  document.getElementById('consig-cliente-nombre').textContent = clienteTxt;
  document.getElementById('consig-fecha').textContent =
    new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  const filas = snap.docs.map(d => d.data())
    .sort((a, b) => String(a.producto || '').localeCompare(String(b.producto || ''), 'es'));
  const piezas = filas.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);

  document.getElementById('consig-lista').innerHTML = filas.map(p => `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--border); border-left: 4px solid var(--orbis); border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="min-width:0;">
          <div style="font-weight: 700; color: var(--text); font-size: 0.95rem; margin-bottom: 2px;">${escHTML(p.producto)}</div>
          <div style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-3); letter-spacing: 0.05em;">SKU: ${escHTML(p.sku || 'N/A')}</div>
        </div>
        <div style="text-align: center; background: var(--surface2); padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); flex-shrink:0;">
          <div style="font-size: 0.65rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Stock</div>
          <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: var(--orbis); line-height: 1;">${escHTML(p.cantidad)}</div>
        </div>
      </div>`).join('') + `
      <div style="display:flex;justify-content:space-between;padding:10px 16px;font-family:var(--font-mono);font-size:.72rem;color:var(--text-2);">
        <span>${filas.length} producto${filas.length !== 1 ? 's' : ''}</span><span>${piezas.toLocaleString('es-MX')} piezas en total</span>
      </div>`;

  closePerfilModal();
  document.getElementById('modal-consignacion').classList.add('open');
};

window.cerrarModalConsignacion = function() {
  document.getElementById('modal-consignacion').classList.remove('open');
};
/* ══════════════════════════════════════════════
   PORTAL "MI CUENTA DE EMPRESA"
   Resumen de condiciones, consignación, equipo y cotizaciones.
   Lo ven el dueño y los empleados; "Equipo" completo solo el dueño.
═══════════════════════════════════════════════ */
const CE = { tab: 'resumen', empresa: null, consig: null, equipo: null, cots: null, q: '' };

function _ceFecha(v) {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function _ceMs(v) { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !isNaN(d) ? d.getTime() : 0; }
function _ceProductoPorSku(sku) {
  const k = String(sku || '').trim().toLowerCase();
  if (!k) return null;
  return allProducts.find(p => String(p.sku || '').trim().toLowerCase() === k) || null;
}
function _ceAgregar(p, qty) {
  const inv = p.inventario != null ? Number(p.inventario) : null;
  if (inv !== null && inv <= 0) return 0;
  const ex = cart.find(c => c.id === p.id);
  let q = Math.max(1, Math.floor(qty) || 1);
  if (inv !== null) q = Math.min(q, inv - (ex?.qty || 0));
  if (q <= 0) return 0;
  if (ex) ex.qty += q; else cart.push(_itemCarrito(p, q));
  _refreshProductCardBtn(p.id);
  return q;
}

window.abrirCuentaEmpresa = async function(tab = 'resumen') {
  if (!currentCustomer?.empresaId) { showToast('Esta sección es solo para cuentas de empresa', '⚠️'); return; }
  closeUserDropdown?.(); closeDrawer?.(); closePerfilModal?.();
  CE.tab = tab; CE.q = '';
  const isOwner = currentCustomer.rolEmpresa === 'owner';
  document.getElementById('ce-tab-equipo').style.display = isOwner ? '' : 'none';
  document.getElementById('ce-rol').textContent = isOwner ? '👑 Dueño' : '👤 Empleado';
  document.getElementById('ce-nombre').textContent = currentCustomer.empresa || 'Mi empresa';
  document.getElementById('modal-empresa').classList.add('open');
  _ceRender();
  await _ceCargar();
  _ceRender();
};
window.cerrarCuentaEmpresa = () => document.getElementById('modal-empresa').classList.remove('open');
window.ceTab = function(tab) { CE.tab = tab; _ceRender(); };

async function _ceCargar() {
  const eid = currentCustomer.empresaId, uid = currentCustomer.uid;
  const isOwner = currentCustomer.rolEmpresa === 'owner';
  const tareas = [
    getDoc(doc(db, 'empresas', eid)).then(s => { CE.empresa = s.exists() ? s.data() : {}; }).catch(() => { CE.empresa = {}; }),
    getDocs(query(collection(db, 'productos_consignacion'), where('empresaId', '==', eid)))
      .then(s => { CE.consig = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.producto || '').localeCompare(String(b.producto || ''), 'es')); })
      .catch(e => { console.error('[EMPRESA/consig]', e?.code); CE.consig = 'error'; }),
    getDocs(query(collection(db, 'cotizaciones'), where('uid', '==', uid)))
      .then(s => { CE.cots = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => _ceMs(b.creadaEn) - _ceMs(a.creadaEn)); })
      .catch(e => { console.error('[EMPRESA/cots]', e?.code); CE.cots = 'error'; })
  ];
  if (isOwner) tareas.push(
    getDocs(query(collection(db, 'clientes'), where('empresaId', '==', eid)))
      .then(s => { CE.equipo = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.rolEmpresa === 'owner') - (a.rolEmpresa === 'owner')); })
      .catch(e => { console.error('[EMPRESA/equipo]', e?.code); CE.equipo = 'error'; })
  );
  await Promise.all(tareas);
  if (CE.empresa?.nombreEmpresa) document.getElementById('ce-nombre').textContent = CE.empresa.nombreEmpresa;
}

function _ceRender() {
  document.querySelectorAll('#modal-empresa .ce-tab').forEach(b => {
    const on = b.dataset.tab === CE.tab;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
  });
  const body = document.getElementById('ce-body');
  const cargando = `<div class="ce-empty"><span class="ce-spin"></span>Cargando…</div>`;
  const error = t => `<div class="ce-empty">⚠️ No se pudo cargar ${t}. Intenta de nuevo o contacta a tu asesor.</div>`;
  const c = currentCustomer, isOwner = c.rolEmpresa === 'owner';

  if (CE.tab === 'resumen') {
    const desc = c.tiene_descuento === true && Number(c.porcentaje_descuento) > 0 ? Math.min(100, Number(c.porcentaje_descuento)) : 0;
    const cred = c.credito_aprobado === true;
    const plazo = cred && c.credito_duracion ? `${c.credito_duracion} ${c.credito_tipo_duracion === 'meses' ? (c.credito_duracion == 1 ? 'mes' : 'meses') : (c.credito_duracion == 1 ? 'día' : 'días')}` : '';
    const cons = Array.isArray(CE.consig) ? CE.consig : null;
    const piezas = cons ? cons.reduce((s, p) => s + (Number(p.cantidad) || 0), 0) : null;
    const cots = Array.isArray(CE.cots) ? CE.cots : null;
    const kpi = (lbl, val, sub = '', go = '') => `<button class="ce-kpi" ${go ? `onclick="ceTab('${go}')"` : 'disabled'}><small>${lbl}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</button>`;
    body.innerHTML = `
      <div class="ce-cond">
        <div class="ce-cond-card ${desc ? 'ok' : ''}"><span class="ce-ic">🏷️</span><div><small>Descuento B2B</small><b>${desc ? `${desc}% en todo el catálogo` : 'Sin descuento asignado'}</b><em>${desc ? 'Ya aplicado en precios, carrito y cotizaciones' : 'Pregunta a tu asesor por precios preferenciales'}</em></div></div>
        <div class="ce-cond-card ${cred ? 'ok' : ''}"><span class="ce-ic">💳</span><div><small>Línea de crédito</small><b>${cred ? `Activa${plazo ? ` · ${plazo}` : ''}` : 'Pago de contado'}</b><em>${cred ? 'Tus pedidos pueden pagarse a crédito' : 'Solicita una línea de crédito con tu asesor'}</em></div></div>
      </div>
      <div class="ce-kpis">
        ${kpi('Productos en consignación', cons ? cons.length : '…', piezas != null ? `${piezas.toLocaleString('es-MX')} piezas` : '', 'consig')}
        ${isOwner ? kpi('Equipo', Array.isArray(CE.equipo) ? CE.equipo.length : '…', 'cuentas con acceso', 'equipo') : kpi('Tu rol', 'Empleado', 'compras con las condiciones de la empresa')}
        ${kpi('Mis cotizaciones', cots ? cots.length : '…', cots && cots.length ? `última ${_ceFecha(cots[0].creadaEn)}` : '', 'cots')}
      </div>
      <p class="ce-sec">Accesos rápidos</p>
      <div class="ce-acciones">
        <button onclick="cerrarCuentaEmpresa(); navigate('buscar')"><span>📚</span>Catálogo con mi precio</button>
        <button onclick="cerrarCuentaEmpresa(); abrirPedidoRapido()"><span>⚡</span>Pedido rápido por código</button>
        <button onclick="ceTab('consig')"><span>📦</span>Reponer consignación</button>
        <button onclick="ceAsesor()"><span>💬</span>Hablar con mi asesor</button>
      </div>`;
    return;
  }

  if (CE.tab === 'consig') {
    if (CE.consig == null) { body.innerHTML = cargando; return; }
    if (CE.consig === 'error') { body.innerHTML = error('el inventario en consignación'); return; }
    const q = CE.q.trim().toLowerCase();
    const list = CE.consig.filter(p => !q || [p.producto, p.sku].some(v => String(v || '').toLowerCase().includes(q)));
    const piezas = CE.consig.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
    body.innerHTML = CE.consig.length ? `
      <div class="ce-bar">
        <input type="search" id="ce-q" class="ce-search" placeholder="Buscar producto o SKU" value="${escHTML(CE.q)}" autocomplete="off">
        <button class="mcancel-btn" onclick="ceCsvConsig()">⬇ CSV</button>
        <button class="mcancel-btn" onclick="cePrintConsig()">🖨 Imprimir</button>
      </div>
      <div class="ce-meta">${CE.consig.length} producto${CE.consig.length !== 1 ? 's' : ''} · ${piezas.toLocaleString('es-MX')} piezas en resguardo</div>
      <div class="ce-list">${list.map(p => {
        const prod = _ceProductoPorSku(p.sku);
        const sinStock = prod && prod.inventario != null && Number(prod.inventario) <= 0;
        return `<div class="ce-row">
          <div class="ce-row-i"><b>${escHTML(p.producto)}</b><small>SKU ${escHTML(p.sku || 'N/A')}${prod ? ` · ${renderPriceHTML(getPrecioData(prod.precio)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}` : ''}</small></div>
          <div class="ce-qty"><small>En resguardo</small><b>${escHTML(Number(p.cantidad) || 0)}</b></div>
          ${prod ? `<div class="ce-pedir">
              ${sinStock ? '' : `<input type="number" min="1" value="1" inputmode="numeric" aria-label="Cantidad a pedir" data-ceq="${escHTML(prod.id)}">`}
              <button class="msave-btn" ${sinStock ? 'disabled title="Sin stock en tienda"' : ''} onclick="cePedir('${escJS(prod.id)}')">${sinStock ? 'Sin stock' : '+ Pedir'}</button>
            </div>`
          : `<button class="mcancel-btn ce-wa" onclick="ceAsesor('${escJS(p.producto)}','${escJS(p.sku || '')}')">💬 Solicitar</button>`}
        </div>`;
      }).join('') || '<div class="ce-empty">Ningún producto coincide con la búsqueda.</div>'}</div>
      <p class="ce-nota">Material propiedad de OrbisCORP resguardado en tus instalaciones. “+ Pedir” agrega más piezas al carrito con tu precio de empresa.</p>`
      : `<div class="ce-empty">📦 Aún no hay productos en consignación registrados para tu empresa.</div>`;
    const inp = document.getElementById('ce-q');
    if (inp) inp.oninput = () => { CE.q = inp.value; const pos = inp.selectionStart; _ceRender(); const n = document.getElementById('ce-q'); n.focus(); n.setSelectionRange(pos, pos); };
    return;
  }

  if (CE.tab === 'equipo') {
    if (!isOwner) { CE.tab = 'resumen'; _ceRender(); return; }
    if (CE.equipo == null) { body.innerHTML = cargando; return; }
    if (CE.equipo === 'error') { body.innerHTML = error('tu equipo'); return; }
    body.innerHTML = `
      <div class="ce-bar"><div class="ce-meta" style="margin:0;flex:1">${CE.equipo.length} cuenta${CE.equipo.length !== 1 ? 's' : ''} con acceso a las condiciones de la empresa</div>
        <button class="msave-btn" onclick="abrirModalRegistrarEmpleado()">+ Registrar empleado</button></div>
      <div class="ce-list">${CE.equipo.map(e => {
        const nom = [e.nombre, e.apellido].filter(Boolean).join(' ') || e.email || '';
        return `<div class="ce-row">
          <div class="emp-avatar-sm">${escHTML((e.nombre || e.email || '?')[0].toUpperCase())}</div>
          <div class="ce-row-i"><b>${escHTML(nom)}</b><small>${escHTML(e.email || '')}${e.puesto ? ' · ' + escHTML(e.puesto) : ''}</small></div>
          <span class="ce-chip ${e.rolEmpresa === 'owner' ? 'gold' : ''}">${e.rolEmpresa === 'owner' ? '👑 Dueño' : '👤 Empleado'}</span>
        </div>`;
      }).join('')}</div>
      <p class="ce-nota">Tus empleados compran con el descuento y crédito de la empresa y pueden consultar la consignación. Para dar de baja a alguien, contacta a tu asesor.</p>`;
    return;
  }

  if (CE.tab === 'cots') {
    if (CE.cots == null) { body.innerHTML = cargando; return; }
    if (CE.cots === 'error') { body.innerHTML = error('tus cotizaciones'); return; }
    body.innerHTML = CE.cots.length ? `
      <div class="ce-meta">${CE.cots.length} cotización${CE.cots.length !== 1 ? 'es' : ''} solicitada${CE.cots.length !== 1 ? 's' : ''} con tu cuenta · el PDF se envió a tu correo</div>
      <div class="ce-list">${CE.cots.map(q => {
        const parts = Array.isArray(q.partidas) ? q.partidas : [];
        return `<details class="ce-cot">
          <summary><div class="ce-row-i"><b>${escHTML(q.folio || 'Cotización')}</b><small>${_ceFecha(q.creadaEn)} · ${parts.length} partida${parts.length !== 1 ? 's' : ''}${Number(q.descuento) ? ` · −${escHTML(q.descuento)}%` : ''}</small></div>
            <div class="ce-qty"><small>Total c/IVA</small><b>${fmtPrice(Number(q.total) || 0)}</b></div></summary>
          <div class="ce-cot-bd">${parts.map(pt => `<div class="ce-line"><span>${escHTML(pt.cantidad)} × ${escHTML(pt.nombre)}${pt.sku ? ` <small>${escHTML(pt.sku)}</small>` : ''}</span><span>${pt.sinPrecio ? 'Por confirmar' : fmtPrice(Number(pt.importe) || 0)}</span></div>`).join('')}
            <div class="ce-line"><span>Subtotal</span><span>${fmtPrice(Number(q.subtotal) || 0)}</span></div>
            <div class="ce-line"><span>IVA</span><span>${fmtPrice(Number(q.iva) || 0)}</span></div>
            <button class="msave-btn" style="width:100%;margin-top:10px" onclick="ceRepetir('${escJS(q.id)}')">🔁 Volver a pedir esta cotización</button>
          </div></details>`;
      }).join('')}</div>
      <p class="ce-nota">Los precios al volver a pedir se actualizan con tu precio vigente.</p>`
      : `<div class="ce-empty">📄 Aún no has pedido cotizaciones. Arma tu carrito y toca “Generar Cotización PDF”.</div>`;
  }
}

window.cePedir = function(pid) {
  const p = allProducts.find(x => x.id === pid); if (!p) return;
  const inp = document.querySelector(`#ce-body [data-ceq="${CSS.escape(pid)}"]`);
  const n = _ceAgregar(p, Number(inp?.value) || 1);
  if (!n) { showToast('No hay más stock disponible de este producto', '⚠️'); return; }
  persistCart(); updateCartUI();
  showToast(`${n} × "${p.nombre}" al carrito`, '🛒');
};
window.ceRepetir = function(cid) {
  const q = Array.isArray(CE.cots) && CE.cots.find(x => x.id === cid); if (!q) return;
  let ok = 0, faltan = 0;
  (q.partidas || []).forEach(pt => {
    const p = allProducts.find(x => x.id === pt.productId) || _ceProductoPorSku(pt.sku);
    if (p && _ceAgregar(p, Number(pt.cantidad) || 1) > 0) ok++; else faltan++;
  });
  persistCart(); updateCartUI();
  if (!ok) { showToast('Esos productos ya no están disponibles', '⚠️'); return; }
  showToast(`${ok} producto${ok !== 1 ? 's' : ''} al carrito${faltan ? ` · ${faltan} sin stock o descontinuado${faltan !== 1 ? 's' : ''}` : ''}`, '🛒', 4200);
  cerrarCuentaEmpresa(); openCart();
};
window.ceAsesor = function(producto = '', sku = '') {
  const c = currentCustomer || {};
  const quien = [c.nombre, c.apellido].filter(Boolean).join(' ');
  const emp = CE.empresa?.nombreEmpresa || c.empresa || '';
  const msg = producto
    ? `Hola, soy ${quien}${emp ? ` de *${emp}*` : ''}. Necesito reponer material en consignación:\n\n• *${producto}*${sku ? ` (SKU ${sku})` : ''}\n\n¿Me apoyan con la reposición?`
    : `Hola, soy ${quien}${emp ? ` de *${emp}*` : ''} (cuenta de empresa). Me gustaría hablar con mi asesor.`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};
window.ceCsvConsig = function() {
  if (!Array.isArray(CE.consig) || !CE.consig.length) return;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const txt = '\ufeff' + [['Producto', 'SKU', 'Cantidad en resguardo'], ...CE.consig.map(p => [p.producto, p.sku || '', Number(p.cantidad) || 0])].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = `consignacion_${(CE.empresa?.nombreEmpresa || 'empresa').replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
window.cePrintConsig = function() {
  if (!Array.isArray(CE.consig) || !CE.consig.length) return;
  const c = currentCustomer, emp = CE.empresa?.nombreEmpresa || c.empresa || 'Empresa';
  const piezas = CE.consig.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { showToast('Permite las ventanas emergentes para imprimir', '⚠️'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Consignación ${escHTML(emp)}</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#1A1F3C;margin:32px}h1{font-size:20px;margin:0 0 4px;color:#151E6B}.top{display:flex;justify-content:space-between;border-bottom:3px solid #2F3BA2;padding-bottom:14px;margin-bottom:18px}
    small{color:#8892B0;font-size:11px;letter-spacing:.06em;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;background:#E8EBFA;padding:8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
    td{padding:8px;border-bottom:1px solid #DDE3F0}td.n,th.n{text-align:right}tfoot td{font-weight:700;border-top:2px solid #2F3BA2}.firm{display:flex;gap:60px;margin-top:70px}.firm div{flex:1;border-top:1px solid #1A1F3C;padding-top:6px;font-size:12px;text-align:center}</style></head><body>
    <div class="top"><div><h1>Reporte de consignación</h1><small>OrbisCORP S.A. de C.V. · Seguridad industrial</small></div><div style="text-align:right"><small>Fecha</small><br><b>${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</b></div></div>
    <p><small>Cliente / empresa</small><br><b>${escHTML(emp)}</b></p><p><small>Consulta</small><br>${escHTML([c.nombre, c.apellido].filter(Boolean).join(' ') || c.email)}</p>
    <table><thead><tr><th>Producto</th><th>SKU</th><th class="n">Cantidad</th></tr></thead><tbody>${CE.consig.map(p => `<tr><td>${escHTML(p.producto)}</td><td>${escHTML(p.sku || '')}</td><td class="n">${escHTML(Number(p.cantidad) || 0)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">${CE.consig.length} productos</td><td class="n">${piezas.toLocaleString('es-MX')} pzas</td></tr></tfoot></table>
    <div class="firm"><div>Entrega · OrbisCORP</div><div>Recibe · ${escHTML(emp)}</div></div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
  w.document.close();
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
let _uidPrevio    = null;   // para distinguir "cerró sesión" de "visitante que llega"
let _firmaPrecios = null;   // descuento con el que se pintó la vista actual

function _resolverAuth() {
  if (!_initAuthResolved) { _initAuthResolved = true; _resolveAuthReady(); }
}

/* Vuelve a pintar precios sin perder filtros ni página */
function _rerenderVistaActual() {
  if (window._currentCat) {
    const cat = VIEWS_CONFIG[window._currentCat]?.cat;
    if (cat) _renderCategoryProducts(cat);
  } else {
    renderShowroom();
    renderHome();
  }
}

onAuthStateChanged(auth, async (firebaseUser) => {
  if (_unsubProfile) { _unsubProfile(); _unsubProfile = null; }

  const habiaSesion = !!_uidPrevio;
  _uidPrevio  = firebaseUser?.uid || null;
  currentUser = firebaseUser;

  if (!firebaseUser) {
    /* === SIN SESIÓN === */
    isAdmin         = false;
    currentCustomer = null;
    _firmaPrecios   = null;
    if (habiaSesion) {
      // Cerró sesión: el carrito pertenece a su cuenta, no se queda en este equipo
      cart = [];
      clearLocalCart();
    } else {
      // Visitante: recuperamos su carrito (antes se borraba en cada recarga)
      cart = loadCartFromLocalStorage();
      _rehidratarCarrito();
    }
    updateCustomerNavBtn(null);
    document.body.classList.remove('admin-mode');
    document.getElementById('admin-toolbar')?.classList.remove('active');
    document.documentElement.style.setProperty('--toolbar-h', '0px');
    const badge = document.getElementById('nav-admin-badge');
    if (badge) badge.style.display = 'none';
    deactivateFields();
    updateCartUI();
    _rerenderVistaActual();
    _resolverAuth();
    return;
  }

  /* === ADMIN === */
  if (firebaseUser.uid === ADMIN_UID) {
    isAdmin         = true;
    currentCustomer = null;
    updateCustomerNavBtn(null);
    document.body.classList.add('admin-mode');
    document.getElementById('admin-toolbar')?.classList.add('active');
    document.documentElement.style.setProperty('--toolbar-h', '44px');
    const badge = document.getElementById('nav-admin-badge');
    if (badge) badge.style.display = 'inline-flex';
    activateFields();
    updateCartUI();
    _rerenderVistaActual();
    _resolverAuth();
    return;
  }

  /* === CLIENTE === */
  isAdmin = false;
  document.body.classList.remove('admin-mode');
  document.getElementById('admin-toolbar')?.classList.remove('active');
  document.documentElement.style.setProperty('--toolbar-h', '0px');
  const badgeCli = document.getElementById('nav-admin-badge');
  if (badgeCli) badgeCli.style.display = 'none';
  deactivateFields();

  const clienteRef = doc(db, 'clientes', firebaseUser.uid);
  let firstSnapshot = true;

  _unsubProfile = onSnapshot(clienteRef, async (snap) => {
    const data = snap.exists()
      ? { uid: snap.id, ...snap.data() }
      : { uid: firebaseUser.uid, email: firebaseUser.email };   // perfil aún sin crear

    currentCustomer = data;
    updateCustomerNavBtn(currentCustomer);
    updatePerfilModalHeader(currentCustomer);
    _prellenarContacto(currentCustomer);

    /* Solo repintamos si cambió lo que afecta al precio. Antes se repintaba
       en cada sincronización del carrito y se perdían filtros y página. */
    const firma = `${data.tiene_descuento === true}|${Number(data.porcentaje_descuento) || 0}`;
    if (firstSnapshot || firma !== _firmaPrecios) {
      _firmaPrecios = firma;
      _rerenderVistaActual();
    }

    if (firstSnapshot) {
      firstSnapshot = false;
      /* === SINCRONIZACIÓN DE CARRITO AL INICIAR SESIÓN ===
         Se fusiona el carrito local con el de la nube y el resultado
         se guarda en ambos lados. */
      const localCart = loadCartFromLocalStorage();
      const cloudCart = Array.isArray(data.carrito) ? data.carrito : [];
      const merged    = mergeCarritos(localCart, cloudCart);

      cart = merged;
      _rehidratarCarrito();
      if (merged.length > 0) {
        try { localStorage.setItem(LS_CART_KEY, JSON.stringify(_slimCart())); } catch (_) {}
        if (snap.exists()) {
          try { await updateDoc(clienteRef, { carrito: _slimCart(), carritoUpdatedAt: serverTimestamp() }); } catch (_) {}
        }
        if (merged.length !== cloudCart.length) {
          showToast(`Carrito listo: ${merged.length} producto${merged.length > 1 ? 's' : ''}`, '🛒');
        }
      }
      updateCartUI();
      _resolverAuth();
    } else {
      updateCartUI();
    }
  }, (err) => {
    console.error('[PROFILE LISTENER]', err);
    _resolverAuth();
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

/* Antes los textos editados por el admin se guardaban pero nunca se leían:
   al recargar volvía el texto original. */
function _aplicarContenido(data) {
  siteData = data || {};
  document.querySelectorAll('[data-field]').forEach(el => {
    if (document.activeElement === el) return;
    const [s, k] = el.dataset.field.split('.');
    const v = siteData?.[s]?.[k];
    if (typeof v !== 'string' || !v.trim()) return;
    if (el.dataset.field === 'hero.title') {
      const lineas = v.split('\n').map(x => x.trim()).filter(Boolean);
      el.innerHTML = lineas
        .map((l, i) => (i === lineas.length - 1 && lineas.length > 1) ? `<em>${escHTML(l)}</em>` : escHTML(l))
        .join('<br>');
    } else {
      el.textContent = v;
    }
  });
}

async function _cargarContenidoSitio() {
  try {
    const snap = await getDoc(REF_CONTENT);
    if (snap.exists()) _aplicarContenido(snap.data());
  } catch (e) {
    console.warn('[CMS] no se pudo leer el contenido:', e?.code);
  }
}

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
  const el    = e.currentTarget;
  const field = el?.dataset.field;
  if (!field) return;
  clearTimeout(el._debounce);
  el._debounce = setTimeout(async () => {
    const [section, key] = field.split('.');
    const val = (field === 'hero.title' ? el.innerText : el.textContent).trim();
    if (!siteData) siteData = {};
    if (!siteData[section]) siteData[section] = {};
    siteData[section][key] = val;
    setSaveStatus('saving');
    try {
      // setDoc + merge: funciona aunque el documento todavía no exista
      await setDoc(REF_CONTENT, { [section]: { [key]: val } }, { merge: true });
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

/* Cada producto recuerda de qué colección viene. Antes todo se intentaba
   guardar en productos_orbis/productos y fallaba con el inventario RIVG. */
const COLECCION_POR_ORIGEN = { orbis: 'productos_orbis', rivg: 'inventario_rivg', erp: 'productos' };
function _refProducto(p) {
  return doc(db, COLECCION_POR_ORIGEN[p?._origen] || 'productos_orbis', p.id);
}

window.openProductModal = function(productId) {
  if (!isAdmin) return;
  const titleEl = document.getElementById('pm-title-el');

  if (productId) {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    if (titleEl) titleEl.textContent = '◈ Editar Producto';
    document.getElementById('pm-id').value          = productId;
    document.getElementById('pm-nombre').value      = p.nombre    || '';
    const pmDesc = document.getElementById('pm-desc');
    pmDesc.value       = p._descGenerada ? '' : (p.desc || '');
    pmDesc.placeholder = p._descGenerada ? `Automática: ${p.desc}` : 'Descripción del producto...';
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
    
    const prod = allProducts.find(p => p.id === productId) || { id: productId };
    await updateDoc(_refProducto(prod), { imageUrl: url });
    _borrarCatalogoCache();

    const idx = allProducts.findIndex(p => p.id === productId);
    if (idx > -1) allProducts[idx].imageUrl = url;
    Object.keys(categoryCovers).forEach(cat => {
      if (categoryCovers[cat]?.id === productId) categoryCovers[cat].imageUrl = url;
    });
    if (window._currentCat) {
      _rerenderVistaActual();
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
    errEl.textContent = 'Completa los campos obligatorios (*)';
    errEl.classList.add('show'); return;
  }

  btnEl.disabled = true; btnEl.textContent = '⟳ Guardando...';
  setSaveStatus('saving');

  try {
    let imageUrl = pmImgUrl;
    if (pmImgFile) {
      const ext = (pmImgFile.name.split('.').pop() || 'jpg').toLowerCase();
      const ref = stRef(storage, `productos/nuevo_${Date.now()}.${ext}`);
      await uploadBytes(ref, pmImgFile, { contentType: pmImgFile.type, cacheControl: 'public,max-age=31536000' });
      imageUrl = await getDownloadURL(ref);
    }

    const visibles = { nombre, categoria: cat, precio: precio || null, sku, inventario, desc, imageUrl, esPortada };
    const existId  = document.getElementById('pm-id').value;
    // Vacío = la tienda sigue generando la descripción automáticamente

    if (existId) {
      const actual = allProducts.find(p => p.id === existId) || { id: existId };
      if (actual._origen === 'rivg') {
        /* Inventario sincronizado: se usan los nombres de campo de subir_inventario.py.
           Ojo: si el script vuelve a subir este código puede sobrescribir precio y cantidad. */
        await updateDoc(_refProducto(actual), {
          descripcion: nombre, codigo: sku, cantidad: inventario,
          precio_unitario: precio || null,
          precio_total_iva: precio ? Math.round(precio * 1.16 * 100) / 100 : null,
          categoria_web: cat, descripcion_web: desc, imageUrl, esPortada,
          updatedAt: serverTimestamp()
        });
        visibles.precio_con_iva = precio ? Math.round(precio * 1.16 * 100) / 100 : null;
      } else {
        await updateDoc(_refProducto(actual), { ...visibles, updatedAt: serverTimestamp() });
      }
      const idx = allProducts.findIndex(p => p.id === existId);
      if (idx > -1) allProducts[idx] = enriquecer({ ...allProducts[idx], ...visibles, _descAuto: undefined, _txt: undefined });
    } else {
      const newRef = await addDoc(COL_PRODS, { ...visibles, creadoEn: serverTimestamp(), updatedAt: serverTimestamp() });
      allProducts.unshift(enriquecer({ ...visibles, id: newRef.id, _origen: 'orbis', _ts: Date.now() }));
    }
    _reagrupar();
    _indiceSku = null;

    pmImgFile = null; pmImgUrl = imageUrl;
    _borrarCatalogoCache();
    _buildNavMenus();
    await _reloadCovers();
    if (window._currentCat) _rerenderVistaActual();
    setSaveStatus('saved');
    closeProdModal();
    showToast(`"${nombre}" guardado`, '✅');
  } catch (e) {
    console.error('[SAVE PROD]', e);
    setSaveStatus('error');
    showToast(e?.code === 'permission-denied' ? 'Sin permiso para guardar (revisa las reglas)' : 'Error al guardar el producto', '❌');
  } finally {
    btnEl.disabled = false; btnEl.textContent = 'Guardar →';
  }
};

window.deleteProduct = async function(productId) {
  if (!isAdmin) return;
  const p = allProducts.find(x => x.id === productId) || { id: productId };
  const aviso = p._origen === 'rivg'
    ? '¿Eliminar este producto del inventario sincronizado?\n\nSi el script de inventario lo vuelve a subir, reaparecerá.'
    : '¿Eliminar este producto? Esta acción no se puede deshacer.';
  if (!confirm(aviso)) return;
  try {
    await deleteDoc(_refProducto(p));
    allProducts = allProducts.filter(x => x.id !== productId);
    _borrarCatalogoCache();
    const wasInCart = cart.some(c => c.id === productId);
    cart = cart.filter(c => c.id !== productId);
    if (wasInCart) { persistCart(); updateCartUI(); }
    _buildNavMenus();
    if (window._currentCat) _rerenderVistaActual();
    await _reloadCovers();
    showToast('Producto eliminado', '🗑️');
  } catch (e) {
    console.error('[DEL PROD]', e);
    showToast('Error al eliminar', '❌');
  }
};

/* ══ CALIDAD DEL CATÁLOGO (admin) ══
   Qué le falta al inventario y qué se está corrigiendo automáticamente,
   con descarga en CSV para arreglarlo en el ERP o en subir_inventario.py. */
function _problemasDe(p) {
  const c = p._calidad || {};
  const r = [];
  if (!p.imageUrl) r.push('Sin foto');
  if (c.sinNombre) r.push('Sin nombre en el ERP');
  if (!p.desc) r.push('Sin descripción');
  else if (p._descGenerada) r.push('Descripción automática');
  if (!p.subcategoria) r.push('Sin línea');
  else if (c.lineaDeducida) r.push('Línea deducida');
  if (!p.marca) r.push('Sin marca');
  else if (c.marcaDeducida) r.push('Marca deducida');
  if (c.precioDescartado != null) r.push(`Precio de relleno ($${c.precioDescartado})`);
  else if (p.precio == null) r.push('Sin precio');
  else if (p.precio < 10) r.push('Precio muy bajo');
  if (c.nombreCorregido) r.push('Nombre corregido');
  return r;
}

window.abrirCalidad = function() {
  if (!isAdmin) return;
  const total = allProducts.length;
  const cuenta = f => allProducts.filter(f).length;
  const filas = [
    ['Sin foto',                       cuenta(p => !p.imageUrl),            'Súbelas desde cada tarjeta (botón Cambiar imagen).'],
    ['Sin nombre en el ERP',           cuenta(p => p._calidad?.sinNombre),  'Venían como "(sin descripción)". La tienda les pone un nombre provisional; corrígelo en el ERP.'],
    ['Descripción automática',         cuenta(p => p._descGenerada),        'La tienda la escribe sola según el tipo de producto. Puedes reemplazarla desde Editar.'],
    ['Descripción escrita a mano',     cuenta(p => p.desc && !p._descGenerada), ''],
    ['Con variantes de talla o color', cuenta(p => p._grupo),               `Agrupados en ${_grupos.size} productos con selector de talla/color.`],
    ['Sin línea (no salen en filtros)', cuenta(p => !p.subcategoria),        'Agrega la subcategoría en el ERP o en subir_inventario.py.'],
    ['Línea deducida del nombre',      cuenta(p => p._calidad?.lineaDeducida), 'Funciona, pero conviene guardarla en el inventario.'],
    ['Sin marca',                      cuenta(p => !p.marca),               ''],
    ['Marca deducida del nombre',      cuenta(p => p._calidad?.marcaDeducida), ''],
    ['Sin precio o precio de relleno', cuenta(p => p.precio == null),       'Se muestran como "Precio a consultar".'],
    ['Precio menor a $10',             cuenta(p => p.precio != null && p.precio < 10), 'Revisa que no sean errores de captura.'],
    ['Nombre en mayúsculas corregido', cuenta(p => p._calidad?.nombreCorregido), '']
  ];

  let modal = document.getElementById('modal-calidad');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-calidad';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="modal-panel wide">
      <div class="modal-head">
        <span class="modal-head-title">Calidad del catálogo · ${total.toLocaleString('es-MX')} productos</span>
        <button class="modal-close" onclick="document.getElementById('modal-calidad').classList.remove('open')" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">
        <table class="calidad-tabla">
          <tbody>${filas.map(([k, n, tip]) => `<tr>
              <th>${k}${tip ? `<small>${tip}</small>` : ''}</th>
              <td><b>${n.toLocaleString('es-MX')}</b><span>${total ? Math.round(n / total * 100) : 0}%</span></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="modal-foot">
        <button class="mcancel-btn" onclick="descargarDescripcionesCSV()">Descripciones (CSV)</button>
        <button class="msave-btn" onclick="descargarCalidadCSV()">Pendientes (CSV)</button>
      </div>
    </div>`;
  modal.classList.add('open');
};

function _descargarCSV(filas, nombre) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\ufeff' + filas.map(f => f.map(q).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Para subir las descripciones al ERP o a Firestore (campo descripcion_web) */
window.descargarDescripcionesCSV = function() {
  const filas = [['codigo', 'nombre_tienda', 'nombre_erp', 'categoria', 'linea', 'marca', 'unidad', 'automatica', 'descripcion_web']];
  allProducts.forEach(p => filas.push([p.sku || p.id, p.nombre, p.nombreOriginal || '', p.categoria, p.subcategoria, p.marca, p.unidad, p._descGenerada ? 'si' : 'no', p.desc]));
  _descargarCSV(filas, 'descripciones-catalogo');
};

window.descargarCalidadCSV = function() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [['codigo', 'nombre', 'categoria', 'linea', 'marca', 'precio', 'existencia', 'pendientes']];
  allProducts.forEach(p => {
    const prob = _problemasDe(p);
    if (prob.length) filas.push([p.sku || p.id, p.nombre, p.categoria, p.subcategoria, p.marca, p.precio, p.inventario, prob.join('; ')]);
  });
  const csv = '﻿' + filas.map(f => f.map(q).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `calidad-catalogo-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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

window.reloadData = async function(silencioso = false) {
  const ok = await loadAllProducts();
  if (ok) _guardarCatalogoCache();
  await _despuesDeCargarCatalogo();
  if (!silencioso) showToast(ok ? 'Catálogo actualizado' : 'No se pudo actualizar el catálogo', ok ? '↺' : '⚠️');
};

async function _despuesDeCargarCatalogo() {
  _reagrupar();
  _buildNavMenus();
  renderHome();
  _pintarFavBadge();
  _rehidratarCarrito();
  updateCartUI();
  _actualizarStatProductos();
  await _reloadCovers();            // también repinta el showroom
  if (window._currentCat) _rerenderVistaActual();
}

/* El "500+" del hero se calcula con el catálogo real, salvo que el admin
   lo haya escrito a mano desde el editor. */
function _actualizarStatProductos() {
  if (siteData?.hero?.statA) return;
  const n = allProducts.length;
  if (n < 50) return;
  const el = document.querySelector('[data-field="hero.statA"]');
  if (el && document.activeElement !== el) el.textContent = `${(Math.floor(n / 50) * 50).toLocaleString('es-MX')}+`;
}

/* ══ CACHÉ DEL CATÁLOGO ══
   La segunda visita pinta los productos al instante con lo que se guardó
   la vez anterior y, en paralelo, trae la versión fresca de Firestore. */
const LS_CATALOGO_KEY = 'orbiscorp_catalogo_v3';  // v3: con descripciones, ficha y variantes
const CATALOGO_TTL_MS = 24 * 60 * 60 * 1000;

function _leerCatalogoCache() {
  try {
    const raw = localStorage.getItem(LS_CATALOGO_KEY);
    if (!raw) return null;
    const { t, items } = JSON.parse(raw);
    if (!Array.isArray(items) || Date.now() - t > CATALOGO_TTL_MS) return null;
    return items;
  } catch (_) { return null; }
}
function _guardarCatalogoCache() {
  try {
    const items = allProducts.map(({ _txt, ...p }) => p);
    localStorage.setItem(LS_CATALOGO_KEY, JSON.stringify({ t: Date.now(), items }));
  } catch (_) { /* cuota llena: la tienda sigue funcionando sin caché */ }
}
function _borrarCatalogoCache() {
  try { localStorage.removeItem(LS_CATALOGO_KEY); } catch (_) {}
}

/* ══════════════════════════════════════════════
   CARGA DE DATOS
═══════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   MENÚS DEL NAVBAR — GENERADOS DESDE EL INVENTARIO
   Antes eran listas fijas con búsquedas de texto ("japones", "desbaste")
   que ya no coincidían con nada. Ahora cada menú se arma con las
   subcategorías y marcas que realmente existen, con su conteo, y filtran
   por campo exacto en lugar de por texto.
═══════════════════════════════════════════════ */

const MAX_MARCAS_MENU = 8;

function _buildNavMenus() {
  document.querySelectorAll('[data-navmenu]').forEach(cont => {
    const catName = cont.dataset.navmenu;
    const slug    = CAT_META[catName]?.slug;
    if (!slug) return;

    const prods = allProducts.filter(p => p.categoria === catName);

    // Sin datos todavía (o categoría vacía): solo el enlace a la categoría
    if (!prods.length) {
      cont.innerHTML = `<div class="mega-col">
        <ul><li><a onclick="navigate('${slug}')">Ver categoría completa</a></li></ul>
      </div>`;
      cont.classList.remove('mega-menu');
      return;
    }

    const contar = campo => {
      const c = {};
      prods.forEach(p => { if (p[campo]) c[p[campo]] = (c[p[campo]] || 0) + 1; });
      return Object.entries(c).sort((a, b) => b[1] - a[1]);
    };

    const subs   = contar('subcategoria');
    const marcas = contar('marca');
    const esc    = v => String(v).replace(/'/g, "\\'");

    const col = (titulo, opciones, clave) => {
      if (!opciones.length) return '';
      return `<div class="mega-col">
        <h4>${titulo}</h4>
        <ul>
          ${opciones.map(([nom, n]) => `
            <li><a onclick="navigate('${slug}', { ${clave}: '${escJS(nom)}' })">
              <span class="mega-item-name">${escHTML(nom)}</span>
              <span class="mega-item-count">${n}</span>
            </a></li>`).join('')}
        </ul>
      </div>`;
    };

    const columnas =
      col('Líneas', subs, 'sub') +
      col('Marcas', marcas.slice(0, MAX_MARCAS_MENU), 'marca');

    // Si la categoría no tiene ni líneas ni marcas, no desplegamos nada
    if (!columnas) {
      cont.innerHTML = `<div class="mega-col">
        <ul><li><a onclick="navigate('${slug}')">Ver categoría completa</a></li></ul>
      </div>`;
      cont.classList.remove('mega-menu');
      return;
    }

    const multi = (subs.length ? 1 : 0) + (marcas.length ? 1 : 0) > 1;
    cont.classList.toggle('mega-menu', multi);

    cont.innerHTML = columnas + `
      <div class="mega-foot">
        <a onclick="navigate('${slug}')">Ver los ${prods.length} productos de ${catName} →</a>
      </div>`;
  });

  _syncNavDropdownFlechas();
}

/* Oculta la flecha ▾ de las categorías que no tienen submenú útil */
function _syncNavDropdownFlechas() {
  document.querySelectorAll('.nav-dropdown').forEach(li => {
    const menu = li.querySelector('[data-navmenu]');
    const link = li.querySelector('a[data-route]');
    if (!menu || !link) return;
    const tieneSub = menu.querySelectorAll('li').length > 1;
    link.classList.toggle('sin-submenu', !tieneSub);
  });
}

/* En pantallas táctiles el hover no existe: el primer toque abre el menú,
   el segundo entra a la categoría. */
function _initNavDropdownsTactil() {
  if (!window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.nav-dropdown').forEach(li => {
    const link = li.querySelector('a[data-route]');
    if (!link) return;
    link.addEventListener('click', e => {
      const menu = li.querySelector('[data-navmenu]');
      if (!menu || menu.querySelectorAll('li').length <= 1) return;
      if (!li.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.nav-dropdown.open').forEach(o => o.classList.remove('open'));
        li.classList.add('open');
      }
    }, true);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown.open').forEach(o => o.classList.remove('open'));
    }
  });
}

function _tsMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return Number(v) || 0;
}

/* Carga ambas fuentes EN PARALELO. Devuelve true si se obtuvo algo.
   La limpieza y el enriquecimiento viven en catalogo.js. */
async function loadAllProducts() {
  const [rOrbis, rRivg] = await Promise.allSettled([getDocs(COL_PRODS), getDocs(COL_INVENTARIO_RIVG)]);
  const lista = [];

  // 1. PRODUCTOS MANUALES (ORBIS)
  if (rOrbis.status === 'fulfilled') {
    rOrbis.value.forEach(d => {
      const { creadoEn, updatedAt, ...resto } = d.data();
      lista.push(enriquecer({ ...resto, id: d.id, _origen: 'orbis', _ts: _tsMillis(creadoEn) }));
    });
  } else {
    console.error('[PRODS MANUALES] Error:', rOrbis.reason?.message);
  }

  // 2. INVENTARIO REAL (RIVG) — catalogo.js limpia nombre, marca, línea y precio,
  //    y genera la descripción y la ficha técnica cuando el ERP no las trae.
  if (rRivg.status === 'fulfilled') {
    rRivg.value.forEach(d => {
      const p = desdeInventario(d.data(), d.id);
      if (p) lista.push(p);
    });
  } else {
    console.error('[INVENTARIO_RIVG] Error:', rRivg.reason?.message);
  }

  // Si todo falló (sin internet) conservamos lo que ya había en pantalla
  if (!lista.length && allProducts.length) return false;

  allProducts = lista;
  window._allProductsCache = allProducts;
  _reagrupar();
  _indiceSku = null;
  return lista.length > 0;
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

/* Botón principal del navbar: en categorías lleva a pedir cotización */
window.navCtaClick = () => (window._currentCat ? scrollToContact() : scrollToCatalog());

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
let _yPrev = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  document.getElementById('back-to-top')?.classList.toggle('show', y > 400);
  document.getElementById('main-nav')?.classList.toggle('scrolled', y > 40);
  // En el celular el botón del asistente se aparta al bajar y vuelve al subir (ver CSS)
  if (Math.abs(y - _yPrev) > 8) {
    document.body.classList.toggle('fab-fuera', y > _yPrev && y > 240);
    _yPrev = y;
  }
  document.body.classList.toggle('fab-hero', !window._currentCat && y < 260);
}, { passive: true });

/* ── Barra de navegación: compacta por pasos hasta que todo quepa ──
   Funciona con cualquier ancho, zoom del sistema (125 %, 150 %…), nombre
   largo del cliente o fuente que tarde en cargar. Ver CSS "nav-n1…n4". */
let _navRaf = 0;
function _ajustarNav() {
  _navRaf = 0;
  const inner = document.querySelector('#main-nav .nav-inner');
  const b = document.body;
  const quitar = () => b.classList.remove('nav-n1', 'nav-n2', 'nav-n3', 'nav-n4');
  quitar();
  if (!inner || window.innerWidth <= 768) return;
  const cabe = () => {
    if (inner.scrollWidth > inner.clientWidth + 1) return false;
    const der = inner.getBoundingClientRect().right;
    return [...inner.children].every(el => el.getBoundingClientRect().right <= der + 1);
  };
  for (let n = 1; n <= 4 && !cabe(); n++) b.classList.add(`nav-n${n}`);
}
window._ajustarNav = () => { if (!_navRaf) _navRaf = requestAnimationFrame(_ajustarNav); };
window.addEventListener('resize', window._ajustarNav, { passive: true });
window.addEventListener('load', window._ajustarNav);
try { document.fonts?.ready.then(window._ajustarNav); } catch (_) {}
try {
  const nr = document.querySelector('#main-nav .nav-right');
  if (nr && 'ResizeObserver' in window) {
    let ancho = 0;
    new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (Math.abs(w - ancho) > 2) { ancho = w; window._ajustarNav(); }
    }).observe(nr);
  }
} catch (_) {}
window._ajustarNav();

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
/* Arranque. Si el DOM ya está listo (módulos diferidos, caché del navegador)
   se ejecuta de inmediato; antes podía quedarse esperando un evento que ya pasó. */
async function _iniciarTienda() {
  renderSkeletons();
  document.querySelectorAll('.js-anio').forEach(el => { el.textContent = new Date().getFullYear(); });

  // 1. Si hay catálogo de la visita anterior, se pinta al instante
  const enCache = _leerCatalogoCache();
  if (enCache?.length) {
    allProducts = enCache;
    window._allProductsCache = allProducts;
    _reagrupar();
  }
  _pintarFavBadge();

  { const { route, filtro } = _leerHash(); _applyRoute(route, filtro); }

  if (enCache?.length) {
    _buildNavMenus();
    renderShowroom();
    renderHome();
    setTimeout(hideLoader, 150);
  }

  _cargarContenidoSitio();

  // 2. Catálogo fresco y sesión EN PARALELO (antes uno esperaba al otro)
  const [ok] = await Promise.all([loadAllProducts(), authReadyPromise]);
  if (ok) _guardarCatalogoCache();
  await _despuesDeCargarCatalogo();
  _initNavDropdownsTactil();
  hideLoader();

  // 3. Enlace directo a un producto: tienda.com/?p=CODIGO
  const params = new URLSearchParams(location.search);
  const pid = params.get('p');
  if (pid && allProducts.some(p => p.id === pid)) openQV(pid);

  // 4. Carrito compartido: tienda.com/?carrito=CODIGO*2;CODIGO*1
  const compartido = params.get('carrito');
  if (compartido) {
    let texto = '';
    try { texto = decodeURIComponent(compartido); } catch (_) { texto = compartido; }
    try { history.replaceState(history.state, '', `${location.pathname}${location.hash}`); } catch (_) {}
    abrirPedidoRapido(texto.split(';').map(x => x.replace(/\*(\d+)$/, ' $1')).join('\n'), 'Te compartieron esta lista de productos');
  }
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', _iniciarTienda);
else _iniciarTienda();

/* ══════════════════════════════════════════════
   ASISTENTE VIRTUAL (v2)
   · El servidor busca en el catálogo real y Gemini arma la recomendación.
   · Respuesta en JSON: texto + productos (con motivo y cantidad) +
     sugerencias + "ver más" + aviso de asesor.
   · La conversación sobrevive a recargas (sessionStorage).
   · Si el servidor falla, responde con la búsqueda local del catálogo.
═══════════════════════════════════════════════ */
const chatAsistenteCall = httpsCallable(functionsClient, 'chatAsistente');
const CHAT_KEY = 'orbis_chat_v2';
const CHAT_MAX_SESION = 40;          // tope suave del navegador; el real lo pone el servidor
let _chat = { mensajes: [], enviados: 0 };
let _chatOcupado = false;
let _chatPintado = false;

try {
  const guardado = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
  if (guardado && Array.isArray(guardado.mensajes)) _chat = { mensajes: guardado.mensajes.slice(-40), enviados: Number(guardado.enviados) || 0 };
} catch (_) { /* almacenamiento bloqueado: la conversación vive solo en memoria */ }
function _chatGuardar() {
  try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ mensajes: _chat.mensajes.slice(-40), enviados: _chat.enviados })); } catch (_) {}
}

const _chatAbierto = () => document.getElementById('chatbot-window')?.classList.contains('open');
const _qvAbierto = () => document.getElementById('quick-view-modal')?.classList.contains('open');

window.toggleChatbot = (forzar) => {
  const win = document.getElementById('chatbot-window');
  if (!win) return;
  const abrir = typeof forzar === 'boolean' ? forzar : !win.classList.contains('open');
  win.classList.toggle('open', abrir);
  if (abrir) win.classList.remove('detras');
  document.getElementById('chatbot-fab')?.setAttribute('aria-expanded', String(abrir));
  document.getElementById('chat-nudge')?.remove();
  if (abrir) {
    if (!_chatPintado || !_chat.mensajes.length) _chatRender();
    setTimeout(() => document.getElementById('chat-input')?.focus({ preventScroll: true }), 120);
  }
};

/* ── Sugerencias según dónde está el cliente ── */
const _CHIPS_CAT = {
  epp:          ['Equipo completo para soldar', 'Protección para trabajo en altura', 'Guantes para químicos', 'Respirador para polvo'],
  soldadura:    ['Equipo completo para soldar', 'Careta para soldar', 'Guantes de carnaza'],
  abrasivos:    ['Disco para cortar metal de 4 1/2', '¿Qué disco uso para desbaste?', 'Lijas para madera'],
  herramientas: ['Esmeriladora para uso rudo', 'Brocas para concreto', 'Carbones para mi herramienta'],
  ferreteria:   ['Material para instalación eléctrica', 'Selladores para fugas', 'Tornillería y taquetes'],
};
const _CHIPS_INICIO = ['Equipo completo para soldar', 'Protección para trabajo en altura', 'Discos de corte para metal', 'Respirador contra polvo'];

function _chipsContexto() {
  if (_qvAbierto() && currentQvProductId) {
    const p = allProducts.find(x => x.id === currentQvProductId);
    if (p) return [
      p._tipoVariante === 'tallas' || p._tipoVariante === 'opciones' ? '¿Qué talla me recomiendas?' : '¿Para qué trabajos sirve?',
      '¿Qué más necesito con este producto?',
      '¿Tienen existencia suficiente?'
    ];
  }
  return _CHIPS_CAT[window._currentCat] || _CHIPS_INICIO;
}

/* ── Pintado ── */
function _chatTexto(t) {
  return escHTML(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\n)\s*[-•]\s+/g, '$1• ')
    .replace(/\n/g, '<br>');
}

function _chatTarjeta(item, i) {
  const p = allProducts.find(x => x.id === item.id);
  if (!p) return '';
  const id = escJS(p.id);
  const pd = getPrecioData(p.precio);
  const { inv, out } = getStockInfo(p);
  const qty = Math.max(1, Number(item.cantidad) || 1);
  const precio = !hayUsuarioLogueado()
    ? `<button type="button" class="chat-card__login" onclick="openLoginCliente()">🔒 Inicia sesión para ver precio</button>`
    : pd.sinPrecio ? '<span class="chat-card__precio">Precio a cotizar</span>'
    : `<span class="chat-card__precio">${fmtPrice(pd.final)} <small>+ IVA</small></span>`;
  const stock = inv === null ? '' : out
    ? '<span class="chat-card__stock out">Agotado</span>'
    : `<span class="chat-card__stock${inv <= 5 ? ' low' : ''}">${inv <= 5 ? `¡Solo ${inv}!` : `${inv} disponibles`}</span>`;
  const variantes = p._grupo && _grupos.get(p._grupo)?.length > 1
    ? `<button type="button" class="chat-card__var" onclick="chatVerProducto('${id}')">${p._variante ? escHTML(p._variante) + ' · ' : ''}ver ${_grupos.get(p._grupo).length} ${p._tipoVariante === 'colores' ? 'colores' : p._tipoVariante === 'tallas' ? 'tallas' : 'opciones'}</button>` : '';
  const img = p.imageUrl
    ? `<img src="${escHTML(p.imageUrl)}" alt="" loading="lazy">`
    : `<span class="chat-card__ico" aria-hidden="true">${CAT_META[p.categoria]?.icon || '📦'}</span>`;
  return `<article class="chat-card" style="--i:${i}">
      <button type="button" class="chat-card__img" onclick="chatVerProducto('${id}')" aria-label="Ver ${escHTML(p.nombre)}">${img}</button>
      <div class="chat-card__body">
        <button type="button" class="chat-card__nombre" onclick="chatVerProducto('${id}')">${escHTML(p.nombre)}</button>
        ${item.motivo ? `<p class="chat-card__motivo">${escHTML(item.motivo)}</p>` : ''}
        <div class="chat-card__meta">${precio}${stock}</div>
        ${variantes}
        <button type="button" class="chat-card__add" onclick="chatAgregar('${id}', ${qty})" ${out ? 'disabled' : ''}>
          ${out ? 'Sin existencia' : qty > 1 ? `+ Agregar ${qty}` : '+ Agregar al carrito'}
        </button>
      </div>
    </article>`;
}

function _chatBot(m, idx, esUltimo) {
  const prods = (m.productos || []).filter(x => allProducts.some(p => p.id === x.id));
  const disponibles = prods.filter(x => !getStockInfo(allProducts.find(p => p.id === x.id)).out);
  let html = '';
  if (m.texto) html += `<div class="chat-texto">${_chatTexto(m.texto)}</div>`;
  if (prods.length) html += `<div class="chat-cards">${prods.map(_chatTarjeta).join('')}</div>`;
  if (disponibles.length >= 2) {
    html += `<button type="button" class="chat-kit" onclick="chatAgregarTodo(${idx})">🛒 Agregar ${disponibles.length === prods.length ? `los ${disponibles.length}` : `los ${disponibles.length} disponibles`} al carrito</button>`;
  }
  if (m.verMas) {
    const etiqueta = m.verMas.busqueda ? `Ver más: ${escHTML(m.verMas.busqueda)}` : 'Ver más opciones';
    html += `<button type="button" class="chat-ver-mas" onclick="chatVerMas(${idx})">${etiqueta} <span aria-hidden="true">→</span></button>`;
  }
  if (m.asesor) {
    html += `<button type="button" class="chat-asesor" onclick="chatWhatsApp()">💬 Seguir con un asesor por WhatsApp</button>`;
  }
  if (m.modo === 'respaldo' || m.modo === 'local') {
    html += `<div class="chat-nota">Búsqueda rápida en el catálogo</div>`;
  }
  const chips = esUltimo ? (m.sugerencias || []) : [];
  const chipsHTML = chips.length
    ? `<div class="chat-sugerencias">${chips.map(c => `<button type="button" onclick="enviarMensajeChat('${escJS(c)}')">${escHTML(c)}</button>`).join('')}</div>` : '';
  return `<div class="msg bot${m.error ? ' chat-error' : ''}${m.tipo === 'local' ? ' chat-aviso' : ''}">${html}</div>${chipsHTML}`;
}

function _chatRender() {
  const cont = document.getElementById('chat-messages');
  if (!cont) return;
  const bienvenida = `<div class="msg bot"><div class="chat-texto">¡Hola! 👋 Soy el asesor virtual de OrbisCORP. Cuéntame <strong>qué trabajo vas a hacer</strong> y te armo el equipo adecuado, o pregúntame por cualquier producto, talla o existencia.</div></div>`;
  const ultimoBot = _chat.mensajes.map(m => m.tipo).lastIndexOf('bot') ;
  const ultimoAny = _chat.mensajes.length - 1;
  let html = bienvenida;
  if (!_chat.mensajes.length) {
    html += `<div class="chat-sugerencias">${_chipsContexto().map(c => `<button type="button" onclick="enviarMensajeChat('${escJS(c)}')">${escHTML(c)}</button>`).join('')}</div>`;
  }
  _chat.mensajes.forEach((m, i) => {
    if (m.tipo === 'user') html += `<div class="msg user">${escHTML(m.texto)}</div>`;
    else html += _chatBot(m, i, i === ultimoAny && (i === ultimoBot || m.tipo === 'local'));
  });
  cont.innerHTML = html;
  _chatPintado = true;
  cont.scrollTop = cont.scrollHeight;
  _chatEstadoInput();
}

function _chatEstadoInput() {
  const input = document.getElementById('chat-input');
  const btn = document.querySelector('.chat-input-area button');
  const agotado = _chat.enviados >= CHAT_MAX_SESION;
  if (input) {
    input.disabled = agotado;
    input.placeholder = agotado ? 'Límite de esta sesión: sigue por WhatsApp' : 'Escribe tu pregunta…';
  }
  if (btn) btn.disabled = agotado || _chatOcupado;
}

/* ── Acciones de las tarjetas ── */
window.chatVerProducto = (id) => {
  if (window.matchMedia('(max-width: 900px)').matches) toggleChatbot(false);
  else document.getElementById('chatbot-window')?.classList.add('detras');
  openQV(id);
};
window.chatAgregar = (id, qty = 1) => {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const inv = p.inventario != null ? Number(p.inventario) : null;
  if (inv !== null && inv <= 0) { showToast('Producto sin existencia', '⚠️'); return; }
  const item = cart.find(c => c.id === id);
  const actual = item ? item.qty : 0;
  let nueva = actual + Math.max(1, Number(qty) || 1);
  let tope = false;
  if (inv !== null && nueva > inv) { nueva = inv; tope = true; }
  if (nueva === actual) { showToast('Ya tienes toda la existencia en tu carrito', '⚠️'); return; }
  if (item) item.qty = nueva; else cart.push(_itemCarrito(p, nueva));
  persistCart(); updateCartUI(); _refreshProductCardBtn(id);
  showToast(tope ? `Solo hay ${inv}: agregamos ${nueva - actual} de "${p.nombre}"` : `"${p.nombre}" añadido (${nueva - actual})`, tope ? '⚠️' : '✅');
};
window.chatAgregarTodo = (idx) => {
  const m = _chat.mensajes[idx];
  if (!m) return;
  let n = 0;
  (m.productos || []).forEach(x => {
    const p = allProducts.find(q => q.id === x.id);
    if (!p || getStockInfo(p).out) return;
    const item = cart.find(c => c.id === p.id);
    const inv = p.inventario != null ? Number(p.inventario) : Infinity;
    const nueva = Math.min((item ? item.qty : 0) + Math.max(1, Number(x.cantidad) || 1), inv);
    if (item) item.qty = nueva; else cart.push(_itemCarrito(p, nueva));
    _refreshProductCardBtn(p.id);
    n++;
  });
  if (!n) return;
  persistCart(); updateCartUI();
  showToast(`${n} productos agregados a tu carrito`, '🛒');
};
window.chatVerMas = (idx) => {
  const vm = _chat.mensajes[idx]?.verMas;
  if (!vm) return;
  const q = vm.busqueda || '';
  if (vm.categoria && vm.categoria !== 'todas' && VIEWS_CONFIG[vm.categoria]) navigate(vm.categoria, q ? { q } : null);
  else navigate('buscar', q ? { q } : null);
  if (window.matchMedia('(max-width: 900px)').matches) toggleChatbot(false);
};
window.chatWhatsApp = () => {
  const ultimaPregunta = [..._chat.mensajes].reverse().find(m => m.tipo === 'user')?.texto || '';
  const ids = [];
  _chat.mensajes.forEach(m => (m.productos || []).forEach(x => { if (!ids.some(y => y.id === x.id)) ids.push(x); }));
  const lineas = ids.slice(-6).map(x => {
    const p = allProducts.find(q => q.id === x.id);
    return p ? `• ${p.nombre} (cód. ${p.sku})${x.cantidad > 1 ? ` × ${x.cantidad}` : ''}` : '';
  }).filter(Boolean);
  const msg = `Hola OrbisCORP, vengo del asistente de la tienda en línea.` +
    (ultimaPregunta ? `\n\nMi consulta: ${ultimaPregunta}` : '') +
    (lineas.length ? `\n\nProductos que me recomendaron:\n${lineas.join('\n')}` : '');
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};
window.nuevaConversacionChat = () => {
  _chat = { mensajes: [], enviados: _chat.enviados };
  _chatGuardar();
  _chatRender();
  document.getElementById('chat-input')?.focus();
};
/* Botón de la vista rápida: abre el asistente con preguntas de ese producto */
window.preguntarAlAsistente = () => {
  const p = allProducts.find(x => x.id === currentQvProductId);
  if (!p) return;
  const ultimo = _chat.mensajes[_chat.mensajes.length - 1];
  if (!(ultimo && ultimo.tipo === 'local' && ultimo.productoId === p.id)) {
    _chat.mensajes.push({ tipo: 'local', productoId: p.id, texto: `Estás viendo **${p.nombre.replace(/[.\s]+$/, '')}**. ¿Qué quieres saber?`, sugerencias: _chipsContexto() });
    _chatGuardar();
  }
  _chatRender();
  toggleChatbot(true);
};

/* ── Respaldo sin servidor: búsqueda local ── */
const _CHAT_RELLENO = new Set('necesito ocupo busco quiero tienen tienes hay venden manejan algo algun alguna que cual como donde cuanto me mi se por favor hola buenas gracias precio cuesta para trabajo hacer usar recomiendas sirve'.split(' '));
function _chatBusquedaLocal(texto) {
  const terminos = prepararConsulta(texto).filter(a => !_CHAT_RELLENO.has(a[0]));
  if (!terminos.length) return [];
  const minimo = terminos.length <= 2 ? 1 : Math.ceil(terminos.length / 2);
  const txt = p => textoBusqueda(p);
  const vistos = new Set();
  return allProducts
    .map(p => [terminos.filter(alts => alts.some(a => txt(p).includes(a))).length, p])
    .filter(([n]) => n >= minimo)
    .sort((a, b) => b[0] - a[0] || puntaje(b[1], texto, terminos) - puntaje(a[1], texto, terminos))
    .map(([, p]) => p)
    .filter(p => { const k = p._grupo || p.id; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 4);
}

/* ── Envío ── */
function _chatHistorial() {
  return _chat.mensajes.filter(m => m.tipo === 'user' || (m.tipo === 'bot' && !m.error)).slice(-8).map(m => {
    if (m.tipo === 'user') return { rol: 'user', texto: m.texto };
    const nombres = (m.productos || []).map(x => allProducts.find(p => p.id === x.id)?.nombre).filter(Boolean);
    return { rol: 'model', texto: `${m.texto || ''}${nombres.length ? `\n(Productos mostrados: ${nombres.join('; ')})` : ''}` };
  });
}
function _chatContexto() {
  const mostrados = [];
  [..._chat.mensajes].reverse().forEach(m => (m.productos || []).forEach(x => { if (!mostrados.includes(x.id)) mostrados.push(x.id); }));
  return {
    vista: window._currentCat || 'home',
    productoId: _qvAbierto() ? currentQvProductId : null,
    carrito: cart.slice(0, 15).map(c => ({ id: c.id, cantidad: c.qty })),
    mostrados: mostrados.slice(0, 8)
  };
}

window.enviarMensajeChat = async (textoDirecto) => {
  if (_chatOcupado || _chat.enviados >= CHAT_MAX_SESION) return;
  const input = document.getElementById('chat-input');
  const texto = (typeof textoDirecto === 'string' ? textoDirecto : input?.value || '').trim().slice(0, 500);
  if (!texto) return;
  if (!_chatAbierto()) toggleChatbot(true);

  const historial = _chatHistorial();
  const contexto = _chatContexto();
  _chatOcupado = true;
  _chat.enviados++;
  _chat.mensajes.push({ tipo: 'user', texto });
  if (input) input.value = '';
  _chatRender();

  const cont = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'msg bot chat-pensando';
  typing.innerHTML = '<span class="chat-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-pensando__txt">Pensando…</span>';
  cont.appendChild(typing);
  cont.scrollTop = cont.scrollHeight;
  const fases = ['Buscando en el catálogo…', 'Revisando existencias…', 'Armando tu recomendación…'];
  let f = 0;
  const reloj = setInterval(() => { const t = typing.querySelector('.chat-pensando__txt'); if (t) t.textContent = fases[Math.min(f++, fases.length - 1)]; }, 1400);

  let respuesta;
  try {
    const { data } = await chatAsistenteCall({ mensaje: texto, historial, contexto });
    if (data && data.version >= 2) {
      respuesta = {
        tipo: 'bot',
        texto: String(data.respuesta || ''),
        productos: (data.productos || []).filter(x => x && allProducts.some(p => p.id === x.id)),
        verMas: data.verMas || null,
        sugerencias: Array.isArray(data.sugerencias) ? data.sugerencias.slice(0, 3) : [],
        asesor: !!data.asesor,
        modo: data.modo || 'ia'
      };
    } else {
      // Servidor viejo (etiquetas [PRODUCTO:ID]): se convierte al formato nuevo
      const crudo = String(data?.respuesta || '');
      const productos = [...crudo.matchAll(/\[PRODUCTO:([^\]]+)\]/g)].map(x => ({ id: x[1].trim(), cantidad: 1 })).filter(x => allProducts.some(p => p.id === x.id));
      const vm = crudo.match(/\[VER_MAS:([^:\]]+):([^\]]+)\]/);
      respuesta = { tipo: 'bot', texto: crudo.replace(/\[(PRODUCTO|VER_MAS)[^\]]*\]/g, '').trim(), productos,
        verMas: vm ? { categoria: normTxt(vm[1]).trim(), busqueda: vm[2].trim().slice(0, 40) } : null, sugerencias: [], asesor: false, modo: 'ia' };
    }
    if (!respuesta.texto && !respuesta.productos.length) respuesta.texto = '¿Me das más detalles de tu trabajo para recomendarte bien?';
  } catch (error) {
    console.error('Error en el asistente:', error);
    if (error?.code === 'functions/resource-exhausted') {
      respuesta = { tipo: 'bot', texto: error.message || 'Alcanzaste el límite de mensajes por ahora.', productos: [], asesor: true, modo: 'limite' };
    } else {
      _chat.enviados--;   // un error no cuenta como consulta
      const locales = _chatBusquedaLocal(texto);
      respuesta = {
        tipo: 'bot',
        texto: locales.length
          ? 'Tuve un problema para conectarme, pero esto encontré en el catálogo:'
          : '⚠ Tuve un problema de conexión. Intenta de nuevo en un momento o escríbenos por WhatsApp.',
        productos: locales.map(p => ({ id: p.id, cantidad: 1 })),
        asesor: true,
        modo: 'local',
        sugerencias: [texto.slice(0, 60)]
      };
    }
  } finally {
    clearInterval(reloj);
    _chatOcupado = false;
  }
  _chat.mensajes.push(respuesta);
  _chatGuardar();
  _chatRender();
  // Que se vea el inicio de la respuesta, no el final de las tarjetas
  const burbujas = cont.querySelectorAll('.msg.bot');
  const ultima = burbujas[burbujas.length - 1];
  if (ultima && ultima.offsetHeight > cont.clientHeight * 0.6) {
    cont.style.scrollBehavior = 'auto';
    cont.scrollTop += ultima.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
    cont.style.scrollBehavior = '';
  }
};

/* Invitación discreta, una sola vez por navegador */
setTimeout(() => {
  try {
    if (localStorage.getItem('orbis_chat_nudge') || _chatAbierto() || _chat.mensajes.length) return;
    localStorage.setItem('orbis_chat_nudge', '1');
  } catch (_) { return; }
  const fab = document.getElementById('chatbot-fab');
  if (!fab) return;
  const n = document.createElement('button');
  n.id = 'chat-nudge'; n.type = 'button';
  n.innerHTML = '¿Te ayudo a elegir tu equipo? <span aria-hidden="true">✨</span>';
  n.onclick = () => toggleChatbot(true);
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 9000);
}, 25000);

/* Al cerrar la vista rápida, el asistente vuelve al frente */
const _closeQVBase = window.closeQV;
window.closeQV = (...args) => {
  _closeQVBase(...args);
  document.getElementById('chatbot-window')?.classList.remove('detras');
};