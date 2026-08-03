/**
 * La barra de filtros de una tabla.
 *
 * Van sobre la tabla y se ven aplicados. Un filtro escondido en un panel
 * plegado es un filtro que alguien se va a olvidar puesto, y entonces la tabla
 * miente sobre cuántos corderos hay — en la pantalla que existe justamente para
 * saber cuántos hay.
 *
 * Cada filtro es un `<select>` nativo y no una pastilla con menú propio. La
 * maqueta los dibujó como pastillas con una × para sacarlas, y el select las
 * mejora en lo que importaba: **muestra el valor elegido en vez del nombre del
 * filtro**, así que decir «Sin señalar» ya es decir que está puesto y la × pasa
 * a ser redundante con «Limpiar». Además trae gratis el teclado, el lector de
 * pantalla y la rueda nativa del teléfono.
 */

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

export function Filtro({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  /** Qué se está filtrando. Es también la opción «todos». */
  etiqueta: string;
  valor: string;
  opciones: readonly OpcionFiltro[];
  onCambiar: (valor: string) => void;
}) {
  const puesto = valor !== '';
  return (
    <select
      className={puesto ? 'admin-filtro admin-filtro--on' : 'admin-filtro'}
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      aria-label={etiqueta}
    >
      <option value="">{etiqueta}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

/** Solo aparece cuando hay algo que limpiar. */
export function Limpiar({ visible, onLimpiar }: { visible: boolean; onLimpiar: () => void }) {
  if (!visible) return null;
  return (
    <button type="button" className="admin-limpiar" onClick={onLimpiar}>
      Limpiar
    </button>
  );
}
