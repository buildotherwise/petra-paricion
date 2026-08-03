import { useState, type ReactNode } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { BuscadorCaravana, type OvejaElegida } from '../componentes/BuscadorCaravana';
import { FormularioCordero, type BorradorCordero } from '../componentes/FormularioCordero';
import { causaLegible, pesoLegible, sexoLegible } from '../componentes/FilaCordero';
import { db } from '../lib/powersync/db';
import { actualizar } from '../lib/powersync/escritura';
import { useUsuarioId } from '../lib/sesion';
import { fechaLarga, nombreMarca } from '../lib/parto';
import { Dato, useCorderosDelParto, type FilaCorderoGuardado } from './FichaParto';
import { Collar } from '../componentes/MarcaCollar';
import { describirCanelaLunar } from '../componentes/MatrizCanelaLunar';
import {
  CAUSAS_MUERTE,
  ENTROPIONES,
  hoyISO,
  marcasOcupadas,
  MOTIVOS_ANULACION,
  partoQuedaUnico,
  puedeAnular,
  puedeRegistrarMuerte,
  puedeSenalar,
  validarFechaMuerte,
  validarFechaSenalada,
  type CanelaLunar,
  type CausaMuerte,
  type MotivoAnulacion,
} from '../lib/reglas';

/**
 * La ficha de un cordero.
 *
 * Acá viven cuatro cosas distintas: corregir un dato, registrar que murió (R8),
 * asignar nodriza (R10) y anular uno cargado por error. Las tres últimas van a
 * la vista y no detrás de un menú: con guantes, un ícono de tres puntos es el
 * objetivo más chico de la pantalla y lo que hay adentro no se descubre solo.
 */

interface FilaCorderoFicha extends FilaCorderoGuardado {
  parto_id: string;
  parto_fecha: string;
  oveja_id: string;
  caravana: string;
  collar_numero: string | null;
  collar_puesto: number | null;
}

type Vista = 'ficha' | 'editar' | 'muerte' | 'nodriza' | 'anular'
  // Las dos que solo existen en la web.
  | 'fecha-senalada' | 'desanular';

