-- Los dos números que se preguntan primero.
--
-- «¿Cuántas ovejas parieron ya?» y «¿cuántos corderos deja cada oveja que
-- parió?» son las dos preguntas que abren cualquier conversación sobre la
-- temporada, y hasta ahora había que deducirlas de otras tarjetas.
--
-- La primera parecía estar en v_avance_paricion, y no es la misma: ahí el
-- denominador son las INSEMINADAS, porque esa tarjeta compara contra las
-- ventanas de parto y una oveja sin servicio no tiene ventana. Acá el
-- denominador es el RODEO entero, incluidas las de alta manual (R9) que
-- parieron sin figurar en ninguna lista. En 2026 los dos números coinciden
-- —las 503 madres tienen servicio— y el día que dejen de coincidir van a estar
-- diciendo cosas distintas a propósito.
--
-- La segunda —el «% de señalada»— se mide contra las ovejas PARIDAS, no contra
-- los corderos nacidos. Es una medida de productividad, no de supervivencia:
-- contesta cuántos corderos marcados deja cada oveja que parió, así que pasar
-- del 100 % es lo esperable en un rodeo con mellicería y no un error de
-- cálculo. La supervivencia ya la contesta v_mortalidad.

create view v_resumen_temporada as
select
  o.temporada,
  count(distinct o.id)       as ovejas,
  count(distinct p.oveja_id) as ovejas_paridas,
  count(c.id) filter (where c.anulado_en is null) as corderos_nacidos,
  count(c.id) filter (
    where c.anulado_en is null and c.estado = 'senalado'
  ) as corderos_senalados
from ovejas o
left join partos p   on p.oveja_id = o.id
left join corderos c on c.parto_id = p.id
group by o.temporada;

alter view v_resumen_temporada set (security_invoker = true);
grant select on v_resumen_temporada to authenticated;
grant select on v_resumen_temporada to service_role;

comment on view v_resumen_temporada is
  'Los totales de la temporada. `ovejas` es el rodeo entero, no las inseminadas: es el denominador de «cuántas parieron». El % de señalada se calcula contra ovejas_paridas y puede pasar del 100 %.';
