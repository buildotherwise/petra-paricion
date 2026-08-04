-- La muerte de un señalado también se documenta.
--
-- `muerte_documentada` (0006) exigía causa y fecha solo cuando `condicion` o
-- `estado` decían muerto. Pero un cordero que muere DESPUÉS de señalado
-- conserva su estado `senalado` a propósito (R8: perderlo borraría el hecho de
-- haberlo sido), así que la corrección exclusiva de la web podía escribir
-- `fecha_muerte` sin `causa_muerte` — y el análisis de mortalidad, que es lo
-- que justifica pedir la causa, se quedaba sin la variable. El propio
-- senalada.test.sql llamaba a ese hueco «una casualidad afortunada del
-- esquema»; deja de serlo: causa y fecha van juntas, siempre.

-- Primero el dato existente: una fila con fecha y sin causa es exactamente una
-- muerte sin diagnóstico, que es lo que la lista cerrada ya sabe decir. Corre
-- server-side y sin autor, así que auditar() sale temprano — igual que en las
-- cargas de referencia (0010).
update corderos
   set causa_muerte = 'sin_diagnostico'
 where fecha_muerte is not null and causa_muerte is null;

alter table corderos drop constraint muerte_documentada;
alter table corderos add constraint muerte_documentada check (
  -- La muerte, cuando está, está entera: causa y fecha van juntas.
  (causa_muerte is null) = (fecha_muerte is null)
  -- Y un cordero muerto —al nacer (R5) o después (R8)— tiene que tenerla.
  and ((condicion = 'vivo' and estado <> 'muerto') or fecha_muerte is not null)
);

-- De paso: la única función del esquema que quedó sin search_path fijado
-- (hallazgo del linter de Supabase). Mismo criterio que perfil_activo(),
-- es_admin() y auditar().
alter function public.validar_fecha_muerte() set search_path = public, pg_temp;
