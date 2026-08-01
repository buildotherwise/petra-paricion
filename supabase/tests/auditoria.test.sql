-- Tests del trigger de auditoría.
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/auditoria.test.sql
--
-- Corre dentro de una transacción que hace ROLLBACK al final: no deja rastro
-- en la base, así que es seguro contra el proyecto real.

begin;

-- Un usuario de prueba con perfil de operador.
create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000a1'::uuid as usuario,
  gen_random_uuid()                            as oveja,
  gen_random_uuid()                            as parto,
  gen_random_uuid()                            as cordero;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select usuario, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-auditoria@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select usuario, 'Test Auditoría', 'operador', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja, 2026, 'TEST-0001', usuario from ctx;

-- ---------------------------------------------------------------------------

do $$
declare
  c        record;
  n        int;
  esperado int;
begin
  select * into c from ctx;

  -- 1. Un INSERT genera UNA fila resumen, no una por campo.
  insert into partos (id, oveja_id, fecha, condicion_corporal,
                      creado_por, actualizado_por, dispositivo)
  values (c.parto, c.oveja, current_date, 2.25, c.usuario, c.usuario, 'tablet-campo');

  select count(*) into n from cambios
   where tabla = 'partos' and registro_id = c.parto;
  if n <> 1 then
    raise exception 'INSERT debe generar 1 fila de auditoría, generó %', n;
  end if;

  select count(*) into n from cambios
   where tabla = 'partos' and registro_id = c.parto
     and tipo = 'creacion' and campo is null;
  if n <> 1 then
    raise exception 'La fila de INSERT debe ser tipo=creacion con campo null';
  end if;

  -- 2. Un UPDATE de dos campos genera exactamente DOS filas.
  update partos
     set condicion_corporal = 2.75,
         observaciones      = 'corrección',
         actualizado_en     = now()
   where id = c.parto;

  select count(*) into n from cambios
   where tabla = 'partos' and registro_id = c.parto and tipo = 'actualizacion';
  if n <> 2 then
    raise exception 'UPDATE de 2 campos debe generar 2 filas, generó %', n;
  end if;

  select count(*) into n from cambios
   where tabla = 'partos' and registro_id = c.parto
     and campo = 'condicion_corporal'
     and valor_anterior = '2.25' and valor_nuevo = '2.75';
  if n <> 1 then
    raise exception 'No se registró el valor anterior/nuevo de condicion_corporal';
  end if;

  -- 3. Los metadatos de fila no se auditan como contenido.
  select count(*) into n from cambios
   where tabla = 'partos' and registro_id = c.parto
     and campo in ('actualizado_en', 'actualizado_por', 'dispositivo',
                   'creado_en', 'creado_por');
  if n <> 0 then
    raise exception 'Los metadatos de fila no deben auditarse, hay % filas', n;
  end if;

  -- 4. Un UPDATE que no cambia nada no genera ruido.
  esperado := (select count(*) from cambios where registro_id = c.parto);
  update partos set condicion_corporal = 2.75 where id = c.parto;
  select count(*) into n from cambios where registro_id = c.parto;
  if n <> esperado then
    raise exception 'Un UPDATE sin cambios reales no debe auditar nada';
  end if;

  -- 5. Doble timestamp: el reloj del dispositivo no pisa al del servidor.
  --    Se simula un aparato con la hora atrasada dos días.
  update partos
     set observaciones  = 'editado offline',
         actualizado_en = now() - interval '2 days'
   where id = c.parto;

  select count(*) into n from cambios
   where registro_id = c.parto and campo = 'observaciones'
     and valor_nuevo = 'editado offline'
     and reportado_en < realizado_en - interval '1 day';
  if n <> 1 then
    raise exception
      'realizado_en debe ser del servidor y reportado_en del dispositivo, y deben poder diferir';
  end if;

  -- 6. Autor obligatorio: se toma de actualizado_por, no de quien ejecuta.
  select count(*) into n from cambios
   where registro_id = c.parto and realizado_por <> c.usuario;
  if n <> 0 then
    raise exception 'realizado_por debe salir siempre de NEW.actualizado_por';
  end if;

  -- 7. El dispositivo queda registrado aparte del usuario.
  select count(*) into n from cambios
   where registro_id = c.parto and dispositivo = 'tablet-campo';
  if n = 0 then
    raise exception 'El dispositivo debe quedar registrado en la auditoría';
  end if;

  raise notice 'auditoría: 7/7 OK';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Nadie más que el trigger puede escribir en `cambios`.
-- ---------------------------------------------------------------------------

do $$
declare
  permitido boolean;
begin
  select has_table_privilege('authenticated', 'public.cambios', 'INSERT')
    into permitido;
  if permitido then
    raise exception 'authenticated NO debe poder insertar en cambios';
  end if;

  select has_table_privilege('authenticated', 'public.cambios', 'UPDATE')
    into permitido;
  if permitido then
    raise exception 'authenticated NO debe poder actualizar cambios';
  end if;

  select has_table_privilege('authenticated', 'public.cambios', 'DELETE')
    into permitido;
  if permitido then
    raise exception 'authenticated NO debe poder borrar cambios';
  end if;

  if not has_table_privilege('authenticated', 'public.cambios', 'SELECT') then
    raise exception 'authenticated debe poder leer cambios (la política filtra a admin)';
  end if;

  raise notice 'blindaje de cambios: 4/4 OK';
end $$;

-- ---------------------------------------------------------------------------
-- 9. `cambios` fuera de la publicación de PowerSync.
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n
    from pg_publication_tables
   where pubname = 'powersync' and tablename = 'cambios';
  if n <> 0 then
    raise exception 'cambios NO debe estar en la publicación powersync';
  end if;

  select count(*) into n
    from pg_publication_tables
   where pubname = 'powersync'
     and tablename in ('ovejas', 'partos', 'corderos', 'perfiles');
  if n <> 4 then
    raise exception 'La publicación powersync debe tener las 4 tablas, tiene %', n;
  end if;

  raise notice 'publicación: 2/2 OK';
end $$;

rollback;
