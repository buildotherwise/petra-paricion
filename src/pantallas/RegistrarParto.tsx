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
  collarDisponible,
  corderosQueRequierenCollar,
  hoyISO,
  tipoNacimiento,
  validarFechaNacimiento,
  validarPeso,
  type CorderoDelParto,
  type MarcaCollar,
} from '../lib/reglas';

type Paso = 'madre' | 'datos' | 'corderos' | 'cordero' | 'resumen';

interface BorradorCordero extends CorderoDelParto {
  sexo: 'macho' | 'hembra';
  peso_kg: number | null;
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
  const [fecha, setFecha] = useState(hoyISO());
  const [condicion, setCondicion] = useState<number | null>(null);
  const [corderos, setCorderos] = useState<BorradorCordero[]>([]);
  const [editando, setEditando] = useState<BorradorCordero | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collares ya asignados a corderos vivos de la temporada (R3). Sale de la
  // réplica local, así que la validación funciona sin señal.
  const { data: collaresEnUso } = useQuery<{
    collar_numero: string;
    collar_marca: MarcaCollar;
  }>(
    `SELECT collar_numero, collar_marca FROM corderos
      WHERE temporada = ? AND estado = 'nacido' AND collar_numero IS NOT NULL`,
    [entorno.temporada],
  );

  const faltanCollar = useMemo(() => corderosQueRequierenCollar(corderos), [corderos]);

