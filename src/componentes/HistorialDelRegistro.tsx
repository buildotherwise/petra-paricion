import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import {
  historialDeRegistro,
  useConsultaOnline,
  type Cambio,
} from '../lib/consultas-online';
import { CAUSAS_MUERTE, MOTIVOS_ANULACION } from '../lib/reglas';

/**
 * Quién tocó este registro, cuándo y qué cambió.
 *
 * Era la deuda que la Fase 2 dejó escrita: «la tabla `cambios` quedó
 * deliberadamente fuera de la replicación y su lectura es solo para admin.
 * Mostrarla en el teléfono exigiría replicar la auditoría a los cinco
 * dispositivos y abrirle la lectura a todos — dos cambios al modelo de
 * seguridad por una pantalla que es de administración. Va en la web, en la
 * Fase 4.»
 *
 * Una línea por campo, que es exactamente como lo escribe el trigger: un UPDATE
 * de ocho columnas deja ocho filas, y agruparlas sería inventar una transacción
 * que la base no guardó.
 */

export function HistorialDelRegistro({
  tabla,
  registroId,
}: {
  tabla: 'partos' | 'corderos' | 'ovejas';
  registroId: string;
}) {
  const { datos, cargando, error, recargar } = useConsultaOnline<Cambio>(
    historialDeRegistro(tabla, registroId),
    [tabla, registroId],
  );

  // Los nombres se resuelven acá, contra la réplica, y no en la consulta: así
  // el pedido al servidor queda sin joins y funciona igual aunque el perfil de
  // quien hizo el cambio no se pueda leer.
  const { data: perfiles } = useQuery<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM perfiles',
  );
  const nombres = useMemo(
    () => new Map(perfiles.map((p) => [p.id, p.nombre])),
    [perfiles],
  );

  return (
    <section className="historial">
      <p className="etiqueta">Historial de cambios</p>

      {cargando && <p className="historial-nota">Buscando en el servidor…</p>}

      {error !== null && (
        <div className="historial-nota historial-nota--apagada">
          <p>{error}</p>
          <button type="button" className="boton boton--texto" onClick={recargar}>
            Reintentar
          </button>
        </div>
      )}

      {!cargando && error === null && datos.length === 0 && (
        <p className="historial-nota">Sin cambios registrados.</p>
      )}

      {datos.length > 0 && (
        <ul className="historial-lista">
          {datos.map((cambio) => (
            <li key={cambio.id}>
              <span className="cuando">{cuando(cambio.realizado_en)}</span>
              <span className="campo">{nombreDeCampo(cambio.campo)}</span>
              <span className="valor">
                {cambio.tipo === 'creacion' ? (
                  'Se cargó el registro'
                ) : (
                  <>
                    <s>{legible(cambio.campo, cambio.valor_anterior)}</s>
                    {' → '}
                    <b>{legible(cambio.campo, cambio.valor_nuevo)}</b>
                  </>
                )}
              </span>
              <span className="autor">
                {nombres.get(cambio.realizado_por) ?? 'Alguien'}
                {cambio.dispositivo !== null && ` · ${cambio.dispositivo}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="historial-pie">
        Se pide al servidor y no se guarda en este navegador: se lee solo con conexión.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cómo se lee una fila
// ---------------------------------------------------------------------------

function cuando(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })} · ${fecha.toLocaleTimeString(
    'es-UY',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

/**
 * Los nombres de columna se muestran tal cual, en minúscula.
 *
 * Es a propósito: traducirlos a castellano obligaría a mantener un diccionario
 * de treinta entradas que se desactualiza con cada migración, y el que mira
 * este panel es quien tiene el esquema en la cabeza. `sexo_discrepancia` dice
 * más que «Discrepancia de sexo» para quien va a cruzar esto con la base.
 */
function nombreDeCampo(campo: string | null): string {
  return campo ?? 'Creado';
}

/** Los enums sí se traducen: no son nombres de columna, son datos. */
function legible(campo: string | null, valor: string | null): string {
  if (valor === null || valor === '') return '—';
  if (campo === 'causa_muerte') {
    return CAUSAS_MUERTE.find((c) => c.valor === valor)?.etiqueta ?? valor;
  }
  if (campo === 'anulado_motivo') {
    return MOTIVOS_ANULACION.find((m) => m.valor === valor)?.etiqueta ?? valor;
  }
  if (valor === 'true') return 'sí';
  if (valor === 'false') return 'no';
  return valor;
}
