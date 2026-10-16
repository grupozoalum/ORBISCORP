/* ════════════════════════════════════════════════════════════════════
   GENERADOR DE DESCRIPCIONES — OrbisCORP
   Escribe una descripción breve para cada producto del inventario que
   no la tenga, usando Gemini. Funciona en DOS pasos para que una persona
   revise antes de publicar:

   1) Borrador (no toca Firestore):
        node herramientas/generar_descripciones.js --muestra 30
        node herramientas/generar_descripciones.js --todos
      → crea descripciones_borrador.csv. Ábrelo en Excel, corrige o
        borra las filas que no te convenzan y guárdalo como CSV UTF-8.

   2) Publicar lo revisado:
        node herramientas/generar_descripciones.js --aplicar descripciones_borrador.csv
      → guarda cada texto en el campo `descripcion_web` del producto.
        La tienda lo muestra en la vista del producto.

   Requisitos (desde la carpeta functions/, donde ya están las dependencias):
     - GOOGLE_APPLICATION_CREDENTIALS = ruta al JSON de una cuenta de servicio
       (Firebase Console → Configuración → Cuentas de servicio → Generar clave)
     - GEMINI_API_KEY = tu clave de Gemini (la NUEVA, no la que estaba en el código)
     - Opcional: MODELO (por defecto gemini-2.5-flash)

   IMPORTANTE: si subir_inventario.py usa set() sin merge=True, borrará
   descripcion_web en la siguiente carga. Usa set(..., merge=True).
════════════════════════════════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const COLECCION = "inventario_rivg";
const LOTE = 15;                      // productos por llamada a Gemini
const ARCHIVO = "descripciones_borrador.csv";

admin.initializeApp();
const db = admin.firestore();

/* ── CSV mínimo (comillas, comas y saltos de línea) ─────────────── */
const csvCelda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function leerCSV(texto) {
  const filas = []; let fila = []; let celda = ""; let q = false;
  texto = texto.replace(/^﻿/, "");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') q = false;
      else celda += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";") { fila.push(celda); celda = ""; }   // Excel en español a veces usa ;
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim()));
}

/* ── Instrucciones para la IA ───────────────────────────────────── */
const INSTRUCCIONES = `Eres redactor de fichas de producto para OrbisCORP, distribuidor de seguridad industrial y ferretería en Hidalgo, México.
Para cada producto escribe una descripción en español de México:
- 1 o 2 oraciones, entre 120 y 260 caracteres.
- Di qué es y para qué se usa típicamente en industria, construcción o taller.
- Usa SOLO lo que se puede deducir del nombre, la marca, la línea y la categoría.
- PROHIBIDO inventar: normas o certificaciones (NOM, ANSI, etc.), materiales, medidas, potencias, garantías o compatibilidades que no aparezcan en el nombre.
- Si el nombre trae medidas o modelo, puedes mencionarlos tal cual.
- Tono profesional y directo. Sin superlativos ("el mejor", "increíble"), sin emojis, sin repetir el código, sin precios.
Responde SOLO con un arreglo JSON: [{"codigo": "...", "descripcion": "..."}], en el mismo orden recibido.`;

async function generarLote(modelo, productos) {
  const lista = productos.map((p) => ({
    codigo: p.codigo, nombre: p.descripcion, marca: p.marca || "", linea: p.subcategoria || "", categoria: p.categoria_web || "",
  }));
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await modelo.generateContent(JSON.stringify(lista));
      const datos = JSON.parse(r.response.text());
      if (!Array.isArray(datos)) throw new Error("La respuesta no es un arreglo");
      return datos;
    } catch (e) {
      console.warn(`  intento ${intento} falló: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 1500 * intento));
    }
  }
  return [];
}

async function borrador(limite) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error("Falta la variable GEMINI_API_KEY");
  const modelo = new GoogleGenerativeAI(clave).getGenerativeModel({
    model: process.env.MODELO || "gemini-2.5-flash",
    systemInstruction: INSTRUCCIONES,
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });

  const snap = await db.collection(COLECCION).get();
  const pendientes = [];
  snap.forEach((d) => {
    const p = d.data();
    if (!p.descripcion || (p.descripcion_web || "").trim()) return;
    pendientes.push({ id: d.id, codigo: String(p.codigo || d.id), ...p });
  });
  const trabajo = limite ? pendientes.slice(0, limite) : pendientes;
  console.log(`${pendientes.length} productos sin descripción; se generarán ${trabajo.length}.`);

  const filas = [["id", "codigo", "nombre", "descripcion"]];
  for (let i = 0; i < trabajo.length; i += LOTE) {
    const lote = trabajo.slice(i, i + LOTE);
    process.stdout.write(`  ${i + 1}–${i + lote.length}… `);
    const res = await generarLote(modelo, lote);
    const porCodigo = new Map(res.map((r) => [String(r.codigo), String(r.descripcion || "").trim()]));
    lote.forEach((p) => filas.push([p.id, p.codigo, p.descripcion, porCodigo.get(p.codigo) || ""]));
    console.log("listo");
  }

  fs.writeFileSync(ARCHIVO, "﻿" + filas.map((f) => f.map(csvCelda).join(",")).join("\r\n"));
  console.log(`\nBorrador guardado en ${path.resolve(ARCHIVO)}`);
  console.log("Revísalo y luego ejecuta:  node herramientas/generar_descripciones.js --aplicar " + ARCHIVO);
}

async function aplicar(archivo) {
  const filas = leerCSV(fs.readFileSync(archivo, "utf8"));
  const enc = filas.shift().map((x) => x.trim().toLowerCase());
  const iId = enc.indexOf("id"), iDesc = enc.indexOf("descripcion");
  if (iId < 0 || iDesc < 0) throw new Error('El CSV debe tener las columnas "id" y "descripcion"');

  const validas = filas
    .map((f) => ({ id: (f[iId] || "").trim(), desc: (f[iDesc] || "").trim() }))
    .filter((f) => f.id && f.desc && !f.id.includes("/") && f.desc.length <= 600);
  console.log(`Se guardarán ${validas.length} descripciones…`);

  for (let i = 0; i < validas.length; i += 400) {
    const batch = db.batch();
    validas.slice(i, i + 400).forEach(({ id, desc }) =>
      batch.set(db.collection(COLECCION).doc(id), {
        descripcion_web: desc,
        descripcion_web_en: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }));
    await batch.commit();
  }
  console.log("Listo. La tienda las muestra en la siguiente visita de cada cliente.");
}

(async () => {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--aplicar" && args[1]) await aplicar(args[1]);
    else if (args[0] === "--muestra") await borrador(Number(args[1]) || 20);
    else if (args[0] === "--todos") await borrador(0);
    else console.log("Uso:\n  --muestra 30\n  --todos\n  --aplicar descripciones_borrador.csv");
  } catch (e) {
    console.error("Error:", e.message);
    process.exitCode = 1;
  }
})();