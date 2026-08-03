import { useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { entorno } from '../../lib/entorno';
import { aCSV, descargar, nombreDeArchivo, type ColumnaCSV } from '../../lib/exportacion';
import { IndicadorSync } from '../../componentes/IndicadorSync';

/**
 * La planilla plana de corderos.
 *
 * Una fila por cordero, con todo lo del parto y la madre repetido en cada
 * fila. Eso es lo que permite ordenarla, filtrarla y llevarla a cualquier lado
 * sin tener que explicar el modelo.
 *
 * Se arma en el navegador, desde la misma réplica que la persona está viendo en
 * la tabla. Un export server-side podría diferir de la pantalla, y un archivo
 * que no coincide con lo que se está mirando es peor que no tener archivo.
 */

interface FilaExport {
  cordero_id: string;
  parto_id: string;
  oveja_id: string;
  temporada: number;
  caravana_madre: string;
  fecha_parto: string;
  condicion_corporal_madre: number | null;
  collar_numero: string | null;
  collar_marca: string | null;
  tatuaje: string | null;
  sexo: string;
  condicion_al_nacer: string;
  peso_kg: number | null;
  madre_tipo: string;
  caravana_nodriza: string | null;
  estado: string;
  fecha_senalada: string | null;
  canela_vellon: number | null;
  canela_no_vellon: number | null;
  lunar_vellon: number | null;
  lunar_no_vellon: number | null;
  halo_hair: number | null;
  pigmentacion: number | null;
  entropion: string | null;
  sexo_discrepancia: number;
  fecha_muerte: string | null;
  causa_muerte: string | null;
  observaciones_cordero: string | null;
  observaciones_parto: string | null;
  anulado: number;
  anulado_motivo: string | null;
  creado_en: string;
  creado_por_nombre: string | null;
  actualizado_en: string;
  actualizado_por_nombre: string | null;
  dispositivo: string | null;
}

/**
 * Las veintinueve de la planilla de trabajo.
 *
 * Los códigos van CRUDOS —halo hair 0/1, pigmentación 0–4, las cuatro de canela
 * y lunar— porque esa es literalmente la razón de la continuidad de codificación
 * de §2: traducirlos a «Sí/No» rompe la comparación entre temporadas.
 *
 * Los enums también van con el valor de la base: `punto_arriba`,
 * `sin_diagnostico`, `ojo_derecho`. Son claves, y castellanizarlas con tildes
 * rompe cualquier cruce contra un histórico. El día que aparezca un export real
 * de Zoho para calzar nombres, eso es una tabla de equivalencias y no un
 * rediseño.
 */
const PLANILLA: readonly ColumnaCSV<FilaExport>[] = [
  { clave: 'temporada', valor: (f) => f.temporada },
  { clave: 'caravana_madre', valor: (f) => f.caravana_madre },
  { clave: 'fecha_parto', valor: (f) => f.fecha_parto },
  // R1: se cuenta, nunca se lee de un campo. Lo resuelve la consulta.
  { clave: 'tipo_nacimiento', valor: (f) => (f as FilaExport & { tipo: number }).tipo },
  { clave: 'condicion_corporal_madre', valor: (f) => f.condicion_corporal_madre },
  { clave: 'collar_numero', valor: (f) => f.collar_numero },
  { clave: 'collar_marca', valor: (f) => f.collar_marca },
  { clave: 'tatuaje', valor: (f) => f.tatuaje },
  { clave: 'sexo', valor: (f) => f.sexo },
  { clave: 'condicion_al_nacer', valor: (f) => f.condicion_al_nacer },
  { clave: 'peso_kg', valor: (f) => f.peso_kg },
  { clave: 'madre_tipo', valor: (f) => f.madre_tipo },
  { clave: 'caravana_nodriza', valor: (f) => f.caravana_nodriza },
  { clave: 'estado', valor: (f) => f.estado },
  { clave: 'fecha_senalada', valor: (f) => f.fecha_senalada },
  { clave: 'canela_vellon', valor: (f) => f.canela_vellon },
  { clave: 'canela_no_vellon', valor: (f) => f.canela_no_vellon },
  { clave: 'lunar_vellon', valor: (f) => f.lunar_vellon },
  { clave: 'lunar_no_vellon', valor: (f) => f.lunar_no_vellon },
  { clave: 'halo_hair', valor: (f) => f.halo_hair },
  { clave: 'pigmentacion', valor: (f) => f.pigmentacion },
  { clave: 'entropion', valor: (f) => f.entropion },
  { clave: 'sexo_discrepancia', valor: (f) => f.sexo_discrepancia },
  { clave: 'fecha_muerte', valor: (f) => f.fecha_muerte },
  { clave: 'causa_muerte', valor: (f) => f.causa_muerte },
  { clave: 'observaciones_cordero', valor: (f) => f.observaciones_cordero },
  { clave: 'observaciones_parto', valor: (f) => f.observaciones_parto },
  { clave: 'anulado', valor: (f) => f.anulado },
  { clave: 'anulado_motivo', valor: (f) => f.anulado_motivo },
];

/** El respaldo: lo mismo más lo que hace falta para reconstruir el modelo. */
const COMPLETA: readonly ColumnaCSV<FilaExport>[] = [
  ...PLANILLA,
  { clave: 'cordero_id', valor: (f) => f.cordero_id },
  { clave: 'parto_id', valor: (f) => f.parto_id },
  { clave: 'oveja_id', valor: (f) => f.oveja_id },
  { clave: 'creado_en', valor: (f) => f.creado_en },
  { clave: 'creado_por', valor: (f) => f.creado_por_nombre },
  { clave: 'actualizado_en', valor: (f) => f.actualizado_en },
  { clave: 'actualizado_por', valor: (f) => f.actualizado_por_nombre },
  { clave: 'dispositivo', valor: (f) => f.dispositivo },
];

export function Exportar() {
  const [excluirAnulados, setExcluirAnulados] = useState(true);
  const sincronizacion = useStatus();

  const { data: corderos } = useQuery<FilaExport & { tipo: number }>(
    `SELECT c.id                AS cordero_id,
            c.parto_id, p.oveja_id, c.temporada,
            o.caravana          AS caravana_madre,
            p.fecha             AS fecha_parto,
            p.condicion_corporal AS condicion_corporal_madre,
            p.collar_numero, c.collar_marca, c.tatuaje, c.sexo,
            c.condicion         AS condicion_al_nacer,
            c.peso_kg, c.madre_tipo,
            n.caravana          AS caravana_nodriza,
            c.estado, c.fecha_senalada,
            c.canela_vellon, c.canela_no_vellon, c.lunar_vellon, c.lunar_no_vellon,
            c.halo_hair, c.pigmentacion, c.entropion, c.sexo_discrepancia,
            c.fecha_muerte, c.causa_muerte,
            c.observaciones     AS observaciones_cordero,
            p.observaciones     AS observaciones_parto,
            CASE WHEN c.anulado_en IS NULL THEN 0 ELSE 1 END AS anulado,
            c.anulado_motivo,
            c.creado_en, c.actualizado_en, c.dispositivo,
            cr.nombre           AS creado_por_nombre,
            ac.nombre           AS actualizado_por_nombre,
            -- R1: el tipo de nacimiento se cuenta y los anulados no cuentan.
            (SELECT count() FROM corderos h
              WHERE h.parto_id = c.parto_id AND h.anulado_en IS NULL) AS tipo
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
       LEFT JOIN ovejas   n  ON n.id  = c.madre_crianza_id
       LEFT JOIN perfiles cr ON cr.id = c.creado_por
       LEFT JOIN perfiles ac ON ac.id = c.actualizado_por
      WHERE c.temporada = ?
      ORDER BY p.fecha, o.caravana, c.creado_en`,
    [entorno.temporada],
  );

  const aExportar = excluirAnulados ? corderos.filter((c) => c.anulado === 0) : corderos;

  const bajar = (que: string, columnas: readonly ColumnaCSV<FilaExport>[]) => {
    descargar(
      aCSV(aExportar, columnas),
      nombreDeArchivo(que, entorno.temporada, new Date()),
    );
  };

  return (
    <>
      <div className="admin-exportar">
        <div className="admin-rev">
          <div className="cabeza">
            <span className="que">Planilla de corderos</span>
          </div>
          <p className="porque">
            Una fila por cordero, {PLANILLA.length} columnas. Los códigos van crudos —halo hair 0/1,
            pigmentación 0–4, las cuatro de canela y lunar— para que se pueda comparar contra las
            temporadas de Zoho.
          </p>
          <Casilla
            marcada={excluirAnulados}
            onCambiar={setExcluirAnulados}
            etiqueta="Excluir los corderos anulados"
          />
          <button
            type="button"
            className="boton boton--principal boton--chico"
            onClick={() => bajar('corderos', PLANILLA)}
            disabled={aExportar.length === 0}
          >
            Descargar CSV
          </button>
        </div>

        <div className="admin-rev">
          <div className="cabeza">
            <span className="que">Exportación completa</span>
          </div>
          <p className="porque">
            Lo mismo más los identificadores, las marcas de tiempo, quién cargó cada registro y
            desde qué aparato. Es el respaldo, no la planilla de trabajo.
          </p>
          <Casilla
            marcada={excluirAnulados}
            onCambiar={setExcluirAnulados}
            etiqueta="Excluir los corderos anulados"
          />
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            onClick={() => bajar('completo', COMPLETA)}
            disabled={aExportar.length === 0}
          >
            Descargar CSV
          </button>
        </div>
      </div>

      {/* El archivo dice lo que ESTE navegador tiene sincronizado, y eso hay que
          decirlo al lado del botón y no en la letra chica. */}
      <div className="admin-aviso-export">
        <IndicadorSync />
        <p>
          Exportás <b>lo que este navegador tiene sincronizado</b>:{' '}
          {aExportar.length === corderos.length
            ? `${corderos.length} corderos`
            : `${aExportar.length} de ${corderos.length} corderos`}
          . La fecha y hora del corte van en el nombre del archivo.
        </p>
      </div>

      {!sincronizacion.hasSynced && (
        <p className="admin-espera">Sincronizando la temporada…</p>
      )}
    </>
  );
}

function Casilla({
  marcada,
  etiqueta,
  onCambiar,
}: {
  marcada: boolean;
  etiqueta: string;
  onCambiar: (valor: boolean) => void;
}) {
  return (
    <label className="admin-casilla">
      <input type="checkbox" checked={marcada} onChange={(e) => onCambiar(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}
