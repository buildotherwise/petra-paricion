-- Tests de la señalada: R11 (completa o nada) y el tatuaje único por temporada.
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/senalada.test.sql
--
-- Como los demás: todo dentro de una transacción con ROLLBACK al final.
--
-- Lo que se prueba acá es lo que la app NO puede garantizar sola. La validación
-- del cliente evita el error; estas restricciones evitan que un cliente viejo,
-- una escritura directa o un bug lo metan igual.

begin;

create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000c1'::uuid as usuario,
  gen_random_uuid()                            as oveja_a,
  gen_random_uuid()                            as oveja_b,
  gen_random_uuid()                            as parto_a,
  gen_random_uuid()                            as parto_b,
  gen_random_uuid()                            as cordero_a,
  gen_random_uuid()                            as cordero_b,
  gen_random_uuid()                            as muerto;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select usuario, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-senalada@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select usuario, 'Test Señalada', 'operador', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja_a, 2026, 'TEST-0003', usuario from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja_b, 2026, 'TEST-0004', usuario from ctx;

insert into partos (id, oveja_id, fecha, condicion_corporal,
                    creado_por, actualizado_por, dispositivo)
select parto_a, oveja_a, date '2026-08-02', 3.25, usuario, usuario, 'tablet-campo' from ctx;

insert into partos (id, oveja_id, fecha, condicion_corporal,
                    creado_por, actualizado_por, dispositivo)
select parto_b, oveja_b, date '2026-08-02', 3.00, usuario, usuario, 'tablet-campo' from ctx;

insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      creado_por, actualizado_por, dispositivo)
select cordero_a, parto_a, 2026, 'macho', 'vivo', 4.20, usuario, usuario, 'tablet-campo' from ctx;

insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      creado_por, actualizado_por, dispositivo)
select cordero_b, parto_b, 2026, 'hembra', 'vivo', 3.80, usuario, usuario, 'tablet-campo' from ctx;

-- Un muerto al nacer, que no pasa por la señalada (R5).
insert into corderos (id, parto_id, temporada, sexo, condicion, estado,
                      fecha_muerte, causa_muerte,
                      creado_por, actualizado_por, dispositivo)
select muerto, parto_a, 2026, 'hembra', 'muerto', 'muerto',
       date '2026-08-02', 'distocia', usuario, usuario, 'tablet-campo'
from ctx;

-- ---------------------------------------------------------------------------

do $$
declare
  c     record;
  n     int;
  fallo boolean;
  ok    int := 0;
begin
  select * into c from ctx;

  -- 1. R11: no se pasa a `senalado` sin los nueve campos. Media señalada es
  --    peor que ninguna: el cordero figuraría hecho y el fenotipo estaría vacío.
  fallo := false;
  begin
    update corderos set estado = 'senalado', tatuaje = '001',
                        fecha_senalada = date '2026-08-10'
     where id = c.cordero_a;
  exception when check_violation then fallo := true;
  end;
  if not fallo then
    raise exception 'R11: una señalada sin fenotipo entró igual';
  end if;
  ok := ok + 1;

  -- 2. Con los nueve campos, sí.
  update corderos
     set estado = 'senalado', tatuaje = '001', fecha_senalada = date '2026-08-10',
         canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0, lunar_no_vellon = 0,
         entropion = 'ninguno', halo_hair = 0, pigmentacion = 0
   where id = c.cordero_a;

  select count(*) into n from corderos where id = c.cordero_a and estado = 'senalado';
  if n <> 1 then
    raise exception 'R11: la señalada completa no se guardó';
  end if;
  ok := ok + 1;

  -- 3. El tatuaje no se repite en la temporada. Es el caso del aparato que
  --    estuvo días sin señal y sugirió un número que otro ya usó: acá se frena,
  --    aunque el animal ya lo tenga puesto en la oreja.
  fallo := false;
  begin
    update corderos
       set estado = 'senalado', tatuaje = '001', fecha_senalada = date '2026-08-10',
           canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0, lunar_no_vellon = 0,
           entropion = 'ninguno', halo_hair = 0, pigmentacion = 0
     where id = c.cordero_b;
  exception when unique_violation then fallo := true;
  end;
  if not fallo then
    raise exception 'tatuaje: el 001 se repitió en la misma temporada';
  end if;
  ok := ok + 1;

  -- 4. Pero sí se repite entre temporadas: el índice es (temporada, tatuaje) y
  --    la numeración arranca de cero cada año.
  update corderos set temporada = 2027 where id = c.cordero_b;
  update corderos
     set estado = 'senalado', tatuaje = '001', fecha_senalada = date '2027-08-10',
         canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0, lunar_no_vellon = 0,
         entropion = 'ninguno', halo_hair = 0, pigmentacion = 0
   where id = c.cordero_b;
  ok := ok + 1;

  -- 5. Muchos corderos sin tatuaje conviven: el índice es parcial, así que los
  --    null no chocan entre sí. Sin eso no habría forma de tener dos corderos
  --    sin señalar al mismo tiempo.
  select count(*) into n from corderos where tatuaje is null and parto_id = c.parto_a;
  if n < 1 then
    raise exception 'el índice parcial debería permitir varios sin tatuaje';
  end if;
  ok := ok + 1;

  -- 6. R5: un muerto al nacer no termina señalado, ni con todo completo.
  fallo := false;
  begin
    update corderos
       set estado = 'senalado', tatuaje = '900', fecha_senalada = date '2026-08-10',
           canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0, lunar_no_vellon = 0,
           entropion = 'ninguno', halo_hair = 0, pigmentacion = 0
     where id = c.muerto;
  exception when check_violation then fallo := true;
  end;
  if not fallo then
    raise exception 'R5: un muerto al nacer se señaló';
  end if;
  ok := ok + 1;

  raise notice 'señalada: %/6 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- La auditoría de la señalada: el trigger tiene que dejar una fila por campo.

do $$
declare
  c  record;
  n  int;
  ok int := 0;
begin
  select * into c from ctx;

  select count(*) into n
    from cambios
   where tabla = 'corderos' and registro_id = c.cordero_a and campo = 'tatuaje';
  if n <> 1 then
    raise exception 'auditoría: el tatuaje no quedó registrado (% filas)', n;
  end if;
  ok := ok + 1;

  select count(*) into n
    from cambios
   where tabla = 'corderos' and registro_id = c.cordero_a
     and campo = 'estado' and valor_nuevo = 'senalado';
  if n <> 1 then
    raise exception 'auditoría: el pasaje a señalado no quedó registrado';
  end if;
  ok := ok + 1;

  raise notice 'auditoría de la señalada: %/2 OK', ok;
end $$;

rollback;
