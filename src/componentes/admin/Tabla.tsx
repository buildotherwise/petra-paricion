import { useMemo, useState, type ReactNode } from 'react';

/**
 * La tabla de la web admin.
 *
 * La app de campo no tiene ninguna: todo son listas de tarjetas, porque una
 * tarjeta se toca con el pulgar y una celda no. En escritorio la relación se
 * invierte — lo que se busca es COMPARAR filas, y para eso las cifras tienen
 * que quedar una debajo de la otra. Ese es el argumento, no la cantidad de
 * filas visibles.
 *
 * Sin paginado, sin virtualización y sin librería. La escala manda: 502 ovejas,
 * unos 700 partos y a lo sumo 1200 corderos por temporada, leídos de SQLite
 * local, donde ordenar no cuesta nada. TanStack Table serían cuarenta
 * kilobytes para ordenar mil doscientas filas.
 *
 * Es presentacional a propósito: no consulta nada. Cada pantalla sigue siendo
 * dueña de su SQL, como el resto del repo.
 */

export interface Columna<T> {
  clave: string;
  titulo: string;
  /** Cómo se ve. Sin esto se muestra el valor crudo de `orden`. */
  celda?: (fila: T) => ReactNode;
  /** Por qué se ordena. Sin esto, la columna no ordena. */
  orden?: (fila: T) => string | number | null;
  /** `numero` alinea a la derecha y hereda las cifras tabulares de tokens.css. */
  tipo?: 'texto' | 'numero';
  ancho?: string;
}

type Direccion = 'asc' | 'desc';

export function Tabla<T>({
  filas,
  columnas,
  claveDe,
  onAbrir,
  vacia,
  cargando = false,
  ordenInicial,
}: {
  filas: readonly T[];
  columnas: readonly Columna<T>[];
  claveDe: (fila: T) => string;
  onAbrir?: (fila: T) => void;
  /** Qué decir cuando no hay filas. Nunca es lo mismo que «cargando». */
  vacia: string;
  /**
   * Una réplica que todavía no bajó NO es una tabla vacía.
   *
   * Si en ese hueco la tabla dijera «no hay resultados», eso se lee como
   * pérdida de datos — que es el peor error que esta pantalla puede cometer.
   */
  cargando?: boolean;
  ordenInicial?: { clave: string; direccion: Direccion };
}) {
  const [orden, setOrden] = useState<{ clave: string; direccion: Direccion } | null>(
    ordenInicial ?? null,
  );

  const ordenadas = useMemo(() => {
    if (orden === null) return filas;

    const columna = columnas.find((c) => c.clave === orden.clave);
    const extraer = columna?.orden;
    if (extraer === undefined) return filas;

    const signo = orden.direccion === 'asc' ? 1 : -1;

    // `sort` es estable desde ES2019, así que las filas que empatan conservan
    // el orden que traía el SQL. Y los nulos van al final en las DOS
    // direcciones: un peso vacío arriba de todo es ruido en cualquier orden.
    return [...filas].sort((a, b) => {
      const va = extraer(a);
      const vb = extraer(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -signo;
      if (va > vb) return signo;
      return 0;
    });
  }, [filas, columnas, orden]);

  const alternar = (clave: string) => {
    setOrden((previo) =>
      previo?.clave === clave
        ? { clave, direccion: previo.direccion === 'asc' ? 'desc' : 'asc' }
        : { clave, direccion: 'asc' },
    );
  };

  if (cargando) {
    return <p className="admin-espera">Sincronizando la temporada…</p>;
  }

  if (filas.length === 0) {
    return <p className="admin-espera">{vacia}</p>;
  }

  return (
    <div className="admin-tabla-caja">
      <table className="admin-tabla">
        <thead>
          <tr>
            {columnas.map((columna) => {
              const ordenable = columna.orden !== undefined;
              const activa = orden?.clave === columna.clave;
              return (
                <th
                  key={columna.clave}
                  scope="col"
                  className={columna.tipo === 'numero' ? 'der' : undefined}
                  style={columna.ancho !== undefined ? { width: columna.ancho } : undefined}
                  aria-sort={
                    activa ? (orden.direccion === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {ordenable ? (
                    <button type="button" onClick={() => alternar(columna.clave)}>
                      {columna.titulo}
                      <span className="flecha" aria-hidden="true">
                        {activa ? (orden.direccion === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  ) : (
                    columna.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((fila) => (
            <tr
              key={claveDe(fila)}
              className={onAbrir !== undefined ? 'abrible' : undefined}
              onClick={onAbrir !== undefined ? () => onAbrir(fila) : undefined}
            >
              {columnas.map((columna, i) => {
                const contenido = columna.celda?.(fila) ?? columna.orden?.(fila) ?? '';
                return (
                  <td
                    key={columna.clave}
                    className={columna.tipo === 'numero' ? 'der cifra' : undefined}
                  >
                    {/* La fila entera se abre con el mouse, que es lo que se
                        espera en escritorio. Pero un onClick sobre un <tr> no
                        existe para el teclado ni para un lector de pantalla, y
                        ponerle role="button" a una fila rompe la tabla. Así que
                        la primera celda lleva un botón de verdad: el foco tiene
                        dónde pararse y su nombre accesible es la caravana o el
                        tatuaje, que es como se llama esa fila. */}
                    {i === 0 && onAbrir !== undefined ? (
                      <button
                        type="button"
                        className="abrir-fila"
                        onClick={(evento) => {
                          evento.stopPropagation();
                          onAbrir(fila);
                        }}
                      >
                        {contenido}
                      </button>
                    ) : (
                      contenido
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
