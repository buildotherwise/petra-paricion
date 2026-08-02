import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { db } from '../lib/powersync/db';
import { camposDeLaCarga, motivoLegible, tituloDeLaCarga } from '../lib/rechazos';
import { Dato } from './FichaParto';

/**
 * Lo que el servidor no aceptó.
 *
 * Cuando el rechazo es por un problema del dato, reintentar no sirve: trabaría
 * la cola para siempre y todo lo que se registre después quedaría atrás. La app
 * lo descarta y guarda una copia acá.
 *
 * Esa copia es lo ÚNICO que queda. La réplica local se sincroniza con el
 * servidor, así que cuando el aparato vuelva a bajar datos la fila original
 * también desaparece del teléfono. De ahí que quitar una carga de esta lista sea
 * la única acción de toda la app que pierde datos a propósito, y que la
 * confirmación muestre por última vez lo que se va.
 */

interface FilaRechazo {
  id: string;
  carga_id: string;
  tabla: string;
  registro_id: string;
  codigo: string | null;
  motivo: string;
  caravana: string | null;
  datos: string;
  ocurrido_en: string;
}

/** Una carga rechazada: todas las operaciones que la persona hizo de una vez. */
interface Carga {
  id: string;
  filas: FilaRechazo[];
  principal: FilaRechazo;
}

