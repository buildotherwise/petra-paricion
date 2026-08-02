-- ¿La madre sigue con el collar puesto?
--
-- Aparece al anular un cordero de un parto de mellizos: queda un solo cordero y
-- el collar deja de hacer falta para distinguirlos. Pero el collar es un objeto,
-- y la app no puede deducir dónde está. Si el segundo cordero nunca existió, lo
-- más probable es que la madre nunca haya llevado collar; si existió y se cargó
-- mal, el collar está puesto. Solo lo sabe quien está mirando la oveja.
--
-- Por eso se pregunta y se guarda la respuesta, en vez de adivinarla.

alter table partos
  add column collar_puesto boolean not null default true;

comment on column partos.collar_puesto is
  'false = alguien confirmó que el collar ya no está en los animales. El NÚMERO queda reservado igual: se guarda para que la señalada no salga a buscar un collar que nadie lleva.';

-- El número no vuelve a circulación en ninguno de los dos casos. R3 mira
-- `collar_numero`, que no se borra nunca: una vez que un número salió de la caja
-- no se sabe con certeza dónde terminó, y reasignarlo es peor que perderlo.
alter table partos add constraint collar_puesto_necesita_collar check (
  collar_puesto or collar_numero is not null
);

-- La vista expone el dato para que la web pueda listar qué collares siguen en el
-- campo y cuáles ya se recogieron.
drop view partos_resumen;

create view partos_resumen as
select
  p.id,
  p.oveja_id,
  o.caravana,
  o.temporada,
  p.fecha,
  p.condicion_corporal,
  p.collar_numero,
  p.collar_puesto,
  count(c.id) filter (where c.anulado_en is null)                            as tipo_nacimiento,
  count(c.id) filter (where c.anulado_en is null and c.condicion = 'vivo')   as nacidos_vivos,
  count(c.id) filter (where c.anulado_en is null and c.estado = 'senalado')  as senalados,
  count(c.id) filter (where c.anulado_en is null and c.estado = 'nacido')    as pendientes_senalada,
  count(c.id) filter (where c.anulado_en is not null)                        as anulados
from partos p
join ovejas o on o.id = p.oveja_id
left join corderos c on c.parto_id = p.id
group by p.id, o.caravana, o.temporada;

comment on view partos_resumen is
  'R1: el tipo de nacimiento nunca se tipea, se cuenta. Los anulados no cuentan; se exponen aparte para que la web pueda revisarlos.';
