/**
 * La caravana, dibujada como la chapa que el operario tiene en la mano.
 *
 * No es decoración: en el campo se compara lo que dice la pantalla contra lo
 * que dice la oreja de la oveja. Que se vean iguales quita un paso de
 * traducción, y ahí es donde nacen los errores de vínculo madre–cordero.
 * El agujero del vástago lo dibuja el ::before en app.css.
 */
export function Caravana({ numero, chica = false }: { numero: string; chica?: boolean }) {
  return <span className={chica ? 'caravana caravana--chica' : 'caravana'}>{numero}</span>;
}
