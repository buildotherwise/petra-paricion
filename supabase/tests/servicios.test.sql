-- Tests de la tabla `servicios` — los hechos reproductivos de la temporada.
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/servicios.test.sql
--
-- Como los demás: todo dentro de una transacción con ROLLBACK al final.
--
-- Esta tabla es la segunda del esquema que el servidor protege por ROL —la
-- primera es `cambios`—, así que sus tests cambian de rol como los de vistas:
-- un CHECK no depende de quién escribe, pero una política sí, y la diferencia
-- entre «el operador no ve el botón» y «el operador no puede leer» solo se
-- comprueba mirando desde afuera.

begin;

create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000e1'::uuid as admin,
  '00000000-0000-0000-0000-0000000000e2'::uuid as operador,
  gen_random_uuid()                            as oveja;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select admin, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-servicios-admin@petra.local', '', now(), now()
from ctx;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select operador, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-servicios-oper@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select admin, 'Test Servicios Admin', 'admin', true from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select operador, 'Test Servicios Operador', 'operador', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja, 2026, 'TEST-0010', admin from ctx;

-- ---------------------------------------------------------------------------
-- 1. Las restricciones: lo que la tabla no deja escribir.
-- ---------------------------------------------------------------------------

do $$
declare
  c     record;
  fallo boolean;
  n     int;
  ok    int := 0;
begin
  select * into c from ctx;

  -- 1.1. El rango al revés no existe: una encarnerada que termina antes de
  --      empezar es un error de tipeo o de mapeo de columnas.
  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre)
    values (c.oveja, 'encarnerada', date '2026-05-13', date '2026-04-21', '3020');
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'un servicio con fecha_fin anterior a fecha_inicio debe ser rechazado';
  end if;
  ok := ok + 1;

  -- 1.2. La inseminación es un acto de un día. Si trae rango, el archivo se
  --      leyó mal — y la ventana de parto saldría de once días en vez de once.
  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre)
    values (c.oveja, 'inseminacion', date '2026-03-09', date '2026-03-27', '3050');
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'una inseminación con rango de más de un día debe ser rechazada';
  end if;
  ok := ok + 1;

  -- 1.3. Un padre en blanco no es «se desconoce»: es una celda vacía que se
  --      coló. Sin padre, el servicio no puede contestar la única pregunta que
  --      justifica guardarlo.
  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre)
    values (c.oveja, 'inseminacion', date '2026-03-09', date '2026-03-09', '   ');
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'un servicio con el padre vacío debe ser rechazado';
  end if;
  ok := ok + 1;

  -- 1.4. La clave de idempotencia. Es lo que hace que reejecutar la
  --      importación sea inocuo, y lo garantiza el servidor, no el script.
  insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre, cabana)
  values (c.oveja, 'inseminacion', date '2026-03-09', date '2026-03-09', '3050', 'PETRA');

  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre, cabana)
    values (c.oveja, 'inseminacion', date '2026-03-09', date '2026-03-09', '3050', 'PETRA');
  exception when unique_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'el mismo servicio cargado dos veces debe ser rechazado';
  end if;
  ok := ok + 1;

  -- 1.5. Y el camino que usa de verdad el importador: reejecutarlo no duplica
  --      ni revienta, simplemente no inserta nada.
  insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre, cabana)
  values (c.oveja, 'inseminacion', date '2026-03-09', date '2026-03-09', '3050', 'PETRA')
  on conflict (oveja_id, tipo, fecha_inicio, padre) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'el upsert del importador insertó % filas repetidas', n;
  end if;
  ok := ok + 1;

  -- 1.6. Lo que SÍ tiene que entrar: la misma oveja, misma fecha, otro padre —
  --      y la encarnerada con su rango de verdad.
  insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre, cabana)
  values (c.oveja, 'encarnerada', date '2026-04-21', date '2026-05-13', '4459', 'PETRA POLL');

  select count(*) into n from servicios where oveja_id = c.oveja;
  if n <> 2 then
    raise exception 'la oveja debería tener 2 servicios, tiene %', n;
  end if;
  ok := ok + 1;

  raise notice 'servicios · restricciones: %/6 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Quién puede: la tabla la lee y la escribe un admin, y nadie más.
-- ---------------------------------------------------------------------------

do $$
declare
  c  record;
  n  int;
  fallo boolean;
  ok int := 0;
