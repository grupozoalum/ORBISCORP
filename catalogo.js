/* ══════════════════════════════════════════════════════════════════
   catalogo.js — Limpieza y enriquecimiento del inventario OrbisCORP
   ──────────────────────────────────────────────────────────────────
   El inventario llega del ERP con huecos: productos "(sin descripción)",
   nombres en MAYÚSCULAS, marcas escritas dentro del nombre, Ferretería y
   Herramientas sin línea, y CERO descripciones para la tienda.

   Este módulo arregla todo eso al vuelo, sin tocar Firestore:
     · nombre legible (y un nombre útil cuando el ERP no trae ninguno)
     · descripción de venta según el tipo de producto
     · ficha técnica: talla, color, medidas, contenido, compatibilidad
     · unidad de venta (pieza, par, caja, juego, bolsa…)
     · línea (subcategoría) y marca deducidas
     · variantes: agrupa el mismo producto en otras tallas o colores
     · usos ("compra por necesidad": soldar, alturas, químicos…)
     · búsqueda con sinónimos, plurales y corrección de errores

   Lo que el admin escriba a mano (descripcion_web) SIEMPRE tiene prioridad
   sobre lo generado aquí.
═══════════════════════════════════════════════════════════════════ */

export const CATS_WEB = ['EPP', 'Abrasivos', 'Soldadura', 'Herramientas', 'Ferretería'];

export function normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
const capital = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* ── Correcciones puntuales por código (errores de captura del ERP) ── */
const CORRECCIONES = {
  'C0304P04140EE': { nombre: 'Playera Cab. c/r PC m/l marino, EEG', subcategoria: 'Cuerpo Completo' },
  'GUA-ELEC-AMA':  { nombre: 'Guantes para electricista', categoria: 'EPP', subcategoria: 'Guantes' },
  'CH-REFLEX-NA':  { nombre: 'Chaleco Reflex naranja', subcategoria: 'Cuerpo Completo' },
  'CHBRR-VDEBA':   { nombre: 'Chaleco brigadista ROCKER verde bandera', subcategoria: 'Cuerpo Completo' },
  '2,02E+11':      { nombre: 'Tapón auditivo reusable con caja HA-SP-0073', subcategoria: 'Protección Auditiva', sku: 'HA-SP-0073' },
  'S-18105':       { nombre: 'Despachador de pared para tapones auditivos Moldex SparkPlugs, chico', subcategoria: 'Protección Auditiva', marca: 'Moldex' },
  '49556':         { marca: 'Volteck' },                       // el ERP le puso "3M" por el "3MP"
  '3700406':       { nombre: 'Papel térmico para impresora Dräger (10 años de archivo)', categoria: 'EPP', subcategoria: 'Protección Respiratoria', marca: 'Dräger' },
  '26150727A0':    { nombre: 'Refacción Dremel 26150727A0' },
  '0601391G0':     { categoriaOrigen: 'Herramienta Eléctrica' }, // es una herramienta, no una refacción
  '2615MS52AA':    { categoriaOrigen: 'Accesorios' },
  '2615M450AD':    { categoriaOrigen: 'Accesorios' },
  '12337':         { categoria: 'EPP', subcategoria: 'Cascos' },
  '10763':         { categoria: 'EPP', subcategoria: 'Alturas' },
  '18416': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' }, '18417': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' },
  '17408': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' }, '17409': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' },
  '14416': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' }, '101132': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' },
  '101133': { categoria: 'EPP', subcategoria: 'Cuerpo Completo' },
  '13037': { categoria: 'Abrasivos', subcategoria: 'Desbaste' }, '13038': { categoria: 'Abrasivos', subcategoria: 'Desbaste' },
  '13039': { categoria: 'Abrasivos', subcategoria: 'Desbaste' },
  '1600AD11H7': { oculto: true },                              // duplicado sin precio de 1600A011H7
  // Registros vacíos: sin nombre, sin categoría y sin precio. No se pueden vender.
  '725024': { oculto: true }, '724971': { oculto: true }, '724970': { oculto: true }, '7771444': { oculto: true }
};

/* ── Nombres legibles ── */
const _PALABRAS_MINUSC = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'en', 'a', 'al', 'por', 'sin', 'e', 'o', 'p/', 'c/', 'x']);
const _SIGLAS = new Set(['EPP', 'PVC', 'LED', 'MSA', 'NOM', 'ANSI', 'TPE', 'USB', 'HSS', 'HSS-CO', 'UV', 'AC', 'DC', 'LI', 'SDS', 'CE', 'RE', 'STD', 'GOP', 'GPO', 'GHO', 'GWS', 'GSR', 'GSB', 'GBM', 'GBH', 'GKS', 'GST', 'GLL', 'GDX', 'GSH', 'GAL', 'GBA', 'XL', 'XG', 'XXL', 'CH', 'MD', 'GD', 'AF', 'MIG', 'TIG', 'CYL-1', 'II', 'III', 'MX', 'DBI', 'N95', 'P95', 'P100', 'FFP2', 'WC', 'ABS', 'PPR', 'POM', 'AWG', 'EZ', 'AD', 'EG', 'EEG', 'CJA']);