  function guardarCordero(cordero: BorradorCordero) {
    setCorderos((previos) => {
      const existe = previos.some((c) => c.id === cordero.id);
      return existe
        ? previos.map((c) => (c.id === cordero.id ? cordero : c))
        : [...previos, cordero];
    });
    setEditando(null);
    setPaso('corderos');
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
             (id, oveja_id, fecha, condicion_corporal, observaciones,
              creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          [partoId, oveja.id, fecha, condicion, ahora, usuarioId, ahora, usuarioId, aparato],
        );

        for (const cordero of corderos) {
          await tx.execute(
            `INSERT INTO corderos
               (id, parto_id, temporada, estado, sexo, condicion, peso_kg,
                collar_numero, collar_marca, madre_tipo, sexo_discrepancia,
                creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'biologica', 0, ?, ?, ?, ?, ?)`,
            [
              cordero.id,
              partoId,
              entorno.temporada,
              // R5: un cordero muerto al nacer no pasa por señalada.
              cordero.condicion === 'muerto' ? 'muerto' : 'nacido',
              cordero.sexo,
              cordero.condicion,
              cordero.peso_kg,
              cordero.collar_numero,
              cordero.collar_marca,
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
            faltanCollar={faltanCollar}
            onAgregar={() => {
              setEditando(null);
              setPaso('cordero');
            }}
            onEditar={(cordero) => {
              setEditando(cordero);
              setPaso('cordero');
            }}
            onQuitar={(id) => setCorderos((previos) => previos.filter((c) => c.id !== id))}
            onSiguiente={() => setPaso('resumen')}
          />
        )}

        {paso === 'cordero' && (
          <FormularioCordero
            inicial={editando}
            esMultiple={corderos.length >= 1 || editando !== null}
            collaresEnUso={[
              ...collaresEnUso,
              ...corderos
                .filter((c) => c.id !== editando?.id && c.collar_numero !== null)
                .map((c) => ({ collar_numero: c.collar_numero, collar_marca: c.collar_marca })),
            ]}
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
            faltanCollar={faltanCollar}
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
        <div className="tarjeta">
          <p style={{ margin: '0 0 var(--sp-3)' }}>
            Ninguna caravana de la temporada tiene <strong>{consulta}</strong>.
          </p>
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => setAltaManual(true)}
          >
            No está en la lista
          </button>
        </div>
      )}
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
  const validacionFecha = validarFechaNacimiento(fecha, hoyISO());

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
        <input
          id="fecha"
          className="entrada"
          type="date"
          value={fecha}
          max={hoyISO()}
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
  faltanCollar,
  onAgregar,
  onEditar,
  onQuitar,
  onSiguiente,
}: {
  corderos: BorradorCordero[];
  faltanCollar: CorderoDelParto[];
  onAgregar: () => void;
  onEditar: (cordero: BorradorCordero) => void;
  onQuitar: (id: string) => void;
  onSiguiente: () => void;
}) {
  const tipo = tipoNacimiento(corderos);

  return (
    <>
      <h1 className="titulo">Corderos</h1>
      <p className="subtitulo">
        {tipo === 0
          ? 'Todavía no agregaste ninguno.'
          : // R1: el tipo de nacimiento se cuenta, nunca se tipea.
            `${NOMBRE_TIPO[tipo] ?? `${tipo} corderos`} · se calcula solo`}
      </p>

      {faltanCollar.length > 0 && (
        <p className="aviso aviso--atencion">
          En partos múltiples cada cordero vivo lleva collar para distinguirlo hasta la
          señalada. {faltanCollar.length === 1 ? 'Falta uno.' : `Faltan ${faltanCollar.length}.`}
        </p>
      )}

      {corderos.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 'var(--sp-4)' }}>
          {corderos.map((cordero) => (
            <FilaCordero
              key={cordero.id}
              cordero={cordero}
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
          disabled={corderos.length === 0 || faltanCollar.length > 0}
        >
          Revisar y guardar
        </button>
      </div>
    </>
  );
}

function FilaCordero({
  cordero,
  onEditar,
  onQuitar,
}: {
  cordero: BorradorCordero;
  /** Sin handler la fila es solo lectura: en el resumen no se edita. */
  onEditar?: (() => void) | undefined;
  onQuitar?: (() => void) | undefined;
}) {
  const peso =
    cordero.peso_kg !== null ? `${cordero.peso_kg.toFixed(2).replace('.', ',')} kg` : 'sin pesar';

  return (
    <div className="cordero-fila">
      {cordero.collar_marca !== null && <DibujoMarca marca={cordero.collar_marca} tamano={0.62} />}
      <div className="cordero-datos">
        <strong>
          {cordero.sexo === 'macho' ? 'Macho' : 'Hembra'} · {peso}
        </strong>
        <small>
          {cordero.condicion === 'muerto' ? 'Muerto al nacer' : null}
          {cordero.condicion === 'muerto' && cordero.collar_numero !== null ? ' · ' : null}
          {cordero.collar_numero !== null ? `Collar ${cordero.collar_numero}` : null}
          {cordero.condicion === 'vivo' && cordero.collar_numero === null ? 'Sin collar' : null}
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

function FormularioCordero({
  inicial,
  esMultiple,
  collaresEnUso,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorCordero | null;
  esMultiple: boolean;
  collaresEnUso: { collar_numero: string | null; collar_marca: MarcaCollar | null }[];
  onGuardar: (cordero: BorradorCordero) => void;
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
  const [collarNumero, setCollarNumero] = useState(inicial?.collar_numero ?? '');
  const [collarMarca, setCollarMarca] = useState<MarcaCollar | null>(inicial?.collar_marca ?? null);

  const pesoNumero = peso.trim() === '' ? null : Number(peso.replace(',', '.'));
  const validacionPeso = validarPeso(pesoNumero);

  const collarLibre =
    collarNumero.trim() === '' || collarMarca === null
      ? true
      : collarDisponible(collarNumero, collarMarca, collaresEnUso);

  // El collar solo se pide en partos múltiples y solo para corderos vivos (R2).
  const pideCollar = esMultiple && condicion === 'vivo';
  const puedeGuardar = sexo !== null && validacionPeso.estado !== 'bloqueo' && collarLibre;

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
          onChange={(e) => setPeso(e.target.value)}
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

      {pideCollar && (
        <>
          <div className="campo">
            <label className="etiqueta" htmlFor="collar">
              Número de collar
            </label>
            <input
              id="collar"
              className="entrada entrada--cifra"
              inputMode="numeric"
              placeholder="00"
              value={collarNumero}
              onChange={(e) => setCollarNumero(e.target.value)}
            />
          </div>

          <div className="campo">
            <span className="etiqueta">Marca del collar</span>
            <SelectorMarcaCollar valor={collarMarca} onChange={setCollarMarca} />
            {!collarLibre && (
              <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
                Ese collar ya está puesto en otro cordero sin señalar. Elegí otro número o marca.
              </p>
            )}
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
            onGuardar({
              id: inicial?.id ?? crypto.randomUUID(),
              sexo,
              condicion,
              peso_kg: pesoNumero,
              collar_numero: pideCollar && collarNumero.trim() !== '' ? collarNumero.trim() : null,
              collar_marca: pideCollar && collarNumero.trim() !== '' ? collarMarca : null,
            });
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
  faltanCollar,
  guardando,
  onGuardar,
}: {
  oveja: OvejaElegida;
  fecha: string;
  condicion: number | null;
  corderos: BorradorCordero[];
  faltanCollar: CorderoDelParto[];
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
          <FilaCordero key={cordero.id} cordero={cordero} />
        ))}
      </div>

      <div className="rizo" aria-hidden="true" style={{ marginTop: 'var(--sp-5)' } as CSSProperties} />

      <div className="barra-accion">
        <button
          type="button"
          className="boton boton--principal"
          onClick={onGuardar}
          disabled={guardando || faltanCollar.length > 0}
        >
          {guardando ? 'Guardando…' : 'Guardar parto'}
        </button>
      </div>
    </>
  );
}
