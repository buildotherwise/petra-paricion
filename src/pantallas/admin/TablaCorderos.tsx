import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { Tabla, type Columna } from '../../componentes/admin/Tabla';
import { Filtro, Limpiar } from '../../componentes/admin/Filtros';
import { Caravana } from '../../componentes/Caravana';
import { entorno } from '../../lib/entorno';
import { buscarPorCaravanaOCollar } from '../../lib/busqueda';
// El peso va sin unidad: la columna ya se llama «Peso» y repetir «kg» en mil
// doscientas filas es ruido. Por eso no se usa `pesoLegible`, que sí
// corresponde en las fichas, donde el número está suelto en una oración.
import { causaLegible, sexoLegible } from '../../componentes/FilaCordero';
import { diaCorto, diasDesde, nombreMarca } from '../../lib/parto';
import type { MarcaCollar } from '../../lib/reglas';

/**
 * Todos los corderos de la temporada.
 *
 * Es la tabla que justifica la fase: 138 corderos hoy, más de mil al cerrar la
 * temporada, y el único lugar donde se pueden comparar pesos y fenotipos de
 * corriente. La ficha contesta «este cordero»; esto contesta «cuáles».
 *
 * Los anulados aparecen, tachados. Un anulado no cuenta para nada (R13) pero
 * sigue existiendo y hay que poder encontrarlo — esconderlo sería la única
 * forma de que alguien lo cargue dos veces.
 */

let ultimaConsulta = '';
let ultimosFiltros = { estado: '', sexo: '', tipo: '' };

interface FilaCordero {
  id: string;
  parto_id: string;
  tatuaje: string | null;
  caravana: string;
  collar_numero: string | null;
  fecha: string;
  sexo: string;
  condicion: string;
  peso_kg: number | null;
  collar_marca: MarcaCollar | null;
  estado: string;
  anulado_en: string | null;
  fecha_muerte: string | null;
  causa_muerte: string | null;
  sexo_discrepancia: number;
  observaciones: string | null;
  /** Hermanos que cuentan, para leer un peso bajo en su contexto (R7). */
  del_parto: number;
}

const ESTADOS = [
  { valor: 'nacido', etiqueta: 'Sin señalar' },
  { valor: 'senalado', etiqueta: 'Señalados' },
  { valor: 'muerto', etiqueta: 'Muertos' },
  { valor: 'anulado', etiqueta: 'Anulados' },
];

const SEXOS = [
  { valor: 'macho', etiqueta: 'Machos' },
  { valor: 'hembra', etiqueta: 'Hembras' },
];

const TIPOS = [
  { valor: 'unico', etiqueta: 'Únicos' },
  { valor: 'multiple', etiqueta: 'Mellizos y trillizos' },
];

