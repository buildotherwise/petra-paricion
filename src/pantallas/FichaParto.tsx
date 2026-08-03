import { useState, type ReactNode } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { BuscadorCaravana, type OvejaElegida } from '../componentes/BuscadorCaravana';
import { FormularioCordero, type BorradorCordero } from '../componentes/FormularioCordero';
import { causaLegible, FilaCordero } from '../componentes/FilaCordero';
import { Collar } from '../componentes/MarcaCollar';
import {
  SelectorCondicionCorporal,
  formatearCondicion,
} from '../componentes/SelectorCondicionCorporal';
import { db } from '../lib/powersync/db';
import { actualizar } from '../lib/powersync/escritura';
import { dispositivo, entorno } from '../lib/entorno';
import { useUsuarioId } from '../lib/sesion';
import { fechaLarga, nombreMarca, nombreTipo } from '../lib/parto';
import {
  collarDisponible,
  corderosQueRequierenMarca,
  hoyISO,
  marcasOcupadas,
  maximoElegible,
  partoRequiereCollar,
  rangoTemporada,
  tipoNacimiento,
  validarFechaNacimiento,
  type MarcaCollar,
} from '../lib/reglas';

/**
 * La ficha de un parto ya guardado.
 *
 * Se mira, y editar es un paso aparte. Es la pantalla que más se va a abrir sin
 * intención de cambiar nada —para confirmar que lo cargado está bien—, y a
 * pleno sol con guantes un formulario siempre activo cambia una condición
 * corporal de un roce, sin que nadie se entere hasta fin de temporada.
 */

interface FilaParto {
  id: string;
  oveja_id: string;
  caravana: string;
  fecha: string;
  condicion_corporal: number | null;
  collar_numero: string | null;
  collar_puesto: number | null;
  observaciones: string | null;
}

export interface FilaCorderoGuardado {
  id: string;
  sexo: 'macho' | 'hembra';
  condicion: 'vivo' | 'muerto';
  estado: 'nacido' | 'senalado' | 'muerto';
  peso_kg: number | null;
  collar_marca: MarcaCollar | null;
  causa_muerte: string | null;
  fecha_muerte: string | null;
  madre_crianza_id: string | null;
  nodriza_caravana: string | null;
  observaciones: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  anulado_nombre: string | null;

  // Etapa 2. Van acá y no en una consulta aparte porque el tatuaje es lo que
  // identifica al cordero una vez señalado: sin él, la lista de hermanos no
  // puede decir cuál ya está hecho.
  tatuaje: string | null;
  fecha_senalada: string | null;
  canela_vellon: number | null;
  canela_no_vellon: number | null;
  lunar_vellon: number | null;
  lunar_no_vellon: number | null;
  entropion: string | null;
  halo_hair: number | null;
  pigmentacion: number | null;
  sexo_discrepancia: number | null;
}

type Vista = 'ficha' | 'editar' | 'madre' | 'cordero';

/** Los corderos de un parto, con la nodriza y el autor de la anulación resueltos. */
export function useCorderosDelParto(partoId: string) {
  const { data } = useQuery<FilaCorderoGuardado>(
    `SELECT c.id, c.sexo, c.condicion, c.estado, c.peso_kg, c.collar_marca,
            c.causa_muerte, c.fecha_muerte, c.madre_crianza_id, c.observaciones,
            c.anulado_en, c.anulado_motivo,
            c.tatuaje, c.fecha_senalada, c.entropion, c.halo_hair, c.pigmentacion,
            c.canela_vellon, c.canela_no_vellon, c.lunar_vellon, c.lunar_no_vellon,
            c.sexo_discrepancia,
            n.caravana AS nodriza_caravana,
            a.nombre   AS anulado_nombre
       FROM corderos c
       LEFT JOIN ovejas   n ON n.id = c.madre_crianza_id
       LEFT JOIN perfiles a ON a.id = c.anulado_por
      WHERE c.parto_id = ?
      -- Los hermanos de un parto se guardan en la misma transacción y comparten
      -- creado_en al milisegundo. Sin el desempate por id el orden cambia entre
      -- renders y las filas saltan solas.
      ORDER BY c.creado_en, c.id`,
    [partoId],
  );
  return data;
}

