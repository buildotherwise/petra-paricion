import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import {
  SelectorCondicionCorporal,
  formatearCondicion,
} from '../componentes/SelectorCondicionCorporal';
import { db } from '../lib/powersync/db';
import { dispositivo, entorno } from '../lib/entorno';
import { useUsuarioId } from '../lib/sesion';
import { BuscadorCaravana, type OvejaElegida } from '../componentes/BuscadorCaravana';
import { FormularioCordero, type BorradorCordero } from '../componentes/FormularioCordero';
import { causaLegible, FilaCordero } from '../componentes/FilaCordero';
import {
  ajustarCollarDelParto,
  corderosQueRequierenMarca,
  hoyISO,
  marcasOcupadas,
  maximoElegible,
  partoRequiereCollar,
  rangoTemporada,
  tipoNacimiento,
  validarFechaNacimiento,
  type CorderoDelParto,
} from '../lib/reglas';
import { nombreTipo } from '../lib/parto';

type Paso = 'madre' | 'datos' | 'corderos' | 'cordero' | 'resumen';

const PASOS: Paso[] = ['madre', 'datos', 'corderos', 'resumen'];

export function RegistrarParto({
  onSalir,
  onGuardado,
  onAbrirParto,
}: {
  onSalir: () => void;
  onGuardado: () => void;
  onAbrirParto: (partoId: string) => void;
}) {
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

  // R3: todo número usado en la temporada queda tomado, sin importar en qué
  // estado estén los corderos de ese parto. El collar es un objeto que sigue
  // puesto en la oveja hasta que alguien va y lo saca. Sale de la réplica
  // local: la validación funciona sin señal.
  const { data: collaresUsados } = useQuery<{ collar_numero: string }>(
    `SELECT DISTINCT p.collar_numero
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.collar_numero IS NOT NULL AND o.temporada = ?`,
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
          // collar_puesto va explícito en 1 en vez de confiar en el default de
          // Postgres: la columna es NOT NULL, y depender de que la operación
          // llegue sin ella haría que un cambio en cómo PowerSync arma la
          // subida se manifieste como partos rechazados en pleno campo.
          `INSERT INTO partos
             (id, oveja_id, fecha, condicion_corporal, collar_numero, collar_puesto,
              observaciones, creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
           VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)`,
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
                madre_tipo, madre_crianza_id, observaciones, sexo_discrepancia,
                creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
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
              cordero.madre_crianza === null ? 'biologica' : 'nodriza',
              cordero.madre_crianza?.id ?? null,
              cordero.observaciones === '' ? null : cordero.observaciones,
              ahora,
              usuarioId,
              ahora,
              usuarioId,
              aparato,
            ],
          );
        }
      });

      onGuardado();
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
            onAbrirParto={onAbrirParto}
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
            // Editar no agrega un cordero: el que se edita ya está contado en
            // la lista, así que el parto es múltiple recién con otro más.
            esMultiple={editando !== null ? corderos.length >= 2 : corderos.length >= 1}
            fechaParto={fecha}
            madreBiologicaId={oveja?.id ?? ''}
            collarNumero={collarNumero}
            numerosUsados={collaresUsados.map((c) => c.collar_numero)}
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

function PasoMadre({
  onElegir,
  onAbrirParto,
}: {
  onElegir: (oveja: OvejaElegida) => void;
  onAbrirParto: (partoId: string) => void;
}) {
  return (
    <>
      <h1 className="titulo">¿Qué oveja parió?</h1>
      <p className="subtitulo">Escribí los números de la caravana.</p>
      {/* Las que ya parieron se abren: spec §7, «avisar y ofrecer abrirlo». Es
          la forma de ver si el parto que ya existe es el que se iba a cargar. */}
      <BuscadorCaravana autoFocus bloquearConParto onElegir={onElegir} onAbrirParto={onAbrirParto} />
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

/** La línea chica de cada cordero mientras el parto todavía es un borrador. */
function detalleDelBorrador(cordero: BorradorCordero, collarNumero: string | null): string {
  const causa = causaLegible(cordero.causa_muerte);
  const estado =
    cordero.condicion === 'muerto'
      ? `Muerto · ${causa ?? 'sin causa'}`
      : collarNumero !== null
        ? `Collar ${collarNumero}`
        : 'Vivo';
  return cordero.madre_crianza !== null
    ? `${estado} · nodriza ${cordero.madre_crianza.caravana}`
    : estado;
}

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
            `${nombreTipo(tipo)} · se calcula solo`}
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
              detalle={detalleDelBorrador(cordero, collarNumero)}
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
      <h1 className="titulo">{nombreTipo(tipo)}</h1>
      <p className="subtitulo">
        Madre <Caravana numero={oveja.caravana} /> · {vivos} vivo{vivos === 1 ? '' : 's'} ·{' '}
        {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-UY')}
        {condicion !== null && ` · condición ${formatearCondicion(condicion)}`}
      </p>

      <div className="tarjeta">
        {corderos.map((cordero) => (
          <FilaCordero
            key={cordero.id}
            cordero={cordero}
            detalle={detalleDelBorrador(cordero, collarNumero)}
          />
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