begin
  -- El contexto se lee ANTES de cambiar de rol: la tabla temporal es del dueño.
  select * into c from ctx;

  -- 2.1. Un admin lee.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.admin::text, true);
  select count(*) into n from servicios where oveja_id = c.oveja;
  execute 'reset role';

  if n <> 2 then
    raise exception 'un admin debería leer los 2 servicios, leyó %', n;
  end if;
  ok := ok + 1;

  -- 2.2. Un operador NO lee. No es que la app le esconda la sección: el
  --      servidor no le devuelve las filas. Esta es la diferencia entre
  --      separar superficies y separar permisos.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.operador::text, true);
  select count(*) into n from servicios where oveja_id = c.oveja;
  execute 'reset role';

  if n <> 0 then
    raise exception 'un operador no debería ver ningún servicio, vio %', n;
  end if;
  ok := ok + 1;

  -- 2.3. Un operador tampoco escribe.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.operador::text, true);
  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre,
                           actualizado_por)
    values (c.oveja, 'inseminacion', date '2026-03-20', date '2026-03-20', '32',
            c.operador);
  exception when insufficient_privilege then
    fallo := true;
  end;
  execute 'reset role';

  if not fallo then
    raise exception 'un operador no debería poder cargar un servicio';
  end if;
  ok := ok + 1;

  -- 2.4. Y un admin no puede firmar en nombre de otro: el autor queda clavado
  --      al usuario autenticado, como en todas las tablas del esquema.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.admin::text, true);
  fallo := false;
  begin
    insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre,
                           actualizado_por)
    values (c.oveja, 'inseminacion', date '2026-03-20', date '2026-03-20', '32',
            c.operador);
  exception when insufficient_privilege then
    fallo := true;
  end;
  execute 'reset role';

  if not fallo then
    raise exception 'un admin no debería poder cargar un servicio a nombre de otro';
  end if;
  ok := ok + 1;

  -- 2.5. El borrado está revocado acá también: los datos de referencia de la
  --      temporada no se van sin dejar rastro.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.admin::text, true);
  fallo := false;
  begin
    delete from servicios where oveja_id = c.oveja;
  exception when insufficient_privilege then
    fallo := true;
  end;
  execute 'reset role';

  if not fallo then
    raise exception 'el delete sobre servicios debería estar revocado';
  end if;
  ok := ok + 1;

  raise notice 'servicios · permisos: %/5 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 3. La auditoría, con sus dos caminos.
-- ---------------------------------------------------------------------------

do $$
declare
  c  record;
  n  int;
  ok int := 0;
  id_firmado uuid;
begin
  select * into c from ctx;

  -- 3.1. Una edición hecha desde la web queda firmada, como cualquier otra.
  insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre,
                         actualizado_por, dispositivo)
  values (c.oveja, 'inseminacion', date '2026-03-27', date '2026-03-27', '3020',
          c.admin, 'web-admin')
  returning id into id_firmado;

  select count(*) into n
    from cambios
   where tabla = 'servicios' and registro_id = id_firmado
     and tipo = 'creacion' and realizado_por = c.admin
     and dispositivo = 'web-admin';
  if n <> 1 then
    raise exception 'la carga firmada debería dejar 1 fila de auditoría, dejó %', n;
  end if;
  ok := ok + 1;

  -- 3.2. Y la carga masiva —sin usuario, como las 503 madres— no deja nada:
  --      son mil trescientas filas de referencia, no trabajo de campo. El
  --      trigger ya tiene esa rama; lo que se prueba es que sigue siendo la
  --      correcta para esta tabla.
  select count(*) into n from cambios where tabla = 'servicios';
  if n <> 1 then
    raise exception 'la carga sin autor no debería auditarse; hay % filas', n;
  end if;
  ok := ok + 1;

  raise notice 'servicios · auditoría: %/2 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 4. El entierro: las dos columnas que nunca pudieron decir la verdad.
-- ---------------------------------------------------------------------------

do $$
declare
  sobrantes text[];
begin
  select array_agg(column_name order by column_name) into sobrantes
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ovejas'
     and column_name in ('fecha_inseminacion', 'padre');

  if sobrantes is not null then
    raise exception 'ovejas todavía tiene %: la verdad tiene que estar en un solo lugar',
      array_to_string(sobrantes, ' y ');
  end if;

  raise notice 'servicios · ovejas sin las columnas viejas: OK';
end $$;

rollback;
