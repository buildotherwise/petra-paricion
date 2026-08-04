import { Fragment, useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  avanceParicion,
  condicionCorporal,
  mortalidad,
  paternidadDeLaTemporada,
  pesoAlNacer,
  prevalenciasFenotipicas,
  resumenDeLaTemporada,
  senaladasPendientes,
  tipoDeNacimiento,
  useConsultaOnline,
  type EstadoConsulta,
} from '../../lib/consultas-online';
import { entorno } from '../../lib/entorno';
import { hoyISO } from '../../lib/reglas';
import {
  distribucionTipos,
  histogramaCondicion,
  matrizCanelaLunar,
  paternidadPorPadre,
  pendientesConAntiguedad,
  pesosPorSexoYTipo,
  prevalenciaDe,
  resumenAvance,
  resumenTemporada,
  serieAvance,
  tasasMortalidad,
} from '../../lib/tablero';
// Acá y no en admin.css: el tablero se dibuja también en la pantalla de campo,
// y colgado de este archivo el CSS viaja con el chunk `Tablero-*`.
import '../../estilos/tablero.css';

/**
 * Cómo viene la temporada, en nueve tarjetas.
 *
 * Es la única sección de la web admin que **no** sale de la réplica local. Las
 * métricas son vistas de Postgres (0011_vistas_metricas.sql) por dos razones
 * escritas en CLAUDE.md §9: la lógica de cálculo queda en un solo lugar
 * auditable, y un BI externo futuro lee exactamente lo mismo. Además la curva
 * esperada necesita `servicios`, que a propósito no se replica a los teléfonos.
 *
 * Consecuencia asumida: **sin señal no hay tablero**. La bajada de la sección lo
 * dice y cada tarjeta degrada sola, con su error en castellano y su botón de
 * reintentar — una vista caída no deja la pantalla entera en blanco.
 *
 * Este archivo es el ÚNICO que importa Recharts, y no es casual: así el
 * empaquetador lo deja en el chunk de esta pantalla y `globIgnores` de
 * `vite.config.ts` puede sacarlo del precache. Si otro módulo lo importa, la
 * librería se iza a un chunk compartido, el patrón deja de coincidir y los cinco
 * teléfonos del campo se bajan 400 kB en silencio.
 */

// Los colores salen de tokens.css en vez de estar escritos acá: el tablero es
// parte de la misma pieza gráfica que el resto, y un hex repetido se despega el
// día que la paleta se ajuste. Los de reserva son los mismos valores, por si
// esto corriera sin las hojas de estilo cargadas.
function colores() {
  const raiz = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const token = (nombre: string, reserva: string) =>
    raiz?.getPropertyValue(nombre).trim() || reserva;

  return {
    marca: token('--marca', '#6b5a1e'),
    // Lo esperado va en gris y no en oro: el oro del logo contra el oro de la
    // marca tienen ΔE 11 —indistinguibles incluso con visión normal— y además
    // el gris dice lo correcto, que es una referencia y no una medición.
    esperado: token('--tinta-suave', '#7c7362'),
    error: token('--error', '#b3261e'),
    tenue: token('--marca-tenue', '#efe8cf'),
    tinta: token('--tinta', '#2b2519'),
    linea: token('--linea', '#e0d9c4'),
  };
}

const EJE = { fontSize: 11, fontWeight: 700, fill: '#7c7362' };

export default function Tablero() {
  const c = useMemo(colores, []);
  const temporada = entorno.temporada;

  return (
    <div className="admin-tablero">
      {/* Las dos primeras contestan las dos preguntas que abren cualquier
          conversación sobre la temporada, así que van antes que los gráficos:
          quien entra a mirar «cómo viene» las tiene sin buscar. */}
      <Resumen temporada={temporada} />
      <Avance temporada={temporada} c={c} />
      <Pendientes temporada={temporada} c={c} />
      <Tipos temporada={temporada} c={c} />
      <Paternidad temporada={temporada} c={c} />
      <Mortalidad temporada={temporada} c={c} />
      <Pesos temporada={temporada} c={c} />
      <Condicion temporada={temporada} c={c} />
      <Prevalencias temporada={temporada} c={c} />
    </div>
  );
}

type Colores = ReturnType<typeof colores>;

