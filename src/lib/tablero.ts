import { diaCorto, diasDesde, nombreTipo } from './parto';
import { ENTROPIONES } from './reglas';

/**
 * De lo que devuelven las vistas a lo que dibuja cada tarjeta.
 *
 * Todo acá es una función pura: entra un arreglo de filas tal como lo manda
 * PostgREST y sale lo que Recharts espera. La razón de que esto no viva dentro
 * de `Tablero.tsx` es que **el caso difícil de un tablero es el vacío**, y un
 * caso difícil metido en un componente no se puede probar sin montar el
 * componente.
 *
 * La regla que gobierna todas: entrada vacía ⇒ ceros explícitos, nunca
 * `undefined` ni NaN. El tablero se abre por primera vez con la temporada sin
 * arrancar, y «0 %» es una respuesta mientras que una tarjeta en blanco parece
 * una consulta rota.
 *
 * Lo que NO se hace acá: pedir los datos (eso es `consultas-online.ts`) ni
 * calcular métricas (eso es `0011_vistas_metricas.sql`, para que un BI externo
 * lea lo mismo). Esto es solo la traducción.
 */

// ---------------------------------------------------------------------------
// Las filas, tal como llegan de cada vista
// ---------------------------------------------------------------------------

export interface FilaAvance {
  temporada: number;
  dia: string;
  partos: number;
  esperados: number;
  en_ventana: number;
  partos_acumulados: number;
  esperados_acumulados: number;
  paridas_acumuladas: number;
  /** Ovejas con algún servicio. NO son las inseminadas: en 2026 hay dieciséis
   *  que solo fueron al repaso y nunca pasaron por la pipeta. */
  servidas: number;
  /** El total de la curva esperada, repetido en cada fila. Desde la 0016 es
   *  menor que `servidas`: la curva predice la preñez, no la da por hecha. */
  esperados_temporada: number;
}

export interface FilaTipoNacimiento {
  temporada: number;
  tipo_nacimiento: number;
  partos: number;
  corderos: number;
}

export interface FilaMortalidad {
  temporada: number;
  nacidos: number;
  nacidos_vivos: number;
  muertos_al_nacer: number;
  muertos_antes_de_senalar: number;
  muertos_despues_de_senalar: number;
}

export interface FilaPeso {
  temporada: number;
  sexo: 'macho' | 'hembra';
  tipo_nacimiento: number;
  con_peso: number;
  promedio_kg: number;
  minimo_kg: number;
  maximo_kg: number;
}

export interface FilaPendientes {
  temporada: number;
  fecha_parto: string;
  pendientes: number;
}

export interface FilaPrevalencia {
  temporada: number;
  rasgo: string;
  valor: string;
  corderos: number;
  senalados: number;
}

export interface FilaCondicion {
  temporada: number;
  condicion_corporal: number | null;
  partos: number;
}

export interface FilaResumen {
  temporada: number;
  ovejas: number;
  ovejas_paridas: number;
  corderos_nacidos: number;
  corderos_senalados: number;
}

/** Una fila de `v_paternidad`: un parto, con su padre derivado o sin él. */
export interface FilaPaternidad {
  temporada: number;
  parto_id: string;
  oveja_id: string;
  caravana: string;
  fecha_parto: string;
  /** Servicios de la madre biológicamente compatibles con esta fecha. */
  candidatos: number;
  /** Otros servicios posibles de un padre distinto: la ambigüedad de verdad. */
  alternativas: number;
  padre: string | null;
  cabana: string | null;
  servicio_tipo: 'inseminacion' | 'encarnerada' | null;
  servicio_inicio: string | null;
  servicio_fin: string | null;
  gestacion_min: number | null;
  gestacion_max: number | null;
  /** cierto = gestación 145–155 · probable = 140–160 · null = sin padre. */
  confianza: 'cierto' | 'probable' | null;
}

/** Un porcentaje que no explota cuando todavía no hay de qué. */
function porciento(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0;
}

// ---------------------------------------------------------------------------
// 1. Avance
// ---------------------------------------------------------------------------

export interface ResumenAvance {
  paridas: number;
  servidas: number;
  porcentaje: number;
  /** Cuántos partos predice la curva en toda la temporada, redondeado. */
  esperados: number;
}