export function FichaCordero({
  corderoId,
  onVolver,
  onSenalar,
  admin = false,
  pie,
}: {
  corderoId: string;
  onVolver: () => void;
  onSenalar: (corderoId: string) => void;
  /**
   * Habilita las correcciones que no existen en el teléfono: la fecha de la
   * señalada, la muerte de un señalado y deshacer una anulación. Las tres
   * tocan corderos que ya tienen el tatuaje puesto o que ya se dieron por
   * cargados de más, y se hacen sentado — no con el animal entre las piernas.
   *
   * Ojo con lo que esto NO es: ninguna política de RLS distingue admin de
   * operador en `corderos`, así que esconder los botones separa superficies,
   * no permisos. Está dicho también en `perfil.ts`.
   */
  admin?: boolean;
  /**
   * Lo que se agrega al pie desde afuera. Hoy es el historial de cambios, que
   * solo corresponde en la web (§7). La ficha no sabe quién se lo pasa ni por
   * qué: si lo decidiera ella, tendría que conocer el rol y la superficie.
   */
  pie?: ReactNode;
}) {
  const [vista, setVista] = useState<Vista>('ficha');

  const { data: filas } = useQuery<FilaCorderoFicha>(
    `SELECT c.id, c.sexo, c.condicion, c.estado, c.peso_kg, c.collar_marca,
            c.causa_muerte, c.fecha_muerte, c.madre_crianza_id, c.observaciones,
            c.anulado_en, c.anulado_motivo, c.parto_id,
            c.tatuaje, c.fecha_senalada, c.entropion, c.halo_hair, c.pigmentacion,
            c.canela_vellon, c.canela_no_vellon, c.lunar_vellon, c.lunar_no_vellon,
            c.sexo_discrepancia,
            p.fecha AS parto_fecha, p.collar_numero, p.collar_puesto, p.oveja_id,
            o.caravana,
            n.caravana AS nodriza_caravana,
            a.nombre   AS anulado_nombre
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
       LEFT JOIN ovejas   n ON n.id = c.madre_crianza_id
       LEFT JOIN perfiles a ON a.id = c.anulado_por
      WHERE c.id = ?`,
    [corderoId],
  );
  const cordero = filas[0];
  const hermanos = useCorderosDelParto(cordero?.parto_id ?? '');

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

  return (
    <div className="app">
      <Encabezado atras={vista === 'ficha' ? onVolver : () => setVista('ficha')} />

      <main className="contenido area-segura">
        {vista === 'ficha' && (
          <Ficha
            cordero={cordero}
            hermanos={hermanos}
            admin={admin}
            onIr={setVista}
            onSenalar={() => onSenalar(cordero.id)}
          />
        )}
        {vista === 'editar' && (
          <EditarCordero
            cordero={cordero}
            hermanos={hermanos}
            onListo={() => setVista('ficha')}
          />
        )}
        {vista === 'muerte' && (
          <RegistrarMuerte cordero={cordero} onListo={() => setVista('ficha')} />
        )}
        {vista === 'nodriza' && (
          <AsignarNodriza cordero={cordero} onListo={() => setVista('ficha')} />
        )}
        {vista === 'anular' && (
          <AnularCordero
            cordero={cordero}
            hermanos={hermanos}
            onListo={() => setVista('ficha')}
          />
        )}
        {vista === 'fecha-senalada' && (
          <CorregirFechaSenalada cordero={cordero} onListo={() => setVista('ficha')} />
        )}
        {vista === 'desanular' && (
          <DesanularCordero cordero={cordero} onListo={() => setVista('ficha')} />
        )}

        {/* Solo mirando: debajo de un formulario abierto el historial es ruido,
            y encima invita a leer mientras se edita. */}
        {vista === 'ficha' && pie}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Lo que se mira
// ───────────────────────────────────────────────────────────────────────

const ESTADO: Record<string, string> = {
  nacido: 'Sin señalar',
  senalado: 'Señalado',
  muerto: 'Muerto',
};

function Ficha({
  cordero,
  hermanos,
  admin,
  onIr,
  onSenalar,
}: {
  cordero: FilaCorderoFicha;
  hermanos: readonly FilaCorderoGuardado[];
  admin: boolean;
  onIr: (vista: Vista) => void;
  onSenalar: () => void;
}) {
  const anulado = cordero.anulado_en !== null;
  const permisoMuerte = puedeRegistrarMuerte(cordero);
  const permisoAnular = puedeAnular(hermanos, cordero.id);
  const permisoSenalar = puedeSenalar(cordero);
  const senalado = cordero.estado === 'senalado';
  const motivo = MOTIVOS_ANULACION.find((m) => m.valor === cordero.anulado_motivo);

  return (
    <>
      {/* Una vez señalado, el tatuaje es el nombre del animal y pasa al lugar
          grande. El collar va al lado mientras exista: es lo que el cordero
          lleva puesto y lo que permite reconocerlo entre sus hermanos. */}
      <h1 className="titulo chapas">
        {senalado && cordero.tatuaje !== null ? (
          <span className="tatuaje-chapa">{cordero.tatuaje}</span>
        ) : (
          sexoLegible(cordero.sexo)
        )}
        {cordero.collar_numero !== null && (
          <Collar numero={cordero.collar_numero} marca={cordero.collar_marca} grande />
        )}
      </h1>
      <p className="subtitulo">
        Madre <Caravana numero={cordero.caravana} />
        {senalado && ` · ${sexoLegible(cordero.sexo).toLowerCase()}`} · nacido el{' '}
        {fechaLarga(cordero.parto_fecha)}
      </p>

      {anulado && (
        <p className="aviso aviso--atencion">
          Anulado{cordero.anulado_nombre !== null && ` por ${cordero.anulado_nombre}`}
          {motivo !== undefined && ` · ${motivo.etiqueta.toLowerCase()}`}. No cuenta para el tipo de
          nacimiento ni para la señalada.
        </p>
      )}

      <div className="tarjeta">
        <Dato etiqueta="Peso" valor={pesoLegible(cordero.peso_kg)} />
        {/* El número ya está en la chapa de arriba; acá va lo que lo distingue
            de sus hermanos. */}
        {cordero.collar_marca !== null && (
          <Dato etiqueta="Marca del collar" valor={nombreMarca(cordero.collar_marca)} />
        )}
        <Dato
          etiqueta="Se cría con"
          valor={
            cordero.nodriza_caravana !== null ? `Nodriza ${cordero.nodriza_caravana}` : 'Su madre'
          }
        />
        <Dato etiqueta="Estado" valor={ESTADO[cordero.estado] ?? cordero.estado} />
        {cordero.estado === 'muerto' && cordero.fecha_muerte !== null && (
          <Dato
            etiqueta="Murió el"
            valor={`${fechaLarga(cordero.fecha_muerte)}${
              causaLegible(cordero.causa_muerte) !== null
                ? ` · ${causaLegible(cordero.causa_muerte)?.toLowerCase()}`
                : ''
            }`}
          />
        )}
        {cordero.observaciones !== null && cordero.observaciones !== '' && (
          <Dato etiqueta="Observaciones" valor={cordero.observaciones} />
        )}
      </div>

      {/* El fenotipo entero a la vista, sin desplegar: es lo que se mira cuando
          algo no cierra, y esconderlo detrás de un acordeón solo agrega toques. */}
      {senalado && (
        <>
          <p className="etiqueta">Señalada</p>
          <div className="tarjeta">
            <Dato etiqueta="Tatuaje" valor={cordero.tatuaje ?? '—'} />
            {cordero.fecha_senalada !== null && (
              <Dato etiqueta="Señalado el" valor={fechaLarga(cordero.fecha_senalada)} />
            )}
            <Dato etiqueta="Entropión" valor={nombreEntropion(cordero.entropion)} />
            <Dato etiqueta="Canela y lunar" valor={describirCanelaLunar(canelaLunarDe(cordero))} />
            <Dato
              etiqueta="Halo hair"
              valor={cordero.halo_hair === 1 ? 'Tiene' : cordero.halo_hair === 0 ? 'No tiene' : '—'}
            />
            <Dato
              etiqueta="Pigmentación"
              valor={cordero.pigmentacion !== null ? String(cordero.pigmentacion) : '—'}
            />
          </div>
          {cordero.sexo_discrepancia === 1 && (
            <p className="aviso aviso--atencion">
              En la señalada el sexo no coincidió con el registrado al nacer. Queda para revisar
              desde la web.
            </p>
          )}
        </>
      )}

      {!anulado && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
          {permisoSenalar.puede && (
            <button type="button" className="boton boton--principal" onClick={onSenalar}>
              Señalar
            </button>
          )}
          {senalado && (
            <button type="button" className="boton boton--secundario" onClick={onSenalar}>
              Corregir la señalada
            </button>
          )}
          <button type="button" className="boton boton--secundario" onClick={() => onIr('editar')}>
            Editar
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => onIr('nodriza')}>
            {cordero.nodriza_caravana !== null ? 'Cambiar la nodriza' : 'Asignar nodriza'}
          </button>
          {/* En el teléfono un señalado no puede morirse: R8 manda ese caso a
              la web, para no perder el hecho de haber sido señalado con un
              toque apurado. Acá sí, y sin tocar `estado`. */}
          <button
            type="button"
            className="boton boton--secundario boton--riesgo"
            onClick={() => onIr('muerte')}
            disabled={!permisoMuerte.puede && !(admin && senalado)}
          >
            {senalado ? 'Registrar que murió' : 'Registrar muerte'}
          </button>
          <button
            type="button"
            className="boton boton--secundario boton--riesgo"
            onClick={() => onIr('anular')}
            disabled={!permisoAnular.puede}
          >
            Anular cordero
          </button>
          {/* Un botón apagado sin explicación se lee como una falla de la app. */}
          {!permisoAnular.puede && <p className="nota-boton">{permisoAnular.motivo}</p>}

          {admin && senalado && (
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => onIr('fecha-senalada')}
            >
              Corregir la fecha de la señalada
            </button>
          )}
        </div>
      )}

      {/* Equivocarse anulando es un error de carga más, y R13 es justamente
          para los errores de carga. Solo desde la web: en el teléfono, con
          guantes, deshacer una baja a un toque de distancia sería peor. */}
      {anulado && admin && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => onIr('desanular')}
          >
            Deshacer la anulación
          </button>
        </div>
      )}
    </>
  );
}

