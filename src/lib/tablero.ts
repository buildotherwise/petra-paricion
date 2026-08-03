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
  inseminadas: number;
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

/** Un porcentaje que no explota cuando todavía no hay de qué. */
function porciento(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0;
}

// ---------------------------------------------------------------------------
// 1. Avance
// ---------------------------------------------------------------------------

export interface ResumenAvance {
  paridas: number;
  inseminadas: number;
  porcentaje: number;
}

/**
 * La cifra grande: cuántas de las inseminadas ya parieron.
 *
 * Sale de la ÚLTIMA fila porque los acumulados son de la vista, no de acá. Se
 * busca el máximo día en vez de tomar el último elemento: el orden lo pone la
 * consulta y esto tiene que seguir siendo cierto si alguien la cambia.
 */
export function resumenAvance(filas: readonly FilaAvance[]): ResumenAvance {
  if (filas.length === 0) return { paridas: 0, inseminadas: 0, porcentaje: 0 };

  const ultima = filas.reduce((a, b) => (b.dia > a.dia ? b : a));
  return {
    paridas: ultima.paridas_acumuladas,
    inseminadas: ultima.inseminadas,
    porcentaje: porciento(ultima.paridas_acumuladas, ultima.inseminadas),
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
  barras: { etiqueta: string; tipo: number; partos: number; corderos: number }[];
  partos: number;
  melliceria: number;
}

export function distribucionTipos(filas: readonly FilaTipoNacimiento[]): DistribucionTipos {
  const barras = [...filas]
    .sort((a, b) => a.tipo_nacimiento - b.tipo_nacimiento)
    .map((f) => ({
      etiqueta: CATEGORIA[f.tipo_nacimiento] ?? nombreTipo(f.tipo_nacimiento),
      tipo: f.tipo_nacimiento,
      partos: f.partos,
      corderos: f.corderos,
    }));

  const partos = barras.reduce((n, b) => n + b.partos, 0);
  const multiples = barras.filter((b) => b.tipo >= 2).reduce((n, b) => n + b.partos, 0);

  return { barras, partos, melliceria: porciento(multiples, partos) };
}

// ---------------------------------------------------------------------------
// 3. Mortalidad
// ---------------------------------------------------------------------------

export interface Mortalidad {
  nacidos: number;
  nacidosVivos: number;
  alNacer: number;
  antesDeSenalar: number;
  despuesDeSenalar: number;
  tasaAlNacer: number;
  tasaAntesDeSenalar: number;
}

/**
 * Las tres muertes, cada una con el denominador que le corresponde.
 *
 * La de al nacer va sobre todos los nacidos; la de después va sobre los que
 * NACIERON VIVOS, porque un cordero que nació muerto nunca estuvo en riesgo de
 * morirse en la crianza y meterlo en el denominador diluiría la única tasa que
 * habla del manejo.
 *
 * Sin corderos la vista no devuelve ninguna fila —no hay `group by` que agrupar—
 * y la tarjeta tiene que mostrarse igual.
 */
export function tasasMortalidad(filas: readonly FilaMortalidad[]): Mortalidad {
  const f = filas[0];
  if (f === undefined) {
    return {
      nacidos: 0,
      nacidosVivos: 0,
      alNacer: 0,
      antesDeSenalar: 0,
      despuesDeSenalar: 0,
      tasaAlNacer: 0,
      tasaAntesDeSenalar: 0,
    };
  }

  return {
    nacidos: f.nacidos,
    nacidosVivos: f.nacidos_vivos,
    alNacer: f.muertos_al_nacer,
    antesDeSenalar: f.muertos_antes_de_senalar,
    despuesDeSenalar: f.muertos_despues_de_senalar,
    tasaAlNacer: porciento(f.muertos_al_nacer, f.nacidos),
    tasaAntesDeSenalar: porciento(f.muertos_antes_de_senalar, f.nacidos_vivos),
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
