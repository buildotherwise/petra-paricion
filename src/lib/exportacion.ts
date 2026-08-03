/**
 * La planilla, en CSV.
 *
 * El detalle que decide si esta exportación sirve o no NO es ninguna columna:
 * es que abra de doble clic en el Excel del establecimiento, que está en
 * español. Tres cosas lo determinan y las tres se equivocan por omisión:
 *
 *  1. **Punto y coma como separador.** Excel usa el separador de listas del
 *     sistema, que en español es `;`. Con coma, las veintinueve columnas caen
 *     todas en la primera celda.
 *  2. **BOM al principio.** Sin él, Excel lee el archivo como ANSI y «señalada»
 *     aparece rota en todas las filas.
 *  3. **Coma decimal en los números.** Con punto, Excel los lee como texto y
 *     los promedios dan cero — el modo de falla más silencioso de los tres,
 *     porque el archivo se ve bien.
 *
 * Todo acá es puro: entran filas y columnas, sale un string. Lo único que no se
 * puede verificar sin un Excel en español de verdad es justamente lo de arriba,
 * así que va como prueba manual obligatoria.
 */

export const SEPARADOR = ';';
const FIN_DE_LINEA = '\r\n';

/** Lo que hace que Excel no lea el archivo como ANSI. */
export const BOM = '﻿';

export interface ColumnaCSV<T> {
  /** El encabezado, que es también el nombre de la columna en la base. */
  clave: string;
  valor: (fila: T) => string | number | null | undefined;
}

/**
 * Un campo, escapado.
 *
 * Además de lo obvio —comillas alrededor de lo que contenga el separador, una
 * comilla o un salto de línea, y las comillas internas duplicadas— se
 * entrecomilla lo que empiece con `=`, `+`, `-` o `@`. Una observación que
 * empiece con un guion no debería poder ejecutar nada al abrirse la planilla.
 */
export function escapar(texto: string): string {
  const peligroso =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes('\n') ||
    texto.includes('\r') ||
    /^[=+\-@]/.test(texto);

  return peligroso ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Un valor, en texto.
 *
 * Los nulos van como celda vacía y nunca como 0: los históricos de Zoho
 * cargaban 0 en el peso de los muertos y eso arruina cualquier promedio.
 */
export function formatear(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? String(valor) : String(valor).replace('.', ',');
  }
  return valor;
}

/** Las filas y sus columnas, listas para descargar. */
export function aCSV<T>(filas: readonly T[], columnas: readonly ColumnaCSV<T>[]): string {
  const encabezado = columnas.map((c) => escapar(c.clave)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => escapar(formatear(c.valor(fila)))).join(SEPARADOR),
  );
  return BOM + [encabezado, ...cuerpo].join(FIN_DE_LINEA) + FIN_DE_LINEA;
}

/**
 * El nombre del archivo, con la fecha y hora del corte.
 *
 * Va acá y no en una línea de cabecera, que rompería el CSV para Excel. Y va,
 * porque el archivo dice lo que ESTE navegador tenía sincronizado: sin la marca
 * de tiempo, dos exportaciones del mismo día son indistinguibles.
 */
export function nombreDeArchivo(que: string, temporada: number, ahora: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  const sello =
    `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}` +
    `-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  return `petra-${que}-${temporada}-${sello}.csv`;
}

/**
 * Dispara la descarga.
 *
 * No es puro y por eso está al final, aparte: lo de arriba se testea, esto se
 * mira funcionar. `text/csv` con charset declarado por si alguien lo abre en
 * algo que respete el encabezado en vez del BOM.
 */
export function descargar(contenido: string, nombre: string): void {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  // Sin esto el Blob queda vivo hasta que se cierre la pestaña, y una sesión de
  // exportaciones repetidas se los va acumulando en memoria.
  URL.revokeObjectURL(url);
}
