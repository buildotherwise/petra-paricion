import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { DibujoMarca, SelectorMarcaCollar } from '../componentes/MarcaCollar';
import {
  SelectorCondicionCorporal,
  formatearCondicion,
} from '../componentes/SelectorCondicionCorporal';
import { db } from '../lib/powersync/db';
import { dispositivo, entorno } from '../lib/entorno';
import { useUsuarioId } from '../lib/sesion';
import { buscarCaravana, partirCoincidencia } from '../lib/busqueda';
import {
  ajustarCollarDelParto,
  CAUSAS_MUERTE,
  collarDisponible,
  corderosQueRequierenMarca,
  hoyISO,
  marcasOcupadas,
  maximoElegible,
  partoRequiereCollar,
  rangoTemporada,
  tipoNacimiento,
  validarFechaMuerte,
  validarFechaNacimiento,
  validarPeso,
  type CausaMuerte,
  type CorderoDelParto,
  type MarcaCollar,
} from '../lib/reglas';

type Paso = 'madre' | 'datos' | 'corderos' | 'cordero' | 'resumen';

interface BorradorCordero extends CorderoDelParto {
  sexo: 'macho' | 'hembra';
  peso_kg: number | null;
  causa_muerte: CausaMuerte | null;
  fecha_muerte: string | null;
}

interface OvejaElegida {
  id: string;
  caravana: string;
}

const PASOS: Paso[] = ['madre', 'datos', 'corderos', 'resumen'];
const NOMBRE_TIPO: Record<number, string> = { 1: 'Único', 2: 'Mellizos', 3: 'Trillizos' };

