import { useState, type CSSProperties } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { Collar } from '../componentes/MarcaCollar';
import { MatrizCanelaLunar } from '../componentes/MatrizCanelaLunar';
import { pesoLegible, sexoLegible } from '../componentes/FilaCordero';
import { db } from '../lib/powersync/db';
import { guardarCambio } from '../lib/powersync/escritura';
import { useUsuarioId } from '../lib/sesion';
import { entorno } from '../lib/entorno';
import { diaCorto } from '../lib/parto';
import {
  camposFaltantes,
  ENTROPIONES,
  hermanoDelMismoSexo,
  hoyISO,
  normalizarTatuaje,
  PIGMENTACION_MAXIMA,
  puedeSenalar,
  siguienteTatuaje,
  tatuajeDisponible,
  type BorradorSenalada,
  type CanelaLunar,
  type Entropion,
  type Sexo,
} from '../lib/reglas';
import { nombreMarca, useCorderosDelParto } from './FichaParto';
import { antiguedad } from './Senalada';

/**
 * La señalada de un cordero: nueve campos en un teléfono, a pleno sol.
 *
 * Una sola pantalla con scroll, no un asistente. Un asistente de nueve pasos
 * serían dieciocho pantallas en un parto de mellizos y seiscientas en la
 * jornada, y corregir el sexo desde el paso 8 son seis toques de «atrás» y seis
 * de vuelta. Acá corregirlo es subir el dedo, y antes de guardar se puede
 * repasar todo de una pasada — que con nueve datos que van a un análisis
 * genético vale más que el scroll que cuesta.
 *
 * El orden lo fija el cuerpo, no el diseño: primero se mira qué es, después se
 * le pone el tatuaje, y recién ahí se lo revisa.
 */

const PIGMENTACIONES = Array.from({ length: PIGMENTACION_MAXIMA + 1 }, (_, i) => i);

/**
 * Las cuatro columnas de canela y lunar como el objeto que usa la matriz.
 *
 * Solo tiene sentido en un cordero ya señalado: si alguna viene en null la fila
 * no pasaría la restricción `senalada_completa`, así que se leen como 0 sin
 * inventar nada.
 */
function canelaLunarGuardada(fila: {
  canela_vellon: number | null;
  canela_no_vellon: number | null;
  lunar_vellon: number | null;
  lunar_no_vellon: number | null;
}): CanelaLunar {
  const uno = (valor: number | null): 0 | 1 => (valor === 1 ? 1 : 0);
  return {
    canela_vellon: uno(fila.canela_vellon),
    canela_no_vellon: uno(fila.canela_no_vellon),
    lunar_vellon: uno(fila.lunar_vellon),
    lunar_no_vellon: uno(fila.lunar_no_vellon),
  };
}

interface FilaSenalar {
  id: string;
  parto_id: string;
  sexo: Sexo;
  estado: 'nacido' | 'senalado' | 'muerto';
  peso_kg: number | null;
  collar_marca: 'punto_arriba' | 'cruz_al_medio' | 'punto_abajo' | null;
  observaciones: string | null;
  anulado_en: string | null;
  caravana: string;
  parto_fecha: string;
  collar_numero: string | null;

  // Lo ya cargado, para corregir una señalada sin volver a preguntarlo todo.
  tatuaje: string | null;
  entropion: Entropion | null;
  canela_vellon: number | null;
  canela_no_vellon: number | null;
  lunar_vellon: number | null;
  lunar_no_vellon: number | null;
  halo_hair: number | null;
  pigmentacion: number | null;
  sexo_discrepancia: number | null;
}

interface TatuajeUsado {
  tatuaje: string;
  caravana: string;
}