const NOMBRE_ENTROPION: Record<string, string> = Object.fromEntries(
  ENTROPIONES.map((e) => [e.valor, e.etiqueta]),
);

function nombreEntropion(valor: string | null): string {
  return valor === null ? '—' : (NOMBRE_ENTROPION[valor] ?? valor);
}

/** Las cuatro columnas como el objeto que sabe describirse. */
function canelaLunarDe(cordero: FilaCorderoFicha): CanelaLunar {
  const uno = (valor: number | null): 0 | 1 => (valor === 1 ? 1 : 0);
  return {
    canela_vellon: uno(cordero.canela_vellon),
    canela_no_vellon: uno(cordero.canela_no_vellon),
    lunar_vellon: uno(cordero.lunar_vellon),
    lunar_no_vellon: uno(cordero.lunar_no_vellon),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Editar
// ───────────────────────────────────────────────────────────────────────

function EditarCordero({
  cordero,
  hermanos,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  hermanos: readonly FilaCorderoGuardado[];
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [error, setError] = useState<string | null>(null);

  // Nació vivo y murió después (R8), o ya está señalado: en los dos casos
  // tocar «al nacer» pisaría un hecho registrado.
  const murioDespues = cordero.estado === 'muerto' && cordero.condicion === 'vivo';
  const nacimientoFijo = murioDespues
    ? {
        motivo:
          'Este cordero nació vivo y murió después. La muerte se corrige desde «Registrar muerte».',
      }
    : cordero.estado === 'senalado'
      ? { motivo: 'Este cordero ya está señalado: nació vivo y así queda.' }
      : undefined;

  const inicial: BorradorCordero = {
    id: cordero.id,
    sexo: cordero.sexo,
    condicion: cordero.condicion,
    peso_kg: cordero.peso_kg,
    collar_marca: cordero.collar_marca,
    causa_muerte: cordero.causa_muerte as CausaMuerte | null,
    fecha_muerte: cordero.fecha_muerte,
    anulado_en: cordero.anulado_en,
    madre_crianza:
      cordero.madre_crianza_id !== null && cordero.nodriza_caravana !== null
        ? { id: cordero.madre_crianza_id, caravana: cordero.nodriza_caravana }
        : null,
    observaciones: cordero.observaciones ?? '',
  };

  async function guardar(editado: BorradorCordero) {
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'corderos',
          cordero.id,
          {
            sexo: editado.sexo,
            condicion: editado.condicion,
            peso_kg: editado.peso_kg,
            collar_marca: editado.collar_marca,
            // Con el nacimiento fijo el estado no se toca; si no, lo dicta cómo
            // nació: muerto al nacer no pasa por señalada (R5).
            estado:
              nacimientoFijo !== undefined
                ? cordero.estado
                : editado.condicion === 'muerto'
                  ? 'muerto'
                  : 'nacido',
            causa_muerte: editado.causa_muerte,
            fecha_muerte: editado.fecha_muerte,
            madre_tipo: editado.madre_crianza === null ? 'biologica' : 'nodriza',
            madre_crianza_id: editado.madre_crianza?.id ?? null,
            observaciones: editado.observaciones === '' ? null : editado.observaciones,
          },
          usuarioId,
        );
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el cambio.');
    }
  }

  const activos = hermanos.filter((h) => h.anulado_en === null);

  return (
    <>
      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}
      <FormularioCordero
        inicial={inicial}
        titulo="Editar cordero"
        esMultiple={activos.length >= 2}
        fechaParto={cordero.parto_fecha}
        madreBiologicaId={cordero.oveja_id}
        collarNumero={cordero.collar_numero}
        numerosUsados={[]}
        ocupadas={marcasOcupadas(activos, cordero.id)}
        nacimientoFijo={nacimientoFijo}
        onGuardar={guardar}
        onCancelar={onListo}
      />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// R8 — Registrar la muerte
// ───────────────────────────────────────────────────────────────────────

function RegistrarMuerte({
  cordero,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [fecha, setFecha] = useState(hoyISO());
  const [causa, setCausa] = useState<CausaMuerte | ''>('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validacion = validarFechaMuerte(fecha, cordero.parto_fecha, hoyISO());

  /**
   * En un cordero ya señalado NO se toca `estado`.
   *
   * R8 dice que la muerte de un señalado «perdería el hecho de haberlo sido».
   * Poner `estado = 'muerto'` haría exactamente eso: el tatuaje seguiría en la
   * fila pero el animal dejaría de figurar como señalado, y ese hecho no se
   * recupera. Se escriben la fecha y la causa, y listo — la base lo acepta
   * porque con `condicion = 'vivo'` la primera rama de `muerte_documentada` ya
   * es verdadera. Lo verifica `supabase/tests/senalada.test.sql`.
   *
   * CONSECUENCIA: la mortalidad se cuenta con `fecha_muerte is not null`,
   * nunca con `estado = 'muerto'`.
   */
  const yaSenalado = cordero.estado === 'senalado';

  async function guardar() {
    if (causa === '') return;
    setGuardando(true);
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'corderos',
          cordero.id,
          yaSenalado
            ? { fecha_muerte: fecha, causa_muerte: causa }
            : { estado: 'muerto', fecha_muerte: fecha, causa_muerte: causa },
          usuarioId,
        );
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo registrar la muerte.');
      setGuardando(false);
    }
  }

  return (
    <>
      <h1 className="titulo">¿Qué le pasó?</h1>
      <p className="subtitulo">
        {sexoLegible(cordero.sexo)} de <Caravana numero={cordero.caravana} /> · nacido el{' '}
        {fechaLarga(cordero.parto_fecha)}
      </p>

      {yaSenalado && (
        <p className="aviso">
          Sigue figurando como señalado, con su tatuaje {cordero.tatuaje ?? ''}. Se le agrega que
          murió, no se le quita el haber sido señalado.
        </p>
      )}

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="fecha-muerte">
          Fecha de muerte
        </label>
        <input
          id="fecha-muerte"
          className="entrada"
          type="date"
          value={fecha}
          min={cordero.parto_fecha}
          max={hoyISO()}
          onChange={(e) => setFecha(e.target.value)}
        />
        {!validacion.valida && (
          <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
            {validacion.motivo}
          </p>
        )}
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="causa">
          Motivo
        </label>
        {/* Obligatorio: sin causa no hay análisis de mortalidad, que es una de
            las métricas de la temporada. La lista trae «Sin diagnóstico» para
            cuando de verdad no se sabe. */}
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

      {cordero.collar_numero !== null && (
        <p className="aviso aviso--atencion">
          El collar <strong>{cordero.collar_numero}</strong> sigue asignado a este parto. No vuelve a
          estar disponible hasta la temporada que viene.
        </p>
      )}

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onListo}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal boton--peligroso"
          onClick={guardar}
          disabled={guardando || causa === '' || !validacion.valida}
        >
          {guardando ? 'Guardando…' : 'Registrar muerte'}
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// R10 — Nodriza
// ───────────────────────────────────────────────────────────────────────

function AsignarNodriza({
  cordero,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [error, setError] = useState<string | null>(null);

  async function asignar(oveja: OvejaElegida | null) {
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'corderos',
          cordero.id,
          {
            madre_tipo: oveja === null ? 'biologica' : 'nodriza',
            madre_crianza_id: oveja?.id ?? null,
          },
          usuarioId,
        );
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la nodriza.');
    }
  }

  return (
    <>
      <h1 className="titulo">¿Con qué oveja se cría?</h1>
      <p className="subtitulo">
        {sexoLegible(cordero.sexo)} de <Caravana numero={cordero.caravana} /> · nacido el{' '}
        {fechaLarga(cordero.parto_fecha)}
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      {/* R10: el parto sigue siendo de la madre biológica. Es lo que sostiene la
          mellicería y la fertilidad; la nodriza solo dice quién lo está criando.
          Por eso el buscador NO bloquea a las que ya parieron: una nodriza casi
          siempre tiene su propio parto. */}
      <BuscadorCaravana autoFocus excluirId={cordero.oveja_id} onElegir={asignar} />

      <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-4)' }}>
        El parto sigue siendo de la <strong>{cordero.caravana}</strong>. La nodriza solo dice quién
        lo está criando.
      </p>

      {cordero.nodriza_caravana !== null && (
        <button
          type="button"
          className="boton boton--secundario"
          style={{ marginTop: 'var(--sp-3)' }}
          onClick={() => asignar(null)}
        >
          Volver a criarse con su madre
        </button>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Anular
// ───────────────────────────────────────────────────────────────────────

function AnularCordero({
  cordero,
  hermanos,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  hermanos: readonly FilaCorderoGuardado[];
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [motivo, setMotivo] = useState<MotivoAnulacion | null>(null);
  const [collarPuesto, setCollarPuesto] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permiso = puedeAnular(hermanos, cordero.id);
  // Al quedar un solo cordero el collar deja de hacer falta para distinguirlos,
  // pero puede seguir puesto en la oveja. La app no tiene cómo saberlo.
  const quedaUnico = partoQuedaUnico(hermanos, cordero.id);
  const preguntaCollar = quedaUnico && cordero.collar_numero !== null;
  const listo = motivo !== null && (!preguntaCollar || collarPuesto !== null);

  async function anular() {
    if (motivo === null) return;
    setGuardando(true);
    setError(null);

    const hermanoQueQueda = hermanos.find(
      (h) => h.id !== cordero.id && h.anulado_en === null,
    );

    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'corderos',
          cordero.id,
          {
            anulado_en: new Date().toISOString(),
            anulado_por: usuarioId,
            anulado_motivo: motivo,
          },
          usuarioId,
        );

        // Si nadie lleva el collar puesto, el registro deja de decir que sí. El
        // NÚMERO queda reservado igual: R3 mira collar_numero, que no se borra.
        if (preguntaCollar && collarPuesto === false) {
          await actualizar(tx, 'partos', cordero.parto_id, { collar_puesto: 0 }, usuarioId);
          if (hermanoQueQueda !== undefined) {
            await actualizar(
              tx,
              'corderos',
              hermanoQueQueda.id,
              { collar_marca: null },
              usuarioId,
            );
          }
        }
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo anular el cordero.');
      setGuardando(false);
    }
  }

  if (!permiso.puede) {
    return (
      <>
        <h1 className="titulo">No se puede anular</h1>
        <p className="aviso aviso--atencion">{permiso.motivo}</p>
        <div className="barra-accion">
          <button type="button" className="boton boton--principal" onClick={onListo}>
            Volver
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="titulo">Anular este cordero</h1>
      <p className="subtitulo">
        {sexoLegible(cordero.sexo)} de <Caravana numero={cordero.caravana} /> ·{' '}
        {pesoLegible(cordero.peso_kg)}
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <p className="aviso aviso--atencion">
        {quedaUnico && 'El parto vuelve a ser único. '}
        El cordero queda registrado como anulado, con tu nombre y la hora. No se borra: sigue
        visible en la ficha del parto.
      </p>

      <div className="campo">
        <span className="etiqueta">Por qué</span>
        <div className="motivos">
          {MOTIVOS_ANULACION.map((m) => (
            <button
              key={m.valor}
              type="button"
              className="motivo"
              aria-pressed={motivo === m.valor}
              onClick={() => setMotivo(m.valor)}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {preguntaCollar && (
        <div className="campo">
          <span className="etiqueta">¿La {cordero.caravana} tiene el collar puesto?</span>
          <div className="collar-asignado" style={{ marginBottom: 'var(--sp-3)' }}>
            <b>{cordero.collar_numero}</b>
            <small>
              Con un solo cordero el collar deja de hacer falta
              <br />
              para distinguirlos.
            </small>
          </div>
          <div className="opciones">
            <button
              type="button"
              className="opcion"
              aria-pressed={collarPuesto === true}
              onClick={() => setCollarPuesto(true)}
            >
              Sí, lo tiene
            </button>
            <button
              type="button"
              className="opcion"
              aria-pressed={collarPuesto === false}
              onClick={() => setCollarPuesto(false)}
            >
              No lo tiene
            </button>
          </div>
          <p className="nota-boton" style={{ marginTop: 'var(--sp-2)' }}>
            Digas lo que digas, el número {cordero.collar_numero} no vuelve a la lista de collares
            disponibles hasta la temporada que viene.
          </p>
        </div>
      )}

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onListo}>
          Volver
        </button>
        <button
          type="button"
          className="boton boton--principal boton--peligroso"
          onClick={anular}
          disabled={guardando || !listo}
        >
          {guardando ? 'Anulando…' : 'Anular cordero'}
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Lo que solo se puede arreglar desde la web
// ───────────────────────────────────────────────────────────────────────

/**
 * Corregir la fecha de la señalada.
 *
 * En el campo no se pide: es siempre hoy, y un control más por cordero,
 * seiscientas veces, para un dato que en la práctica nunca difiere (R11). Pero
 * «nunca» no es «jamás» —una tanda cargada al otro día, un aparato con el reloj
 * corrido— y entonces hay que poder arreglarla desde algún lado.
 */
function CorregirFechaSenalada({
  cordero,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [fecha, setFecha] = useState(cordero.fecha_senalada ?? hoyISO());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validacion = validarFechaSenalada(fecha, cordero.parto_fecha, hoyISO());

  async function guardar() {
    if (validacion.estado === 'bloqueo') return;
    setGuardando(true);
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(tx, 'corderos', cordero.id, { fecha_senalada: fecha }, usuarioId);
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la corrección.');
      setGuardando(false);
    }
  }

  return (
    <>
      <h1 className="titulo">Corregir la señalada</h1>
      <p className="subtitulo">
        Tatuaje {cordero.tatuaje ?? '—'} · madre <Caravana numero={cordero.caravana} /> · nació el{' '}
        {fechaLarga(cordero.parto_fecha)}
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="fecha-senalada">
          Fecha de la señalada
        </label>
        <input
          id="fecha-senalada"
          className="entrada"
          type="date"
          value={fecha}
          min={cordero.parto_fecha}
          max={hoyISO()}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      {/* Aviso y bloqueo se ven distintos porque significan cosas distintas:
          uno pide mirar, el otro no deja pasar. */}
      {validacion.estado !== 'ok' && (
        <p
          className={validacion.estado === 'bloqueo' ? 'aviso aviso--error' : 'aviso aviso--atencion'}
          role={validacion.estado === 'bloqueo' ? 'alert' : undefined}
        >
          {validacion.mensaje}
        </p>
      )}

      <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
        <button
          type="button"
          className="boton boton--principal"
          onClick={() => void guardar()}
          disabled={guardando || validacion.estado === 'bloqueo'}
        >
          Guardar la corrección
        </button>
        <button type="button" className="boton boton--texto" onClick={onListo}>
          Cancelar
        </button>
      </div>

      <p className="nota-boton">
        Queda registrado en el historial: <b>fecha_senalada</b>, el valor anterior y el nuevo, tu
        nombre y este navegador.
      </p>
    </>
  );
}

/**
 * Deshacer una anulación.
 *
 * La anulación es para el error de carga (R13), y equivocarse anulando es un
 * error de carga más. Son los tres campos a NULL, que `anulacion_completa`
 * acepta porque la restricción pide que vayan los tres juntos o ninguno.
 */
function DesanularCordero({
  cordero,
  onListo,
}: {
  cordero: FilaCorderoFicha;
  onListo: () => void;
}) {
  const usuarioId = useUsuarioId();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await db.writeTransaction(async (tx) => {
        await actualizar(
          tx,
          'corderos',
          cordero.id,
          { anulado_en: null, anulado_por: null, anulado_motivo: null },
          usuarioId,
        );
      });
      onListo();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo deshacer la anulación.');
      setGuardando(false);
    }
  }

  return (
    <>
      <h1 className="titulo">Deshacer la anulación</h1>
      <p className="subtitulo">
        {sexoLegible(cordero.sexo)} de <Caravana numero={cordero.caravana} /> · nacido el{' '}
        {fechaLarga(cordero.parto_fecha)}
      </p>

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <p className="aviso">
        Vuelve a contar para el tipo de nacimiento y para la señalada, y su marca de collar vuelve a
        estar ocupada dentro del parto.
      </p>

      <div style={{ display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
        <button
          type="button"
          className="boton boton--principal"
          onClick={() => void guardar()}
          disabled={guardando}
        >
          Deshacer la anulación
        </button>
        <button type="button" className="boton boton--texto" onClick={onListo}>
          Cancelar
        </button>
      </div>
    </>
  );
}