/**
 * El marco de cada tarjeta, con sus cuatro estados.
 *
 * Cargando, error, vacío y con datos son CUATRO cosas distintas y se ven
 * distinto. La que más importa es la diferencia entre las dos del medio: un
 * cero es una respuesta —«todavía no murió ninguno»— y un error es la ausencia
 * de respuesta. Mostrar «0 %» cuando en realidad no se pudo consultar sería
 * mentir con precisión.
 */
function Tarjeta({
  titulo,
  porque,
  cifra,
  estado,
  vacio,
  ancha = false,
  children,
}: {
  titulo: string;
  porque: string;
  cifra?: ReactNode;
  estado: Pick<EstadoConsulta<unknown>, 'cargando' | 'error' | 'recargar'>;
  vacio?: { titulo: string; detalle: string } | null;
  ancha?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={ancha ? 'admin-tarjeta admin-tarjeta--ancha' : 'admin-tarjeta'}>
      <div className="cabeza">
        <div>
          <h2>{titulo}</h2>
          <p className="porque">{porque}</p>
        </div>
        {/* La cifra espera a que haya datos. Mientras carga, `datos` es un
            arreglo vacío y las transformaciones devuelven ceros honestos —«0,0 %
            · 0 de 0»— que en pantalla se leen como un resultado y no como una
            espera. Es la misma mentira que el error tiene prohibida, en el otro
            estado. */}
        {!estado.cargando && estado.error === null && cifra !== undefined && (
          <div className="cifra-grande">{cifra}</div>
        )}
      </div>

      {estado.cargando && <p className="espera">Consultando el servidor…</p>}

      {estado.error !== null && (
        <div className="aviso-tablero">
          <p>{estado.error}</p>
          <button type="button" className="boton boton--texto" onClick={estado.recargar}>
            Reintentar
          </button>
        </div>
      )}

      {!estado.cargando && estado.error === null && vacio != null && (
        <div className="vacio-tablero">
          <b>{vacio.titulo}</b>
          {vacio.detalle}
        </div>
      )}

      {!estado.cargando && estado.error === null && vacio == null && children}
    </section>
  );
}

/** Un porcentaje como se escribe en castellano: coma decimal. */
function pct(n: number, decimales = 1): string {
  return `${n.toFixed(decimales).replace('.', ',')} %`;
}

/** Un decimal como se escribe en castellano. */
function coma(n: number, decimales = 1): string {
  return n.toFixed(decimales).replace('.', ',');
}

/**
 * Los formateadores del globo de Recharts.
 *
 * Reciben `unknown` porque la librería tipa el valor como «puede no venir», y
 * escribirlo así deja el ajuste en un solo lugar en vez de un casteo por
 * gráfico.
 */