export function SenalarCordero({
  corderoId,
  onVolver,
  onSenalarOtro,
  onElegirHermano,
}: {
  corderoId: string;
  onVolver: () => void;
  /** Encadena con el hermano que falta, sin apilar otra pantalla. */
  onSenalarOtro: (corderoId: string) => void;
  /** Con dos o más pendientes, vuelve a la lista de hermanos a elegir. */
  onElegirHermano: (partoId: string) => void;
}) {
  const { data: filas } = useQuery<FilaSenalar>(
    `SELECT c.id, c.parto_id, c.sexo, c.estado, c.peso_kg, c.collar_marca,
            c.observaciones, c.anulado_en,
            c.tatuaje, c.entropion, c.halo_hair, c.pigmentacion, c.sexo_discrepancia,
            c.canela_vellon, c.canela_no_vellon, c.lunar_vellon, c.lunar_no_vellon,
            o.caravana, p.fecha AS parto_fecha, p.collar_numero
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE c.id = ?`,
    [corderoId],
  );
  const cordero = filas[0];

  if (cordero === undefined) {
    return (
      <div className="app">
        <Encabezado atras={onVolver} />
        <main className="contenido area-segura">
          <h1 className="titulo">Cordero no encontrado</h1>
        </main>
      </div>
    );
  }

  // La clave remonta el formulario entero al encadenar con un hermano: sin
  // ella, React reusaría el estado y el segundo cordero arrancaría con las
  // respuestas del primero ya puestas.
  return (
    <Formulario
      key={cordero.id}
      cordero={cordero}
      onVolver={onVolver}
      onSenalarOtro={onSenalarOtro}
      onElegirHermano={onElegirHermano}
    />
  );
}