export function TablaCorderos({ onAbrir }: { onAbrir: (corderoId: string) => void }) {
  const [consulta, setConsultaLocal] = useState(ultimaConsulta);
  const [filtros, setFiltrosLocal] = useState(ultimosFiltros);
  const sincronizacion = useStatus();

  const setConsulta = (texto: string) => {
    ultimaConsulta = texto;
    setConsultaLocal(texto);
  };
  const setFiltros = (nuevos: typeof filtros) => {
    ultimosFiltros = nuevos;
    setFiltrosLocal(nuevos);
  };

  const { data: corderos } = useQuery<FilaCordero>(
    `SELECT c.id, c.parto_id, c.tatuaje, o.caravana, p.collar_numero, p.fecha,
            c.sexo, c.condicion, c.peso_kg, c.collar_marca, c.estado,
            c.anulado_en, c.fecha_muerte, c.causa_muerte, c.sexo_discrepancia,
            c.observaciones,
            (SELECT count() FROM corderos h
              WHERE h.parto_id = c.parto_id AND h.anulado_en IS NULL) AS del_parto
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE c.temporada = ?
      ORDER BY p.fecha DESC, o.caravana, c.creado_en`,
    [entorno.temporada],
  );

  const buscando = consulta.trim() !== '';
  const hayFiltros = filtros.estado !== '' || filtros.sexo !== '' || filtros.tipo !== '';

  const filtrados = useMemo(() => {
    // Lo estable se resolvería en SQL, pero acá los tres filtros son de estado
    // derivado —«anulado» no es un valor de `estado`, y «múltiple» sale de
    // contar hermanos— así que se hacen en memoria sobre las mismas filas. Con
    // mil doscientas es gratis, y evita cuatro consultas distintas.
    const porFiltros = corderos.filter((c) => {
      if (filtros.estado === 'anulado' && c.anulado_en === null) return false;
      if (filtros.estado !== '' && filtros.estado !== 'anulado') {
        if (c.anulado_en !== null || c.estado !== filtros.estado) return false;
      }
      if (filtros.sexo !== '' && c.sexo !== filtros.sexo) return false;
      if (filtros.tipo === 'unico' && c.del_parto !== 1) return false;
      if (filtros.tipo === 'multiple' && c.del_parto < 2) return false;
      return true;
    });

    if (!buscando) return porFiltros;

    // El tatuaje también busca: para un cordero señalado es su nombre, y es lo
    // que se tiene escrito en el papel del genetista.
    const porTatuaje = porFiltros.filter(
      (c) => c.tatuaje !== null && c.tatuaje.includes(consulta.trim()),
    );
    const porMadre = buscarPorCaravanaOCollar(porFiltros, consulta);
    const vistos = new Set(porMadre.map((c) => c.id));
    return [...porMadre, ...porTatuaje.filter((c) => !vistos.has(c.id))];
  }, [corderos, consulta, buscando, filtros]);

  const columnas: readonly Columna<FilaCordero>[] = [
    {
      clave: 'tatuaje',
      titulo: 'Tatuaje',
      orden: (c) => c.tatuaje,
      celda: (c) =>
        c.tatuaje !== null ? (
          <span className="tatuaje">{c.tatuaje}</span>
        ) : (
          <span className="apagado">—</span>
        ),
    },
    {
      clave: 'madre',
      titulo: 'Madre',
      orden: (c) => c.caravana,
      celda: (c) => <Caravana numero={c.caravana} />,
    },
    { clave: 'fecha', titulo: 'Nació', orden: (c) => c.fecha, celda: (c) => diaCorto(c.fecha) },
    { clave: 'sexo', titulo: 'Sexo', orden: (c) => c.sexo, celda: (c) => sexoLegible(c.sexo) },
    {
      clave: 'peso',
      titulo: 'Peso',
      tipo: 'numero',
      orden: (c) => c.peso_kg,
      celda: (c) =>
        c.peso_kg === null ? (
          <span className="apagado">—</span>
        ) : (
          c.peso_kg.toFixed(2).replace('.', ',')
        ),
    },
    {
      clave: 'marca',
      titulo: 'Marca',
      orden: (c) => c.collar_marca,
      celda: (c) =>
        c.collar_marca !== null ? nombreMarca(c.collar_marca) : <span className="apagado">—</span>,
    },
    { clave: 'estado', titulo: 'Estado', orden: (c) => ordenDeEstado(c), celda: (c) => chip(c) },
    {
      clave: 'dias',
      titulo: 'Días',
      tipo: 'numero',
      // Un anulado no tiene edad: no es un animal, es una carga de más.
      orden: (c) => (c.anulado_en !== null ? null : diasDesde(c.fecha)),
      celda: (c) =>
        c.anulado_en !== null ? <span className="apagado">—</span> : diasDesde(c.fecha),
    },
    {
      clave: 'observaciones',
      titulo: 'Observaciones',
      orden: (c) => c.observaciones,
      celda: (c) => <span className="apagado">{observacion(c)}</span>,
    },
  ];

  return (
    <>
      <div className="admin-filtros">
        <input
          type="search"
          className="admin-buscar"
          placeholder="Buscar caravana, collar o tatuaje…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar por caravana, collar o tatuaje"
        />
        <Filtro
          etiqueta="Estado"
          valor={filtros.estado}
          opciones={ESTADOS}
          onCambiar={(estado) => setFiltros({ ...filtros, estado })}
        />
        <Filtro
          etiqueta="Sexo"
          valor={filtros.sexo}
          opciones={SEXOS}
          onCambiar={(sexo) => setFiltros({ ...filtros, sexo })}
        />
        <Filtro
          etiqueta="Tipo de parto"
          valor={filtros.tipo}
          opciones={TIPOS}
          onCambiar={(tipo) => setFiltros({ ...filtros, tipo })}
        />
        <Limpiar
          visible={hayFiltros || buscando}
          onLimpiar={() => {
            setFiltros({ estado: '', sexo: '', tipo: '' });
            setConsulta('');
          }}
        />
        <span className="admin-conteo">
          {hayFiltros || buscando
            ? `${filtrados.length} de ${corderos.length} corderos`
            : `${corderos.length} corderos`}
        </span>
      </div>

      <Tabla
        filas={filtrados}
        columnas={columnas}
        claveDe={(c) => c.id}
        onAbrir={(c) => onAbrir(c.id)}
        cargando={!sincronizacion.hasSynced && corderos.length === 0}
        vacia={
          hayFiltros || buscando
            ? 'Ningún cordero coincide con lo que está puesto.'
            : 'Todavía no hay corderos cargados en la temporada.'
        }
        ordenInicial={{ clave: 'fecha', direccion: 'desc' }}
      />
    </>
  );
}

/**
 * El chip de estado.
 *
 * No usa `chipDelCordero` de la ficha porque ahí el chip convive con una línea
 * de detalle que cuenta el resto; en una tabla la columna tiene que decirlo
 * sola, y son cinco estados y no dos. «Muerto al nacer» y «murió después» son
 * cosas distintas —lo primero es `condicion`, lo segundo `estado`— y separarlas
 * es la mitad del análisis de mortalidad.
 */
function chip(c: FilaCordero): ReactNode {
  if (c.anulado_en !== null) return <span className="chip chip--anulado">Anulado</span>;
  if (c.condicion === 'muerto') return <span className="chip chip--muerto">Muerto al nacer</span>;
  if (c.estado === 'muerto') return <span className="chip chip--muerto">Murió después</span>;
  if (c.estado === 'senalado') {
    return (
      <>
        <span className="chip chip--senalado">Señalado</span>
        {/* R6: el caso que hay que poder encontrar sin ir al panel. */}
        {c.sexo_discrepancia === 1 && <span className="chip chip--pendiente">Sexo</span>}
      </>
    );
  }
  return <span className="chip chip--pendiente">Sin señalar</span>;
}

/** Para ordenar la columna: de lo que falta hacer a lo que ya no existe. */
function ordenDeEstado(c: FilaCordero): number {
  if (c.anulado_en !== null) return 5;
  if (c.condicion === 'muerto') return 4;
  if (c.estado === 'muerto') return 3;
  if (c.estado === 'senalado') return 2;
  return 1;
}

/** La observación propia, o la causa de muerte si no hay ninguna. */
function observacion(c: FilaCordero): string {
  if (c.observaciones !== null && c.observaciones.trim() !== '') return c.observaciones;
  return causaLegible(c.causa_muerte) ?? '';
}
