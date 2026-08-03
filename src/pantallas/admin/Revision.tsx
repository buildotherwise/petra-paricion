import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@powersync/react';
import { Caravana } from '../../componentes/Caravana';
import { entorno } from '../../lib/entorno';
import { buscarCaravana } from '../../lib/busqueda';
import { nombreMarca } from '../FichaParto';
import { antiguedad, diaCorto, fechaLarga, nombreTipo } from '../../lib/parto';
import { sexoLegible } from '../../componentes/FilaCordero';
import {
  collaresDuplicados,
  DIAS_SIN_SENALAR_PARA_REVISAR,
  hoyISO,
  marcasDuplicadasEnParto,
  PESO_AVISO_MAX,
  PESO_AVISO_MIN,
  restarDias,
  type MarcaCollar,
} from '../../lib/reglas';
import { Ediciones } from './Ediciones';

/**
 * Ocho preguntas que la temporada tiene que poder contestar.
 *
 * CLAUDE.md §8 pide cinco. Maquetarlo trajo tres más, y una de ellas —«partos
 * sin corderos»— es la más importante del panel: es la única de la que se puede
 * afirmar que no tiene falsos positivos.
 *
 * Lo que hace que un panel así se muera a la semana es gritar. Si «pesos fuera
 * de rango» muestra cuarenta filas el primer día, nadie lo abre más. Por eso
 * cada fila trae **el contexto que la vuelve accionable** y no solo el dato que
 * la disparó: al lado de un peso de 2,1 kg va «trillizos», porque 2,1 en
 * trillizos es normal y en un único no lo es.
 *
 * Y por eso el cero se muestra. Una tarjeta que dice «0 · Ninguno ✓» es una
 * respuesta; una lista vacía parece una consulta rota.
 *
 * Las ocho salen de la réplica local. Lo único que se pide por internet es el
 * feed de ediciones, al pie.
 */

interface FilaParto {
  id: string;
  caravana: string;
  fecha: string;
  collar_numero: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
  corderos: number;
}

interface FilaCordero {
  id: string;
  parto_id: string;
  caravana: string;
  fecha: string;
  collar_numero: string | null;
  collar_marca: MarcaCollar | null;
  sexo: string;
  peso_kg: number | null;
  estado: string;
  condicion: string;
  anulado_en: string | null;
  tatuaje: string | null;
  fecha_senalada: string | null;
  sexo_discrepancia: number;
  del_parto: number;
}

interface FilaOveja {
  id: string;
  caravana: string;
  observaciones: string | null;
  creado_en: string;
  cargada_por: string | null;
  tiene_parto: number;
}

/** Una fila del panel: siempre con el contexto que la vuelve accionable. */
interface FilaRevision {
  clave: string;
  chapa: ReactNode;
  principal: string;
  detalle: ReactNode;
  chip?: { texto: string; tono: 'calma' | 'atencion' };
  onAbrir?: () => void;
}

interface Pregunta {
  clave: string;
  titulo: string;
  porque: string;
  filas: FilaRevision[];
}