/**
 * La cifra grande: cuántas de las servidas ya parieron, y cuántas se esperan.
 *
 * Sale de la ÚLTIMA fila porque los acumulados son de la vista, no de acá. Se
 * busca el máximo día en vez de tomar el último elemento: el orden lo pone la
 * consulta y esto tiene que seguir siendo cierto si alguien la cambia.
 *
 * `esperados` y `servidas` son dos números distintos a propósito y la tarjeta
 * muestra los dos: desde la 0016 la curva predice la preñez —unas 460 de las
 * 503 servidas— en vez de suponer que toda oveja servida pare. Sin decirlo, la
 * distancia entre las barras y la línea se lee como un atraso de la parición.
 */
export function resumenAvance(filas: readonly FilaAvance[]): ResumenAvance {
  if (filas.length === 0) return { paridas: 0, servidas: 0, porcentaje: 0, esperados: 0 };

  const ultima = filas.reduce((a, b) => (b.dia > a.dia ? b : a));
  return {
    paridas: ultima.paridas_acumuladas,
    servidas: ultima.servidas,
    porcentaje: porciento(ultima.paridas_acumuladas, ultima.servidas),
    esperados: Math.round(ultima.esperados_temporada),
  };
}

export interface PuntoAvance {
  dia: string;
  etiqueta: string;
  partos: number;
  esperados: number;
}

/**
 * La curva diaria. Los días en cero NO se filtran: son el ritmo de la parición.
 *
 * Sacarlos comprimiría el tiempo y las tandas de la inseminación —tres olas
 * separadas quince días, que es la estructura real del manejo— se verían como
 * una sola loma continua.
 */
export function serieAvance(filas: readonly FilaAvance[]): PuntoAvance[] {
  return [...filas]
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((f) => ({
      dia: f.dia,
      etiqueta: diaCorto(f.dia),
      partos: f.partos,
      esperados: f.esperados,
    }));
}

// ---------------------------------------------------------------------------
// 2. Tipo de nacimiento
// ---------------------------------------------------------------------------

/**
 * En el tablero cada barra nombra una CATEGORÍA, no un parto: son «los únicos»,
 * no «este parto es único». Por eso el plural, que `nombreTipo` no da — ese
 * nombra un parto y así tiene que seguir nombrándolo en la ficha y en la tabla.
 */
const CATEGORIA: Record<number, string> = { 1: 'Únicos', 2: 'Mellizos', 3: 'Trillizos' };

export interface DistribucionTipos {
  barras: {
    etiqueta: string;
    tipo: number;
    partos: number;
    corderos: number;
    porcentaje: number;
  }[];
  partos: number;
  /** Partos de dos o más. Es el numerador de la mellicería, y se muestra: un
   *  porcentaje sin su fracción obliga a confiar en vez de a entender. */
  multiples: number;
  melliceria: number;
}

export function distribucionTipos(filas: readonly FilaTipoNacimiento[]): DistribucionTipos {
  const ordenadas = [...filas].sort((a, b) => a.tipo_nacimiento - b.tipo_nacimiento);
  const partos = ordenadas.reduce((n, f) => n + f.partos, 0);

  const barras = ordenadas.map((f) => ({
    etiqueta: CATEGORIA[f.tipo_nacimiento] ?? nombreTipo(f.tipo_nacimiento),
    tipo: f.tipo_nacimiento,
    partos: f.partos,
    corderos: f.corderos,
    porcentaje: porciento(f.partos, partos),
  }));

  const multiples = barras.filter((b) => b.tipo >= 2).reduce((n, b) => n + b.partos, 0);

  return { barras, partos, multiples, melliceria: porciento(multiples, partos) };
}

// ---------------------------------------------------------------------------
// 2.b Los dos números que se preguntan primero
// ---------------------------------------------------------------------------

export interface Resumen {
  ovejas: number;
  paridas: number;
  porcentajeParidas: number;
  nacidos: number;
  senalados: number;
  porcentajeSenalada: number;
}