function numeroDe(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

const contando =
  (etiqueta: string) =>
  (v: unknown): [string, string] => [String(numeroDe(v)), etiqueta];

/**
 * El globo, con el texto en tinta y no en el color de la serie.
 *
 * Recharts pinta cada línea del globo con el color de su barra, y la barra de
 * las hembras es champán: sobre el fondo blanco del globo quedaba ilegible. La
 * regla general es que **el texto usa colores de texto**; el color de la serie
 * lo lleva el cuadradito de al lado, que para eso está.
 *
 * El `cursor` también se baja: el gris por defecto de Recharts es un bloque que
 * tapa media tarjeta para señalar una columna.
 */
const GLOBO = {
  itemStyle: { color: '#2b2519', fontWeight: 600 },
  labelStyle: { fontWeight: 800, color: '#2b2519' },
  contentStyle: { borderRadius: 12, border: '1px solid #e0d9c4', fontSize: 12.5 },
  cursor: { fill: 'rgba(43, 37, 25, 0.05)' },
} as const;

/**
 * Unas pocas barras horizontales con su número y su porcentaje, en HTML.
 *
 * No es un gráfico de Recharts y no es por capricho. Con `LabelList` las
 * etiquetas se apoyan en el extremo de cada barra, así que cada una arranca en
 * una x distinta y la columna de números queda dentada — que es justamente lo
 * que se quiere leer de un vistazo. Alinearlas dentro del SVG pide reconstruir
 * la escala a mano desde el ancho en píxeles de cada barra, y con un valor en
 * cero esa cuenta ni siquiera se puede hacer.
 *
 * Una grilla de tres columnas lo resuelve por construcción: `auto 1fr auto`
 * hace que la primera se mida por la etiqueta más larga y la última por la
 * cifra más ancha, así que las barras arrancan todas en la misma x y las
 * cifras también. Para tres o cuatro barras sin eje ni escala visible, una
 * librería de gráficos no estaba aportando nada.
 *
 * **Las celdas son hijas directas de la grilla, sin un div por fila.** Con una
 * grilla por fila cada una mide sus columnas por su cuenta: «Únicos» es más
 * corto que «Trillizos» y las barras arrancan escalonadas. Que las cifras
 * parezcan alineadas en ese caso es casualidad de que los textos midan lo
 * mismo, no alineación.
 */
function BarrasHorizontales({
  filas,
  color,
}: {
  filas: readonly { etiqueta: string; valor: number; porcentaje: number }[];
  color: string;
}) {
  // El máximo manda la escala; el `1` evita dividir por cero cuando no hay nada
  // todavía y deja las barras en cero, que es lo honesto.
  const maximo = Math.max(...filas.map((f) => f.valor), 1);

  return (
    <div className="barras-h">
      {filas.map((f) => (
        <Fragment key={f.etiqueta}>
          <span className="et">{f.etiqueta}</span>
          <span className="pista">
            <span
              className="barra"
              style={{ width: `${(f.valor / maximo) * 100}%`, background: color }}
            />
          </span>
          <span className="val">
            <b>{f.valor}</b> · {pct(f.porcentaje)}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0 · Las dos preguntas de entrada
// ---------------------------------------------------------------------------

/**
 * Cuántas ovejas parieron y cuántos corderos deja cada una.
 *
 * Dos cifras y ningún gráfico: son números que se miran, no series que se
 * comparan. Comparten una sola consulta porque salen de la misma vista y de la
 * misma pregunta —el estado del rodeo— y separarlas duplicaría el viaje para
 * mostrar dos tarjetas que siempre se leen juntas.
 */
function Resumen({ temporada }: { temporada: number }) {
  const estado = useConsultaOnline(
    resumenDeLaTemporada(temporada),
    [temporada],
    'el resumen de la temporada',
  );
  const r = useMemo(() => resumenTemporada(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="La temporada"
      porque="Ovejas paridas y corderos señalados"
      estado={estado}
      vacio={r.ovejas === 0 ? { titulo: 'Sin ovejas', detalle: 'La temporada no tiene madres cargadas.' } : null}
    >
      <div className="par-cifras">
        <div>
          <p className="etiqueta-tablero">Ovejas paridas</p>
          <p className="cifra-grande">
            {pct(r.porcentajeParidas)}{' '}
            <small>
              · {r.paridas} de {r.ovejas}
            </small>
          </p>
        </div>
        <div>
          <p className="etiqueta-tablero">Señalada</p>
          <p className="cifra-grande">
            {pct(r.porcentajeSenalada)}{' '}
            <small>
              · {r.senalados} señalados
            </small>
          </p>
          {/* La aclaración no es un detalle: este número pasa del 100 % en
              cuanto la mellicería empuja, y sin decir contra qué se mide
              parecería un error de cálculo. */}
          <p className="pie-tablero">
            Corderos señalados por cada oveja que parió
            {r.paridas > 0 && ` · ${r.paridas} paridas`}
          </p>
        </div>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 1 · Avance
// ---------------------------------------------------------------------------

function Avance({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(avanceParicion(temporada), [temporada], 'el avance');
  const serie = useMemo(() => serieAvance(estado.datos), [estado.datos]);
  // Para saber si ya hay servicios contra los que comparar, y para el nivel que
  // predice la curva. El porcentaje de avance vive en «La temporada»: repetirlo
  // acá era decir el mismo número dos veces en la misma pantalla, y con
  // denominadores distintos —servidas contra rodeo— dos números casi iguales
  // invitan a buscar la diferencia.
  const resumen = useMemo(() => resumenAvance(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      ancha
      titulo="Avance de la parición"
      porque="Partos por día, contra lo esperado según los servicios de cada oveja"
      estado={estado}
      vacio={
        serie.length === 0
          ? { titulo: 'Sin datos todavía', detalle: 'Falta cargar los servicios de la temporada.' }
          : null
      }
    >
      <div className="grafico">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={c.linea} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} minTickGap={44} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            {...GLOBO}
            formatter={(v: unknown, n: unknown): [string, string] =>
              n === 'esperados'
                ? [coma(numeroDe(v)), 'Esperados']
                : [String(numeroDe(v)), 'Partos']
            }
           
          />
          <Bar dataKey="partos" name="partos" fill={c.marca} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Line
            dataKey="esperados"
            name="esperados"
            stroke={c.esperado}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {/* Sin servicios cargados hay curva real pero no hay contra qué compararla,
          y el porcentaje dice «0 de 0» — que sin esta línea se lee como si nadie
          hubiera parido. Es el estado del primer día: los partos entran antes de
          que alguien corra la importación. */}
      {resumen.servidas === 0 ? (
        <p className="pie-tablero">
          Faltan los servicios de la temporada, así que todavía no hay contra qué
          comparar. Se cargan con <b>scripts/importar-servicios.py</b>.
        </p>
      ) : (
        <>
          <div className="leyenda-tablero">
            <span>
              <i style={{ background: c.marca }} />
              Partos por día
            </span>
            <span>
              <i className="raya" style={{ borderTopColor: c.esperado }} />
              Esperados (gestación 140–160)
            </span>
          </div>
          {/* El nivel, dicho en palabras. La curva ya no supone que toda oveja
              servida pare, así que la suma de la línea punteada queda por debajo
              de las servidas — y sin esta línea esa distancia se lee como un
              atraso de la parición en vez de como lo que es: las que no
              quedaron preñadas. */}
          <p className="pie-tablero">
            La curva espera <b>{resumen.esperados} partos</b> sobre {resumen.servidas}{' '}
            ovejas servidas: no da por hecho que todas queden preñadas.
          </p>
        </>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 2 · Señaladas pendientes
// ---------------------------------------------------------------------------

function Pendientes({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(senaladasPendientes(temporada), [temporada], 'las señaladas pendientes');
  const p = useMemo(() => pendientesConAntiguedad(estado.datos, hoyISO()), [estado.datos]);

  return (
    <Tarjeta
      titulo="Señaladas pendientes"
      porque="Corderos vivos sin señalar, por fecha de parto"
      cifra={p.total}
      estado={estado}
      vacio={
        p.total === 0
          ? { titulo: 'Ninguna', detalle: 'No hay corderos sin señalar.' }
          : null
      }
    >
      <div className="grafico">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={p.barras} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} minTickGap={28} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip {...GLOBO} formatter={contando('Sin señalar')} />
          <Bar dataKey="pendientes" fill={c.marca} radius={[4, 4, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      {p.masViejaDias !== null && (
        <p className="pie-tablero">
          La más vieja espera hace <b>{p.masViejaDias} días</b>
        </p>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 3 · Tipo de nacimiento
// ---------------------------------------------------------------------------

/**
 * Partos por padre derivado. La unidad es el parto y no el cordero: el padre
 * sale del servicio de la madre, así que los mellizos lo comparten por
 * construcción y contarlos inflaría la mellicería en un gráfico de carneros.
 *
 * Los sin-padre van al pie con su caravana, no escondidos en un «otros»: son
 * los casos que `v_paternidad` se negó a adivinar (0 o 2+ candidatos), y la
 * regla de §9 es que se miran a mano.
 */
function Paternidad({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(
    paternidadDeLaTemporada(temporada),
    [temporada],
    'la paternidad',
  );
  const p = useMemo(() => paternidadPorPadre(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Paternidad"
      porque="Partos por padre, derivado de los servicios — nunca se tipea"
      cifra={
        <>
          {p.conPadre} <small>de {p.partos} con padre</small>
        </>
      }
      estado={estado}
      vacio={p.partos === 0 ? { titulo: 'Ninguno', detalle: 'Todavía no hay partos.' } : null}
    >
      <BarrasHorizontales
        color={c.marca}
        filas={p.padres.map((b) => ({
          etiqueta: b.etiqueta,
          valor: b.partos,
          porcentaje: b.porcentaje,
        }))}
      />
      {/* Cuánto se confía, no solo cuántos hay. Un padre «probable» es el que
          la regla anterior habría dejado sin asignar (migración 0018), y quien
          analiza el plantel tiene derecho a saber cuál es cuál. */}
      {p.conPadre > 0 && (
        <p className="pie-tablero">
          {p.ciertos} cierto{p.ciertos === 1 ? '' : 's'} <small>145–155 días</small> y {p.probables}{' '}
          probable{p.probables === 1 ? '' : 's'} <small>140–160 días</small>
          {p.conAlternativa > 0 &&
            ` · ${p.conAlternativa} con otro servicio posible, para mirar`}
        </p>
      )}
      {p.revisar.length > 0 && (
        <p className="pie-tablero">
          Sin padre: {p.revisar.length} parto{p.revisar.length === 1 ? '' : 's'} cuya fecha no la
          explica ningún servicio de la madre — caravana{' '}
          {p.revisar
            .slice(0, 8)
            .map((r) => r.caravana)
            .join(', ')}
          {p.revisar.length > 8 && ` y ${p.revisar.length - 8} más`}. Se miran a mano.
        </p>
      )}
    </Tarjeta>
  );
}

function Tipos({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(tipoDeNacimiento(temporada), [temporada], 'el tipo de nacimiento');
  const d = useMemo(() => distribucionTipos(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Tipo de nacimiento"
      porque="Distribución de los tipos de partos"
      estado={estado}
      vacio={d.partos === 0 ? { titulo: 'Ninguno', detalle: 'Todavía no hay partos.' } : null}
    >
      {/* El absoluto y el porcentaje juntos: el absoluto dice cuántos animales
          y el porcentaje dice qué peso tiene ese número en la temporada. Cada
          uno sin el otro obliga a una cuenta mental. */}
      <BarrasHorizontales
        color={c.marca}
        filas={d.barras.map((b) => ({
          etiqueta: b.etiqueta,
          valor: b.partos,
          porcentaje: b.porcentaje,
        }))}
      />
      <p className="pie-tablero">
        {d.partos} partos · {d.barras.reduce((n, b) => n + b.corderos, 0)} corderos
      </p>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 4 · Mortalidad
// ---------------------------------------------------------------------------

function Mortalidad({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(mortalidad(temporada), [temporada], 'la mortalidad');
  const m = useMemo(() => tasasMortalidad(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Mortalidad"
      porque="Corderos muertos sobre nacidos, por etapa"
      cifra={<span className="mala">{pct(m.tasaTotal)}</span>}
      estado={estado}
      vacio={
        // Un gráfico de tres barras en cero se ve roto, no se ve vacío. Y son
        // dos ceros distintos: «todavía no nació ninguno» y «no se murió
        // ninguno» — el segundo es una buena noticia y merece decirse.
        m.nacidos === 0
          ? { titulo: 'Ninguna', detalle: 'Sin nacimientos todavía, no hay qué contar.' }
          : m.muertos === 0
            ? { titulo: 'Ninguna', detalle: `No se murió ningún cordero de los ${m.nacidos} nacidos.` }
            : null
      }
    >
      <BarrasHorizontales
        color={c.error}
        filas={m.etapas.map((e) => ({
          etiqueta: e.etiqueta,
          valor: e.corderos,
          porcentaje: e.porcentaje,
        }))}
      />
      <p className="pie-tablero">{m.muertos} de {m.nacidos} nacidos</p>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 5 · Peso al nacer
// ---------------------------------------------------------------------------

function Pesos({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(pesoAlNacer(temporada), [temporada], 'los pesos');
  const barras = useMemo(() => pesosPorSexoYTipo(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Peso al nacer"
      porque="Promedios de pesos al nacer en kg"
      estado={estado}
      vacio={
        barras.length === 0
          ? { titulo: 'Sin pesos', detalle: 'Todavía no se pesó ningún cordero vivo.' }
          : null
      }
    >
      <div className="grafico">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barras} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={c.linea} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} domain={[0, 'auto']} width={38} />
          <Tooltip
            {...GLOBO}
            formatter={(v: unknown, n: unknown): [string, string] => [
              `${coma(numeroDe(v), 2)} kg`,
              n === 'macho' ? 'Machos' : 'Hembras',
            ]}
           
          />
          {/* Machos en relleno pleno, hembras en champán con borde: la paleta no
              tiene un segundo tono que se distinga del oro, y el contraste de
              luminosidad sobrevive a cualquier daltonismo. Es el mismo lenguaje
              que la chapa del collar. */}
          <Bar dataKey="macho" name="macho" fill={c.marca} radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Bar
            dataKey="hembra"
            name="hembra"
            fill={c.tenue}
            stroke={c.tinta}
            strokeWidth={1.5}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <div className="leyenda-tablero">
        <span>
          <i style={{ background: c.marca }} />
          Machos
        </span>
        <span>
          <i style={{ background: c.tenue, boxShadow: `inset 0 0 0 1.5px ${c.tinta}` }} />
          Hembras
        </span>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 6 · Condición corporal
// ---------------------------------------------------------------------------

function Condicion({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(condicionCorporal(temporada), [temporada], 'la condición corporal');
  const h = useMemo(() => histogramaCondicion(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Condición corporal"
      porque="Condición corporal de las madres"
      cifra={
        h.mediana === null ? undefined : (
          <>
            {String(h.mediana).replace('.', ',')} <small>· mediana</small>
          </>
        )
      }
      estado={estado}
      vacio={
        h.mediana === null && h.sinDato === 0
          ? { titulo: 'Sin datos', detalle: 'Todavía no hay partos con condición corporal.' }
          : null
      }
    >
      <div className="grafico">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={h.barras} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} interval={3} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip {...GLOBO} formatter={contando('Partos')} />
          <Bar dataKey="partos" fill={c.marca} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      {h.sinDato > 0 && (
        <p className="pie-tablero">
          Sin dato: <b>{h.sinDato} partos</b>
        </p>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// 7 · Prevalencias fenotípicas
// ---------------------------------------------------------------------------

function Prevalencias({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(prevalenciasFenotipicas(temporada), [temporada], 'las prevalencias');
  const m = useMemo(() => matrizCanelaLunar(estado.datos), [estado.datos]);
  const pigmentacion = useMemo(() => prevalenciaDe(estado.datos, 'pigmentacion'), [estado.datos]);
  const halo = useMemo(
    () => prevalenciaDe(estado.datos, 'halo_hair').find((b) => b.valor === '1'),
    [estado.datos],
  );
  const entropion = useMemo(
    () =>
      prevalenciaDe(estado.datos, 'entropion')
        .filter((b) => b.valor !== 'ninguno')
        .reduce((n, b) => n + b.corderos, 0),
    [estado.datos],
  );

  return (
    <Tarjeta
      titulo="Prevalencias fenotípicas"
      porque={`Sobre ${m.senalados} corderos señalados`}
      estado={estado}
      vacio={
        m.senalados === 0
          ? { titulo: 'Ninguno', detalle: 'Todavía no se señaló ningún cordero.' }
          : null
      }
    >
      {/* La matriz 2×2 va en HTML y no como gráfico: es la misma que se toca en
          el campo, y verla igual es lo que permite rastrear un número del
          tablero hasta el gesto que lo produjo. */}
      <div className="matriz-tablero">
        <span />
        <span className="enc">Vellón</span>
        <span className="enc">No vellón</span>
        <span className="rot">Canela</span>
        <div className="celda">
          <b>{m.canela.vellon.corderos}</b>
          {pct(m.canela.vellon.porcentaje)}
        </div>
        <div className="celda">
          <b>{m.canela.noVellon.corderos}</b>
          {pct(m.canela.noVellon.porcentaje)}
        </div>
        <span className="rot">Lunar</span>
        <div className="celda">
          <b>{m.lunar.vellon.corderos}</b>
          {pct(m.lunar.vellon.porcentaje)}
        </div>
        <div className="celda">
          <b>{m.lunar.noVellon.corderos}</b>
          {pct(m.lunar.noVellon.porcentaje)}
        </div>
      </div>

      <p className="etiqueta-tablero">Pigmentación</p>
      <div className="grafico">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pigmentacion} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip {...GLOBO} formatter={contando('Corderos')} />
          <Bar dataKey="corderos" fill={c.marca} radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
      </div>

      <p className="pie-tablero">
        Halo hair <b>{halo?.corderos ?? 0}</b> · entropión <b>{entropion}</b>
      </p>
    </Tarjeta>
  );
}