function Formulario({
  cordero,
  onVolver,
  onSenalarOtro,
  onElegirHermano,
}: {
  cordero: FilaSenalar;
  onVolver: () => void;
  onSenalarOtro: (corderoId: string) => void;
  onElegirHermano: (partoId: string) => void;
}) {
  const usuarioId = useUsuarioId();
  const hermanos = useCorderosDelParto(cordero.parto_id);

  const { data: usados } = useQuery<TatuajeUsado>(
    `SELECT c.tatuaje, o.caravana
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE c.temporada = ? AND c.tatuaje IS NOT NULL`,
    [entorno.temporada],
  );

  /**
   * Corregir una señalada es el mismo formulario con lo cargado ya puesto.
   *
   * Vale la pena que sea el mismo y no una pantalla aparte: son nueve campos
   * con nueve controles particulares, y dos copias divergen apenas una cambie.
   *
   * Se congela al montar a propósito. Derivarlo en cada render lo daría vuelta
   * al guardar —la consulta se reejecuta y el cordero ya figura señalado—, y la
   * pantalla de confirmación diría «corregido» sobre una señalada recién hecha.
   */
  const [corrigiendo] = useState(() => cordero.estado === 'senalado');

  const [sexo, setSexo] = useState<Sexo | null>(() => (corrigiendo ? cordero.sexo : null));
  // null significa «todavía no lo tocó»: el valor que se muestra es el
  // sugerido. Así la sugerencia puede llegar después de la consulta sin
  // pisar lo que la persona haya escrito mientras tanto.
  const [tatuajeEscrito, setTatuajeEscrito] = useState<string | null>(() => cordero.tatuaje);
  const [entropion, setEntropion] = useState<Entropion | null>(() => cordero.entropion);
  const [canelaLunar, setCanelaLunar] = useState<CanelaLunar | null>(() =>
    corrigiendo ? canelaLunarGuardada(cordero) : null,
  );
  const [haloHair, setHaloHair] = useState<0 | 1 | null>(() =>
    cordero.halo_hair === 1 ? 1 : cordero.halo_hair === 0 ? 0 : null,
  );
  const [pigmentacion, setPigmentacion] = useState<number | null>(() => cordero.pigmentacion);
  const [observaciones, setObservaciones] = useState<string | null>(null);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sugerido = siguienteTatuaje(usados.map((u) => u.tatuaje));
  const tatuaje = tatuajeEscrito ?? sugerido ?? '';
  const nota = observaciones ?? cordero.observaciones ?? '';

  const permiso = puedeSenalar(cordero);
  const borrador: BorradorSenalada = {
    sexo,
    tatuaje,
    entropion,
    canelaLunar,
    halo_hair: haloHair,
    pigmentacion,
  };
  const faltantes = camposFaltantes(borrador);
  const normalizado = normalizarTatuaje(tatuaje);
  // El propio tatuaje no se bloquea a sí mismo al corregir.
  const ocupadoPor =
    normalizado !== null &&
    !tatuajeDisponible(tatuaje, usados.map((u) => u.tatuaje), cordero.tatuaje)
      ? (usados.find((u) => normalizarTatuaje(u.tatuaje) === normalizado)?.caravana ?? null)
      : null;

  // Lo que R6 busca de verdad: en un parto de sexos distintos, decir que no
  // coincide casi siempre significa que en la mano está el otro hermano.
  const discrepancia = sexo !== null && sexo !== cordero.sexo;
  const confundible =
    discrepancia && sexo !== null ? hermanoDelMismoSexo(hermanos, cordero.id, sexo) : null;

  // Al corregir todo viene puesto, así que lo que importa es si cambió algo
  // respecto de lo guardado; al señalar de cero, si tocó cualquier cosa.
  const tocado = corrigiendo
    ? sexo !== cordero.sexo ||
      normalizado !== cordero.tatuaje ||
      entropion !== cordero.entropion ||
      pigmentacion !== cordero.pigmentacion ||
      haloHair !== cordero.halo_hair ||
      observaciones !== null
    : sexo !== null ||
      tatuajeEscrito !== null ||
      entropion !== null ||
      canelaLunar !== null ||
      haloHair !== null ||
      pigmentacion !== null ||
      observaciones !== null;

  const listo =
    faltantes.length === 0 && ocupadoPor === null && (corrigiendo || permiso.puede);

  const salir = () => {
    if (tocado && guardado === null) setConfirmandoSalida(true);
    else onVolver();
  };

  async function guardar() {
    if (!listo || canelaLunar === null || normalizado === null || sexo === null) return;

    try {
      await guardarCambio(db, usuarioId, async (aplicar) => {
        await aplicar('corderos', cordero.id, {
          estado: 'senalado',
          // R6: se guarda lo que se vio, y se deja marcado que no coincidía.
          // Al corregir, una discrepancia ya registrada no se borra: pasó.
          sexo,
          sexo_discrepancia: discrepancia || cordero.sexo_discrepancia === 1 ? 1 : 0,
          tatuaje: normalizado,
          fecha_senalada: hoyISO(),
          canela_vellon: canelaLunar.canela_vellon,
          canela_no_vellon: canelaLunar.canela_no_vellon,
          lunar_vellon: canelaLunar.lunar_vellon,
          lunar_no_vellon: canelaLunar.lunar_no_vellon,
          entropion,
          halo_hair: haloHair,
          pigmentacion,
          observaciones: nota.trim() === '' ? null : nota.trim(),
        });
      });
      setGuardado(normalizado);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : 'No se pudo guardar la señalada.');
    }
  }

  if (guardado !== null) {
    return (
      <Guardado
        tatuaje={guardado}
        cordero={cordero}
        sexo={sexo ?? cordero.sexo}
        corrigiendo={corrigiendo}
        hermanos={hermanos}
        onVolver={onVolver}
        onSenalarOtro={onSenalarOtro}
        onElegirHermano={onElegirHermano}
      />
    );
  }

  return (
    <div className="app">
      <Encabezado atras={salir} />

      <main className="contenido area-segura">
        {/* La caravana y el collar juntos, como se leen en los animales. Es la
            única pantalla que se mira con el cordero sujeto, y el collar es el
            único dato que dice si se agarró el correcto: la caravana la tiene
            la madre y el tatuaje todavía no existe. */}
        <h1 className="titulo chapas">
          <Caravana numero={cordero.caravana} grande />
          {cordero.collar_numero !== null && (
            <Collar numero={cordero.collar_numero} marca={cordero.collar_marca} grande />
          )}
        </h1>
        <p className="subtitulo">
          {corrigiendo && cordero.tatuaje !== null && `Tatuaje ${cordero.tatuaje} · `}
          {cordero.collar_marca !== null && `${nombreMarca(cordero.collar_marca)} · `}
          nació el {diaCorto(cordero.parto_fecha)} · {antiguedad(cordero.parto_fecha)} ·{' '}
          {pesoLegible(cordero.peso_kg)}
        </p>

        {!corrigiendo && !permiso.puede && <p className="aviso aviso--error">{permiso.motivo}</p>}
        {corrigiendo && (
          <p className="aviso">
            Estás corrigiendo una señalada ya cargada. Cada cambio queda firmado en la auditoría.
          </p>
        )}

        {/* ── ¿Qué es? (R6) ───────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">¿Qué es?</p>
          <p className="aviso" style={{ marginTop: 0 }}>
            Al nacer se registró <b>{sexoLegible(cordero.sexo).toLowerCase()}</b>.
          </p>
          <div className="opciones" style={{ '--columnas': 2 } as CSSProperties}>
            <button
              type="button"
              className="opcion"
              aria-pressed={sexo === cordero.sexo}
              onClick={() => setSexo(cordero.sexo)}
            >
              Sí, {sexoLegible(cordero.sexo).toLowerCase()}
            </button>
            <button
              type="button"
              className="opcion"
              aria-pressed={discrepancia}
              onClick={() => setSexo(cordero.sexo === 'macho' ? 'hembra' : 'macho')}
            >
              No, es {cordero.sexo === 'macho' ? 'hembra' : 'macho'}
            </button>
          </div>

          {confundible !== null && (
            <p className="aviso aviso--atencion">
              <b>Fijate que no sea el otro hermano.</b> Este parto tuvo{' '}
              {sexoLegible(confundible.sexo).toLowerCase()}
              {confundible.collar_marca !== null &&
                ` de ${nombreMarca(confundible.collar_marca).toLowerCase()}`}
              . Mirá la marca del collar del animal que tenés.
            </p>
          )}
          {discrepancia && confundible === null && (
            <p className="aviso aviso--atencion">
              Se va a guardar como {sexo !== null ? sexoLegible(sexo).toLowerCase() : ''} y queda
              marcado para revisar desde la web.
            </p>
          )}
        </div>

        {/* ── Tatuaje ─────────────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">Tatuaje</p>
          <input
            className="entrada entrada--cifra"
            inputMode="numeric"
            maxLength={3}
            placeholder="000"
            value={tatuaje}
            onChange={(e) => setTatuajeEscrito(e.target.value)}
            aria-label="Número de tatuaje"
          />
          {ocupadoPor !== null ? (
            <p className="aviso aviso--error">
              El tatuaje <b>{normalizado}</b> ya lo tiene un cordero de la oveja{' '}
              <b>{ocupadoPor}</b>. Poné otro número o revisá cuál de los dos está mal.
            </p>
          ) : sugerido === null ? (
            <p className="aviso aviso--atencion">
              Se acabaron los números de tres dígitos de la temporada. Escribí el que corresponda.
            </p>
          ) : (
            <p className="nota-boton" style={{ marginTop: 'var(--sp-2)', textAlign: 'center' }}>
              {tatuajeEscrito === null || normalizarTatuaje(tatuajeEscrito) === sugerido
                ? 'El siguiente libre'
                : `El siguiente libre es el ${sugerido}`}
            </p>
          )}
        </div>

        {/* ── Entropión ───────────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">Entropión</p>
          <div className="opciones" style={{ '--columnas': 2 } as CSSProperties}>
            {ENTROPIONES.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                className="opcion"
                aria-pressed={entropion === opcion.valor}
                onClick={() => setEntropion(opcion.valor)}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* ── Canela y lunar ──────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">Canela y lunar</p>
          <MatrizCanelaLunar
            valor={canelaLunar}
            onChange={setCanelaLunar}
          />
        </div>

        {/* ── Halo hair ───────────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">Halo hair</p>
          <div className="opciones" style={{ '--columnas': 2 } as CSSProperties}>
            <button
              type="button"
              className="opcion"
              aria-pressed={haloHair === 1}
              onClick={() => setHaloHair(1)}
            >
              Tiene
            </button>
            <button
              type="button"
              className="opcion"
              aria-pressed={haloHair === 0}
              onClick={() => setHaloHair(0)}
            >
              No tiene
            </button>
          </div>
        </div>

        {/* ── Pigmentación ────────────────────────────────────────────── */}
        <div>
          <p className="etiqueta">Pigmentación</p>
          <div className="opciones" style={{ '--columnas': 5 } as CSSProperties}>
            {PIGMENTACIONES.map((valor) => (
              <button
                key={valor}
                type="button"
                className="opcion"
                aria-pressed={pigmentacion === valor}
                onClick={() => setPigmentacion(valor)}
              >
                {valor}
              </button>
            ))}
          </div>
        </div>

        {/* ── Observaciones ───────────────────────────────────────────── */}
        <div className="campo">
          <p className="etiqueta">Observaciones</p>
          <textarea
            className="entrada"
            rows={2}
            placeholder="Opcional"
            value={nota}
            onChange={(e) => setObservaciones(e.target.value)}
            aria-label="Observaciones"
          />
        </div>

        {error !== null && <p className="aviso aviso--error">{error}</p>}

        <div className="barra-accion">
          <button
            type="button"
            className="boton boton--principal"
            disabled={!listo}
            onClick={() => void guardar()}
          >
            {corrigiendo ? 'Guardar la corrección' : 'Guardar la señalada'}
          </button>
        </div>
      </main>

      {confirmandoSalida && (
        <ConfirmarSalida
          tatuaje={normalizado}
          onSeguir={() => setConfirmandoSalida(false)}
          onSalir={onVolver}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Después de guardar
// ───────────────────────────────────────────────────────────────────────

/**
 * Lo que pasa cuando se guarda.
 *
 * En mellizos y trillizos los hermanos que faltan quedan a un toque: los
 * animales todavía están ahí y la madre también, así que mandar de vuelta al
 * buscador sería pedir que se busque una oveja que se tiene agarrada.
 *
 * Con dos o más pendientes se vuelve a la lista de hermanos en vez de entrar
 * derecho a uno. El orden lo pone quien agarra los corderos, no la app: entrar
 * al que la app eligió significa que si en la mano está el otro, ya se está en
 * la pantalla equivocada y todavía no se sabe.
 */
function Guardado({
  tatuaje,
  cordero,
  sexo,
  corrigiendo,
  hermanos,
  onVolver,
  onSenalarOtro,
  onElegirHermano,
}: {
  tatuaje: string;
  cordero: FilaSenalar;
  sexo: Sexo;
  corrigiendo: boolean;
  hermanos: readonly { id: string; estado: string; anulado_en: string | null }[];
  onVolver: () => void;
  onSenalarOtro: (corderoId: string) => void;
  onElegirHermano: (partoId: string) => void;
}) {
  const faltan = hermanos.filter(
    (h) => h.id !== cordero.id && h.anulado_en === null && h.estado === 'nacido',
  );
  const unoSolo = faltan[0];

  return (
    <div className="app">
      <Encabezado atras={onVolver} />

      <main className="contenido area-segura">
        <h1 className="titulo chapas">
          <Caravana numero={cordero.caravana} grande />
          {cordero.collar_numero !== null && (
            <Collar numero={cordero.collar_numero} grande />
          )}
        </h1>
        <p className="subtitulo">
          {faltan.length === 0
            ? 'Parto señalado'
            : faltan.length === 1
              ? 'Falta un cordero de este parto'
              : `Faltan ${faltan.length} corderos de este parto`}
        </p>

        <p className="aviso aviso--exito">
          {corrigiendo ? 'Corregido el' : 'Señalado el'} <b>{tatuaje}</b>
          {cordero.collar_marca !== null && `, ${nombreMarca(cordero.collar_marca).toLowerCase()}`},{' '}
          {sexoLegible(sexo).toLowerCase()}.
        </p>

        <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
          {unoSolo !== undefined && (
            <button
              type="button"
              className="boton boton--principal"
              onClick={() =>
                faltan.length === 1
                  ? onSenalarOtro(unoSolo.id)
                  : onElegirHermano(cordero.parto_id)
              }
            >
              {faltan.length === 1 ? 'Señalar el que falta' : 'Elegir el que sigue'}
            </button>
          )}
          <button type="button" className="boton boton--secundario" onClick={onVolver}>
            Buscar otra oveja
          </button>
        </div>

        {cordero.collar_numero !== null && (
          <p className="nota-boton" style={{ marginTop: 'var(--sp-4)' }}>
            El collar {cordero.collar_numero} sigue tomado toda la temporada, se saque o no se
            saque.
          </p>
        )}
      </main>
    </div>
  );
}

/**
 * No hay borrador: un cordero está sin señalar o señalado, nunca a medias.
 *
 * Por eso el aviso nombra el tatuaje en vez de hablar de «cambios sin
 * guardar»: lo que se pierde es un número concreto que quizá ya esté puesto en
 * una oreja.
 */
function ConfirmarSalida({
  tatuaje,
  onSeguir,
  onSalir,
}: {
  tatuaje: string | null;
  onSeguir: () => void;
  onSalir: () => void;
}) {
  return (
    <div className="hoja-fondo">
      <div className="hoja" role="dialog" aria-modal="true" aria-label="Salir sin guardar">
        <h2 className="titulo" style={{ fontSize: '1.35rem' }}>
          ¿Salís sin guardar?
        </h2>
        <p className="subtitulo">
          {tatuaje !== null ? `El tatuaje ${tatuaje} y lo` : 'Lo'} que llevás contestado se pierde.
          El cordero queda sin señalar, como está ahora.
        </p>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <button type="button" className="boton boton--secundario boton--riesgo" onClick={onSalir}>
            Salir y perderlo
          </button>
          <button type="button" className="boton boton--principal" onClick={onSeguir}>
            Seguir señalando
          </button>
        </div>
      </div>
    </div>
  );
}