/**
 * Cuántas ovejas parieron, y cuántos corderos deja cada una.
 *
 * Dos aclaraciones sobre los denominadores, que es donde estos números se
 * confunden con otros parecidos:
 *
 *  - `porcentajeParidas` va sobre el RODEO entero, no sobre las servidas. El
 *    avance de la parición usa el otro denominador porque compara contra
 *    ventanas de parto, y una oveja sin servicio no tiene ventana. En 2026 los
 *    dos coinciden; el día que no, van a estar diciendo cosas distintas.
 *  - `porcentajeSenalada` va sobre las ovejas PARIDAS y **puede pasar del
 *    100 %**: mide cuántos corderos marcados deja cada oveja que parió, así que
 *    con mellizos supera el 100 por definición. No es una tasa de
 *    supervivencia — esa es v_mortalidad.
 */
export function resumenTemporada(filas: readonly FilaResumen[]): Resumen {
  const f = filas[0];
  if (f === undefined) {
    return {
      ovejas: 0,
      paridas: 0,
      porcentajeParidas: 0,
      nacidos: 0,
      senalados: 0,
      porcentajeSenalada: 0,
    };
  }

  return {
    ovejas: f.ovejas,
    paridas: f.ovejas_paridas,
    porcentajeParidas: porciento(f.ovejas_paridas, f.ovejas),
    nacidos: f.corderos_nacidos,
    senalados: f.corderos_senalados,
    porcentajeSenalada: porciento(f.corderos_senalados, f.ovejas_paridas),
  };
}

// ---------------------------------------------------------------------------
// 3. Mortalidad
// ---------------------------------------------------------------------------

export interface Mortalidad {
  nacidos: number;
  nacidosVivos: number;
  muertos: number;
  tasaTotal: number;
  etapas: { etiqueta: string; corderos: number; porcentaje: number }[];
}

/**
 * Cuántos corderos se murieron, en total y por etapa.
 *
 * La cifra grande es la mortalidad **total sobre los nacidos**, que es lo que
 * la palabra «mortalidad» quiere decir sin aclaraciones. Las tres etapas la
 * desarman —el parto, la crianza hasta la señalada, y después— y comparten ese
 * mismo denominador a propósito: con denominadores distintos las tres barras no
 * se podrían comparar entre sí ni sumar a la cifra de arriba, y una tarjeta
 * cuyos números no cierran obliga a desconfiar de todos.
 *
 * Sin corderos la vista no devuelve ninguna fila —no hay `group by` que
 * agrupar— y la tarjeta tiene que mostrarse igual.
 */
export function tasasMortalidad(filas: readonly FilaMortalidad[]): Mortalidad {
  const f = filas[0];
  const nacidos = f?.nacidos ?? 0;
  const cuenta = [
    ['Al nacer', f?.muertos_al_nacer ?? 0],
    ['Antes de señalar', f?.muertos_antes_de_senalar ?? 0],
    ['Después de señalar', f?.muertos_despues_de_senalar ?? 0],
  ] as const;

  const muertos = cuenta.reduce((n, [, c]) => n + c, 0);

  return {
    nacidos,
    nacidosVivos: f?.nacidos_vivos ?? 0,
    muertos,
    tasaTotal: porciento(muertos, nacidos),
    etapas: cuenta.map(([etiqueta, corderos]) => ({
      etiqueta,
      corderos,
      porcentaje: porciento(corderos, nacidos),
    })),
  };
}

// ---------------------------------------------------------------------------
// 4. Peso al nacer
// ---------------------------------------------------------------------------

export interface BarraPeso {
  etiqueta: string;
  macho: number | null;
  hembra: number | null;
  n: number;
}

/**
 * Un grupo por tipo de nacimiento, con una barra por sexo.
 *
 * Un sexo sin datos queda en `null` y no en 0: cero kilos no es un peso bajo,
 * es un cordero que no existe, y Recharts dibujaría una barra rasante como si
 * lo fuera.
 */
