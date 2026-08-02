-- Tests de la anulación de corderos y de la muerte posterior (R8).
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/anulacion.test.sql
--
-- Como los de auditoría: todo dentro de una transacción con ROLLBACK al final.

begin;

create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000b1'::uuid as usuario,
  gen_random_uuid()                            as oveja,
  gen_random_uuid()                            as parto,
  gen_random_uuid()                            as mellizo_a,
  gen_random_uuid()                            as mellizo_b;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select usuario, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-anulacion@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select usuario, 'Test Anulación', 'operador', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja, 2026, 'TEST-0002', usuario from ctx;

-- Un parto de mellizos con collar, que es el caso donde la anulación duele.
insert into partos (id, oveja_id, fecha, condicion_corporal, collar_numero,
                    creado_por, actualizado_por, dispositivo)
select parto, oveja, date '2026-08-02', 3.25, '12', usuario, usuario, 'tablet-campo'
from ctx;

insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      collar_marca, creado_por, actualizado_por, dispositivo)
select mellizo_a, parto, 2026, 'macho', 'vivo', 4.20, 'punto_arriba',
       usuario, usuario, 'tablet-campo'
from ctx;

insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      collar_marca, creado_por, actualizado_por, dispositivo)
select mellizo_b, parto, 2026, 'hembra', 'vivo', 3.80, 'punto_abajo',
       usuario, usuario, 'tablet-campo'
from ctx;

-- ---------------------------------------------------------------------------

do $$
declare
  c     record;
  n     int;
  fallo boolean;
begin
  select * into c from ctx;

  -- 1. Los tres campos de la anulación van juntos o ninguno. Una anulación sin
  --    autor no se puede auditar; sin fecha no se puede ordenar contra el resto
  --    de la historia del registro.
  fallo := false;
  begin
    update corderos set anulado_en = now() where id = c.mellizo_b;
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'anulado_en sin autor ni motivo debe ser rechazado';
  end if;

  -- 2. El parto empieza contando dos.
  select tipo_nacimiento into n from partos_resumen where id = c.parto;
  if n <> 2 then
    raise exception 'El parto debería contar 2 corderos, cuenta %', n;
  end if;

  -- 3. Anulado en regla: el conteo baja y el anulado se expone aparte, para que
  --    la web pueda revisarlo sin que ensucie el tipo de nacimiento (R1).
  update corderos
     set anulado_en     = now(),
         anulado_por    = c.usuario,
         anulado_motivo = 'duplicado',
         actualizado_en = now(),
         actualizado_por = c.usuario
   where id = c.mellizo_b;

  select tipo_nacimiento into n from partos_resumen where id = c.parto;
  if n <> 1 then
    raise exception 'Con un cordero anulado el parto debe contar 1, cuenta %', n;
  end if;

  select anulados into n from partos_resumen where id = c.parto;
  if n <> 1 then
    raise exception 'El anulado debe seguir visible en la vista, hay %', n;
  end if;

  select pendientes_senalada into n from partos_resumen where id = c.parto;
  if n <> 1 then
    raise exception 'Un cordero anulado no puede quedar pendiente de señalada';
  end if;

  -- 4. La anulación queda auditada campo por campo, como cualquier otra edición.
  select count(*) into n from cambios
   where tabla = 'corderos' and registro_id = c.mellizo_b
     and tipo = 'actualizacion'
     and campo in ('anulado_en', 'anulado_por', 'anulado_motivo');
  if n <> 3 then
    raise exception 'La anulación debe auditar sus 3 campos, auditó %', n;
  end if;

  -- 5. El collar del parto sigue asignado. No lo libera la anulación, ni la
  --    muerte, ni la señalada: el collar es un objeto que sigue puesto en la
  --    oveja hasta que alguien va y lo saca.
  select count(*) into n from partos where id = c.parto and collar_numero = '12';
  if n <> 1 then
    raise exception 'La anulación no debe tocar el collar del parto';
  end if;

  raise notice 'anulación: 5/5 OK';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Un cordero señalado no se anula: es un animal con tatuaje puesto.
-- ---------------------------------------------------------------------------

do $$
declare
  c     record;
  fallo boolean := false;
begin
  select * into c from ctx;

  update corderos
     set estado = 'senalado', tatuaje = 'T-9001', fecha_senalada = date '2026-08-09',
         canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0,
         lunar_no_vellon = 0, entropion = 'ninguno', halo_hair = 0, pigmentacion = 2,
         actualizado_en = now(), actualizado_por = c.usuario
   where id = c.mellizo_a;

  begin
    update corderos
       set anulado_en = now(), anulado_por = c.usuario, anulado_motivo = 'otro'
     where id = c.mellizo_a;
  exception when check_violation then
    fallo := true;
  end;

  if not fallo then
    raise exception 'Un cordero señalado NO debe poder anularse';
  end if;

  raise notice 'señalado no se anula: 1/1 OK';
end $$;

-- ---------------------------------------------------------------------------
-- 7. R8 — muerte entre el nacimiento y la señalada.
-- ---------------------------------------------------------------------------

do $$
declare
  c       record;
  nuevo   uuid := gen_random_uuid();
  fallo   boolean := false;
  estado_final text;
begin
  select * into c from ctx;

  insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                        creado_por, actualizado_por, dispositivo)
  values (nuevo, c.parto, 2026, 'macho', 'vivo', 4.00, c.usuario, c.usuario, 'tablet-campo');

  -- Nació vivo y muere después: `condicion` es cómo nació y no cambia; lo que
  -- cambia es el estado. Sin causa ni fecha, la base lo rechaza — de ahí que la
  -- app tenga que exigir la causa en vez de ofrecerla como opcional.
  begin
    update corderos set estado = 'muerto' where id = nuevo;
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'Una muerte sin causa ni fecha debe ser rechazada';
  end if;

  update corderos
     set estado = 'muerto',
         fecha_muerte = date '2026-08-05',
         causa_muerte = 'hambre_exposicion',
         actualizado_en = now(), actualizado_por = c.usuario
   where id = nuevo;

  select condicion into estado_final from corderos where id = nuevo;
  if estado_final <> 'vivo' then
    raise exception 'La muerte posterior no debe cambiar cómo nació el cordero';
  end if;

  -- La muerte nunca antes del parto: lo valida el trigger de 0006, porque la
  -- fecha del parto está en otra tabla y un CHECK no puede consultarla.
  fallo := false;
  begin
    update corderos set fecha_muerte = date '2026-08-01' where id = nuevo;
  exception when check_violation then
    fallo := true;
  end;
  if not fallo then
    raise exception 'Una muerte anterior al parto debe ser rechazada';
  end if;

  raise notice 'muerte posterior: 3/3 OK';
end $$;

rollback;