export function Revision({
  onAbrirParto,
  onAbrirCordero,
}: {
  onAbrirParto: (partoId: string) => void;
  onAbrirCordero: (corderoId: string) => void;
}) {
  const hoy = hoyISO();
  const corte = restarDias(hoy, DIAS_SIN_SENALAR_PARA_REVISAR);

  const { data: partos } = useQuery<FilaParto>(
    `SELECT p.id, o.caravana, p.fecha, p.collar_numero, p.creado_en,
            pf.nombre AS creado_por_nombre,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL) AS corderos
       FROM partos p
       JOIN ovejas o        ON o.id = p.oveja_id
       LEFT JOIN perfiles pf ON pf.id = p.creado_por
      WHERE o.temporada = ?
      ORDER BY p.fecha DESC`,
    [entorno.temporada],
  );

  const { data: corderos } = useQuery<FilaCordero>(
    `SELECT c.id, c.parto_id, o.caravana, p.fecha, p.collar_numero, c.collar_marca,
            c.sexo, c.peso_kg, c.estado, c.condicion, c.anulado_en,
            c.tatuaje, c.fecha_senalada, c.sexo_discrepancia,
            (SELECT count() FROM corderos h
              WHERE h.parto_id = c.parto_id AND h.anulado_en IS NULL) AS del_parto
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE c.temporada = ?
      ORDER BY p.fecha`,
    [entorno.temporada],
  );

  // El índice parcial `ovejas_revision_idx` de la 0001 se hizo a medida de esta
  // consulta. En la réplica no está, pero con 502 filas el escaneo es gratis.
  const { data: ovejas } = useQuery<FilaOveja>(
    `SELECT o.id, o.caravana, o.observaciones, o.creado_en,
            pf.nombre AS cargada_por,
            (SELECT count() FROM partos p WHERE p.oveja_id = o.id) AS tiene_parto
       FROM ovejas o
       LEFT JOIN perfiles pf ON pf.id = o.actualizado_por
      WHERE o.temporada = ? AND o.precargada = 0
      ORDER BY o.creado_en DESC`,
    [entorno.temporada],
  );

  const precargadas = useQuery<{ id: string; caravana: string }>(
    'SELECT id, caravana FROM ovejas WHERE temporada = ? AND precargada = 1',
    [entorno.temporada],
  ).data;

  const preguntas = useMemo<Pregunta[]>(() => {
    const activos = corderos.filter((c) => c.anulado_en === null);

    // 1. Partos sin corderos. La más importante y la única sin falsos
    //    positivos: R13 impide dejar un parto vacío anulando, así que solo
    //    puede ser una carga que el servidor rechazó — el conector descarta la
    //    transacción entera desde la operación que falla, y el parto se inserta
    //    antes que sus corderos.
    const sinCorderos: FilaRevision[] = partos
      .filter((p) => p.corderos === 0)
      .map((p) => ({
        clave: p.id,
        chapa: <Caravana numero={p.caravana} />,
        principal: fechaLarga(p.fecha),
        detalle: `Cargó ${p.creado_por_nombre ?? 'alguien'} · ${antiguedad(p.fecha, hoy)}`,
        onAbrir: () => onAbrirParto(p.id),
      }));

    // 2. Pesos fuera del aviso de R7, con el tipo de parto al lado.
    //
    // Ordenados por cuánto se salen y no por fecha: la tarjeta muestra tres y
    // cuenta el resto, así que cuáles tres importa. Los más extremos son los
    // que hay que mirar; los que rozan el umbral pueden esperar.
    const pesos: FilaRevision[] = activos
      .filter(
        (c) => c.peso_kg !== null && (c.peso_kg < PESO_AVISO_MIN || c.peso_kg > PESO_AVISO_MAX),
      )
      .sort((a, b) => distanciaAlRango(b.peso_kg) - distanciaAlRango(a.peso_kg))
      .map((c) => ({
        clave: c.id,
        chapa: <Caravana numero={c.caravana} />,
        principal: `${c.peso_kg?.toFixed(2).replace('.', ',')} kg · ${sexoLegible(c.sexo).toLowerCase()}`,
        detalle: `${nombreTipo(c.del_parto)} · ${diaCorto(c.fecha)}`,
        // 2,1 kg en trillizos es esperable; en un único no lo es. Sin esta
        // distinción el panel grita en cada parto múltiple.
        chip:
          c.del_parto >= 3 && c.peso_kg !== null && c.peso_kg < PESO_AVISO_MIN
            ? { texto: 'Esperable', tono: 'calma' }
            : { texto: 'Raro', tono: 'atencion' },
        onAbrir: () => onAbrirCordero(c.id),
      }));

    // 3. Altas manuales (R9), con las precargadas parecidas al lado. Sin ese
    //    contraste la lista no sirve: el error real es 0178 contra 178.
    const manuales: FilaRevision[] = ovejas.map((o) => {
      const parecidas = buscarCaravana(precargadas, o.caravana)
        .filter((p) => p.caravana !== o.caravana)
        .slice(0, 3);
      return {
        clave: o.id,
        chapa: <Caravana numero={o.caravana} />,
        principal:
          parecidas.length > 0
            ? `¿Será ${parecidas.map((p) => p.caravana).join(' o ')}?`
            : 'Ninguna precargada se le parece',
        detalle: `Cargó ${o.cargada_por ?? 'alguien'}${o.tiene_parto === 0 ? ' · todavía sin parto' : ''}`,
      };
    });

    // 4. Discrepancias de sexo (R6), con los hermanos: en un múltiple de
    //    distinto sexo casi siempre significa que se tatuó al equivocado.
    const discrepancias: FilaRevision[] = activos
      .filter((c) => c.sexo_discrepancia === 1)
      .map((c) => {
        const hermanos = activos.filter((h) => h.parto_id === c.parto_id && h.id !== c.id);
        return {
          clave: c.id,
          chapa: <Caravana numero={c.caravana} />,
          principal: `Tatuaje ${c.tatuaje ?? '—'} · se señaló ${sexoLegible(c.sexo).toLowerCase()}`,
          detalle:
            hermanos.length === 0
              ? 'Parto único: no hay hermano con quien confundirse'
              : `Hermanos: ${hermanos
                  .map((h) => `${h.tatuaje ?? 'sin tatuaje'} ${sexoLegible(h.sexo).toLowerCase()}`)
                  .join(' · ')}`,
          onAbrir: () => onAbrirCordero(c.id),
        };
      });

    // 5. Sin señalar y viejos. El collar sigue puesto en la madre y en los
    //    hermanos hasta que alguien lo saque.
    const atrasados: FilaRevision[] = activos
      .filter((c) => c.estado === 'nacido' && c.fecha <= corte)
      .map((c) => ({
        clave: c.id,
        chapa: <Caravana numero={c.caravana} />,
        principal: `${sexoLegible(c.sexo)} · ${antiguedad(c.fecha, hoy)}`,
        detalle: `Nació el ${fechaLarga(c.fecha)}${
          c.collar_numero !== null ? ` · collar ${c.collar_numero}` : ''
        }`,
        onAbrir: () => onAbrirCordero(c.id),
      }));

    // 6. Collares duplicados (R3), normalizando el número.
    const collares: FilaRevision[] = collaresDuplicados(partos).map((grupo) => ({
      clave: grupo.numero,
      chapa: <span className="collar-chapa">{grupo.numero}</span>,
      principal: `En ${grupo.partos.length} partos`,
      detalle: grupo.partos.map((p) => p.caravana).join(' · '),
      onAbrir: () => {
        const primero = grupo.partos[0];
        if (primero !== undefined) onAbrirParto(primero.id);
      },
    }));

    // 7. Marcas repetidas dentro de un parto.
    const marcas: FilaRevision[] = marcasDuplicadasEnParto(corderos).map((grupo) => {
      const alguno = grupo.corderos[0];
      return {
        clave: `${grupo.partoId}:${grupo.marca}`,
        chapa: <Caravana numero={alguno?.caravana ?? '—'} />,
        principal: `${grupo.corderos.length} hermanos con «${nombreMarca(grupo.marca)}»`,
        detalle: 'No se pueden distinguir entre sí hasta que se corrija',
        onAbrir: () => onAbrirParto(grupo.partoId),
      };
    });

    // 8. Fechas de señalada imposibles. La contracara de habilitar su edición
    //    (§08), y de paso caza aparatos con el reloj mal.
    const fechas: FilaRevision[] = activos
      .filter(
        (c) =>
          c.estado === 'senalado' &&
          c.fecha_senalada !== null &&
          (c.fecha_senalada < c.fecha || c.fecha_senalada > hoy),
      )
      .map((c) => ({
        clave: c.id,
        chapa: <Caravana numero={c.caravana} />,
        principal: `Tatuaje ${c.tatuaje ?? '—'} · señalado el ${fechaLarga(c.fecha_senalada ?? '')}`,
        detalle: `El parto fue el ${fechaLarga(c.fecha)}`,
        onAbrir: () => onAbrirCordero(c.id),
      }));

    return [
      {
        clave: 'sin-corderos',
        titulo: 'Partos sin corderos',
        porque:
          'Alguien vio parir a la oveja. Si no hay corderos, el servidor rechazó la carga y quedaron en el aparato.',
        filas: sinCorderos,
      },
      {
        clave: 'pesos',
        titulo: 'Pesos fuera de rango',
        porque: `Aviso de R7: fuera de ${PESO_AVISO_MIN.toFixed(1).replace('.', ',')}–${PESO_AVISO_MAX.toFixed(1).replace('.', ',')} kg. El tipo de parto va al lado.`,
        filas: pesos,
      },
      {
        clave: 'manuales',
        titulo: 'Ovejas de alta manual',
        porque: 'R9. Al lado, las precargadas parecidas: el error real es 0178 contra 178.',
        filas: manuales,
      },
      {
        clave: 'sexo',
        titulo: 'Discrepancias de sexo',
        porque:
          'R6. En un múltiple de distinto sexo casi siempre significa que se tatuó al hermano equivocado.',
        filas: discrepancias,
      },
      {
        clave: 'atrasados',
        titulo: `Sin señalar, más de ${DIAS_SIN_SENALAR_PARA_REVISAR} ${
          DIAS_SIN_SENALAR_PARA_REVISAR === 1 ? 'día' : 'días'
        }`,
        porque: 'El collar sigue puesto en la madre y en los hermanos hasta que alguien lo saque.',
        filas: atrasados,
      },
      {
        clave: 'collares',
        titulo: 'Collares duplicados',
        porque: 'R3. El agrupado normaliza: «12» y «012» son el mismo collar.',
        filas: collares,
      },
      {
        clave: 'marcas',
        titulo: 'Marcas repetidas en un parto',
        porque:
          'La app lo valida, pero dos aparatos sin señal pueden agregarle un cordero al mismo parto.',
        filas: marcas,
      },
      {
        clave: 'fechas',
        titulo: 'Fechas de señalada imposibles',
        porque: 'Anterior al parto o futura. También caza aparatos con el reloj mal.',
        filas: fechas,
      },
    ];
  }, [partos, corderos, ovejas, precargadas, hoy, corte, onAbrirParto, onAbrirCordero]);

  const conTrabajo = preguntas.filter((p) => p.filas.length > 0);
  const limpias = preguntas.filter((p) => p.filas.length === 0);
  const total = conTrabajo.reduce((n, p) => n + p.filas.length, 0);

  return (
    <>
      <p className="admin-bajada" style={{ marginTop: 'calc(var(--sp-4) * -1)' }}>
        Ocho preguntas ·{' '}
        {total === 0
          ? 'nada para mirar hoy'
          : `${total} ${total === 1 ? 'cosa' : 'cosas'} para mirar hoy`}
      </p>

      {conTrabajo.length > 0 && (
        <div className="admin-revision">
          {conTrabajo.map((pregunta) => (
            <Tarjeta key={pregunta.clave} pregunta={pregunta} />
          ))}
        </div>
      )}

      {limpias.length > 0 && (
        <>
          <p className="admin-etiqueta">Sin novedad hoy</p>
          <div className="admin-revision admin-revision--limpio">
            {limpias.map((pregunta) => (
              <div key={pregunta.clave} className="admin-rev admin-rev--ok">
                <div className="cabeza">
                  <span className="cifra">0</span>
                  <span className="que">
                    {pregunta.titulo}
                    <span className="tilde">Ninguno ✓</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 'var(--sp-6)' }}>
        <Ediciones />
      </div>
    </>
  );
}

/** Cuánto se sale un peso del rango de aviso. 0 si está adentro. */
function distanciaAlRango(peso: number | null): number {
  if (peso === null) return 0;
  if (peso < PESO_AVISO_MIN) return PESO_AVISO_MIN - peso;
  if (peso > PESO_AVISO_MAX) return peso - PESO_AVISO_MAX;
  return 0;
}

function Tarjeta({ pregunta }: { pregunta: Pregunta }) {
  // Tres filas y el resto se cuenta. Una tarjeta que crece sin techo empuja a
  // las otras siete fuera de la pantalla, que es lo que el panel viene a evitar.
  const visibles = pregunta.filas.slice(0, 3);
  const resto = pregunta.filas.length - visibles.length;

  return (
    <div className="admin-rev">
      <div className="cabeza">
        <span className="cifra">{pregunta.filas.length}</span>
        <span className="que">{pregunta.titulo}</span>
      </div>
      <p className="porque">{pregunta.porque}</p>

      {visibles.map((fila) => {
        const contenido = (
          <>
            {fila.chapa}
            <span className="crece">
              <b>{fila.principal}</b>
              <small>{fila.detalle}</small>
            </span>
            {fila.chip !== undefined && (
              <span className={`chip chip--${fila.chip.tono}`}>{fila.chip.texto}</span>
            )}
          </>
        );
        return fila.onAbrir !== undefined ? (
          <button key={fila.clave} type="button" className="fila-rev" onClick={fila.onAbrir}>
            {contenido}
          </button>
        ) : (
          <div key={fila.clave} className="fila-rev">
            {contenido}
          </div>
        );
      })}

      {resto > 0 && <p className="resto">y {resto} más</p>}
    </div>
  );
}