export function FichaParto({
  partoId,
  onVolver,
  onAbrirCordero,
  pie,
}: {
  partoId: string;
  onVolver: () => void;
  onAbrirCordero: (corderoId: string) => void;
  /** Lo que se agrega al pie desde afuera. Ver el mismo prop en FichaCordero. */
  pie?: ReactNode;
}) {
  const [vista, setVista] = useState<Vista>('ficha');

  const { data: partos } = useQuery<FilaParto>(
    `SELECT p.id, p.oveja_id, p.fecha, p.condicion_corporal, p.collar_numero,
            p.collar_puesto, p.observaciones, o.caravana
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.id = ?`,
    [partoId],
  );
  const parto = partos[0];
  const corderos = useCorderosDelParto(partoId);

  if (parto === undefined) {
    return (
      <div className="app">
        <Encabezado atras={onVolver} />
        <main className="contenido area-segura">
          <h1 className="titulo">Parto no encontrado</h1>
          <p className="subtitulo">
            Puede que se haya cargado en otro dispositivo y todavía no haya llegado.
          </p>
        </main>
      </div>
    );
  }

  const activos = corderos.filter((c) => c.anulado_en === null);
  const tipo = tipoNacimiento(activos);
  const vivos = activos.filter((c) => c.estado !== 'muerto').length;

  return (
    <div className="app">
      <Encabezado atras={vista === 'ficha' ? onVolver : () => setVista('ficha')} />

      <main className="contenido area-segura">
        {vista === 'ficha' && (
          <Ficha
            parto={parto}
            corderos={corderos}
            tipo={tipo}
            vivos={vivos}
            onEditar={() => setVista('editar')}
            onCambiarMadre={() => setVista('madre')}
            onAgregarCordero={() => setVista('cordero')}
            onAbrirCordero={onAbrirCordero}
          />
        )}

        {vista === 'editar' && (
          <EditarParto parto={parto} activos={activos} onListo={() => setVista('ficha')} />
        )}

        {vista === 'madre' && (
          <CambiarMadre parto={parto} corderos={activos.length} onListo={() => setVista('ficha')} />
        )}

        {vista === 'cordero' && (
          <AgregarCordero parto={parto} corderos={activos} onListo={() => setVista('ficha')} />
        )}

        {vista === 'ficha' && pie}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Lo que se mira
// ───────────────────────────────────────────────────────────────────────

function Ficha({
  parto,
  corderos,
  tipo,
  vivos,
  onEditar,
  onCambiarMadre,
  onAgregarCordero,
  onAbrirCordero,
}: {
  parto: FilaParto;
  corderos: readonly FilaCorderoGuardado[];
  tipo: number;
  vivos: number;
  onEditar: () => void;
  onCambiarMadre: () => void;
  onAgregarCordero: () => void;
  onAbrirCordero: (id: string) => void;
}) {
  return (
    <>
      {/* Las dos chapas que se leen en los animales: la caravana cuelga de la
          oreja de la madre, el collar va en el cuello y lo llevan ella y todos
          los hermanos. */}
      <h1 className="titulo chapas">
        <Caravana numero={parto.caravana} grande />
        {parto.collar_numero !== null && <Collar numero={parto.collar_numero} grande />}
      </h1>
      <p className="subtitulo">
        {nombreTipo(tipo)} · {vivos} vivo{vivos === 1 ? '' : 's'} · {fechaLarga(parto.fecha)}
      </p>

      <div className="tarjeta">
        <Dato etiqueta="Fecha" valor={fechaLarga(parto.fecha)} />
        <Dato
          etiqueta="Condición corporal"
          valor={
            parto.condicion_corporal !== null
              ? formatearCondicion(parto.condicion_corporal)
              : 'sin registrar'
          }
        />
        {/* Si alguien confirmó que el collar ya no está en los animales, la
            ficha lo dice: en la señalada, salir a buscar un collar que nadie
            lleva puesto es media hora perdida. El número sigue reservado. */}
        {parto.collar_numero !== null && (
          <Dato
            etiqueta="Collar del parto"
            valor={
              parto.collar_puesto === 0
                ? `${parto.collar_numero} · ya no lo llevan`
                : parto.collar_numero
            }
          />
        )}
        {parto.observaciones !== null && parto.observaciones !== '' && (
          <Dato etiqueta="Observaciones" valor={parto.observaciones} />
        )}
      </div>

      <button
        type="button"
        className="boton boton--secundario"
        style={{ marginTop: 'var(--sp-3)' }}
        onClick={onEditar}
      >
        Editar datos del parto
      </button>

      <span className="etiqueta" style={{ marginTop: 'var(--sp-5)' }}>
        Corderos
      </span>
      <div className="tarjeta">
        {corderos.map((cordero) => (
          <FilaCordero
            key={cordero.id}
            cordero={cordero}
            detalle={detalleDelCordero(cordero)}
            chip={chipDelCordero(cordero)}
            atenuada={cordero.anulado_en !== null || cordero.estado === 'muerto'}
            onAbrir={() => onAbrirCordero(cordero.id)}
          />
        ))}
      </div>

      <button
        type="button"
        className="boton boton--secundario"
        style={{ marginTop: 'var(--sp-3)' }}
        onClick={onAgregarCordero}
      >
        + Agregar un cordero
      </button>

      <button
        type="button"
        className="boton boton--secundario"
        style={{ marginTop: 'var(--sp-3)' }}
        onClick={onCambiarMadre}
      >
        Cambiar la madre
      </button>
    </>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="dato">
      <span>{etiqueta}</span>
      <b>{valor}</b>
    </div>
  );
}

/** La línea chica de un cordero guardado: qué le pasó, no cómo se cargó. */
export function detalleDelCordero(cordero: FilaCorderoGuardado): string {
  if (cordero.anulado_en !== null) {
    const quien = cordero.anulado_nombre;
    return quien !== null ? `Anulado por ${quien}` : 'Anulado';
  }

  const partes: string[] = [];

  if (cordero.estado === 'muerto') {
    const causa = causaLegible(cordero.causa_muerte);
    partes.push(
      cordero.fecha_muerte !== null
        ? `Murió el ${fechaLarga(cordero.fecha_muerte)}`
        : cordero.condicion === 'muerto'
          ? 'Nació muerto'
          : 'Muerto',
    );
    if (causa !== null) partes.push(causa.toLowerCase());
  } else if (cordero.estado === 'senalado') {
    partes.push('Señalado');
  } else if (cordero.collar_marca !== null) {
    partes.push(nombreMarca(cordero.collar_marca));
  } else {
    partes.push('Sin señalar');
  }

  if (cordero.nodriza_caravana !== null) partes.push(`nodriza ${cordero.nodriza_caravana}`);
  return partes.join(' · ');
}

export function chipDelCordero(
  cordero: FilaCorderoGuardado,
): { texto: string; tono: 'muerto' | 'anulado' } | undefined {
  if (cordero.anulado_en !== null) return { texto: 'Anulado', tono: 'anulado' };
  if (cordero.estado === 'muerto') return { texto: 'Muerto', tono: 'muerto' };
  return undefined;
}

// `nombreMarca` se mudó a lib/parto.ts, que es el archivo de cómo se nombran
// las cosas en pantalla. Lo usan cinco pantallas y una función pura, y una de
// ellas importándolo desde otra pantalla era el camino al revés.

// ───────────────────────────────────────────────────────────────────────
// Editar los datos del parto
// ───────────────────────────────────────────────────────────────────────

function EditarParto({
  parto,
  activos,
  onListo,
}: {
  parto: FilaParto;
  activos: readonly FilaCorderoGuardado[];
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [fecha, setFecha] = useState(parto.fecha);
  const [condicion, setCondicion] = useState<number | null>(parto.condicion_corporal);
  const [collar, setCollar] = useState(parto.collar_numero ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoy = hoyISO();
  const validacionFecha = validarFechaNacimiento(fecha, hoy, entorno.temporada);
  const { desde } = rangoTemporada(entorno.temporada);
  const esMultiple = partoRequiereCollar(activos);

  const { data: usados } = useQuery<{ collar_numero: string }>(
    `SELECT DISTINCT p.collar_numero
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.collar_numero IS NOT NULL AND o.temporada = ? AND p.id <> ?`,
    [entorno.temporada, parto.id],
  );

  const collarLibre =
    !esMultiple || collar.trim() === ''
      ? true
      : collarDisponible(
          collar,
          usados.map((u) => u.collar_numero),
          parto.collar_numero,
        );

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'partos',
          parto.id,
          {
            fecha,
            condicion_corporal: condicion,
            collar_numero: esMultiple && collar.trim() !== '' ? collar.trim() : null,
          },
          usuarioId,
        );
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el cambio.');
      setGuardando(false);
    }
  }

  return (
    <>
      <h1 className="titulo">Datos del parto</h1>
      <p className="subtitulo">
        Madre <Caravana numero={parto.caravana} />
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="fecha">
          Fecha del parto
        </label>
        <input
          id="fecha"
          className="entrada"
          type="date"
          value={fecha}
          min={desde}
          max={maximoElegible(hoy, entorno.temporada)}
          onChange={(e) => setFecha(e.target.value)}
        />
        {!validacionFecha.valida && (
          <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
            {validacionFecha.motivo}
          </p>
        )}
      </div>

      <div className="campo">
        <span className="etiqueta">
          Condición corporal de la madre
          {condicion !== null && ` · ${formatearCondicion(condicion)}`}
        </span>
        <SelectorCondicionCorporal valor={condicion} onChange={setCondicion} />
      </div>

      {esMultiple && (
        <div className="campo">
          <label className="etiqueta" htmlFor="collar">
            Collar del parto
          </label>
          <input
            id="collar"
            className="entrada entrada--cifra"
            inputMode="numeric"
            placeholder="00"
            value={collar}
            onChange={(e) => setCollar(e.target.value)}
          />
          {!collarLibre && (
            <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
              Ese collar ya se usó esta temporada en otro parto. Elegí otro número.
            </p>
          )}
          {/* Cambiar el número no devuelve el anterior a la lista: el collar
              físico salió de la caja y no se sabe dónde está. */}
          {parto.collar_numero !== null && collar.trim() !== parto.collar_numero && (
            <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
              El {parto.collar_numero} queda tomado igual por el resto de la temporada.
            </p>
          )}
        </div>
      )}

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onListo}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal"
          onClick={guardar}
          disabled={guardando || !validacionFecha.valida || condicion === null || !collarLibre}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Cambiar la madre
// ───────────────────────────────────────────────────────────────────────

/**
 * «Lo cargué en la caravana equivocada.»
 *
 * Es el error más caro: no se nota mirando el registro, porque todo lo demás
 * está bien. Una oveja tiene un parto y nada más —la base lo garantiza con un
 * unique—, así que si la destino ya parió hay que frenar acá: si sale, el
 * servidor lo rechaza y el cambio se descarta.
 */
function CambiarMadre({
  parto,
  corderos,
  onListo,
}: {
  parto: FilaParto;
  corderos: number;
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [elegida, setElegida] = useState<OvejaElegida | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (elegida === null) return;
    setGuardando(true);
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(tx, 'partos', parto.id, { oveja_id: elegida.id }, usuarioId);
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar la madre.');
      setGuardando(false);
    }
  }

  return (
    <>
      <h1 className="titulo">Cambiar la madre</h1>
      <p className="subtitulo">
        Este parto figura hoy en la <Caravana numero={parto.caravana} />
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      {elegida === null ? (
        <BuscadorCaravana autoFocus bloquearConParto excluirId={parto.oveja_id} onElegir={setElegida} />
      ) : (
        <>
          <div className="tarjeta cambio-madre">
            <Caravana numero={parto.caravana} grande />
            <span aria-hidden="true">→</span>
            <Caravana numero={elegida.caravana} grande />
          </div>

          <p className="aviso aviso--atencion">
            Se mueven el parto entero y {corderos === 1 ? 'su cordero' : `sus ${corderos} corderos`}.
            La {parto.caravana} vuelve a quedar sin parto registrado.
          </p>

          <div className="barra-accion">
            <button type="button" className="boton boton--secundario" onClick={() => setElegida(null)}>
              Elegir otra
            </button>
            <button
              type="button"
              className="boton boton--principal"
              onClick={confirmar}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Confirmar el cambio'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Agregar un cordero a un parto guardado
// ───────────────────────────────────────────────────────────────────────

function AgregarCordero({
  parto,
  corderos,
  onListo,
}: {
  parto: FilaParto;
  corderos: readonly FilaCorderoGuardado[];
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [error, setError] = useState<string | null>(null);

  const { data: usados } = useQuery<{ collar_numero: string }>(
    `SELECT DISTINCT p.collar_numero
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.collar_numero IS NOT NULL AND o.temporada = ? AND p.id <> ?`,
    [entorno.temporada, parto.id],
  );

  async function guardar(cordero: BorradorCordero, numero: string | null) {
    const ahora = new Date().toISOString();
    const aparato = dispositivo();
    setError(null);

    try {
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO corderos
             (id, parto_id, temporada, estado, sexo, condicion, peso_kg,
              collar_marca, causa_muerte, fecha_muerte,
              madre_tipo, madre_crianza_id, observaciones, sexo_discrepancia,
              creado_en, creado_por, actualizado_en, actualizado_por, dispositivo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            cordero.id,
            parto.id,
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

        // El parto pasó a múltiple recién ahora: el collar es del parto, así
        // que el número que pidió el formulario se guarda acá.
        if (numero !== null) {
          await actualizar(tx, 'partos', parto.id, { collar_numero: numero }, usuarioId);
        }
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo agregar el cordero.');
    }
  }

  const faltanMarca = corderosQueRequierenMarca([
    ...corderos,
    { id: 'nuevo', condicion: 'vivo', collar_marca: null, anulado_en: null },
  ]);

  return (
    <>
      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      {/* Al agregar el segundo cordero el parto se vuelve múltiple, y ahí
          aparecen el collar y las marcas — incluida la del que ya estaba, que
          se completa desde su propia ficha. */}
      {faltanMarca.length > 1 && (
        <p className="aviso aviso--atencion">
          Al agregar este cordero el parto pasa a ser múltiple. Después hay que ponerle la marca al
          que ya estaba cargado, desde su ficha.
        </p>
      )}

      <FormularioCordero
        inicial={null}
        titulo="Agregar un cordero"
        esMultiple={corderos.length >= 1}
        fechaParto={parto.fecha}
        madreBiologicaId={parto.oveja_id}
        collarNumero={parto.collar_numero}
        numerosUsados={usados.map((u) => u.collar_numero)}
        ocupadas={marcasOcupadas(corderos)}
        onGuardar={guardar}
        onCancelar={onListo}
      />
    </>
  );
}