export function limpiarNombre(s) {
  let t = String(s || '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  t = t.replace(/escobillll?as/gi, m => m[0] === 'E' ? 'Escobillas' : 'escobillas')
       .replace(/\b[lL]ll\b/g, 'III').replace(/\bAlata\b/g, 'Alta').replace(/â\?¢/g, '™')
       .replace(/\bjgo\./gi, 'juego').replace(/,\s*$/, '');
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  if (letras.length >= 6 && mayus / letras.length >= 0.75) {
    t = t.split(' ').map((w, i) => {
      const base = w.replace(/[.,;:()"'´]/g, '');
      if (/\d/.test(w)) return w;
      if (_SIGLAS.has(base.toUpperCase())) return w.toUpperCase();
      if (base.length === 1 && !/^[yaeo]$/i.test(base)) return w.toUpperCase();
      const low = w.toLowerCase();
      if (i > 0 && _PALABRAS_MINUSC.has(low)) return low;
      if (base.length >= 2 && base.length <= 4 && !/[AEIOUÁÉÍÓÚ]/i.test(base)) return w.toUpperCase();
      return i === 0 ? capital(low) : low;
    }).join(' ');
  }
  return acentuar(t);
}

/* Acentos y erratas frecuentes del ERP (respetando mayúscula inicial) */
const _ACENTOS = [
  ['bano', 'baño'], ['banos', 'baños'], ['ninos', 'niños'], ['espanol', 'español'], ['espanolas', 'españolas'],
  ['metalico', 'metálico'], ['metalica', 'metálica'], ['metalicos', 'metálicos'], ['plastico', 'plástico'], ['plastica', 'plástica'],
  ['plasticos', 'plásticos'], ['electrico', 'eléctrico'], ['electrica', 'eléctrica'], ['electronica', 'electrónica'],
  ['liquido', 'líquido'], ['liquida', 'líquida'], ['silicon', 'silicón'], ['laton', 'latón'], ['poliester', 'poliéster'],
  ['termomagnetico', 'termomagnético'], ['modulos', 'módulos'], ['linea', 'línea'], ['nucleo', 'núcleo'], ['baston', 'bastón'],
  ['algodon', 'algodón'], ['jardin', 'jardín'], ['mecanico', 'mecánico'], ['flexometro', 'flexómetro'], ['multimetro', 'multímetro'],
  ['cautin', 'cautín'], ['carbon', 'carbón'], ['torica', 'tórica'], ['proteccion', 'protección'], ['ergonomico', 'ergonómico'],
  ['quirurgica', 'quirúrgica'], ['medico', 'médico'], ['triangulo', 'triángulo'], ['lampara', 'lámpara'], ['mascara', 'máscara'],
  ['valvula', 'válvula'], ['exhalacion', 'exhalación'], ['particulas', 'partículas'], ['acidos', 'ácidos'], ['organicos', 'orgánicos'],
  ['polietileno', 'polietileno'], ['vinil', 'vinil'], ['angular', 'angular'], ['hidraulico', 'hidráulico'], ['electricista', 'electricista'],
  ['pulgadas', 'pulgadas'], ['caidas', 'caídas'], ['retractil', 'retráctil'], ['ultima', 'última'], ['rapido', 'rápido'],
  ['destapacanos', 'destapacaños'], ['canos', 'caños'], ['reflejante', 'reflejante'], ['bascula', 'báscula'], ['electronico', 'electrónico']
];
const _ACENTOS_MAP = new Map(_ACENTOS.filter(([a, b]) => a !== b));
function acentuar(t) {
  return t.replace(/[A-Za-zñÑ]+/g, w => {
    const r = _ACENTOS_MAP.get(w.toLowerCase());
    if (!r) return w;
    if (w === w.toUpperCase() && w.length > 1) return r.toUpperCase();
    return w[0] === w[0].toUpperCase() ? capital(r) : r;
  });
}

/* ── Marcas ── */
const _MARCAS = [
  ['truper expert', 'Truper Expert'], ['expert', 'Truper Expert'], ['truper', 'Truper'], ['pretul', 'Pretul'],
  ['foset', 'Foset'], ['fiero', 'Fiero'], ['hermex', 'Hermex'], ['volteck', 'Volteck'], ['klintek', 'Klintek'],
  ['bosch', 'Bosch'], ['dremel', 'Dremel'], ['urrea', 'Urrea'], ['surtek', 'Surtek'], ['stanley', 'Stanley'],
  ['dewalt', 'DeWalt'], ['makita', 'Makita'], ['milwaukee', 'Milwaukee'], ['3m', '3M'], ['msa', 'MSA'],
  ['infra', 'Infra'], ['lincoln', 'Lincoln Electric'], ['austromex', 'Austromex'], ['uvex', 'Uvex'],
  ['honeywell', 'Honeywell'], ['steelpro', 'Steel Pro'], ['steel pro', 'Steel Pro'], ['jyrsa', 'Jyrsa'], ['lack', 'Lack'],
  ['matex', 'Matex'], ['protecta', 'Protecta'], ['drager', 'Dräger'], ['moldex', 'Moldex'], ['ansell', 'Ansell'],
  ['libus', 'Libus'], ['derma', 'Derma'], ['rocker', 'Rocker'], ['herhild', 'Herhild'], ['dbi sala', '3M DBI-SALA']
];
export function marcaDesdeTexto(s, sku = '') {
  const t = ` ${normTxt(s).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [clave, nombre] of _MARCAS) if (t.includes(` ${clave} `)) return nombre;
  if (/^3m[\s-]/i.test(String(sku))) return '3M';
  return null;
}
function quitarMarcaFinal(nombre, marca) {
  if (!marca) return nombre;
  const limpio = nombre.replace(/,\s*((truper\s+)?expert|truper|pretul|foset|fiero|hermex|volteck|klintek|urrea|surtek)\.?\s*$/i, '');
  return limpio.length >= 8 ? limpio : nombre;
}

/* ── Categoría web ── */
const ORIGEN_A_WEB = { 'Refacciones': 'Herramientas', 'Accesorios': 'Herramientas', 'Herramienta Eléctrica': 'Herramientas' };
export function clasificarPorTexto(descripcion) {
  const d = normTxt(descripcion);
  const tiene = arr => arr.some(w => d.includes(w));
  if (tiene(['soldar', 'soldadura', 'electrodo', 'careta para soldador', 'microalambre', 'carnaza', 'cautin'])) return 'Soldadura';
  if (tiene(['casco', 'cachucha', 'guante', 'arnes', 'lente', 'goggle', 'careta', 'orejera', 'tapon', 'respirador', 'mascarilla',
             'cartucho', 'chaleco', 'bota', 'calzado', 'faja', 'mandil', 'barbiquejo', 'absorbedor', 'eslinga', 'linea de vida'])) return 'EPP';
  if (tiene(['disco de corte', 'disco diam', 'disco desbaste', 'abrasivo', 'desbaste', 'lija', 'laminado', 'flap'])) return 'Abrasivos';
  if (tiene(['bosch', 'dremel', 'taladro', 'esmeril', 'amoladora', 'atornillador', 'rotomartillo', 'broca', 'escobilla',
             'carbon', 'inducido', 'rodamiento', 'interruptor', 'portaescobilla'])) return 'Herramientas';
  return 'Ferretería';
}

/* ── Líneas (subcategorías) deducidas del nombre ── */
const _LINEAS = {
  'Herramientas': [
    ['Carbones y escobillas',     ['carbon', 'carbones', 'escobilla', 'escobillas', 'portaescobilla', 'portaescobillas', 'plato portaescobillas']],
    ['Inducidos y estatores',     ['inducido', 'expansion polar']],
    ['Interruptores',             ['interruptor', 'switch', 'modulo electronico', 'modulo de accionamiento']],
    ['Rodamientos y juntas',      ['rodamiento', 'balero', 'junta torica', 'anillo', 'muelle', 'reten']],
    ['Taladros y rotomartillos',  ['taladro', 'taladradora', 'rotomartillo']],
    ['Esmeriles y amoladoras',    ['esmeril', 'amoladora', 'miniamoladora']],
    ['Atornilladores',            ['atornillador', 'atornilladora', 'llave de impacto']],
    ['Multicortadoras y rotativas', ['multicortadora', 'multimax', 'multi-max', 'herramienta rotativa', 'oscilante']],
    ['Pulidoras y cepilladoras',  ['pulidora', 'lijadora', 'cepilladora']],
    ['Baterías y cargadores',     ['bateria', 'baterias', 'cargador', 'kit de iniciacion']],
    ['Brocas',                    ['broca', 'brocas', 'broq', 'portabrocas', 'progresor']],
    ['Puntas y fresas',           ['punta', 'puntas', 'fresa', 'puntero', 'adaptador standard']],
    ['Discos y lijas',            ['disco', 'discos', 'lija', 'borla', 'caperuza/borla']],
    ['Hojas y seguetas',          ['segueta', 'seg.', 'hojas multi', 'cuchilla']],
    ['Sets de accesorios',        ['set', 'kit', 'surt']],
  ],
  'Ferretería': [
    ['Selladores, adhesivos y lubricantes', ['sellador', 'silicon', 'adhesivo', 'adh', 'espuma expansiva', 'grasa', 'lubricante', 'aceite', 'aceitera', 'pasta para soldar', 'soldadura con nucleo']],
    ['Tornillería y fijación',    ['tornillo', 'tuerca', 'tuercas', 'rondana', 'arandelas', 'taquete', 'taquetes', 'ancla', 'pija', 'pijas', 'remache', 'clavo', 'clavos', 'abrazadera', 'abrazaderas', 'alcayatas', 'armellas', 'bandola', 'cadena', 'cinchos', 'grapas']],
    ['Brocas',                    ['broca', 'brocas', 'broquero']],
    ['Pinzas',                    ['pinza', 'pinzas', 'crimpadora']],
    ['Amarre y elevación',        ['eslinga', 'sujetador con matraca', 'tensores', 'lazo', 'rafia', 'hilo para albanil', 'hilo para albañil']],
    ['Cuchillas y cutters',       ['cuchilla', 'cuchillas', 'cutter', 'navaja']],
    ['Puntas, dados y matracas',  ['mecanico', 'dado', 'dados', 'punta', 'puntas', 'matraca', 'extension cuadro', 'extension de 6']],
    ['Desarmadores',              ['desarmador', 'desarmadores']],
    ['Llaves',                    ['llave combinada', 'llaves combinadas', 'llave ajustable', 'llave stilson', 'llave de cruz', 'llaves allen', 'llaves espanolas', 'llave espanola']],
    ['Martillos y percusión',     ['martillo', 'mazo', 'marro', 'zapapico', 'cincel', 'barreta']],
    ['Corte y desbaste manual',   ['segueta', 'seguetas', 'arco', 'serrucho', 'lima', 'cortador', 'extractor', 'machuelos', 'tijera']],
    ['Lijas',                     ['lija', 'lijas', 'discos de lija']],
    ['Medición',                  ['flexometro', 'flexometros', 'nivel', 'detector de materiales', 'escuadra', 'escuadras', 'calibrador', 'vernier', 'multimetro', 'bascula', 'tiralineas']],
    ['Cintas',                    ['cinta', 'cintas']],
    ['Pintura',                   ['espatula', 'rodillo', 'brocha', 'felpas', 'pintura']],
    ['Plomería',                  ['termofusora', 'manguera para boiler', 'valvula', 'llave angular', 'mezcladora', 'regadera', 'cople', 'codo 90', 'conector de cobre', 'conector para pealpe', 'adaptador macho', 'adaptador hembra', 'tubo de', 'flotador', 'pichancha', 'cartucho de compresion', 'accesorios para wc', 'tuerca izquierda', 'manerales', 'brida de acero', 'multiconector', 'tapon capa', 'llave p/manguera', 'manguera para gas']],
    ['Material eléctrico',        ['multicontacto', 'cable', 'cables', 'clavija', 'extension', 'contacto', 'contactos', 'interruptor', 'placa', 'condulet', 'conduit', 'canaleta', 'centro de carga', 'capuchones', 'terminales', 'portalampara']],
    ['Iluminación y energía',     ['luminario', 'reflector', 'lampara', 'linterna', 'luz de noche', 'pilas', 'detector de humo', 'camara']],
    ['Limpieza',                  ['escoba', 'trapeador', 'jalador', 'recogedor', 'cubeta', 'cepillo', 'franela', 'estopa', 'destapacanos', 'pastillas', 'polish', 'cera', 'aceite rojo', 'tapete']],
    ['Jardinería',                ['pala', 'rastrillo', 'azadon', 'carretilla', 'pistola', 'herramientas para jardin', 'malla sombra', 'hilo para desbrozadora', 'tijera poda', 'tijera forjada']],
    ['Cerrajería y herrajes',     ['candado', 'cerradura', 'cerrojo', 'portacandado', 'pasador', 'perilla', 'jaladera', 'tope', 'caja de seguridad', 'guardapolvo', 'tubo redondo', 'brida cromada', 'portarrollo', 'accesorios para bano']],
    ['Ropa de trabajo y lluvia',  ['gabardina', 'impermeable', 'overol', 'chamarra', 'rodilleras']],
    ['Organización',              ['caja', 'organizador', 'estuche', 'maletin', 'gaveta', 'porta herramientas']],
    ['Escaleras',                 ['escalera']],
    ['Herramienta eléctrica',     ['esmeriladora', 'cautin', 'termofusora']],
  ]
};
const _RE_LINEAS = {};
Object.entries(_LINEAS).forEach(([cat, reglas]) => {
  _RE_LINEAS[cat] = reglas.map(([linea, claves]) =>
    [linea, new RegExp(`(^|[^a-z])(${claves.map(k => k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(es|s)?($|[^a-z])`)]);
});
export function lineaDesdeTexto(nombre, categoria, origen) {
  if (categoria === 'Herramientas' && origen === 'Herramienta Eléctrica') {
    const l = _buscarLinea(nombre, 'Herramientas'); return l && !/brocas|puntas|discos|hojas|sets/i.test(l) ? l : 'Herramienta eléctrica';
  }
  const l = _buscarLinea(nombre, categoria);
  if (l) return l;
  if (categoria === 'Herramientas' && origen === 'Refacciones') return 'Otras refacciones';
  if (categoria === 'Herramientas' && origen === 'Accesorios') return 'Otros accesorios';
  return null;
}
function _buscarLinea(nombre, categoria) {
  const reglas = _RE_LINEAS[categoria];
  if (!reglas) return null;
  const t = normTxt(nombre);
  for (const [linea, re] of reglas) if (re.test(t)) return linea;
  return null;
}

/* ══ Ficha técnica: talla, color, medidas, contenido, compatibilidad ══ */
const _COLORES = {
  amarillo: 'amarillo', amarilla: 'amarillo', naranja: 'naranja', gris: 'gris', azul: 'azul', blanco: 'blanco', blanca: 'blanco',
  rojo: 'rojo', roja: 'rojo', verde: 'verde', negro: 'negro', negra: 'negro', neon: 'neón', lila: 'lila', beige: 'beige',
  rosa: 'rosa', marino: 'marino', rey: 'rey', limon: 'limón', bandera: 'bandera', canario: 'canario', mango: 'mango',
  perla: 'perla', oxford: 'oxford', claro: 'claro', transparente: 'transparente', espejo: 'espejo', fluorescente: 'fluorescente',
  bco: 'blanco', ama: 'amarillo', vde: 'verde', azl: 'azul', nja: 'naranja', nga: 'negro', ngo: 'negro', cl: 'claro', gr: 'gris'
};
const _COLOR_INICIO = new Set(['amarillo', 'naranja', 'gris', 'azul', 'blanco', 'rojo', 'verde', 'negro', 'neón', 'lila', 'beige', 'rosa', 'claro', 'transparente', 'espejo', 'fluorescente', 'marino']);
const _ORDEN_TALLAS = ['XXS', 'XS', 'CH', 'S', 'M', 'MD', 'G', 'L', 'GD', 'XL', 'XG', 'XXL', '2XG', 'EG', 'EEG'];

const RE_TALLA = [
  /\b(?:t|talla|no)\s*[.\-\/]?\s*(xxs|xs|xxl|xl|2xg|xg|eeg|eg|ch|md|gd|s|m|l|g|\d{1,2})\b/,
  /#\s*0?(\d{1,2})\b/,
  /\b(\d{2})\s*p\s*-/,                  // calzado "25 P- CASCO…"
  /\bt(g|m|ch|xg|l)\b/,                 // "CHALECO ROBERT ROJO TG"
  /,\s*(xg|eeg|eg|ch|m|g|l)\s*$/,       // "…de nitrilo, M"
  /\btalla\s+(xxs|xs|xxl|xl|2xg|xg|eeg|eg|ch|md|gd|s|m|l|g|\d{1,2})\b/
];

export function extraerSpecs(nombre, sku = '', subcat = '', categoria = 'EPP') {
  const t = normTxt(nombre);
  const s = {};
  const conTalla = categoria === 'EPP' || /impermeable|gabardina|rodilleras|chaleco|playera|pantalon/.test(t);

  if (conTalla) for (const re of RE_TALLA) { const m = t.match(re); if (m) { s.talla = m[1].toUpperCase().replace(/^0/, ''); break; } }
  if (conTalla && !s.talla && /guante|faja|manga/i.test(normTxt(nombre))) {
    const m = String(sku).match(/-(10|[5-9]|xxl|xl|xg|ch|md|gd|g|m|l|s)$/i);   // "51-670-8" → talla 8
    if (m) s.talla = m[1].toUpperCase();
  }
  if (s.talla === 'MD') s.talla = 'M';
  if (s.talla === 'GD') s.talla = 'G';

  // Color: primera palabra de color + las que la acompañan ("azul marino", "verde limón")
  const palabras = t.replace(/[^a-z0-9ñ/ ]+/g, ' ').split(/[\s/]+/);
  for (let i = 0; i < palabras.length; i++) {
    const c = _COLORES[palabras[i]];
    if (!c || !_COLOR_INICIO.has(c)) continue;
    if (palabras[i].length <= 3 && !/\b(bco|ama|vde|azl|nja|nga|ngo)\b/.test(palabras[i])) continue;
    // "Anteojo NEON Gris": NEON es el modelo, el color real viene después
    if (c === 'neón' && palabras.slice(i + 1).some(w => _COLORES[w] && _COLOR_INICIO.has(_COLORES[w]) && w.length > 3)) continue;
    const frase = [c];
    const sig = _COLORES[palabras[i + 1]];
    if (sig && (!_COLOR_INICIO.has(sig) || (c === 'azul' && sig === 'marino'))) frase.push(sig);
    s.color = capital(frase.join(' '));
    break;
  }

  // Medidas: pulgadas, mm, cm, m, kg, g, ml, W, V, Ah, A, oz, lb, dB, AWG, lm
  const medidas = [];
  let orig = String(nombre);
  const dims = orig.match(/(\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?)\s*(mm|cm|m)(?![a-z])/i);
  if (dims) { medidas.push(`${dims[1].replace(/\s+/g, ' ')} ${dims[2].toLowerCase()}`); orig = orig.replace(dims[0], ' '); }
  const reMed = /(?<![\w\-\/.,])(\d+(?:[.,]\d+)?(?:\s*-\s*\d+\/\d+|\/\d+)?)\s*("|''|(?:pulg(?:adas)?|mm|cm|m|mts|kg|g|ml|l|w|v|ah|a|oz|lb|db|awg|lm|ft3|amp)(?![a-záéíóúñ0-9]))/gi;
  let m;
  while ((m = reMed.exec(orig)) && medidas.length < 4) {
    let u = m[2].toLowerCase();
    if (u === "''" || u.startsWith('pulg')) u = '"';
    if (u === 'mts') u = 'm';
    if (u === 'db') u = 'dB';
    if (u === 'w' || u === 'v' || u === 'a' || u === 'ah') u = u.toUpperCase().replace('AH', 'Ah');
    if (u === 'amp') u = 'A';
    const val = m[1].replace(/\s+/g, '');
    if (/^#/.test(val)) continue;
    medidas.push(u === '"' ? `${val}"` : `${val} ${u}`);
  }
  if (medidas.length) s.medidas = [...new Set(medidas)].join(' · ');

  const cont = t.match(/(?:c\/|con|cja|caja|bolsas?\s*c\/)\s*(\d+)\s*(piezas|pzas?|pz|pcs|uds|cuchillas|discos|puntas|brocas|dados|llaves|desarmadores|taquetes|cinchos|grapas|capuchones|terminales|pilas)/)
            || t.match(/(\d+)\s*(piezas|pzas|pz|uds|accesorios|accs)\b/);
  if (cont) s.contenido = `${cont[1]} ${cont[2].replace(/^pzas?$|^pz$|^pcs$|^uds$/, 'piezas').replace(/^accs$/, 'accesorios')}`;

  // Modelo compatible / modelo de la herramienta
  const mod = String(nombre).match(/\b((?:GWS|GSB|GBH|GSH|GKS|GBM|GOP|GSR|GPO|GHO|GAL)\s?[\d][\w\-,./]*(?:\s?(?:RE|DSR|VC|LI|CE|S))?)/i)
           || String(nombre).match(/\b(DREMEL\s?\d{4})\b/i) || String(nombre).match(/\b(D\d{5}(?:,\s*D\d{5})*)\b/);
  if (mod) s.modelo = mod[1].replace(/\s+/g, ' ').toUpperCase().replace('DREMEL', 'Dremel').replace(/^(D\d{5})/, 'DeWalt $1');

  const nrr = t.match(/(\d{2})\s*db/);
  if (nrr) s.reduccion = `${nrr[1]} dB`;

  return s;
}

/* ── Unidad de venta ── */
export function unidadDe(nombre, subcat = '') {
  const t = normTxt(nombre);
  if (/\b(caja|cja)\b/.test(t) && /\d+\s*(piezas|pzas|pz)/.test(t)) return 'Caja';
  if (/^(bolsa|bolsas)\b|bolsas?\s*c\//.test(t)) return 'Bolsa';
  if (/^(blister|blíster)\b/.test(t)) return 'Blíster';
  if (/^(juego|set|kit|surt)\b|\bjgo\b|juego de/.test(t)) return 'Juego';
  if (/^(rollo|carrete)\b/.test(t)) return 'Rollo';
  if (/^(estuche|paquete|dispensador)\b|\bpqt\b/.test(t)) return 'Paquete';
  if (/^metro de\b/.test(t)) return 'Metro';
  if (/^(guante|guantes)\b/.test(t) && !/desechable|caja/.test(t)) return 'Par';
  if (/calzado/i.test(subcat) || /^(bota|botas|tenis|borcegui|calzado|floter)\b/.test(t)) return 'Par';
  if (/^tapon(es)? (auditiv|desechable|de espuma)/.test(t)) return 'Par';
  if (/^(botas|rodilleras|orejera)\b/.test(t)) return 'Par';
  return 'Pieza';
}

/* ══ Usos — "Compra por necesidad" ══ */
export const USOS = [
  { id: 'soldadura',    nombre: 'Soldadura y corte',        sub: 'Caretas, guantes y lentes de sombra', re: /sold|careta|carnaza|vaqueta|\btig\b|\bmig\b|aluminizad|sombra 5|cosmos|electrodo/, cats: ['EPP', 'Soldadura'] },
  { id: 'alturas',      nombre: 'Trabajo en altura',        sub: 'Arneses, líneas de vida y anclajes',  re: /arnes de seguridad|arnes hawk|linea de vida|absorbedor|punto fijo|anticaida|retractil|correa de seguridad|barbiquejo|barboquejo|mentonera/ },
  { id: 'respiratoria', nombre: 'Polvo, gases y vapores',   sub: 'Respiradores, cartuchos y filtros',   re: /respirador|mascarilla|semimascara|cartucho|filtro|n95|p95|p100|ffp2|prefiltro|retenedor/, cats: ['EPP'] },
  { id: 'quimicos',     nombre: 'Químicos y líquidos',      sub: 'Guantes, goggles y mandiles',         re: /neopreno|acido|quimic|derma kel|sol-?vex|nitrilo solido|guante de pvc|guante negro 18|mandil de p\.?v\.?c|vapores organicos|gases acidos|goggle|google|desechable/, cats: ['EPP'] },
  { id: 'ruido',        nombre: 'Ruido',                    sub: 'Tapones y orejeras',                  re: /tapon|orejera|auditiv/, cats: ['EPP'] },
  { id: 'corte',        nombre: 'Riesgo de cortes',         sub: 'Guantes y mangas anticorte',          re: /anticorte/ },
  { id: 'visibilidad',  nombre: 'Visibilidad y señalización', sub: 'Chalecos, cintas y señales viales', re: /chaleco|reflejante|delimitadora|triangulo|lampara de destellos|baston de seguridad|banderola|brazalete|cadena plastica|antiderrapante/ },
  { id: 'lluvia',       nombre: 'Lluvia',                   sub: 'Impermeables y gabardinas',           re: /impermeable|gabardina/ },
  { id: 'electricidad', nombre: 'Instalación eléctrica',    sub: 'Material, pinzas y medición',         re: /electricista|aislar|multimetro|termomagnetico|interruptor|contacto|clavija|extension electrica|condulet|conduit|centro de carga|terminales|crimpadora|pela cables|multicontacto|canaleta|capuchones|cable/, cats: ['Ferretería', 'EPP'] }
];
export const USOS_POR_ID = Object.fromEntries(USOS.map(u => [u.id, u]));

/* ══ Generador de descripciones ══
   Cada regla: [expresión sobre nombre+línea normalizados, función → texto].
   Solo se afirma lo que el nombre ya dice; el resto es el uso típico del
   tipo de producto. Nada de certificaciones inventadas. */
const SEG_ARNES = 'El equipo contra caídas funciona como sistema completo (anclaje, conector y arnés) y debe inspeccionarse antes de cada uso.';
const SEG_QUIM = 'Confirma la compatibilidad química con la sustancia que vas a manejar; si tienes la hoja de seguridad, mándanosla y te recomendamos.';

const mica = t => /espejo/.test(t) ? 'Mica espejo que reduce el reflejo del sol en exteriores.'
  : /gris|sombra/.test(t) ? 'Mica gris para trabajo en exteriores con sol intenso.'
  : /amarill/.test(t) ? 'Mica amarilla que mejora el contraste en lugares con poca luz.'
  : /claro|transparente|\bcl\b/.test(t) ? 'Mica clara para trabajo en interiores y uso general.' : '';
const af = t => /\baf\b|anti.?empan|a\/f/.test(t) ? ' Con tratamiento antiempañante.' : '';

const REGLAS = [
  // ── Seguridad vial / señalización (antes que guantes: la banderola vino en "Guantes")
  [/banderola/, () => 'Banderola de malla con reflejante para señalizar vehículos, cargas sobresalientes y zonas de maniobra. Visible de día y de noche.'],
  [/delimitadora|banda delimitadora/, (t) => `Cinta para acordonar y señalizar áreas de riesgo, obras, derrames o zonas en mantenimiento.${/precaucion/.test(t) ? ' Leyenda "Precaución".' : /peligro/.test(t) ? ' Leyenda "Peligro".' : /prohibido/.test(t) ? ' Leyenda "Prohibido el paso".' : ''} Fácil de colocar entre postes, conos o columnas.`],
  [/cinta reflejante/, () => 'Cinta reflejante microprismática para marcar vehículos, remolques, barreras y equipo. Refleja la luz de los faros a gran distancia.'],
  [/cadena plastica/, () => 'Cadena plástica para delimitar pasillos, estacionamientos y zonas restringidas. Ligera, resistente a la intemperie y fácil de cortar a la medida.'],
  [/triangulo vial/, () => 'Triángulo de seguridad para advertir de un vehículo detenido o una obra en la vía. Indispensable en flotillas y unidades de reparto.'],
  [/lampara de destellos/, () => 'Lámpara de destellos para señalización vial nocturna en obras, conos y barreras.'],
  [/baston de seguridad/, () => 'Bastón luminoso para dirigir tránsito y maniobras de vehículos en patios, estacionamientos y obras.'],
  [/brazalete/, () => 'Brazalete para identificar a los integrantes de brigadas de emergencia durante simulacros y evacuaciones.'],

  // ── Calzado
  [/casco de policarbonato|calzado ergonomico|borcegui|floter|bota|botas|tenis de seguridad|nueva lasser/, (t) => {
    const casq = /casco de policarbonato|policarbonato/.test(t) ? 'con casquillo de policarbonato (no metálico y más ligero que el acero)'
      : /casquillo metalico|c\/casq|casq\./.test(t) ? 'con casquillo de acero que protege los dedos contra impactos y aplastamiento'
      : /sin casquillo/.test(t) ? 'sin casquillo, para uso general donde no se requiere protección en la punta'
      : /c\/c\b/.test(t) ? 'con casquillo' : '';
    if (/sanitaria/.test(t)) return 'Bota sanitaria impermeable, fácil de lavar y desinfectar. Ideal para industria alimentaria, rastros, lavado y limpieza.';
    if (/jardinera/.test(t)) return `Bota jardinera de caña alta para trabajo en agua, lodo y áreas húmedas${casq ? `, ${casq}` : ''}. Protege de salpicaduras y humedad durante toda la jornada.`;
    return `Calzado de seguridad${casq ? ` ${casq}` : ''}. Pensado para jornadas largas de pie en planta, obra o almacén. Si tienes duda con la talla, escríbenos por WhatsApp antes de pedir.`;
  }],

  // ── Cabeza
  [/careta.*sold|careta para soldar/, () => 'Careta para soldar que protege rostro y ojos de la radiación, las chispas y las salpicaduras del arco eléctrico. Confirma el número de sombra adecuado para tu proceso (electrodo, MIG o TIG).'],
  [/barbiquejo|barboquejo|mentonera/, () => 'Barbiquejo que mantiene el casco firme al agacharte, trabajar en altura o con viento. Se engancha a la suspensión del casco.'],
  [/visera|protector solar|cubre nuca/, () => 'Accesorio para casco que da sombra y protege nuca, orejas y rostro del sol en trabajo a la intemperie.'],
  [/adaptador (para|de) casco/, () => 'Adaptador para montar protector facial u orejeras directamente en el casco de seguridad.'],
  [/cascos de rescate/, () => 'Kit de casco para rescate y emergencias, pensado para brigadas, protección civil y trabajos en espacios confinados.'],
  [/cachucha|gorra con casquete/, (t) => /gorra/.test(t) ? 'Gorra con casquete interior de protección contra golpes leves. Para mecánicos, almacén y áreas sin riesgo de caída de objetos.'
    : `Casco tipo cachucha${/v-gard/.test(t) ? ' línea V-Gard de MSA' : ''} con suspensión ajustable. Protege la cabeza contra impactos y caída de objetos; su visera frontal deja libre la visión periférica.`],
  [/\bcasco\b/, (t) => `Casco de seguridad${/ala (completa|amplia|ancha)/.test(t) ? ' de ala completa, que además da sombra y desvía agua de lluvia' : ''}${/matraca|fas-trac|securefit/.test(t) ? ' con suspensión de matraca para ajustarlo rápido' : ''}. Protege la cabeza contra impactos y caída de objetos en construcción, plantas y mantenimiento.${/v-gard/.test(t) ? ' Línea V-Gard de MSA.' : ''}`],
  [/cofia/, () => 'Cofia plisada desechable para cubrir el cabello en industria alimentaria, farmacéutica, laboratorios y áreas limpias.'],
  [/capucha/, () => 'Capucha de mezclilla con forro que protege cabeza y cuello del sol, el polvo y las chispas ligeras.'],

  // ── Guantes
  [/manga anticorte/, () => 'Manga anticorte que protege el antebrazo al manejar lámina, vidrio y piezas con filo. Se usa junto con guantes anticorte.'],
  [/protector de aluminio para guante/, () => 'Protector aluminizado que se coloca sobre el guante para reflejar el calor radiante en soldadura, fundición y hornos.'],
  [/guante.*(desechable|desecable)/, (t) => `Guantes desechables de nitrilo${/libre de polvo/.test(t) ? ' libres de polvo' : ''}. Para manejo de alimentos, laboratorio, mantenimiento, pintura y limpieza. Resisten mejor que el látex a aceites y grasas.`],
  [/guantes? (para )?electricista/, () => 'Guantes para electricista. Antes de comprar, confirma con tu asesor la clase dieléctrica y el voltaje de trabajo que requieres.'],
  [/guante.*(anticorte|fibra de vidrio|polietileno)/, (t) => `Guante anticorte para manejo de lámina, vidrio, piezas metálicas con filo y empaques.${/nitrilo/.test(t) ? ' El recubrimiento de nitrilo da agarre firme incluso con piezas aceitosas.' : /poliuretano/.test(t) ? ' Recubrimiento de poliuretano para buena sensibilidad en los dedos.' : ''}`],
  [/guante.*(vaqueta|tig|mig|soldad|soldado)/, () => 'Guante para soldadura en piel resistente al calor y a las chispas. Buena destreza para manipular el material de aporte y la antorcha.'],
  [/guante.*(carnaza|de res|shark|lona)/, () => 'Guante de carnaza para trabajo rudo: carga y descarga, construcción, herrería y manejo de materiales ásperos o calientes.'],
  [/guante.*(japones|puntos)/, () => 'Guante de algodón tipo japonés con recubrimiento para mejorar el agarre. Económico y cómodo para almacén, empaque y trabajo ligero.'],
  [/guante.*(neopreno|acidos|pvc|derma kel|sol-vex|nitrilo solido|18 pulgadas|forro de nitrilo)|derma kel/, (t) => `Guante de ${/neopreno/.test(t) ? 'neopreno' : /pvc|derma kel/.test(t) ? 'PVC' : /sol-vex|nitrilo/.test(t) ? 'nitrilo' : 'protección'} para manejo de químicos, aceites, solventes y limpieza industrial.${/18|14/.test(t) ? ' Puño largo que protege también el antebrazo.' : ''} ${SEG_QUIM}`],
  [/guante.*latex/, () => 'Guante de nylon con recubrimiento de látex en palma: agarre excelente en materiales ásperos, ladrillo, block y piezas húmedas.'],
  [/guante.*nitrilo/, () => 'Guante tejido con recubrimiento de nitrilo: buen agarre con piezas ligeramente aceitosas y resistencia a la abrasión. Para ensamble, mantenimiento y almacén.'],
  [/guante.*poliuretano/, () => 'Guante de nylon con recubrimiento de poliuretano: muy delgado y con gran sensibilidad para ensamble fino, electrónica e inspección.'],
  [/guante/, () => 'Guante de trabajo para proteger las manos en tareas de manejo de materiales, mantenimiento y almacén.'],

  // ── Ojos y cara
  [/kit desmalezador/, () => 'Kit de protección para desmalezar: cubre ojos y rostro de piedras, ramas y residuos que lanza la desbrozadora.'],
  [/protector facial|soporte para proteccion facial/, (t) => /soporte/.test(t) ? 'Soporte con arnés de matraca para colocar el protector facial en la cabeza sin necesidad de casco.' : 'Protector facial que cubre todo el rostro contra partículas, astillas y salpicaduras. Se usa con soporte o adaptador para casco, y sobre lentes de seguridad.'],
  [/mica p\/reemplazo|micas protectoras/, () => 'Mica de repuesto para protector facial o visor. Cámbiala cuando esté rayada para mantener buena visibilidad.'],
  [/goggle|google/, (t) => `Goggle de seguridad que sella alrededor de los ojos contra polvo, partículas y salpicaduras de líquidos.${af(t)} Se puede usar sobre lentes graduados en la mayoría de los casos.`],
  [/lente sombra|sombra 5/, () => 'Lente sombra 5 para trabajos con flama: corte con oxiacetileno, soldadura con gas y soldadura blanda. No sustituye a la careta en soldadura con arco.'],
  [/lente.*visitante/, (t) => `Lente de seguridad tipo visitante, amplio para usarse sobre lentes graduados. ${mica(t)}`],
  [/\blente|anteojo|nemesis/, (t) => `Lente de seguridad que protege contra impacto de partículas en esmerilado, corte, taladrado y trabajo general.${mica(t) ? ' ' + mica(t) : ''}${af(t)}`],

  // ── Respiración
  [/cara completa/, () => 'Respirador de cara completa reutilizable: protege vías respiratorias y también ojos y rostro. Acepta cartuchos o filtros según el contaminante.'],
  [/semimascara|media cara|mascarilla media|resp media cara|mascarilla de media/, () => 'Pieza facial de media cara reutilizable. Se arma con cartuchos o filtros según el contaminante (vapores, gases o partículas). Revisa el ajuste antes de cada uso.'],
  [/arnes (media mascara|para respirador)/, () => 'Arnés de cabeza de repuesto para respirador de media cara. Cámbialo cuando pierda elasticidad para mantener el sello.'],
  [/valvula de exhalacion/, () => 'Válvula de exhalación de repuesto para respirador de media cara.'],
  [/cartucho.*(vapores organicos y gases|multigases|dual)|cartucho dual/, () => 'Cartucho combinado para varios contaminantes (vapores orgánicos, gases ácidos y otros, según modelo). Se usa en pares en la mascarilla compatible.'],
  [/cartucho.*(vapores|organicos)/, () => 'Cartucho para respirador contra vapores orgánicos: pinturas, solventes, thinner y adhesivos. Se usa en pares; revisa que sea compatible con tu mascarilla.'],
  [/cartucho.*(acidos|gases)/, () => 'Cartucho para respirador contra gases ácidos (cloro, ácido clorhídrico, dióxido de azufre). Se usa en pares en la mascarilla compatible.'],
  [/cartucho contra polvos/, () => 'Cartucho para respirador contra polvos y partículas. Se usa en pares en la mascarilla compatible.'],
  [/kit filtro gas/, () => 'Kit de filtros para gases y vapores para semimáscara compatible.'],
  [/retenedor/, () => 'Retenedor para sujetar los prefiltros sobre los cartuchos del respirador.'],
  [/filtro.*(n95|neblinas)/, () => 'Prefiltro para partículas y neblinas sin aceite. Se coloca sobre el cartucho con su retenedor y alarga la vida del cartucho.'],
  [/filtro.*(p100|alta eficiencia)/, () => 'Filtro de alta eficiencia para partículas (incluye humos metálicos de soldadura). Para respirador de media cara o cara completa compatible.'],
  [/boquilla est/, () => 'Boquilla estándar desechable para equipo de medición de aliento.', ['EPP']],
  [/respirador|mascarilla|ffp2|x-plore/, (t) => `Respirador desechable para partículas${/n95/.test(t) ? ' N95' : /p95/.test(t) ? ' P95' : /ffp2/.test(t) ? ' FFP2' : ''}: polvo de lijado, construcción, molienda y barrido.${/anti ?flama/.test(t) ? ' Con tratamiento antiflama, útil cerca de chispas de soldadura.' : ''}${/valvula/.test(t) ? ' La válvula reduce el calor y la humedad dentro de la mascarilla.' : ''}`],
  [/papel termico/, () => 'Rollo de papel térmico de repuesto para la impresora de equipos de medición Dräger. Impresiones con archivo de larga duración.'],

  // ── Oído
  [/despachador/, () => 'Despachador de pared para tapones auditivos desechables. Mantiene los tapones limpios y a la mano en la entrada de áreas con ruido.', ['EPP']],
  [/orejera/, (t) => `Orejera para protección auditiva${/casco/.test(t) ? ' que se monta en el casco de seguridad' : ' con diadema ajustable'}. Para áreas con ruido constante de maquinaria, compresores y esmeriladoras.`, ['EPP']],
  [/tapon/, (t) => `Tapones auditivos ${/espuma|desechable/.test(t) ? 'de espuma desechables' : /reusable|re usable/.test(t) ? 'reutilizables y lavables' : ''} para zonas con ruido constante.${/cordon/.test(t) ? ' Con cordón para no perderlos.' : ''}`.replace('  ', ' '), ['EPP']],

  // ── Alturas
  [/arnes/, () => `Arnés de seguridad de cuerpo completo para trabajo en altura. ${SEG_ARNES}`],
  [/linea de (vida|caidas)|retractil/, (t) => `${/retractil/.test(t) ? 'Línea autorretráctil que acompaña tu movimiento y frena en caso de caída.' : 'Línea de vida para conectar el arnés al punto de anclaje.'} ${SEG_ARNES}`],
  [/absorbedor/, () => `Absorbedor de impacto que reduce la fuerza de detención en caso de caída. ${SEG_ARNES}`],
  [/punto fijo/, () => `Punto de anclaje para conectar la línea de vida en trabajo en altura. ${SEG_ARNES}`],
  [/freno anticaidas/, () => `Freno anticaídas para sistemas de escalera fija Lad-Saf. ${SEG_ARNES}`],
  [/correa de seguridad/, () => `Correa de anclaje DBI-SALA para crear un punto de conexión rodeando vigas o estructuras. ${SEG_ARNES}`],

  // ── Cuerpo
  [/faja/, () => 'Faja de soporte lumbar que ayuda a mantener una postura correcta al cargar y levantar objetos en almacén, carga y descarga. Elige la talla según la medida de tu cintura.'],
  [/chaleco.*brigadista/, () => 'Chaleco tipo brigadista, ideal para identificar brigadas de emergencia, supervisores y personal de seguridad.'],
  [/chaleco.*malla/, () => 'Chaleco de malla ligero y fresco para identificar al personal y mejorar su visibilidad en almacén, obra y estacionamientos.'],
  [/chaleco.*robert/, () => 'Chaleco de trabajo Robert en tela gran bay con forro de jersey: abrigador, resistente y apto para bordar el logo de tu empresa.'],
  [/chaleco.*gafet/, () => 'Chaleco con porta gafete para identificar al personal y visitantes en planta.'],
  [/chaleco/, (t) => `Chaleco de alta visibilidad${/reflex|reflejante|matex/.test(t) ? ' con cintas reflejantes' : ''} para que te vean de día y de noche en obra, patios de maniobra y vía pública.`],
  [/impermeable|gabardina/, (t) => `${/2 piezas|conjunto/.test(t) ? 'Conjunto impermeable de chamarra y pantalón' : /gabardina/.test(t) ? 'Gabardina impermeable larga' : 'Impermeable'}${/doble capa/.test(t) ? ' de doble capa' : /triple capa/.test(t) ? ' de triple capa' : ''} para trabajar bajo la lluvia.${/reflejante/.test(t) ? ' Con reflejante para mayor visibilidad.' : ''}`],
  [/pantalon de mezclilla/, () => 'Pantalón de mezclilla industrial con cinta reflejante: resistente para uso diario en planta y obra, y visible de noche.'],
  [/playera/, () => 'Playera de manga larga para uniforme de trabajo, cómoda y apta para bordar o estampar.'],
  [/pijama quirurgica/, () => 'Conjunto clínico (scrub) antifluidos tipo jogger para personal médico, laboratorios y clínicas.'],
  [/mandil aluminizado/, () => 'Mandil aluminizado que refleja el calor radiante. Para fundición, hornos y soldadura pesada.'],
  [/mandil/, () => 'Mandil de PVC que protege el cuerpo de agua, grasas y salpicaduras de químicos ligeros. Fácil de lavar.'],
  [/rodilleras/, () => 'Rodilleras acolchadas con gel para trabajar hincado: pisos, plomería, instalaciones y jardinería.'],

  // ── Abrasivos
  [/disco diam|diamantado/, (t) => `Disco de diamante para ${/marmol/.test(t) ? 'mármol, granito y piedra natural' : /universal/.test(t) ? 'concreto, ladrillo, block, teja y piedra' : 'concreto y materiales de construcción'}. ${/segment/.test(t) ? 'Segmentado: corte rápido en seco.' : /continu/.test(t) ? 'Borde continuo: corte limpio sin despostillar.' : /turbo/.test(t) ? 'Borde turbo: equilibrio entre velocidad y acabado.' : ''} Úsalo siempre con la guarda de la esmeriladora y lentes de seguridad.`],
  [/almohadilla/, () => 'Almohadilla de fibra abrasiva para limpieza, satinado y acabado de superficies metálicas y de madera.'],
  [/rueda flap|disco flap|laminado/, () => 'Disco laminado (flap) para desbaste y acabado en un solo paso: quita rebaba y cordón de soldadura dejando mejor terminado que un disco rígido.'],
  [/disco abrasivo de corte/, () => 'Disco abrasivo para corte de metal con esmeriladora angular. Respeta las RPM máximas indicadas en la etiqueta y usa siempre la guarda. Si necesitas confirmar medida o espesor, pregúntanos.'],
  [/disco abrasivo de desbaste/, () => 'Disco abrasivo para desbaste de metal: quitar rebabas, cordones de soldadura y preparar superficies. Respeta las RPM máximas de la etiqueta y usa siempre la guarda.'],
  [/disco de lija|discos de lija|lija excent/, () => 'Discos de lija con perforaciones para lijadora orbital o roto-orbital con sistema de gancho y felpa. La perforación ayuda a extraer el polvo.'],
  [/lija cilindrica|cilindro p\/lija/, () => 'Bandas de lija cilíndricas para mototool: lijado de piezas pequeñas, interiores y contornos.'],
  [/lija de agua/, () => 'Lija de agua de carburo de silicio para lijado en húmedo de pintura, primer y acabados automotrices.'],
  [/\blija/, () => 'Lija para preparar superficies antes de pintar y eliminar óxido o pintura vieja.'],

  [/borla|caperuza\/borla/, () => 'Borla de lana para pulir y abrillantar con pulidora.'],
  // ── Refacciones (repuestos para herramienta eléctrica)
  [/inducido/, (t, p, s) => `Inducido (rotor) de repuesto para herramienta eléctrica${s.modelo ? ` ${s.modelo}` : ''}. Se cambia cuando el motor se quemó, chispea en exceso o perdió fuerza.`, ['Herramientas']],
  [/expansion polar/, (t, p, s) => `Expansión polar (estator / campo) de repuesto${s.modelo ? ` para ${s.modelo}` : ''}. Se reemplaza cuando la bobina está quemada o el motor huele a quemado.`, ['Herramientas']],
  [/portaescobilla|porta escobilla|plato portaescobillas|tapa escobillas/, () => 'Porta carbones de repuesto: sostiene las escobillas en contacto con el colector del motor.', ['Herramientas']],
  [/escobilla|carbon|carbones/, (t, p, s) => `Carbones (escobillas) de repuesto${s.modelo ? ` para ${s.modelo}` : ''}. Cámbialos cuando la herramienta pierda fuerza, chispee mucho o se apague sola; es la refacción de desgaste más común.`, ['Herramientas']],
  [/interruptor|switch/, (t, p, s) => `Interruptor de repuesto${s.modelo ? ` para ${s.modelo}` : ''}. Reemplázalo cuando la herramienta no encienda, falle de forma intermitente o el gatillo se trabe.`, ['Herramientas']],
  [/rodamiento|balero/, () => 'Rodamiento (balero) de repuesto. Se cambia cuando la herramienta hace ruido, vibra o se calienta de más.', ['Herramientas']],
  [/junta torica|anillo toroidal/, () => 'Junta tórica (o-ring) de repuesto para sellos internos de la herramienta.', ['Herramientas']],
  [/anillo obturador|semiacoplamiento|muelle|corredera|tornillo|tuerca de reglaje|caperuza|vaina|cubierta|tapa de elemento|brida de fijacion|carcasa|caja del engranaje|modulo|linea de conexion|portabrocas rapido/, (t) => {
    const pieza = /linea de conexion/.test(t) ? 'Cable de alimentación (línea de conexión a red)' : /carcasa/.test(t) ? 'Carcasa' : /engranaje/.test(t) ? 'Caja de engranes' : /modulo/.test(t) ? 'Módulo electrónico' : /portabrocas/.test(t) ? 'Portabrocas' : 'Pieza';
    return `${pieza} de repuesto original para herramienta eléctrica.`;
  }, ['Herramientas']],
  [/^refaccion|refaccion dremel/, () => 'Refacción de repuesto para herramienta eléctrica.', ['Herramientas']],

  // ── Herramienta eléctrica
  [/amoladora|esmeril|miniamoladora|esmeriladora/, (t, p, s) => `Esmeriladora angular${s.modelo ? ` ${s.modelo}` : ''} para cortar, desbastar y pulir metal, y cortar concreto con disco de diamante. Pregúntanos por discos, carbones y refacciones compatibles: los manejamos en tienda.`],
  [/taladro|taladradora/, () => 'Taladro para perforar metal, madera y, en modo percusión, concreto y block. Pregúntanos por brocas y refacciones compatibles: los manejamos en tienda.'],
  [/atornillador|atornilladora/, () => 'Atornillador para armado de muebles, instalaciones y mantenimiento. Pregúntanos por puntas, baterías y cargadores compatibles.'],
  [/multicortadora|multimax|multi-max/, () => 'Multiherramienta oscilante: corta madera, tablaroca, tubería y clavos al ras, lija y raspa en espacios reducidos.'],
  [/pulidora/, () => 'Pulidora para abrillantar pintura automotriz, eliminar rayones finos y aplicar cera.'],
  [/cepilladora/, () => 'Cepillo eléctrico portátil para rebajar y emparejar madera: puertas, marcos y vigas.'],
  [/herramienta rotativa|pc10/, () => 'Herramienta rotativa inalámbrica (mototool) para manualidades, grabado, lijado fino y pulido de piezas pequeñas.'],

  [/abrazaderas tipo una/, () => 'Abrazaderas tipo uña para fijar tubo conduit de pared delgada a muros y techos.'],
  // ── Fijación (antes que puntas: "pija punta broca")
  [/^(?:bolsa con [^,]*?(?:clavos?|arandelas)|blister con \d+ armellas|estuche \d+ taquetes|taquete|pijas?|tornillo|tuercas?|arandelas?|rondana|taquetes?|clavos?|alcayatas?|armellas?|bandola|abrazaderas?)\b/, () => 'Tornillería y fijación para instalaciones, carpintería, herrería y mantenimiento general.'],
  // ── Accesorios para herramienta
  [/bateria|baterias/, () => 'Batería de repuesto para herramienta inalámbrica. Confirma el voltaje y la plataforma de tu equipo antes de comprar.', ['Herramientas']],
  [/cargador|kit de iniciacion/, () => 'Cargador para baterías de herramienta inalámbrica. Confirma que sea compatible con el voltaje de tus baterías.', ['Herramientas']],
  [/broca.*(sds|cyl|concreto|p\/conc)|brocas p\/conc|brocas para concreto|broca expert hex/, (t) => `Broca para ${/ceramic/.test(t) ? 'cerámica y porcelanato' : 'concreto, block y ladrillo'}${/sds/.test(t) ? ', con zanco SDS Plus para rotomartillo' : ''}. Úsala con taladro en modo percusión${/sds/.test(t) ? ' o rotomartillo' : ''}.`],
  [/broca.*(hss|metal|trugold)/, () => 'Broca de acero rápido para perforar metal, acero dulce, aluminio y plástico. Usa aceite de corte y velocidad baja en acero para alargar su vida.'],
  [/broca.*(madera|espada|centradora|router)|brocas p\/madera|progresor/, (t) => /router/.test(t) ? 'Broca para router (rebajadora) para ranurar y perfilar madera.' : 'Broca para madera con punta centradora para perforaciones limpias y precisas.'],
  [/broca escalonada/, () => 'Broca escalonada para hacer barrenos de varios diámetros en lámina y tablero eléctrico sin cambiar de broca.'],
  [/broquero|broq /, () => 'Broquero (portabrocas) de llave para taladro. Repuesto cuando el original ya no sujeta bien la broca.'],
  [/fresa/, () => 'Fresa para mototool: desbaste, grabado y tallado en madera, plástico y metales suaves.'],
  [/punta.*diamante|punto diamante|puntas diamantadas/, () => 'Punta diamantada para mototool: grabado y desbaste fino en vidrio, cerámica, piedra y metal.'],
  [/^(juego de \d+ |estuche con \d+ )?puntas?\b|puntero|adaptador standard/, (t) => /puntero|sds-max/.test(t) ? 'Puntero SDS-Max para demoledor: rompe concreto, quita azulejo y abre ranuras.' : 'Puntas para atornillar con taladro o atornillador. Acero templado que resiste el uso continuo.'],
  [/segueta.*t308|segueta.*caladora/, () => 'Hojas de segueta para caladora con corte limpio en madera dura y tableros.'],
  [/seg\.? ?moto saw|ms5[23]/, () => 'Hoja de repuesto para sierra Moto-Saw de Dremel.'],
  [/hojas multi-max|mm450/, () => 'Hojas para multiherramienta oscilante Multi-Max: corte por inmersión en madera y tablaroca.'],
  [/cuchilla de 82/, () => 'Cuchillas de carburo para cepillo eléctrico de 82 mm.'],
  [/eje flexible/, () => 'Eje flexible para mototool: trabaja con mayor control y precisión en piezas pequeñas.'],
  [/mandril|ez-?lock|disco de corte madera|disco para minisierra|disco saw-max|corte \/ accesorios saw-max|discos de corte reforzados|ez545/, () => 'Accesorio de corte para mototool o mini sierra. Revisa la compatibilidad con tu modelo.'],
  [/empunadura/, () => 'Empuñadura auxiliar para mayor control y menos fatiga al trabajar.'],
  [/set|kit|surt/, () => 'Set de accesorios surtidos para taladro y atornillador. Práctico para tener a la mano la medida que necesitas.', ['Herramientas']],

  // ── Ferretería: herramienta manual
  [/sujetador con matraca|tensores/, () => 'Para amarrar y asegurar carga en camionetas y plataformas durante el transporte.'],
  [/llave stilson/, () => 'Llave stilson para apretar y aflojar tubería y piezas redondas en plomería y mantenimiento.'],
  [/llave ajustable|perico/, () => 'Llave ajustable (perico) para tuercas y tornillos de varias medidas. Imprescindible en la caja de herramientas.'],
  [/llaves? combinadas?|llaves espanolas|llave espanola|llaves allen|llave de cruz/, (t) => /allen/.test(t) ? 'Juego de llaves allen para tornillos de cabeza hexagonal interior en maquinaria, muebles y bicicletas.' : /cruz/.test(t) ? 'Llave de cruz para birlos de automóvil y camioneta.' : 'Llave para apretar y aflojar tuercas y tornillos hexagonales en mantenimiento mecánico.'],
  [/dados|matraca|extension cuadro|extension de 6|herramientas.*mecanico/, () => 'Herramienta de dados y matraca para mantenimiento mecánico, automotriz e industrial.'],
  [/pinza/, (t) => /electricista|pela cables|ponchador/.test(t) ? 'Pinza para electricista: corta, pela y poncha cable y terminales.' : /anillos/.test(t) ? 'Pinza para colocar y retirar anillos de retención (seguros) en flechas y barrenos.' : /corte diagonal/.test(t) ? 'Pinza de corte diagonal para cable, alambre y cinchos.' : 'Pinza para sujetar, doblar y cortar en trabajos de mantenimiento y electricidad.'],
  [/crimpadora/, () => 'Kit de crimpadora con terminales aisladas para hacer conexiones eléctricas firmes y seguras.'],
  [/desarmador/, () => 'Desarmador para atornillar y desatornillar en mantenimiento, electricidad y armado.'],
  [/martillo|mazo|marro/, (t) => /hule/.test(t) ? 'Mazo de hule para golpear sin marcar: colocación de loseta, armado de muebles y carrocería.' : 'Martillo para clavar, desclavar y golpes de ajuste en carpintería y obra.'],
  [/cincel/, () => 'Cincel para cortar, ranurar y demoler concreto, block o metal.'],
  [/\b(barreta|zapapico|azadon|pala|rastrillo)\b/, () => 'Herramienta para excavar, remover tierra y escombro en obra, jardín y campo.'],
  [/carretilla/, () => 'Carretilla de llanta neumática para mover mezcla, escombro, tierra y materiales en obra.'],
  [/lima/, () => 'Lima para desbastar, afilar y quitar rebabas en metal.'],
  [/segueta|arco/, () => 'Seguetas y arco para cortar tubo, varilla, perfiles y tornillería a mano.'],
  [/serrucho/, () => 'Serrucho para cortes en madera y triplay.'],
  [/cuchilla|cutter/, () => 'Cutter y cuchillas para cortar cartón, alfombra, tablaroca, empaques y cintas.'],
  [/espatula/, () => 'Espátula para resanar, aplicar pasta y raspar pintura.'],
  [/cortador de tubo/, () => 'Cortador para tubo de plástico (PVC, CPVC, PEX) con corte recto y limpio.'],
  [/cortador de azulejo/, () => 'Cortadora manual de azulejo y loseta para cortes rectos precisos.'],
  [/extractor de poleas/, () => 'Extractor de 3 quijadas para retirar poleas, engranes y baleros sin dañarlos.'],
  [/machuelos|tarrajas/, () => 'Juego de machuelos y tarrajas para hacer y reparar roscas internas y externas.'],
  [/cautin/, () => 'Cautín tipo lápiz para soldadura con estaño en electrónica y reparaciones eléctricas.'],
  [/escalera/, () => 'Escalera de tijera con bandeja para herramienta. Revisa la carga máxima y apóyala siempre en piso firme.'],
  [/tijera/, () => 'Tijera para poda y jardinería.'],
  [/esmeriladora angular/, () => 'Esmeriladora angular para cortar y desbastar metal.'],
  // ── Medición
  [/flexometro/, () => 'Flexómetro para medición en obra, carpintería y mantenimiento.'],
  [/tiralineas/, () => 'Tiralíneas con gis para trazar líneas rectas largas en piso, muro y lámina.'],
  [/nivel/, () => 'Nivel de burbuja para verificar horizontales y verticales en instalaciones y obra.'],
  [/escuadra/, () => 'Escuadra para trazos a 90° en cantería, carpintería y herrería.'],
  [/calibrador|vernier/, () => 'Calibrador vernier digital para medir diámetros interiores, exteriores y profundidades con precisión.'],
  [/multimetro/, () => 'Multímetro para medir voltaje, corriente, resistencia y continuidad en mantenimiento eléctrico.'],
  [/detector de materiales/, () => 'Detector para localizar tubería, cables y vigas dentro de muros antes de perforar.'],
  [/bascula/, () => 'Báscula electrónica para pesar mercancía, insumos y paquetería.'],
  // ── Cintas, químicos
  [/cinta de aislar/, () => 'Cinta de aislar de vinil para aislar y marcar conexiones eléctricas.'],
  [/masking/, (t) => /azul|pintor/.test(t) ? 'Cinta masking azul para pintor: se retira limpia, sin dejar residuo, para delimitar bordes al pintar.' : 'Cinta masking para enmascarar, rotular y sujetar en pintura, empaque y oficina.'],
  [/cinta antiderrapante/, () => 'Cinta antiderrapante adhesiva para escalones, rampas y pasillos. Evita resbalones y marca zonas de riesgo.'],
  [/cinta sella roscas/, () => 'Cinta de teflón para sellar roscas en conexiones de agua y aire.'],
  [/cinta para ducto|cinta de aluminio/, () => 'Cinta de alta adherencia para reparaciones rápidas, sellado de ductos y sujeción.'],
  [/cinta de empaque/, () => 'Cinta canela para cerrar cajas y embalaje.'],
  [/sellador|silicon/, () => 'Sellador para juntas en baños, cocinas, ventanas y canceles. Resiste humedad.'],
  [/adhesivo|adh epoxy|epoxy/, () => 'Adhesivo de alta resistencia para pegar metal, madera, cerámica y plástico.'],
  [/espuma expansiva/, () => 'Espuma de poliuretano que sella huecos, grietas y pasos de tubería; aísla del aire y el ruido.'],
  [/grasa|lubricante|aceite multiusos|aceitera/, () => 'Lubricante para mantenimiento de bisagras, cadenas, baleros y mecanismos. Protege contra óxido y desgaste.'],
  [/pasta para soldar|soldadura con nucleo/, () => 'Insumo para soldadura con estaño en electrónica y plomería ligera.'],
  [/pintura en aerosol/, () => 'Pintura en aerosol de secado rápido para retoques, señalización y acabados en metal, madera y plástico.'],
  [/rodillo|felpas|brocha/, () => 'Para aplicación de pintura vinílica, esmalte e impermeabilizante.'],
  // ── Fijación
  [/cadena/, () => 'Cadena para amarre, colgado y seguridad.'],
  [/cinchos/, () => 'Cinchos plásticos para sujetar y organizar cables, mangueras y materiales.'],
  [/grapas/, () => 'Grapas con clavo para fijar cable redondo a muros y madera de forma ordenada.'],
  // ── Plomería
  [/termofusora/, () => 'Termofusora para unir tubería y conexiones de PPR por termofusión en instalaciones hidráulicas.'],
  [/mezcladora|regadera|manerales/, () => 'Grifería para baño o cocina, fácil de instalar.'],
  [/manguera para boiler/, () => 'Manguera flexible de acero inoxidable para conectar boiler, calentador o tarja.'],
  [/valvula|llave angular|llave p\/manguera|pichancha|flotador/, () => 'Accesorio de plomería para control y llenado de agua en tinacos, cisternas y tomas.'],
  [/cople|codo|conector|adaptador|tapon capa|brida de acero|multiconector|tuerca izquierda|tubo de|cartucho de compresion|pealpe|manguera para gas/, () => 'Conexión para instalaciones hidráulicas o de gas.'],
  [/accesorios para wc|pastillas/, () => 'Accesorio para tanque de WC.'],
  // ── Eléctrico e iluminación
  [/extension/, () => 'Extensión eléctrica de uso rudo para herramienta y equipo en obra y taller.'],
  [/multicontacto/, () => 'Multicontacto de uso rudo para conectar varios equipos desde un solo contacto.'],
  [/interruptor termomagnetico|interruptor de 1 polo|centro de carga/, () => 'Protección eléctrica para tableros: corta la corriente en caso de sobrecarga o corto circuito.'],
  [/clavija|contacto|interruptor|placa|condulet|conduit|canaleta|capuchones|terminales|portalampara|cables pasa corriente/, (t) => /pasa corriente/.test(t) ? 'Cables pasa corriente para arrancar vehículos con batería descargada.' : 'Material eléctrico para instalaciones residenciales, comerciales e industriales.'],
  [/luminario|reflector|lampara|linterna|luz de noche/, () => 'Iluminación para áreas de trabajo, emergencias y exteriores.'],
  [/pilas/, () => 'Pilas para linternas, controles, detectores y equipo portátil.'],
  [/detector de humo/, () => 'Detector de humo con alarma sonora para oficinas, bodegas y hogar.'],
  [/camara/, () => 'Cámara de seguridad WiFi para vigilar desde el celular.'],
  // ── Limpieza, jardín, cerrajería, organización, amarre
  [/escoba|trapeador|jalador|recogedor|cubeta|cepillo|franela|estopa|destapacanos|polish|cera|aceite rojo|tapete/, () => 'Artículo de limpieza para oficinas, bodegas, áreas de producción y hogar.'],
  [/pistola.*riego|herramientas para jardin|malla sombra|hilo para desbrozadora/, () => 'Artículo de jardinería para riego, mantenimiento de áreas verdes y sombra.'],
  [/candado|cerradura|cerrojo|portacandado|pasador|perilla|jaladera|tope|caja de seguridad/, () => 'Cerrajería y herrajes para puertas, bodegas, lockers y mobiliario.'],
  [/guardapolvo|tubo redondo|brida cromada|portarrollo|accesorios para bano/, () => 'Herraje y accesorio para baño, closet y puertas.'],
  [/gaveta|porta herramientas|organizador/, () => 'Para organizar herramienta, tornillería y refacciones en taller y almacén.'],
  [/eslinga/, () => 'Eslinga de poliéster para izaje de carga. Respeta siempre la capacidad indicada en la etiqueta y revísala antes de cada uso.'],
  [/lazo|rafia|hilo para alban/, () => 'Hilo y cuerda para amarre, trazo y uso general.'],
];

const CIERRE_UNIDAD = { Par: 'Se vende por par.', Caja: 'Precio por caja.', Bolsa: 'Precio por bolsa.', Juego: 'Precio por juego completo.', Rollo: 'Precio por rollo.', Blíster: 'Precio por blíster.', Paquete: 'Precio por paquete.', Metro: 'Precio por metro.' };

export function generarDescripcion(p, specs = {}) {
  let base = '', t = '';
  for (const texto of [normTxt(p.nombre), normTxt(`${p.nombre} ${p.subcategoria || ''}`)]) {
    t = texto;
    for (const [re, fn, cats] of REGLAS) {
      if (cats && !cats.includes(p.categoria)) continue;
      if (re.test(t)) { base = (typeof fn === 'function' ? fn(t, p, specs) : fn) || ''; break; }
    }
    if (base) break;
  }
  const partes = [];
  if (base) partes.push(base.replace(/\s+/g, ' ').trim());
  else partes.push(`${p.nombre}.`);

  // Refacciones y accesorios: el código es lo que garantiza la compatibilidad
  const esRefaccion = p.categoria === 'Herramientas' && (p.categoriaOrigen === 'Refacciones' || /\b(inducido|escobillas?|carbon(es)?|portaescobillas?|expansion polar|rodamiento|junta torica|interruptor)\b/.test(normTxt(p.nombre)));
  if (esRefaccion && p.sku) partes.push(`Antes de pedir, confirma que el código ${p.sku} coincide con el despiece de tu herramienta; si tienes duda, mándanos foto de la placa y te ayudamos.`);
  else if (!base) partes.push('Si necesitas ficha técnica, otra medida o precio por volumen, pregúntanos por WhatsApp.');

  const cierre = CIERRE_UNIDAD[p.unidad];
  if (cierre && !partes.join(' ').includes(cierre)) partes.push(cierre);
  return partes.join(' ').replace(/\s+\./g, '.').replace(/\.\./g, '.');
}

/* Nombre útil para productos que el ERP dejó "(sin descripción)" */
function nombreGenerico(categoria, subcat, origen, marca, codigo) {
  const sub = normTxt(subcat);
  if (sub === 'proteccion lumbar') {
    const talla = (String(codigo).match(/-(CH|M|G|XL|XXL|XG)$/i) || [])[1];
    return `Faja de soporte lumbar${talla ? ` talla ${talla.toUpperCase()}` : ''}`;
  }
  if (categoria === 'Abrasivos') return `Disco abrasivo de ${sub === 'desbaste' ? 'desbaste' : 'corte'} (cód. ${codigo})`;
  if (origen === 'Refacciones') return `Refacción ${marca || ''} ${codigo}`.replace(/\s+/g, ' ');
  return `${subcat || categoria} (cód. ${codigo})`;
}

/* ══ Documento de Firestore (inventario_rivg) → producto de la tienda ══ */
const _tsMillis = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v.seconds === 'number' ? v.seconds * 1000 : Number(v) || 0;

export function desdeInventario(data, id) {
  const codigo = String(data.codigo || id || '').trim();
  const corr = CORRECCIONES[codigo.toUpperCase()] || CORRECCIONES[codigo] || {};
  if (corr.oculto) return null;

  const original = String(data.descripcion || '').trim();
  const sinNombre = !original || /^\(?\s*sin descripci/i.test(original);
  const precioUnit = data.precio_unitario != null ? Number(data.precio_unitario) : (data.precio != null ? Number(data.precio) : null);
  if (sinNombre && !(precioUnit > 0) && !corr.nombre && /sin categ/i.test(data.categoria || 'sin categ')) return null;

  const origen = corr.categoriaOrigen || data.categoria || null;
  const categoria = corr.categoria
    || (CATS_WEB.includes(data.categoria_web) ? data.categoria_web : null)
    || (CATS_WEB.includes(data.categoria) ? data.categoria : null)
    || ORIGEN_A_WEB[origen]
    || clasificarPorTexto(original);

  const subOriginal = corr.subcategoria || data.subcategoria || null;
  const marca = corr.marca || data.marca || marcaDesdeTexto(original, codigo);
  const base = corr.nombre || (sinNombre ? nombreGenerico(categoria, subOriginal, origen, marca, codigo) : original);
  const nombre = quitarMarcaFinal(limpiarNombre(base), marca);
  const linea = subOriginal || lineaDesdeTexto(base, categoria, origen);

  const precioConIva = data.precio_total_iva != null ? Number(data.precio_total_iva) : null;
  // $1, $2 o $3 exactos sin IVA son precios de relleno del ERP, no precios reales
  const relleno = Number.isFinite(precioUnit) && precioUnit <= 3 && Number.isInteger(precioUnit);
  const precioOk = Number.isFinite(precioUnit) && precioUnit > 0 && !relleno;

  const p = {
    id,
    _origen: 'rivg',
    _ts: _tsMillis(data.updatedAt),
    _calidad: {
      sinNombre,
      marcaDeducida: !data.marca && !!marca && !corr.marca,
      lineaDeducida: !data.subcategoria && !!linea && !corr.subcategoria,
      precioDescartado: Number.isFinite(precioUnit) && !precioOk && precioUnit > 0 ? precioUnit : null,
      nombreCorregido: nombre !== original
    },
    nombre,
    nombreOriginal: original,
    categoria,
    subcategoria: linea || null,
    marca: marca || null,
    categoriaOrigen: origen,
    almacen: data.almacen || 'Sucursal Principal',
    precio: precioOk ? precioUnit : null,
    precio_con_iva: precioOk && Number.isFinite(precioConIva) ? precioConIva : null,
    sin_precio: !precioOk,
    nota: data.nota || null,
    inventario: Math.max(0, Math.floor(Number(data.cantidad || 0))),
    desc: String(data.descripcion_web || '').trim(),
    sku: corr.sku || codigo,
    imageUrl: data.imageUrl || '',
    esPortada: !!data.esPortada,
    destacado: !!data.destacado
  };
  return enriquecer(p);
}

/* Completa ficha, unidad, usos y descripción. Sirve también para los
   productos que el admin da de alta a mano. Idempotente. */
export function enriquecer(p) {
  p.nombre = p.nombre || p.sku || 'Producto';
  const specs = extraerSpecs(p.nombre, p.sku, p.subcategoria || '', p.categoria);
  p.specs = specs;
  p.unidad = p.unidad || unidadDe(p.nombre, p.subcategoria || '');
  if (!p.subcategoria) p.subcategoria = lineaDesdeTexto(p.nombre, p.categoria, p.categoriaOrigen) || null;
  if (!p.marca) p.marca = marcaDesdeTexto(p.nombre, p.sku) || null;

  const t = normTxt(`${p.nombre} ${p.subcategoria || ''}`);
  p.usos = USOS.filter(u => (!u.cats || u.cats.includes(p.categoria)) && u.re.test(t)).map(u => u.id);

  const escrita = String(p.desc || '').trim();
  p._descGenerada = !escrita || escrita === p._descAuto;
  if (p._descGenerada) { p.desc = generarDescripcion(p, specs); p._descAuto = p.desc; }
  p._txt = undefined;
  return p;
}

/* ══ Variantes (mismo producto en otra talla o color) ══ */
const RE_QUITAR_TALLA = [
  /\b(?:t|talla|no)\s*[.\-\/]?\s*(xxs|xs|xxl|xl|2xg|xg|eeg|eg|ch|md|gd|s|m|l|g|\d{1,2})\b/g,
  /#\s*\d{1,2}\b/g, /\b\d{2}\s*p\s*-/g, /\bt(g|m|ch|xg|l)\b/g, /,\s*(xg|eeg|eg|ch|m|g|l)\s*$/g, /\btalla\b/g
];
function claveVariante(p) {
  let t = normTxt(p.nombre);
  RE_QUITAR_TALLA.forEach(re => { t = t.replace(re, ' '); });
  t = t.replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter(w => w && !_COLORES[w]).join(' ');
  return `${p.categoria}|${normTxt(p.marca || '')}|${t}`;
}
function ordenTalla(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return 100 + Number(t);
  const i = _ORDEN_TALLAS.indexOf(t);
  return i < 0 ? 90 : 50 + i;
}

/* Asigna p._grupo y p._variante; devuelve Map(grupo → productos ordenados) */
export function agruparVariantes(lista) {
  const grupos = new Map();
  lista.forEach(p => {
    const k = claveVariante(p);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  // Si dos productos quedan con la misma talla/color son modelos distintos
  // (ej. ATI-01P-25 y STX-01P-25): se separan por la base de su código.
  const etiqueta = (arr, p) => {
    const s = p.specs || {};
    const mismoColor = arr.every(x => (x.specs?.color || '') === (s.color || ''));
    return [mismoColor ? '' : s.color, s.talla ? `T. ${s.talla}` : ''].filter(Boolean).join(' · ');
  };
  const skuBase = sku => String(sku).includes('-') ? String(sku).replace(/-[^-]+$/, '') : '';
  const finales = [];
  grupos.forEach((arr, k) => {
    arr.forEach(p => { p._grupo = null; p._variante = null; p._tipoVariante = null; });
    if (arr.length < 2) return;
    // Solo son variantes si TODOS se distinguen por talla o color (las refacciones
    // llamadas igual, como "Interruptor", son piezas distintas, no variantes).
    if (!arr.every(p => p.specs?.talla || p.specs?.color)) return;
    const labels = arr.map(p => etiqueta(arr, p));
    if (new Set(labels).size === arr.length && labels.every(Boolean)) { finales.push([k, arr]); return; }
    const sub = new Map();
    arr.forEach(p => { const b = skuBase(p.sku); if (!sub.has(b)) sub.set(b, []); sub.get(b).push(p); });
    sub.forEach((a2, b) => {
      if (a2.length < 2) return;
      const l2 = a2.map(p => etiqueta(a2, p));
      if (new Set(l2).size === a2.length && l2.every(Boolean)) finales.push([`${k}|${b}`, a2]);
    });
  });
  const res = new Map();
  finales.forEach(([k, arr]) => {
    arr.forEach(p => { p._variante = etiqueta(arr, p); });
    arr.sort((a, b) => String(a.specs?.color || '').localeCompare(String(b.specs?.color || ''), 'es')
                    || ordenTalla(a.specs?.talla) - ordenTalla(b.specs?.talla)
                    || String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true }));
    const tieneTalla = arr.some(p => p.specs?.talla), tieneColor = arr.some(p => p.specs?.color);
    const tipo = tieneTalla && tieneColor ? 'opciones' : tieneTalla ? 'tallas' : tieneColor ? 'colores' : 'opciones';
    arr.forEach(p => { p._grupo = k; p._tipoVariante = tipo; });
    res.set(k, arr);
  });
  return res;
}

/* ══ Búsqueda: sinónimos, plurales y corrección ══ */
const SINONIMOS = [
  ['lente', 'gafa', 'anteojo', 'goggle', 'google', 'mica'],
  ['casco', 'cachucha'],
  ['bota', 'calzado', 'zapato', 'tenis', 'borcegui', 'botin'],
  ['careta', 'mascara de soldar'],
  ['respirador', 'mascarilla', 'cubrebocas', 'tapabocas', 'semimascara', 'n95'],
  ['tapon', 'orejera', 'auditiv'],
  ['impermeable', 'gabardina'],
  ['carbon', 'escobilla'],
  ['esmeril', 'esmeriladora', 'amoladora', 'miniamoladora', 'pulidor'],
  ['taladro', 'taladradora', 'rotomartillo'],
  ['desarmador', 'destornillador'],
  ['perico', 'llave ajustable'],
  ['arnes', 'linea de vida', 'anticaida'],
  ['chaleco', 'reflejante'],
  ['flexometro', 'cinta metrica', 'metro'],
  ['broca', 'barrena'],
  ['silicon', 'sellador'],
  ['teflon', 'sella roscas'],
  ['cincho', 'cinchos', 'abrazadera plastica'],
  ['balero', 'rodamiento'],
  ['faja', 'lumbar'],
  ['extension', 'alargador'],
  ['foco', 'lampara', 'luminario'],
  ['candado', 'cerradura'],
  ['mototool', 'dremel', 'rotativa'],
];
const _MAPA_SIN = new Map();
SINONIMOS.forEach(g => g.forEach(w => _MAPA_SIN.set(w, g)));

export function singular(w) {
  if (w.length > 4 && /[^aeiou]es$/.test(w) && !/(ces)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /[aeiou]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/* Convierte la consulta en grupos de alternativas: todas las palabras deben
   coincidir, pero cada una puede hacerlo por cualquiera de sus sinónimos. */
export function prepararConsulta(q) {
  const limpio = normTxt(q).replace(/["'´]/g, ' ').trim();
  if (!limpio) return [];
  const vacias = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'a', 'en', 'un', 'una', 'p', 'c']);
  const palabras = limpio.split(/\s+/).filter(w => w && !vacias.has(w));
  return palabras.map(w => {
    const s = singular(w);
    const alts = new Set([w, s]);
    (_MAPA_SIN.get(s) || _MAPA_SIN.get(w) || []).forEach(a => alts.add(a));
    return [...alts];
  });
}

export function textoBusqueda(p) {
  if (p._txt) return p._txt;
  const s = p.specs || {};
  const partes = [p.nombre, p.nombreOriginal, p.sku, p.categoria, p.subcategoria, p.marca, s.color, s.modelo, s.medidas,
    s.talla ? `talla ${s.talla} t${s.talla}` : '', (p.usos || []).map(u => USOS_POR_ID[u]?.nombre).join(' ')];
  if (!p._descGenerada) partes.push(p.desc);      // la descripción escrita por el admin sí cuenta
  return (p._txt = normTxt(partes.filter(Boolean).join(' ')));
}

/* Los números cortos ("7", "27", "125") deben coincidir como número
   completo: "talla 9" no debe encontrar el código 51-975-7. */
const _reNum = new Map();
function contiene(txt, a) {
  if (/^\d+$/.test(a)) {
    let re = _reNum.get(a);
    if (!re) { re = new RegExp(`(^|[^0-9])${a}($|[^0-9])`); _reNum.set(a, re); }
    return re.test(txt);
  }
  return txt.includes(a);
}
export function coincide(p, terminos) {
  if (!terminos.length) return true;
  const txt = textoBusqueda(p);
  return terminos.every(alts => alts.some(a => contiene(txt, a)));
}

/* Puntaje para ordenar resultados de búsqueda */
export function puntaje(p, q, terminos) {
  const qn = normTxt(q).trim();
  const nombre = normTxt(p.nombre);
  let s = 0;
  if (normTxt(p.sku) === qn) s += 200;
  else if (normTxt(p.sku).startsWith(qn) && qn.length >= 3) s += 60;
  if (nombre.startsWith(qn)) s += 40;
  else if (nombre.includes(qn)) s += 20;
  terminos.forEach(alts => { if (alts.some(a => contiene(nombre, a))) s += 8; });
  if (Number(p.inventario) > 0) s += 5;
  if (p.imageUrl) s += 2;
  return s;
}

/* Si no hubo resultados: sustituye palabras mal escritas por la más
   parecida del catálogo ("guantez" → "guantes", "respirasor" → "respirador") */
let _vocab = null, _vocabN = 0;
function vocabulario(productos) {
  if (_vocab && _vocabN === productos.length) return _vocab;
  const set = new Set();
  productos.forEach(p => normTxt(`${p.nombre} ${p.marca || ''} ${p.subcategoria || ''}`).split(/[^a-z0-9ñ]+/).forEach(w => { if (w.length >= 4 && !/\d/.test(w)) set.add(w); }));
  _vocab = [...set]; _vocabN = productos.length;
  return _vocab;
}
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < min) min = cur[j];
    }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
export function corregirConsulta(q, productos) {
  const vocab = vocabulario(productos);
  let cambio = false;
  const nueva = normTxt(q).split(/\s+/).filter(Boolean).map(w => {
    if (w.length < 4 || /\d/.test(w)) return w;
    if (vocab.some(v => v.includes(singular(w)))) return w;
    const max = w.length >= 7 ? 2 : 1;
    let mejor = null, dMejor = max + 1;
    for (const v of vocab) { const d = distancia(w, v, max); if (d < dMejor) { dMejor = d; mejor = v; if (d === 1 && max === 1) break; } }
    if (mejor) { cambio = true; return mejor; }
    return w;
  }).join(' ');
  return cambio ? nueva : null;
}