export function Rechazados({ onVolver }: { onVolver: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const { data: filas } = useQuery<FilaRechazo>(
    `SELECT id, carga_id, tabla, registro_id, codigo, motivo, caravana, datos, ocurrido_en
       FROM subidas_rechazadas
      ORDER BY ocurrido_en DESC`,
  );

  const cargas = agrupar(filas);
  const carga = cargas.find((c) => c.id === abierta);

  async function quitar(id: string) {
    // La tabla es local-only: no pasa por la cola de subida, así que un delete
    // acá no llega nunca al servidor. Es solo apagar el aviso.
    await db.execute('DELETE FROM subidas_rechazadas WHERE carga_id = ?', [id]);
    setConfirmando(false);
    setAbierta(null);
  }

  if (carga !== undefined) {
    return (
      <div className="app">
        <Encabezado
          atras={confirmando ? () => setConfirmando(false) : () => setAbierta(null)}
        />
        <main className="contenido area-segura">
          {confirmando ? (
            <Confirmacion
              carga={carga}
              onQuitar={() => quitar(carga.id)}
              onVolver={() => setConfirmando(false)}
            />
          ) : (
            <Detalle carga={carga} onQuitar={() => setConfirmando(true)} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Encabezado atras={onVolver} />
      <main className="contenido area-segura">
        <h1 className="titulo">Con error</h1>
        <p className="subtitulo">
          {cargas.length === 0
            ? 'No hay ninguna carga rechazada.'
            : 'El servidor no las aceptó. No se van a subir solas.'}
        </p>

        {cargas.map((c) => (
          <button key={c.id} type="button" className="tarjeta tarjeta--tocable" onClick={() => setAbierta(c.id)}>
            <span className="rechazo-encabezado">
              <strong>{tituloDeLaCarga(c.principal.tabla, c.principal.caravana)}</strong>
              <span className="nota">{momento(c.principal.ocurrido_en)}</span>
            </span>
            <span className="nota">{resumenDeLaCarga(c)}</span>
            <span className="aviso aviso--error" style={{ marginBottom: 0 }}>
              {motivoLegible(c.principal.codigo, c.principal.motivo)}
            </span>
            <span className="boton--texto" style={{ alignSelf: 'flex-end' }}>
              Ver qué se perdió ›
            </span>
          </button>
        ))}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function Detalle({ carga, onQuitar }: { carga: Carga; onQuitar: () => void }) {
  return (
    <>
      <h1 className="titulo">{tituloDeLaCarga(carga.principal.tabla, carga.principal.caravana)}</h1>
      <p className="subtitulo">{momento(carga.principal.ocurrido_en)} · no llegó al servidor</p>

      <p className="aviso aviso--error">
        {motivoLegible(carga.principal.codigo, carga.principal.motivo)}
      </p>

      {carga.filas.map((fila) => (
        <div key={fila.id}>
          <p className="etiqueta" style={{ marginTop: 'var(--sp-5)' }}>
            {tituloDeLaCarga(fila.tabla, fila.caravana)}
          </p>
          <div className="tarjeta">
            {camposDeLaCarga(fila.tabla, leer(fila.datos)).map((campo) => (
              <Dato key={campo.etiqueta} etiqueta={campo.etiqueta} valor={campo.valor} />
            ))}
          </div>
        </div>
      ))}

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario boton--riesgo" onClick={onQuitar}>
          Quitar de la lista
        </button>
      </div>
    </>
  );
}

function Confirmacion({
  carga,
  onQuitar,
  onVolver,
}: {
  carga: Carga;
  onQuitar: () => void;
  onVolver: () => void;
}) {
  return (
    <>
      <h1 className="titulo">¿Quitar esta carga?</h1>
      <p className="subtitulo">
        {tituloDeLaCarga(carga.principal.tabla, carga.principal.caravana)} ·{' '}
        {momento(carga.principal.ocurrido_en)}
      </p>

      <span className="etiqueta">Lo que se pierde</span>
      <div className="tarjeta">
        {carga.filas.flatMap((fila) =>
          camposDeLaCarga(fila.tabla, leer(fila.datos)).map((campo) => (
            <Dato key={`${fila.id}-${campo.etiqueta}`} etiqueta={campo.etiqueta} valor={campo.valor} />
          )),
        )}
      </div>

      <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-4)' }}>
        Este registro no está en el servidor ni en este teléfono. Lo único que queda de él es lo que
        ves acá arriba, y al quitarlo también se va.
      </p>
      <p className="aviso aviso--atencion">
        Quitarlo <strong>no lo vuelve a subir</strong>: solo apaga el aviso. Hacelo si el dato ya
        está cargado de otra forma.
      </p>

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onVolver}>
          Volver
        </button>
        <button type="button" className="boton boton--principal boton--peligroso" onClick={onQuitar}>
          Quitar igual
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────

/**
 * Una fila por operación, pero una tarjeta por carga.
 *
 * Un parto de mellizos son tres operaciones de algo que la persona hizo una
 * vez. Mostrarlas por separado repetiría el error que ya se corrigió en el
 * contador de pendientes.
 */
function agrupar(filas: readonly FilaRechazo[]): Carga[] {
  const cargas = new Map<string, FilaRechazo[]>();
  for (const fila of filas) {
    const previas = cargas.get(fila.carga_id);
    if (previas === undefined) cargas.set(fila.carga_id, [fila]);
    else previas.push(fila);
  }

  return [...cargas.entries()].flatMap(([id, propias]) => {
    const principal = propias[0];
    if (principal === undefined) return [];
    return [{ id, filas: propias, principal }];
  });
}

const NOMBRE_OPERACION: Record<string, [string, string]> = {
  partos: ['un parto', 'partos'],
  corderos: ['un cordero', 'corderos'],
  ovejas: ['un alta manual', 'altas manuales'],
};

/** «Un parto y un cordero» — de qué se compone la carga que se perdió. */
function resumenDeLaCarga(carga: Carga): string {
  const cuenta = new Map<string, number>();
  for (const fila of carga.filas) {
    cuenta.set(fila.tabla, (cuenta.get(fila.tabla) ?? 0) + 1);
  }

  const partes = [...cuenta.entries()].map(([tabla, n]) => {
    const nombres = NOMBRE_OPERACION[tabla];
    if (nombres === undefined) return `${n} ${tabla}`;
    return n === 1 ? nombres[0] : `${n} ${nombres[1]}`;
  });

  const texto = partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function leer(datos: string): Record<string, unknown> {
  try {
    const leido: unknown = JSON.parse(datos);
    return typeof leido === 'object' && leido !== null ? (leido as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * '2026-08-01T14:20:00Z' → '1 ago · 14:20'.
 *
 * Hora de 24 en vez del «06:48 p. m.» que devuelve el locale: en el campo se
 * habla en 24 horas, y acá la hora sirve para reconocer cuál de las cargas del
 * día fue la que falló.
 */
function momento(iso: string): string {
  const fecha = new Date(iso);
  const dia = fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }).replace('.', '');
  const hora = fecha.toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dia} · ${hora}`;
}
