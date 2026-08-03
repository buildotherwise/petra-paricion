/**
 * Búsqueda de caravanas.
 *
 * El problema concreto: de las 502 madres de la temporada, 20 tienen caravanas
 * alfanuméricas — 'PI 136', 'T. 319 V', 'T. 096 V (2096)'. Con un buscador que
 * exige prefijo exacto y teclado numérico, esas 20 ovejas son imposibles de
 * encontrar y siempre terminarían en alta manual.
 *
 * La solución es buscar también por los dígitos que la caravana contiene, así
 * el teclado numérico —que es el que hace falta para las otras 482— igual llega
 * a todas.
 *
 * Se filtra en memoria y no en SQL: son ~500 filas, el costo es despreciable, y
 * a cambio se puede ordenar por relevancia y testear sin base de datos.
 */

export interface ConCaravana {
  caravana: string;
}

/** Deja solo letras y dígitos, en mayúscula. 'T. 096 V' → 'T096V'. */
function compactar(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Solo los dígitos. 'T. 096 V (2096)' → '0962096'. */
function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * Menor es mejor. Devuelve null si no coincide de ninguna forma.
 *
 * El orden importa más de lo que parece: el operador escribe dos o tres dígitos
 * y toca el primer resultado sin leer el resto.
 */
function relevancia(caravana: string, consulta: string): number | null {
  const compacta = compactar(caravana);
  const digitos = soloDigitos(caravana);

  if (compacta.startsWith(consulta)) return 0;
  if (digitos.startsWith(consulta)) return 1;
  if (compacta.includes(consulta)) return 2;
  if (digitos.includes(consulta)) return 3;
  return null;
}

export interface ConCollar extends ConCaravana {
  id: string;
  collar_numero: string | null;
}

/**
 * Busca un parto por caravana de la madre o por número de collar.
 *
 * Son las dos cosas que se pueden leer en el animal: la caravana la lleva la
 * madre y el collar lo llevan la madre y todos los hermanos. Lo usan la lista
 * de partos registrados y la señalada, y tiene que dar lo mismo en las dos —
 * que un parto aparezca en una pantalla y no en la otra haría dudar de si es el
 * mismo registro.
 *
 * La caravana va por `buscarCaravana`, que llega a las alfanuméricas; el collar
 * es una comparación aparte porque un «12» tipeado tiene que encontrar el parto
 * del collar 12 aunque ninguna caravana lo contenga. Los collares se comparan
 * como números —«12» y «012» son el mismo objeto físico— por la misma razón que
 * en `collarDisponible`.
 */
export function buscarPorCaravanaOCollar<T extends ConCollar>(
  filas: readonly T[],
  consulta: string,
): T[] {
  const porCaravana = buscarCaravana(filas, consulta);
  const encontrados = new Set(porCaravana.map((f) => f.id));
  const buscado = consulta.trim().replace(/^0+(?=.)/, '');
  if (buscado === '') return porCaravana;

  const porCollar = filas.filter(
    (f) =>
      !encontrados.has(f.id) &&
      f.collar_numero !== null &&
      f.collar_numero.trim().replace(/^0+(?=.)/, '') === buscado,
  );

  return [...porCaravana, ...porCollar];
}

export function buscarCaravana<T extends ConCaravana>(ovejas: readonly T[], consulta: string): T[] {
  const buscada = compactar(consulta);
  if (buscada === '') return [];

  const coincidencias: { oveja: T; rango: number }[] = [];

  for (const oveja of ovejas) {
    const rango = relevancia(oveja.caravana, buscada);
    if (rango !== null) coincidencias.push({ oveja, rango });
  }

  coincidencias.sort((a, b) => {
    if (a.rango !== b.rango) return a.rango - b.rango;
    // A igual relevancia, la más corta primero: se lee más rápido.
    const largo = a.oveja.caravana.length - b.oveja.caravana.length;
    if (largo !== 0) return largo;
    return a.oveja.caravana.localeCompare(b.oveja.caravana, 'es');
  });

  return coincidencias.map((c) => c.oveja);
}

/**
 * Parte la caravana en [antes, coincidencia, después] para poder resaltar en
 * pantalla por qué apareció ese resultado.
 *
 * Importa más de lo que parece: buscando '13' aparece 'PI 136', y sin marcar
 * qué coincidió el operador no entiende por qué está ahí y desconfía de la
 * lista. Si no hay coincidencia visible, devuelve todo en 'antes'.
 */
export function partirCoincidencia(caravana: string, consulta: string): [string, string, string] {
  const buscada = compactar(consulta);
  if (buscada === '') return [caravana, '', ''];

  // Índice de cada carácter conservado dentro de la caravana original, para
  // poder volver de la versión compacta a la de pantalla.
  const posiciones: number[] = [];
  let compacta = '';
  for (let i = 0; i < caravana.length; i++) {
    const c = caravana[i]?.toUpperCase() ?? '';
    if (/[0-9A-Z]/.test(c)) {
      compacta += c;
      posiciones.push(i);
    }
  }

  let desde = compacta.indexOf(buscada);

  // No coincide en la forma compacta: puede coincidir solo entre los dígitos
  // ('13' dentro de 'PI 136'). Se rearma el mapa quedándose con los dígitos.
  if (desde === -1) {
    const posDigitos: number[] = [];
    let digitos = '';
    for (let i = 0; i < compacta.length; i++) {
      const c = compacta[i] ?? '';
      if (c >= '0' && c <= '9') {
        digitos += c;
        posDigitos.push(posiciones[i] ?? 0);
      }
    }
    const d = digitos.indexOf(buscada);
    if (d === -1) return [caravana, '', ''];

    const inicio = posDigitos[d] ?? 0;
    const fin = (posDigitos[d + buscada.length - 1] ?? inicio) + 1;
    return [caravana.slice(0, inicio), caravana.slice(inicio, fin), caravana.slice(fin)];
  }

  const inicio = posiciones[desde] ?? 0;
  const fin = (posiciones[desde + buscada.length - 1] ?? inicio) + 1;
  return [caravana.slice(0, inicio), caravana.slice(inicio, fin), caravana.slice(fin)];
}
