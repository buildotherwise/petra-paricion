-- Toda vista nace muda, y hay que acordarse de darle voz.
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/vistas.test.sql
--
-- Los privilegios por defecto del rol dueño sobre `public` no incluyen SELECT
-- para `authenticated`: una vista recién creada la lee su dueño y nadie más, y
-- PostgREST devuelve 42501. `partos_resumen` estuvo así desde 0001 y no se
-- notó nunca por dos razones que conviene tener presentes — la app no la
-- consulta (los conteos de R1 salen de la réplica local) y los tests que sí la
-- consultan corren como dueño, igual que el SQL Editor de Supabase, que es
-- donde uno la probaría a mano.
--
-- Este archivo es la barrera. No prueba una vista: recorre TODAS las de
-- `public` y les exige las dos líneas. La segunda tanda de la Fase 4 agrega
-- siete vistas de métricas; sin esto las siete nacen rotas y se descubre con
-- los tableros a medio hacer.
--
-- Es además el primer test del repo que cambia de rol. Los demás corren como
-- dueño y prueban restricciones y triggers, que es lo correcto para ellos:
-- un CHECK no depende de quién escribe. El RLS sí, y una vista que lo saltea
-- solo se distingue de una que lo respeta mirándola desde afuera.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ninguna vista sin lectura para `authenticated`.
-- ---------------------------------------------------------------------------

do $$
declare
  v      record;
  faltan text[] := '{}';
  total  int := 0;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  loop
    total := total + 1;
    if not has_table_privilege('authenticated',
                               format('public.%I', v.relname), 'select') then
      faltan := faltan || v.relname;
    end if;
  end loop;

  -- Si un día no queda ninguna vista, el test pasaría vacío y dejaría de
  -- proteger nada. Mejor que avise.
  if total = 0 then
    raise exception 'vistas: no hay ninguna vista en public — ¿se borró partos_resumen?';
  end if;

  if array_length(faltan, 1) > 0 then
    raise exception 'vistas sin «grant select … to authenticated»: %',
      array_to_string(faltan, ', ');
  end if;

  raise notice 'vistas legibles: %/% OK', total, total;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Ninguna vista sin security_invoker.
-- ---------------------------------------------------------------------------

do $$
declare
  v      record;
  faltan text[] := '{}';
  total  int := 0;
begin
  for v in
    select c.relname,
           coalesce((select o.option_value
                       from pg_options_to_table(c.reloptions) o
                      where o.option_name = 'security_invoker'),
                    'false')::boolean as invoker
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  loop
    total := total + 1;
    if not v.invoker then
      faltan := faltan || v.relname;
    end if;
  end loop;

  if array_length(faltan, 1) > 0 then
    raise exception 'vistas que leen con los privilegios del dueño y saltean el RLS de quien consulta: %',
      array_to_string(faltan, ', ');
  end if;

  raise notice 'vistas con security_invoker: %/% OK', total, total;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Y que eso signifique algo: la vista, leída de verdad desde afuera.
-- ---------------------------------------------------------------------------

create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000d1'::uuid as usuario,
  gen_random_uuid()                            as oveja,
  gen_random_uuid()                            as parto,
  gen_random_uuid()                            as cordero;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select usuario, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-vistas@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select usuario, 'Test Vistas', 'operador', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja, 2026, 'TEST-0005', usuario from ctx;

insert into partos (id, oveja_id, fecha, condicion_corporal,
                    creado_por, actualizado_por, dispositivo)
select parto, oveja, date '2026-08-02', 3.25, usuario, usuario, 'tablet-campo' from ctx;

insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      creado_por, actualizado_por, dispositivo)
select cordero, parto, 2026, 'macho', 'vivo', 4.20, usuario, usuario, 'tablet-campo' from ctx;

do $$
declare
  c  record;
  n  int;
  ok int := 0;
begin
  -- El contexto se lee ANTES de cambiar de rol: la tabla temporal es del dueño
  -- y `authenticated` no tiene nada sobre ella.
  select * into c from ctx;

  -- 3.1. Un perfil activo lee la vista. Esto es lo que hoy devuelve 42501 en
  --      producción, y lo que ningún test podía ver corriendo como dueño.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.usuario::text, true);
  select count(*) into n from partos_resumen where id = c.parto;
  execute 'reset role';

  if n <> 1 then
    raise exception 'un perfil activo no pudo leer partos_resumen (vio % filas)', n;
  end if;
  ok := ok + 1;

  -- 3.2. Desactivada la cuenta, la misma consulta no devuelve nada. Sin
  --      security_invoker la vista correría como su dueño y esta cuenta
  --      seguiría viendo todos los partos — que es la diferencia entre
  --      desactivar a alguien y creer que se lo desactivó.
  update perfiles set activo = false where user_id = c.usuario;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.usuario::text, true);
  select count(*) into n from partos_resumen where id = c.parto;
  execute 'reset role';

  if n <> 0 then
    raise exception 'la vista saltea el RLS: una cuenta desactivada vio % filas', n;
  end if;
  ok := ok + 1;

  raise notice 'partos_resumen respeta al que consulta: %/2 OK', ok;
end $$;

rollback;