export function pesosPorSexoYTipo(filas: readonly FilaPeso[]): BarraPeso[] {
  const tipos = [...new Set(filas.map((f) => f.tipo_nacimiento))].sort((a, b) => a - b);

  return tipos.map((tipo) => {
    const delTipo = filas.filter((f) => f.tipo_nacimiento === tipo);
    const de = (sexo: 'macho' | 'hembra') =>
      delTipo.find((f) => f.sexo === sexo)?.promedio_kg ?? null;

    return {
      etiqueta: CATEGORIA[tipo] ?? nombreTipo(tipo),
      macho: de('macho'),
      hembra: de('hembra'),
      n: delTipo.reduce((n, f) => n + f.con_peso, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Señaladas pendientes
// ---------------------------------------------------------------------------

export interface Pendientes {
  total: number;
  masViejaDias: number | null;
  barras: { etiqueta: string; fecha: string; pendientes: number }[];
}

/**
 * `hoy` entra por parámetro y no se lee acá adentro: es lo que hace que la
 * antigüedad se pueda probar. La vista tampoco lo calcula —devuelve fechas de
 * parto— porque un «hace 12 días» calculado en el servidor envejece mal.
 */
export function pendientesConAntiguedad(
  filas: readonly FilaPendientes[],
  hoy: string,
): Pendientes {
  const barras = [...filas]
    .sort((a, b) => a.fecha_parto.localeCompare(b.fecha_parto))
    .map((f) => ({
      etiqueta: diaCorto(f.fecha_parto),
      fecha: f.fecha_parto,
      pendientes: f.pendientes,
    }));

  const primera = barras[0];
  return {
    total: barras.reduce((n, b) => n + b.pendientes, 0),
    masViejaDias: primera === undefined ? null : diasDesde(primera.fecha, hoy),
    barras,
  };
}

// ---------------------------------------------------------------------------
// 6. Prevalencias fenotípicas
// ---------------------------------------------------------------------------

export interface Casilla {
  corderos: number;
  porcentaje: number;
}

export interface MatrizCanelaLunar {
  canela: { vellon: Casilla; noVellon: Casilla };
  lunar: { vellon: Casilla; noVellon: Casilla };
  senalados: number;
}

/**
 * Las cuatro columnas de Zoho, otra vez como dos rasgos por dos ubicaciones.
 *
 * Se cuentan los que SÍ tienen el rasgo (`valor = '1'`). Es una matriz de HTML
 * y no un gráfico a propósito: es la misma matriz 2×2 que se toca en el campo,
 * y verla igual acá es lo que hace que un número del tablero se pueda rastrear
 * hasta el gesto que lo produjo.
 */
export function matrizCanelaLunar(filas: readonly FilaPrevalencia[]): MatrizCanelaLunar {
  const senalados = filas[0]?.senalados ?? 0;

  const casilla = (rasgo: string): Casilla => {
    const corderos = filas.find((f) => f.rasgo === rasgo && f.valor === '1')?.corderos ?? 0;
    return { corderos, porcentaje: porciento(corderos, senalados) };
  };

  return {
    canela: { vellon: casilla('canela_vellon'), noVellon: casilla('canela_no_vellon') },
    lunar: { vellon: casilla('lunar_vellon'), noVellon: casilla('lunar_no_vellon') },
    senalados,
  };
}

export interface BarraPrevalencia {
  etiqueta: string;
  valor: string;
  corderos: number;
  porcentaje: number;
}

const ORDEN_ENTROPION = ENTROPIONES.map((e) => e.valor as string);

/**
 * Un rasgo con sus valores posibles, en orden y con los ceros que trae la vista.
 *
 * Los ceros no se filtran: «nadie tuvo pigmentación 4» es información, y una
 * barra ausente se lee como «no se midió».
 */
export function prevalenciaDe(
  filas: readonly FilaPrevalencia[],
  rasgo: string,
): BarraPrevalencia[] {
  const etiquetaDe = (valor: string): string =>
    ENTROPIONES.find((e) => e.valor === valor)?.etiqueta ?? valor;

  const orden = (valor: string): number => {
    const i = ORDEN_ENTROPION.indexOf(valor);
    return i >= 0 ? i : Number(valor);
  };

  return filas
    .filter((f) => f.rasgo === rasgo)
    .sort((a, b) => orden(a.valor) - orden(b.valor))
    .map((f) => ({
      etiqueta: etiquetaDe(f.valor),
      valor: f.valor,
      corderos: f.corderos,
      porcentaje: porciento(f.corderos, f.senalados),
    }));
}

// ---------------------------------------------------------------------------
// 7. Condición corporal
// ---------------------------------------------------------------------------

export interface Histograma {
  barras: { etiqueta: string; valor: number; partos: number }[];
  mediana: number | null;
  sinDato: number;
}

/** La escala de R4: de 1 a 5, en cuartos. Diecisiete escalones. */
function escalaDeCuartos(): number[] {
  const valores: number[] = [];
  for (let v = 1; v <= 5.0001; v += 0.25) valores.push(Math.round(v * 100) / 100);
  return valores;
}

/**
 * El histograma con TODOS los cuartos, incluidos los que nadie usó.
 *
 * Sin el relleno, un histograma de tres barras contiguas parecería una
 * distribución angosta cuando en realidad es una escala con huecos. Y el «sin
 * dato» sale aparte en vez de como una barra más: no es una condición corporal
 * peor que 1, es una medición que no se hizo, y sumarla al gráfico haría que el
 * eje mienta.
 */
export function histogramaCondicion(filas: readonly FilaCondicion[]): Histograma {
  const medidos = filas.filter((f) => f.condicion_corporal !== null);
  const porValor = new Map(medidos.map((f) => [Number(f.condicion_corporal), f.partos]));

  const barras = escalaDeCuartos().map((valor) => ({
    etiqueta: Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace('.', ','),
    valor,
    partos: porValor.get(valor) ?? 0,
  }));

  const total = medidos.reduce((n, f) => n + f.partos, 0);
  let mediana: number | null = null;
  if (total > 0) {
    let acumulado = 0;
    for (const b of barras) {
      acumulado += b.partos;
      if (acumulado >= total / 2) {
        mediana = b.valor;
        break;
      }
    }
  }

  return {
    barras,
    mediana,
    sinDato: filas.find((f) => f.condicion_corporal === null)?.partos ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 9. Paternidad
// ---------------------------------------------------------------------------

export interface BarraPadre {
  /** «32 · La Petra» — el padre con su cabaña, cuando la tiene. */
  etiqueta: string;
  partos: number;
  /** Sobre el total de partos de la temporada, no solo los con padre. */
  porcentaje: number;
}

export interface CasoSinPadre {
  caravana: string;
  fecha: string;
  candidatos: number;
}

export interface Paternidad {
  partos: number;
  conPadre: number;
  /** De los que tienen padre: gestación dentro de 145–155. */
  ciertos: number;
  /** De los que tienen padre: gestación dentro de 140–160, pero no de 145–155. */
  probables: number;
  /** Con padre asignado y OTRO servicio posible de padre distinto (0018). */
  conAlternativa: number;
  padres: BarraPadre[];
  /** Los partos sin padre, para mirarlos a mano, los más viejos primero. */
  revisar: CasoSinPadre[];
}

/**
 * Partos por padre derivado, con los casos sin padre a la vista.
 *
 * La unidad es el PARTO y no el cordero porque esa es la unidad de la vista:
 * el padre se deriva del servicio de la madre, así que los mellizos lo
 * comparten por construcción y contarlos duplicaría el peso de la mellicería
 * en un gráfico que habla de carneros.
 *
 * Los sin-padre no se esconden en un «otros»: un cordero con padre equivocado
 * en un plantel de cabaña es peor que uno sin padre (CLAUDE.md §9), así que
 * los casos que la vista se negó a adivinar son exactamente los que hay que
 * mostrar.
 */
export function paternidadPorPadre(filas: readonly FilaPaternidad[]): Paternidad {
  const porPadre = new Map<string, { cabana: string | null; partos: number }>();
  const revisar: CasoSinPadre[] = [];
  let ciertos = 0;
  let probables = 0;
  let conAlternativa = 0;

  for (const f of filas) {
    if (f.padre === null) {
      revisar.push({ caravana: f.caravana, fecha: f.fecha_parto, candidatos: f.candidatos });
      continue;
    }

    const actual = porPadre.get(f.padre);
    if (actual === undefined) porPadre.set(f.padre, { cabana: f.cabana, partos: 1 });
    else actual.partos += 1;

    if (f.confianza === 'cierto') ciertos += 1;
    else probables += 1;
    if (f.alternativas > 0) conAlternativa += 1;
  }

  const padres = [...porPadre.entries()]
    .map(([padre, { cabana, partos }]) => ({
      etiqueta: cabana === null ? padre : `${padre} · ${cabana}`,
      partos,
      porcentaje: porciento(partos, filas.length),
    }))
    .sort((a, b) => b.partos - a.partos || a.etiqueta.localeCompare(b.etiqueta));

  revisar.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    partos: filas.length,
    conPadre: ciertos + probables,
    ciertos,
    probables,
    conAlternativa,
    padres,
    revisar,
  };
}