export function RegistrarParto({ onSalir }: { onSalir: () => void }) {
  const usuarioId = useUsuarioId();
  const [paso, setPaso] = useState<Paso>('madre');
  const [oveja, setOveja] = useState<OvejaElegida | null>(null);
  // Hoy, salvo que la temporada ya haya cerrado: ahí arranca en su último día,
  // para que la carga tardía siga siendo posible sin pelear con el campo.
  const [fecha, setFecha] = useState(() => maximoElegible(hoyISO(), entorno.temporada));
  const [condicion, setCondicion] = useState<number | null>(null);
  const [corderos, setCorderos] = useState<BorradorCordero[]>([]);
  // El número es del parto: uno solo para todos los hermanos y para la madre.
  const [collarNumero, setCollarNumero] = useState<string | null>(null);
  const [editando, setEditando] = useState<BorradorCordero | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Números de collar tomados por partos que todavía tienen corderos sin
  // señalar (R3). Sale de la réplica local: la validación funciona sin señal.
  const { data: collaresEnUso } = useQuery<{ collar_numero: string }>(
    `SELECT DISTINCT p.collar_numero
       FROM partos p
       JOIN corderos c ON c.parto_id = p.id
      WHERE p.collar_numero IS NOT NULL
        AND c.temporada = ? AND c.estado = 'nacido'`,
    [entorno.temporada],
  );

  const faltanMarca = useMemo(() => corderosQueRequierenMarca(corderos), [corderos]);
  const faltaNumero = partoRequiereCollar(corderos) && collarNumero === null;

  function guardarCordero(cordero: BorradorCordero, numero: string | null) {
    setCorderos((previos) => {
      const existe = previos.some((c) => c.id === cordero.id);
      return existe
        ? previos.map((c) => (c.id === cordero.id ? cordero : c))
        : [...previos, cordero];
    });
    if (numero !== null) setCollarNumero(numero);
    setEditando(null);
    setPaso('corderos');
  }

  /**
   * Al quitar un cordero el parto puede volver a ser único, y entonces el
   * collar tiene que soltarse: si no, ese número quedaría tomado para el resto
   * de la temporada sin que ningún animal lo lleve puesto.
   */
  function quitarCordero(id: string) {
    setCorderos((previos) => {
      const ajustado = ajustarCollarDelParto(
        previos.filter((c) => c.id !== id),
        collarNumero,
      );
      setCollarNumero(ajustado.collarNumero);
      return ajustado.corderos;
    });
  }

  async function guardarParto() {
    if (oveja === null) return;
    setGuardando(true);
    setError(null);

    const ahora = new Date().toISOString();
    const aparato = dispositivo();
    const partoId = crypto.randomUUID();

    try {
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO partos
             (id, oveja_id, fecha, condicion_corporal, collar_numero, observaciones,
              creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          [
            partoId, oveja.id, fecha, condicion, collarNumero,
            ahora, usuarioId, ahora, usuarioId, aparato,
          ],
        );

        for (const cordero of corderos) {
          await tx.execute(
            `INSERT INTO corderos
               (id, parto_id, temporada, estado, sexo, condicion, peso_kg,
                collar_marca, causa_muerte, fecha_muerte,
                madre_tipo, sexo_discrepancia,
                creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'biologica', 0, ?, ?, ?, ?, ?)`,
            [
              cordero.id,
              partoId,
              entorno.temporada,
              // R5: un cordero muerto al nacer no pasa por señalada.
              cordero.condicion === 'muerto' ? 'muerto' : 'nacido',
              cordero.sexo,
              cordero.condicion,
              cordero.peso_kg,
              cordero.collar_marca,
              cordero.causa_muerte,
              cordero.fecha_muerte,
              ahora,
              usuarioId,
              ahora,
              usuarioId,
              aparato,
            ],
          );
        }
      });

      onSalir();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el parto.');
      setGuardando(false);
    }
  }

  const indicePaso = PASOS.indexOf(paso === 'cordero' ? 'corderos' : paso);

  return (
    <div className="app">
      <Encabezado
        atras={() => {
          if (paso === 'madre') onSalir();
          else if (paso === 'cordero') setPaso('corderos');
          else setPaso(PASOS[Math.max(0, indicePaso - 1)] ?? 'madre');
        }}
      />

      <main className="contenido area-segura">
        <div className="progreso" aria-hidden="true">
          {PASOS.map((_, i) => (
            <i key={i} data-activo={i <= indicePaso} />
          ))}
        </div>

        {error !== null && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}

        {paso === 'madre' && (
          <PasoMadre
            onElegir={(elegida) => {
              setOveja(elegida);
              setPaso('datos');
            }}
          />
        )}

        {paso === 'datos' && oveja !== null && (
          <PasoDatos
            oveja={oveja}
            fecha={fecha}
            condicion={condicion}
            onFecha={setFecha}
            onCondicion={setCondicion}
            onSiguiente={() => setPaso('corderos')}
          />
        )}

        {paso === 'corderos' && (
          <PasoCorderos
            corderos={corderos}
            collarNumero={collarNumero}
            faltanMarca={faltanMarca}
            faltaNumero={faltaNumero}
            onAgregar={() => {
              setEditando(null);
              setPaso('cordero');
            }}
            onEditar={(cordero) => {
              setEditando(cordero);
              setPaso('cordero');
            }}
            onQuitar={quitarCordero}
            onSiguiente={() => setPaso('resumen')}
          />
        )}

        {paso === 'cordero' && (
          <FormularioCordero
            inicial={editando}
            esMultiple={corderos.length >= 1 || editando !== null}
            fechaParto={fecha}
            collarNumero={collarNumero}
            numerosEnUso={collaresEnUso.map((c) => c.collar_numero)}
            ocupadas={marcasOcupadas(corderos, editando?.id)}
            onGuardar={guardarCordero}
            onCancelar={() => setPaso('corderos')}
          />
        )}

        {paso === 'resumen' && oveja !== null && (
          <PasoResumen
            oveja={oveja}
            fecha={fecha}
            condicion={condicion}
            corderos={corderos}
            collarNumero={collarNumero}
            bloqueado={faltanMarca.length > 0 || faltaNumero}
            guardando={guardando}
            onGuardar={guardarParto}
          />
        )}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Paso 1 — La madre
// ───────────────────────────────────────────────────────────────────────

function PasoMadre({ onElegir }: { onElegir: (oveja: OvejaElegida) => void }) {
  const [consulta, setConsulta] = useState('');
  const [altaManual, setAltaManual] = useState(false);

  // Se traen las ~500 madres de la temporada y se filtra en memoria. El costo
  // es despreciable y a cambio la búsqueda puede llegar a las caravanas
  // alfanuméricas (ver src/lib/busqueda.ts), cosa que un LIKE no logra.
  const { data: ovejas } = useQuery<{
    id: string;
    caravana: string;
    parto_id: string | null;
  }>(
    `SELECT o.id, o.caravana, p.id AS parto_id
       FROM ovejas o
       LEFT JOIN partos p ON p.oveja_id = o.id
      WHERE o.temporada = ?`,
    [entorno.temporada],
  );

  const resultados = useMemo(
    () => buscarCaravana(ovejas, consulta).slice(0, 12),
    [ovejas, consulta],
  );

  if (altaManual) {
    return (
      <AltaManual
        inicial={consulta}
        onCancelar={() => setAltaManual(false)}
        onCreada={onElegir}
      />
    );
  }

  return (
    <>
      <h1 className="titulo">¿Qué oveja parió?</h1>
      <p className="subtitulo">Escribí los números de la caravana.</p>

      <div className="campo">
        <input
          className="entrada entrada--cifra"
          inputMode="numeric"
          autoFocus
          placeholder="0000"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Número de caravana"
        />
      </div>

      {resultados.length > 0 && (
        <ul className="lista">
          {resultados.map((fila) => {
            const [antes, coincide, despues] = partirCoincidencia(fila.caravana, consulta);
            return (
              <li key={fila.id}>
                <button
                  type="button"
                  onClick={() => onElegir({ id: fila.id, caravana: fila.caravana })}
                >
                  <span className="numero">
                    {antes}
                    <mark>{coincide}</mark>
                    {despues}
                  </span>
                  {fila.parto_id !== null && <span className="nota nota--alerta">Ya tiene parto</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {consulta.trim() !== '' && resultados.length === 0 && (
        <p className="aviso aviso--atencion">
          Ninguna caravana de la temporada tiene <strong>{consulta}</strong>.
        </p>
      )}

      {/* Siempre visible, no solo cuando la búsqueda no encuentra nada.
          Con teclado numérico, si existe "PI 138" no hay forma de llegar a
          cargar "138 V": el buscador siempre devuelve algo y el botón nunca
          aparecería. Va al pie y no arriba porque en 500 partos el 99% son
          ovejas que sí están en la lista — tiene que estar disponible, no
          cómodo. */}
      <button type="button" className="alta-manual" onClick={() => setAltaManual(true)}>
        + No está en la lista
      </button>
    </>
  );
}

/**
 * Alta manual de una madre que no está en la lista (R9).
 *
 * Acá el teclado es común, no numérico: hay caravanas como 'PI 136' o
 * 'T. 319 V' y con un teclado de números serían imposibles de escribir.
 */
function AltaManual({
  inicial,
  onCancelar,
  onCreada,
}: {
  inicial: string;
  onCancelar: () => void;
  onCreada: (oveja: OvejaElegida) => void;
}) {
  const usuarioId = useUsuarioId();
  const [caravana, setCaravana] = useState(inicial);
  const [creando, setCreando] = useState(false);

  async function crear() {
    const limpia = caravana.trim();
    if (limpia === '') return;
    setCreando(true);

    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();

    await db.execute(
      `INSERT INTO ovejas
         (id, temporada, caravana, precargada, creado_en, actualizado_en, actualizado_por, dispositivo)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      [id, entorno.temporada, limpia, ahora, ahora, usuarioId, dispositivo()],
    );

    onCreada({ id, caravana: limpia });
  }

  return (
    <>
      <h1 className="titulo">Agregar una madre</h1>
      <p className="subtitulo">Escribila tal cual figura en la caravana.</p>

      <div className="campo">
        <label className="etiqueta" htmlFor="caravana-nueva">
          Caravana
        </label>
        <input
          id="caravana-nueva"
          className="entrada entrada--cifra"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          placeholder="PI 136"
          value={caravana}
          onChange={(e) => setCaravana(e.target.value)}
        />
      </div>

      <p className="aviso aviso--atencion">
        Queda marcada para revisar la caravana desde la web antes de cerrar la temporada.
      </p>

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal"
          onClick={crear}
          disabled={creando || caravana.trim() === ''}
        >
          Agregar
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Paso 2 — Fecha y condición corporal
// ───────────────────────────────────────────────────────────────────────

function PasoDatos({
  oveja,
  fecha,
  condicion,
  onFecha,
  onCondicion,
  onSiguiente,
}: {
  oveja: OvejaElegida;
  fecha: string;
  condicion: number | null;
  onFecha: (fecha: string) => void;
  onCondicion: (valor: number) => void;
  onSiguiente: () => void;
}) {
  const hoy = hoyISO();
  const validacionFecha = validarFechaNacimiento(fecha, hoy, entorno.temporada);
  const { desde } = rangoTemporada(entorno.temporada);

  return (
    <>
      <h1 className="titulo">Datos del parto</h1>
      <p className="subtitulo">
        Madre <Caravana numero={oveja.caravana} />
      </p>

      <div className="campo">
        <label className="etiqueta" htmlFor="fecha">
          Fecha del parto
        </label>
        {/* min y max acotan el selector del teléfono a la ventana de parición,
            así el operador no llega ni a ver una fecha inválida. La validación
            igual corre: el atributo se puede saltear. */}
        <input
          id="fecha"
          className="entrada"
          type="date"
          value={fecha}
          min={desde}
          max={maximoElegible(hoy, entorno.temporada)}
          onChange={(e) => onFecha(e.target.value)}
        />
        {!validacionFecha.valida && (
          <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)' }}>
            {validacionFecha.motivo}
          </p>
        )}
      </div>

      <div className="campo">
        <span className="etiqueta">
          Condición corporal de la madre
          {condicion !== null && ` · ${formatearCondicion(condicion)}`}
        </span>
        <SelectorCondicionCorporal valor={condicion} onChange={onCondicion} />
      </div>

      <div className="barra-accion">
        <button
          type="button"
          className="boton boton--principal"
          onClick={onSiguiente}
          disabled={!validacionFecha.valida || condicion === null}
        >
          Seguir con los corderos
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Paso 3 — Los corderos
// ───────────────────────────────────────────────────────────────────────

function PasoCorderos({
  corderos,
  collarNumero,
  faltanMarca,
  faltaNumero,
  onAgregar,
  onEditar,
  onQuitar,
  onSiguiente,
}: {
  corderos: BorradorCordero[];
  collarNumero: string | null;
  faltanMarca: CorderoDelParto[];
  faltaNumero: boolean;
  onAgregar: () => void;
  onEditar: (cordero: BorradorCordero) => void;
  onQuitar: (id: string) => void;
  onSiguiente: () => void;
}) {
  const tipo = tipoNacimiento(corderos);
  const incompleto = faltanMarca.length > 0 || faltaNumero;

  return (
    <>
      <h1 className="titulo">Corderos</h1>
      <p className="subtitulo">
        {tipo === 0
          ? 'Todavía no agregaste ninguno.'
          : // R1: el tipo de nacimiento se cuenta, nunca se tipea.
            `${NOMBRE_TIPO[tipo] ?? `${tipo} corderos`} · se calcula solo`}
      </p>

      {incompleto && (
        <p className="aviso aviso--atencion">
          {faltaNumero
            ? 'Falta el número de collar del parto.'
            : `Falta la marca de ${faltanMarca.length === 1 ? 'un cordero' : `${faltanMarca.length} corderos`}.`}
        </p>
      )}

      {corderos.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 'var(--sp-4)' }}>
          {corderos.map((cordero) => (
            <FilaCordero
              key={cordero.id}
              cordero={cordero}
              collarNumero={collarNumero}
              onEditar={() => onEditar(cordero)}
              onQuitar={() => onQuitar(cordero.id)}
            />
          ))}
        </div>
      )}

      <button type="button" className="boton boton--secundario" onClick={onAgregar}>
        + Agregar cordero
      </button>

      <div className="barra-accion">
        <button
          type="button"
          className="boton boton--principal"
          onClick={onSiguiente}
          disabled={corderos.length === 0 || incompleto}
        >
          Revisar y guardar
        </button>
      </div>
    </>
  );
}

function FilaCordero({
  cordero,
  collarNumero,
  onEditar,
  onQuitar,
}: {
  cordero: BorradorCordero;
  collarNumero: string | null;
  /** Sin handler la fila es solo lectura: en el resumen no se edita. */
  onEditar?: (() => void) | undefined;
  onQuitar?: (() => void) | undefined;
}) {
  const peso =
    cordero.peso_kg !== null ? `${cordero.peso_kg.toFixed(2).replace('.', ',')} kg` : 'sin pesar';
  const causa =
    cordero.causa_muerte !== null
      ? (CAUSAS_MUERTE.find((c) => c.valor === cordero.causa_muerte)?.etiqueta ?? null)
      : null;

  return (
    <div className="cordero-fila">
      {cordero.collar_marca !== null && <DibujoMarca marca={cordero.collar_marca} tamano={0.62} />}
      <div className="cordero-datos">
        <strong>
          {cordero.sexo === 'macho' ? 'Macho' : 'Hembra'} · {peso}
        </strong>
        <small>
          {cordero.condicion === 'muerto'
            ? `Muerto · ${causa ?? 'sin causa'}`
            : collarNumero !== null
              ? `Collar ${collarNumero}`
              : 'Vivo'}
        </small>
      </div>
      {onEditar !== undefined && (
        <button type="button" className="boton--texto" onClick={onEditar}>
          Editar
        </button>
      )}
      {onQuitar !== undefined && (
        <button type="button" className="boton--texto boton--peligro" onClick={onQuitar}>
          Quitar
        </button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Formulario de un cordero
// ───────────────────────────────────────────────────────────────────────

/** Recorta lo tipeado a dos decimales, en vez de avisar después. */
function limitarDecimales(texto: string): string {
  const limpio = texto.replace(/[^0-9.,]/g, '');
  const partes = limpio.replace('.', ',').split(',');
  if (partes.length < 2) return limpio;
  return `${partes[0]},${(partes[1] ?? '').slice(0, 2)}`;
}

function FormularioCordero({
  inicial,
  esMultiple,
  fechaParto,
  collarNumero,
  numerosEnUso,
  ocupadas,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorCordero | null;
  esMultiple: boolean;
  fechaParto: string;
  /** Número ya asignado al parto. Si es null y el parto es múltiple, se pide. */
  collarNumero: string | null;
  numerosEnUso: readonly string[];
  ocupadas: readonly MarcaCollar[];
  onGuardar: (cordero: BorradorCordero, numero: string | null) => void;
  onCancelar: () => void;
}) {
  const [sexo, setSexo] = useState<'macho' | 'hembra' | null>(inicial?.sexo ?? null);
  const [condicion, setCondicion] = useState<'vivo' | 'muerto'>(inicial?.condicion ?? 'vivo');
  // Con coma, como se escribe y se lee en Uruguay.
  const [peso, setPeso] = useState(
    inicial?.peso_kg !== null && inicial?.peso_kg !== undefined
      ? inicial.peso_kg.toFixed(2).replace('.', ',')
      : '',
  );
  const [numero, setNumero] = useState(collarNumero ?? '');
  const [marca, setMarca] = useState<MarcaCollar | null>(inicial?.collar_marca ?? null);
  const [causa, setCausa] = useState<CausaMuerte | ''>(inicial?.causa_muerte ?? '');
  const [fechaMuerte, setFechaMuerte] = useState(inicial?.fecha_muerte ?? fechaParto);

  const pesoNumero = peso.trim() === '' ? null : Number(peso.replace(',', '.'));
  const validacionPeso = validarPeso(pesoNumero);

  // El número solo se pide una vez por parto: si ya está, se muestra fijo.
  const pideNumero = esMultiple && collarNumero === null;
  const numeroLibre =
    !pideNumero || numero.trim() === '' ? true : collarDisponible(numero, numerosEnUso);

  const validacionMuerte =
    condicion === 'muerto'
      ? validarFechaMuerte(fechaMuerte, fechaParto, hoyISO())
      : ({ valida: true } as const);

  const puedeGuardar =
    sexo !== null &&
    validacionPeso.estado !== 'bloqueo' &&
    // R2: en parto múltiple no se confirma un cordero sin collar Y marca.
    (!esMultiple || (marca !== null && (collarNumero !== null || numero.trim() !== ''))) &&
    numeroLibre &&
    (condicion === 'vivo' || (causa !== '' && validacionMuerte.valida));

  return (
    <>
      <h1 className="titulo">{inicial === null ? 'Nuevo cordero' : 'Editar cordero'}</h1>
      <p className="subtitulo">{esMultiple ? 'Parto múltiple' : 'Primer cordero del parto'}</p>

      <div className="campo">
        <span className="etiqueta">Sexo</span>
        <div className="opciones">
          <button
            type="button"
            className="opcion"
            aria-pressed={sexo === 'macho'}
            onClick={() => setSexo('macho')}
          >
            Macho
          </button>
          <button
            type="button"
            className="opcion"
            aria-pressed={sexo === 'hembra'}
            onClick={() => setSexo('hembra')}
          >
            Hembra
          </button>
        </div>
      </div>

      <div className="campo">
        <span className="etiqueta">Al nacer</span>
        <div className="opciones">
          <button
            type="button"
            className="opcion"
            aria-pressed={condicion === 'vivo'}
            onClick={() => setCondicion('vivo')}
          >
            Vivo
          </button>
          <button
            type="button"
            className="opcion"
            aria-pressed={condicion === 'muerto'}
            onClick={() => setCondicion('muerto')}
          >
            Muerto
          </button>
        </div>
      </div>

      {condicion === 'muerto' && (
        <>
          <div className="campo">
            <label className="etiqueta" htmlFor="causa">
              Motivo de muerte
            </label>
            <select
              id="causa"
              className="desplegable"
              value={causa}
              onChange={(e) => setCausa(e.target.value as CausaMuerte | '')}
            >
              <option value="">Elegir…</option>
              {CAUSAS_MUERTE.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="etiqueta" htmlFor="fecha-muerte">
              Fecha de muerte
            </label>
            <input
              id="fecha-muerte"
              className="entrada"
              type="date"
              value={fechaMuerte}
              min={fechaParto}
              max={hoyISO()}
              onChange={(e) => setFechaMuerte(e.target.value)}
            />
            {!validacionMuerte.valida && (
              <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
                {validacionMuerte.motivo}
              </p>
            )}
          </div>
        </>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="peso">
          Peso en kg {condicion === 'muerto' && '· opcional'}
        </label>
        <input
          id="peso"
          className="entrada entrada--cifra"
          inputMode="decimal"
          placeholder="0,00"
          value={peso}
          onChange={(e) => setPeso(limitarDecimales(e.target.value))}
        />
        {validacionPeso.estado !== 'ok' && (
          <p
            className={
              validacionPeso.estado === 'bloqueo' ? 'aviso aviso--error' : 'aviso aviso--atencion'
            }
            style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}
          >
            {validacionPeso.mensaje}
          </p>
        )}
      </div>

      {esMultiple && (
        <>
          <div className="campo">
            <span className="etiqueta">Collar del parto</span>
            {pideNumero ? (
              <>
                <input
                  className="entrada entrada--cifra"
                  inputMode="numeric"
                  placeholder="00"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  aria-label="Número de collar del parto"
                />
                <p
                  style={{
                    margin: 'var(--sp-2) 0 0',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--tinta-suave)',
                  }}
                >
                  Va en todos los corderos del parto y también en la madre.
                </p>
                {!numeroLibre && (
                  <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
                    Ese collar ya está en otro parto sin señalar. Elegí otro número.
                  </p>
                )}
              </>
            ) : (
              <div className="collar-asignado">
                <b>{collarNumero}</b>
                <small>
                  Ya asignado al parto.
                  <br />
                  Solo falta la marca de este cordero.
                </small>
              </div>
            )}
          </div>

          <div className="campo">
            <span className="etiqueta">Marca de este cordero</span>
            <SelectorMarcaCollar valor={marca} ocupadas={ocupadas} onChange={setMarca} />
          </div>
        </>
      )}

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal"
          disabled={!puedeGuardar}
          onClick={() => {
            if (sexo === null) return;
            onGuardar(
              {
                id: inicial?.id ?? crypto.randomUUID(),
                sexo,
                condicion,
                peso_kg: pesoNumero,
                collar_marca: esMultiple ? marca : null,
                causa_muerte: condicion === 'muerto' && causa !== '' ? causa : null,
                fecha_muerte: condicion === 'muerto' ? fechaMuerte : null,
              },
              pideNumero && numero.trim() !== '' ? numero.trim() : null,
            );
          }}
        >
          Listo
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Paso 4 — Resumen
// ───────────────────────────────────────────────────────────────────────

function PasoResumen({
  oveja,
  fecha,
  condicion,
  corderos,
  collarNumero,
  bloqueado,
  guardando,
  onGuardar,
}: {
  oveja: OvejaElegida;
  fecha: string;
  condicion: number | null;
  corderos: BorradorCordero[];
  collarNumero: string | null;
  bloqueado: boolean;
  guardando: boolean;
  onGuardar: () => void;
}) {
  const tipo = tipoNacimiento(corderos);
  const vivos = corderos.filter((c) => c.condicion === 'vivo').length;

  return (
    <>
      <h1 className="titulo">{NOMBRE_TIPO[tipo] ?? `${tipo} corderos`}</h1>
      <p className="subtitulo">
        Madre <Caravana numero={oveja.caravana} /> · {vivos} vivo{vivos === 1 ? '' : 's'} ·{' '}
        {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-UY')}
        {condicion !== null && ` · condición ${formatearCondicion(condicion)}`}
      </p>

      <div className="tarjeta">
        {corderos.map((cordero) => (
          <FilaCordero key={cordero.id} cordero={cordero} collarNumero={collarNumero} />
        ))}
      </div>

      {/* El collar es del parto, así que la madre también lo lleva. No es un
          recordatorio opcional: es parte del dato que se está guardando. */}
      {collarNumero !== null && (
        <div className="collar-asignado" style={{ marginTop: 'var(--sp-4)' }}>
          <b>{collarNumero}</b>
          <small>
            Va en los {tipo} corderos y también en la madre,
            <br />
            sin marca.
          </small>
        </div>
      )}

      <div className="rizo" aria-hidden="true" style={{ marginTop: 'var(--sp-5)' } as CSSProperties} />

      <div className="barra-accion">
        <button
          type="button"
          className="boton boton--principal"
          onClick={onGuardar}
          disabled={guardando || bloqueado}
        >
          {guardando ? 'Guardando…' : 'Guardar parto'}
        </button>
      </div>
    </>
  );
}
