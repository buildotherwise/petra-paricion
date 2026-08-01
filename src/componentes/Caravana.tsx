/**
 * La caravana, como la chapa amarilla que cuelga de la oreja.
 *
 * En el campo se compara lo que dice la pantalla contra lo que dice la oreja
 * de la oveja. Que se vean parecidas quita el paso de traducción, que es donde
 * nacen los errores de vínculo madre–cordero.
 */
export function Caravana({ numero, grande = false }: { numero: string; grande?: boolean }) {
  return <span className={grande ? 'caravana caravana--grande' : 'caravana'}>{numero}</span>;
}
