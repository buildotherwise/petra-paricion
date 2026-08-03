import { useMemo, type ReactNode } from 'react';
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
  pesoAlNacer,
  prevalenciasFenotipicas,
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
  pendientesConAntiguedad,
  pesosPorSexoYTipo,
  prevalenciaDe,
  resumenAvance,
  serieAvance,
  tasasMortalidad,
} from '../../lib/tablero';

/**
 * Cómo viene la temporada, en siete tarjetas.
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
      <Avance temporada={temporada} c={c} />
      <Pendientes temporada={temporada} c={c} />
      <Tipos temporada={temporada} c={c} />
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

// ---------------------------------------------------------------------------
// 1 · Avance
// ---------------------------------------------------------------------------

function Avance({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(avanceParicion(temporada), [temporada], 'el avance');
  const serie = useMemo(() => serieAvance(estado.datos), [estado.datos]);
  const resumen = useMemo(() => resumenAvance(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      ancha
      titulo="Avance de la parición"
      porque="Partos por día, contra lo esperado según gestación 145–155"
      cifra={
        <>
          {pct(resumen.porcentaje)}{' '}
          <small>
            · {resumen.paridas} de {resumen.inseminadas}
          </small>
        </>
      }
      estado={estado}
      vacio={
        serie.length === 0
          ? { titulo: 'Sin datos todavía', detalle: 'Falta cargar los servicios de la temporada.' }
          : null
      }
    >
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={c.linea} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} minTickGap={44} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(v: unknown, n: unknown): [string, string] =>
              n === 'esperados'
                ? [coma(numeroDe(v)), 'Esperados']
                : [String(numeroDe(v)), 'Partos']
            }
            labelStyle={{ fontWeight: 800 }}
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
      {/* Sin servicios cargados hay curva real pero no hay contra qué compararla,
          y el porcentaje dice «0 de 0» — que sin esta línea se lee como si nadie
          hubiera parido. Es el estado del primer día: los partos entran antes de
          que alguien corra la importación. */}
      {resumen.inseminadas === 0 ? (
        <p className="pie-tablero">
          Faltan los servicios de la temporada, así que todavía no hay contra qué
          comparar. Se cargan con <b>scripts/importar-servicios.py</b>.
        </p>
      ) : (
        <div className="leyenda-tablero">
          <span>
            <i style={{ background: c.marca }} />
            Partos por día
          </span>
          <span>
            <i className="raya" style={{ borderTopColor: c.esperado }} />
            Esperados (gestación 145–155)
          </span>
        </div>
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
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={p.barras} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} minTickGap={28} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip formatter={contando('Sin señalar')} labelStyle={{ fontWeight: 800 }} />
          <Bar dataKey="pendientes" fill={c.marca} radius={[4, 4, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
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

function Tipos({ temporada, c }: { temporada: number; c: Colores }) {
  const estado = useConsultaOnline(tipoDeNacimiento(temporada), [temporada], 'el tipo de nacimiento');
  const d = useMemo(() => distribucionTipos(estado.datos), [estado.datos]);

  return (
    <Tarjeta
      titulo="Tipo de nacimiento"
      porque="Sin contar anulados"
      cifra={
        <>
          {pct(d.melliceria)} <small>· mellizos o más</small>
        </>
      }
      estado={estado}
      vacio={d.partos === 0 ? { titulo: 'Ninguno', detalle: 'Todavía no hay partos.' } : null}
    >
      <ResponsiveContainer width="100%" height={26 + d.barras.length * 30}>
        <BarChart data={d.barras} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={false} width={68} />
          <Tooltip formatter={contando('Partos')} labelStyle={{ fontWeight: 800 }} />
          <Bar dataKey="partos" fill={c.marca} radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
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

  const barras = [
    { etiqueta: 'Al nacer', corderos: m.alNacer },
    { etiqueta: 'Antes de señalar', corderos: m.antesDeSenalar },
    { etiqueta: 'Después', corderos: m.despuesDeSenalar },
  ];

  return (
    <Tarjeta
      titulo="Mortalidad"
      porque="Con fecha de muerte, nunca por estado"
      cifra={
        <span className="mala">
          {pct(m.tasaAlNacer)} <small>· al nacer</small>
        </span>
      }
      estado={estado}
      vacio={
        m.nacidos === 0
          ? { titulo: 'Ninguna', detalle: 'Sin nacimientos todavía, no hay qué contar.' }
          : null
      }
    >
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={false} width={104} />
          <Tooltip formatter={contando('Corderos')} labelStyle={{ fontWeight: 800 }} />
          <Bar dataKey="corderos" fill={c.error} radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
      <p className="pie-tablero">
        {pct(m.tasaAntesDeSenalar)} entre el nacimiento y la señalada, sobre {m.nacidosVivos} nacidos
        vivos
      </p>
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
      porque="Promedio de vivos con peso, en kg"
      estado={estado}
      vacio={
        barras.length === 0
          ? { titulo: 'Sin pesos', detalle: 'Todavía no se pesó ningún cordero vivo.' }
          : null
      }
    >
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={barras} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={c.linea} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} domain={[0, 'auto']} width={38} />
          <Tooltip
            formatter={(v: unknown, n: unknown): [string, string] => [
              `${coma(numeroDe(v), 2)} kg`,
              n === 'macho' ? 'Machos' : 'Hembras',
            ]}
            labelStyle={{ fontWeight: 800 }}
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
      porque="De las madres, al parto"
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
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={h.barras} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} interval={3} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip formatter={contando('Partos')} labelStyle={{ fontWeight: 800 }} />
          <Bar dataKey="partos" fill={c.marca} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
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
      <ResponsiveContainer width="100%" height={92}>
        <BarChart data={pigmentacion} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: c.linea }} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip formatter={contando('Corderos')} labelStyle={{ fontWeight: 800 }} />
          <Bar dataKey="corderos" fill={c.marca} radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>

      <p className="pie-tablero">
        Halo hair <b>{halo?.corderos ?? 0}</b> · entropión <b>{entropion}</b>
      </p>
    </Tarjeta>
  );
}
