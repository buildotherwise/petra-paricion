-- Tests de las vistas de métricas de los tableros.
--
--   psql "$DIRECT_CONNECTION_STRING" -f supabase/tests/metricas.test.sql
--
-- `vistas.test.sql` verifica que toda vista se pueda leer y respete el RLS de
-- quien consulta. Este archivo prueba lo otro: que digan la verdad.
--
-- Las tres cosas que se fijan acá, porque son las que se romperían en silencio:
--
--   1. La paternidad se deriva o no se afirma. Cero servicios compatibles o más
--      de uno dan `padre` null: un cordero con padre equivocado en un plantel
--      de cabaña es peor que uno sin padre asignado.
--   2. La curva esperada usa toda la evidencia y no la repone por
--      normalización. Una oveja con tres servicios va a parir UNA vez y no
--      tres; y a la que se vio no volver al celo se le cree, así que pesa más
--      que aquella de la que no se sabe nada.
--   3. La mortalidad se cuenta con `fecha_muerte`, nunca con `estado`. Es la
--      consecuencia que senalada.test.sql dejó escrita para esta tanda.
--
-- Sobre las fechas del fixture: `partos_fecha_no_futura` no deja registrar un
-- parto que todavía no pasó, así que los partos van en los primeros días de
-- agosto de 2026 y los servicios están corridos hacia atrás para que las
-- ventanas caigan ahí. En el archivo real la encarnerada es de abril y sus
-- partos son de setiembre; acá no podrían existir.

begin;

create temp table ctx on commit drop as
select
  '00000000-0000-0000-0000-0000000000f1'::uuid as usuario,
  gen_random_uuid() as oveja_a,   -- una IA sola: el caso limpio
  gen_random_uuid() as oveja_b,   -- dos IA con ventanas solapadas: ambiguo
  gen_random_uuid() as oveja_c,   -- encarnerada, con rango de verdad
  gen_random_uuid() as oveja_d,   -- sin servicios: parió igual (alta manual R9)
  gen_random_uuid() as oveja_e,   -- IA lejana: el parto cae fuera de la ventana
  gen_random_uuid() as oveja_f,   -- servida y todavía sin parir
  gen_random_uuid() as parto_a,
  gen_random_uuid() as parto_b,
  gen_random_uuid() as parto_c,
  gen_random_uuid() as parto_d,
  gen_random_uuid() as parto_e,
  gen_random_uuid() as cordero_a1, -- señalado y muerto DESPUÉS de señalado
  gen_random_uuid() as cordero_a2, -- muerto al nacer
  gen_random_uuid() as cordero_b1,
  gen_random_uuid() as cordero_b2; -- muerto entre el nacimiento y la señalada

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at)
select usuario, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'test-metricas@petra.local', '', now(), now()
from ctx;

insert into perfiles (user_id, nombre, rol, activo)
select usuario, 'Test Métricas', 'admin', true from ctx;

insert into ovejas (id, temporada, caravana, actualizado_por)
select oveja_a, 2026, 'TEST-M-A', usuario from ctx union all
select oveja_b, 2026, 'TEST-M-B', usuario from ctx union all
select oveja_c, 2026, 'TEST-M-C', usuario from ctx union all
select oveja_d, 2026, 'TEST-M-D', usuario from ctx union all
select oveja_e, 2026, 'TEST-M-E', usuario from ctx union all
select oveja_f, 2026, 'TEST-M-F', usuario from ctx;

-- Los servicios. Cada uno genera DOS ventanas, porque las dos vistas usan
-- gestaciones distintas a propósito (el porqué está en la 0016): `v_paternidad`
-- es angosta —[145, 155], prefiere no afirmar un padre— y la curva esperada es
-- ancha —[140, 160], sin colas inventa ceros—.
--
--   A  IA 09-mar             paternidad [01-ago, 11-ago]   curva [27-jul, 16-ago]
--   B  IA 09-mar + 11-mar    dos ventanas que solapan: paternidad ambigua
--   C  encarnerada 01→15-mar paternidad [24-jul, 17-ago]   curva [19-jul, 22-ago]
--   E  IA 05-ene             paternidad [30-may, 09-jun]   curva [25-may, 14-jun]
--   F  IA 20-abr                                           curva [07-set, 27-set]
--   E y F  encarnerada 20-may→10-jun                       curva [07-oct, 17-nov]
--
-- E y F son las que ejercitan el peso de la última IA: las dos tienen
-- inseminación Y repaso, pero la de E cae en una tanda con otra después —se la
-- vio no volver al celo— y la de F es la última tanda, donde no hay nada
-- observado. Sus ventanas están aisladas de todo lo demás justamente para poder
-- comparar los dos pesos en la sección 2. A y B, en cambio, no tienen repaso:
-- son las «confirmadas preñadas» que pesan 1.
insert into servicios (oveja_id, tipo, fecha_inicio, fecha_fin, padre, cabana)
select oveja_a, 'inseminacion'::servicio_t, date '2026-03-09', date '2026-03-09', '3050', 'PETRA' from ctx union all
select oveja_b, 'inseminacion',             date '2026-03-09', date '2026-03-09', '3020', 'PETRA' from ctx union all
select oveja_b, 'inseminacion',             date '2026-03-11', date '2026-03-11', '4459', 'PETRA' from ctx union all
select oveja_c, 'encarnerada',              date '2026-03-01', date '2026-03-15', '4459', 'PETRA POLL' from ctx union all
select oveja_e, 'inseminacion',             date '2026-01-05', date '2026-01-05', '32',   'PETRA' from ctx union all
select oveja_e, 'encarnerada',              date '2026-05-20', date '2026-06-10', '3020', 'PETRA' from ctx union all
select oveja_f, 'inseminacion',             date '2026-04-20', date '2026-04-20', '3050', 'PETRA' from ctx union all
select oveja_f, 'encarnerada',              date '2026-05-20', date '2026-06-10', '3020', 'PETRA' from ctx;

insert into partos (id, oveja_id, fecha, condicion_corporal,
                    creado_por, actualizado_por, dispositivo)
select parto_a, oveja_a, date '2026-08-02', 3.25, usuario, usuario, 'tablet-campo' from ctx union all
select parto_b, oveja_b, date '2026-08-03', 3.00, usuario, usuario, 'tablet-campo' from ctx union all
select parto_c, oveja_c, date '2026-08-01', 2.75, usuario, usuario, 'tablet-campo' from ctx union all
select parto_d, oveja_d, date '2026-08-02', 3.50, usuario, usuario, 'tablet-campo' from ctx union all
select parto_e, oveja_e, date '2026-08-02', null, usuario, usuario, 'tablet-campo' from ctx;

-- Mellizos en A y en B; únicos en C, D y E.
insert into corderos (id, parto_id, temporada, sexo, condicion, peso_kg,
                      creado_por, actualizado_por, dispositivo)
select cordero_a1, parto_a, 2026, 'macho'::sexo_t, 'vivo'::condicion_t, 4.20, usuario, usuario, 'tablet-campo' from ctx union all
select cordero_b1, parto_b, 2026, 'hembra',        'vivo',              3.80, usuario, usuario, 'tablet-campo' from ctx union all
select cordero_b2, parto_b, 2026, 'macho',         'vivo',              3.10, usuario, usuario, 'tablet-campo' from ctx union all
select gen_random_uuid(), parto_c, 2026, 'hembra', 'vivo',              4.60, usuario, usuario, 'tablet-campo' from ctx union all
select gen_random_uuid(), parto_d, 2026, 'macho',  'vivo',              5.10, usuario, usuario, 'tablet-campo' from ctx union all
select gen_random_uuid(), parto_e, 2026, 'hembra', 'vivo',              4.00, usuario, usuario, 'tablet-campo' from ctx;

-- El muerto al nacer (R5): no pasa por la señalada.
insert into corderos (id, parto_id, temporada, sexo, condicion, estado,
                      fecha_muerte, causa_muerte,
                      creado_por, actualizado_por, dispositivo)
select cordero_a2, parto_a, 2026, 'hembra', 'muerto', 'muerto',
       date '2026-08-02', 'distocia', usuario, usuario, 'tablet-campo'
from ctx;

-- ---------------------------------------------------------------------------
-- 1. v_paternidad: se deriva, o no se afirma.
-- ---------------------------------------------------------------------------

do $$
declare
  c  record;
  r  record;
  ok int := 0;
begin
  select * into c from ctx;

  -- 1.1. Una sola inseminación compatible: hay padre, con su cabaña.
  select * into r from v_paternidad where parto_id = c.parto_a;
  if r.candidatos <> 1 then
    raise exception 'A: debería tener 1 servicio compatible, tiene %', r.candidatos;
  end if;
  if r.padre <> '3050' or r.cabana <> 'PETRA' then
    raise exception 'A: el padre derivado es % (%), se esperaba 3050 (PETRA)',
      r.padre, r.cabana;
  end if;
  if r.gestacion_min <> 146 or r.gestacion_max <> 146 then
    raise exception 'A: la gestación de una IA es exacta; salió [%, %]',
      r.gestacion_min, r.gestacion_max;
  end if;
  ok := ok + 1;

  -- 1.2. Dos servicios compatibles de padres distintos: NO se elige uno. Este
  --      es el caso que la temporada 2026 no tiene —se midió: ninguna oveja
  --      tiene dos ventanas solapadas con padres distintos— y que la vista
  --      tiene que aguantar igual el día que aparezca.
  select * into r from v_paternidad where parto_id = c.parto_b;
  if r.candidatos <> 2 then
    raise exception 'B: debería tener 2 servicios compatibles, tiene %', r.candidatos;
  end if;
  if r.padre is not null then
    raise exception 'B: con paternidad ambigua no se afirma un padre (dijo %)', r.padre;
  end if;
  ok := ok + 1;

  -- 1.3. La encarnerada también deriva, con su rango real de gestación
  --      acotado a lo posible: [145, 153] y no [139, 153].
  select * into r from v_paternidad where parto_id = c.parto_c;
  if r.candidatos <> 1 or r.padre <> '4459' then
    raise exception 'C: el repaso debería derivar al carnero 4459 (candidatos %, padre %)',
      r.candidatos, r.padre;
  end if;
  if r.servicio_tipo <> 'encarnerada' then
    raise exception 'C: el servicio derivado debería ser la encarnerada, es %', r.servicio_tipo;
  end if;
  if r.gestacion_min <> 145 or r.gestacion_max <> 153 then
    raise exception 'C: la gestación posible salió [%, %], se esperaba [145, 153]',
      r.gestacion_min, r.gestacion_max;
  end if;
  ok := ok + 1;

  -- 1.4. Una oveja de alta manual (R9), sin ningún servicio cargado.
  select * into r from v_paternidad where parto_id = c.parto_d;
  if r.candidatos <> 0 or r.padre is not null then
    raise exception 'D: sin servicios no hay padre (candidatos %, padre %)',
      r.candidatos, r.padre;
  end if;
  -- Y tampoco hay gestación. Parece obvio y no lo es: `greatest` y `least`
  -- IGNORAN los nulos en Postgres, así que `greatest(null, 145)` da 145 — la
  -- vista informaba una gestación de [145,155] para partos sin ningún servicio
  -- compatible. Números inventados con cara de medidos, en la única vista cuyo
  -- propósito es no inventar nada.
  if r.gestacion_min is not null or r.gestacion_max is not null then
    raise exception 'D: sin servicio no hay gestación que informar (salió [%, %])',
      r.gestacion_min, r.gestacion_max;
  end if;
  ok := ok + 1;

  -- 1.5. Y un parto que no cae en ninguna ventana: tampoco se adivina «el más
  --      cercano». Queda sin padre y el caso se mira a mano.
  select * into r from v_paternidad where parto_id = c.parto_e;
  if r.candidatos <> 0 or r.padre is not null then
    raise exception 'E: un parto fuera de toda ventana no tiene padre (candidatos %, padre %)',
      r.candidatos, r.padre;
  end if;
  if r.gestacion_min is not null then
    raise exception 'E: fuera de la ventana tampoco hay gestación (salió %)', r.gestacion_min;
  end if;
  ok := ok + 1;

  -- 1.5.b Y con paternidad ambigua, lo mismo: dos servicios compatibles no dan
  --       «la gestación», dan dos gestaciones posibles y ninguna es la buena.
  select * into r from v_paternidad where parto_id = c.parto_b;
  if r.gestacion_min is not null or r.gestacion_max is not null then
    raise exception 'B: con dos candidatos no hay una gestación (salió [%, %])',
      r.gestacion_min, r.gestacion_max;
  end if;
  ok := ok + 1;

  -- 1.6. La vista tiene una fila por parto, ni una más.
  if (select count(*) from v_paternidad where temporada = 2026) <> 5 then
    raise exception 'v_paternidad debería tener 5 filas, tiene %',
      (select count(*) from v_paternidad where temporada = 2026);
  end if;
  ok := ok + 1;

  raise notice 'métricas · paternidad: %/7 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 2. v_avance_paricion: la curva esperada usa toda la evidencia.
-- ---------------------------------------------------------------------------

do $$
declare
  total_esperado numeric;
  n_servidas     int;
  n_paridas      int;
  n              int;
  r              record;
  ok             int := 0;
begin
  -- 2.1. La curva suma la PREÑEZ esperada, no las servidas.
  --
  --      Hasta la 0015 la aserción de acá era `sum(esperados) = servidas`, y
  --      era el defecto y no la propiedad: obligaba a que toda oveja servida
  --      pariera, reponiendo por normalización la preñez que los propios
  --      parámetros del modelo decían que no iba a existir. Lo que sí sigue
  --      valiendo es que una oveja con dos servicios no puede parir dos veces:
  --      por eso el total tiene que quedar por debajo de las servidas.
  --
  --      El piso del 80 % es contra el otro error posible —una curva que se
  --      desinfla— y el techo del 98 % es el mismo defecto viejo con otra cara.
  select sum(esperados), max(servidas)
    into total_esperado, n_servidas
    from v_avance_paricion where temporada = 2026;

  if n_servidas <> 5 then
    raise exception 'las servidas de la temporada deberían ser 5, son %', n_servidas;
  end if;
  ok := ok + 1;

  if total_esperado < n_servidas * 0.80 or total_esperado > n_servidas * 0.98 then
    raise exception 'la curva suma % y con % servidas tendría que caer entre el 80 %% y el 98 %%',
      total_esperado, n_servidas;
  end if;
  ok := ok + 1;

  -- 2.2. El calendario es continuo: los días sin nada existen igual. Si la
  --      serie se saltea los días vacíos, el gráfico dibuja una curva que
  --      comprime el tiempo y las tandas de la inseminación desaparecen.
  select count(*) into n
    from v_avance_paricion
   where temporada = 2026 and dia = date '2026-06-15';
  if n <> 1 then
    raise exception 'el 15 de junio no está en la serie: el calendario tiene agujeros';
  end if;

  select * into r from v_avance_paricion
   where temporada = 2026 and dia = date '2026-06-15';
  if r.partos <> 0 or r.esperados <> 0 then
    raise exception 'el 15 de junio debería estar vacío (partos %, esperados %)',
      r.partos, r.esperados;
  end if;
  ok := ok + 1;

  -- 2.2.b Una IA superada por otra NO aporta a la curva. La oveja B se
  --       inseminó el 9 y el 11 de marzo: que exista la segunda prueba que la
  --       primera falló —volvió al celo—, así que su ventana empieza el 29 de
  --       julio y no el 27. El 28 de julio solo pueden parir A y C; si la IA
  --       descartada contara, B haría tres.
  select * into r from v_avance_paricion
   where temporada = 2026 and dia = date '2026-07-28';
  if r.en_ventana <> 2 then
    raise exception 'el 28 de julio podían parir 2 ovejas, la vista dice % (¿se está contando la IA que falló?)',
      r.en_ventana;
  end if;
  ok := ok + 1;

  -- 2.2.c LA aserción de la 0016, la simétrica de la anterior: si volver al
  --       celo prueba que la IA falló, no volver es evidencia de que prendió, y
  --       tiene que pesar más que no saber nada.
  --
  --       E y F tienen las dos inseminación y repaso. La IA de E está en una
  --       tanda que tuvo otra después —se la vio no volver—; la de F es la
  --       última tanda, donde no hubo ocasión de observar nada. Las dos
  --       ventanas están aisladas del resto del fixture, así que cada uno de
  --       estos días es de una sola oveja y los valores se comparan directo.
  declare
    con_evidencia numeric;
    sin_evidencia numeric;
  begin
    select esperados into con_evidencia from v_avance_paricion
     where temporada = 2026 and dia = date '2026-06-04';   -- pico de E: 05-ene + 150
    select esperados into sin_evidencia from v_avance_paricion
     where temporada = 2026 and dia = date '2026-09-17';   -- pico de F: 20-abr + 150

    if con_evidencia is null or sin_evidencia is null then
      raise exception 'faltan los picos de E o de F en la serie';
    end if;
    if con_evidencia <= sin_evidencia then
      raise exception 'la que no volvió al celo pesa % y la de la última tanda % — el no-retorno se está tirando',
        con_evidencia, sin_evidencia;
    end if;
  end;
  ok := ok + 1;

  -- 2.2.d La gestación tiene colas: [140, 160] y no [145, 155]. Es lo que evita
  --       que la curva valga CERO entre dos tandas separadas quince días — con
  --       la ventana angosta, en 2026 el 15 de agosto daba 0,000 y la línea del
  --       gráfico tocaba el eje como si faltaran datos. La ventana de E está
  --       sola, así que sus dos bordes se leen directo.
  select esperados into total_esperado from v_avance_paricion
   where temporada = 2026 and dia = date '2026-05-25';     -- 05-ene + 140
  if coalesce(total_esperado, 0) <= 0 then
    raise exception 'a los 140 días de gestación la curva ya debería ser positiva, dice %',
      total_esperado;
  end if;
  select esperados into total_esperado from v_avance_paricion
   where temporada = 2026 and dia = date '2026-06-14';     -- 05-ene + 160
  if coalesce(total_esperado, 0) <= 0 then
    raise exception 'a los 160 días de gestación la curva todavía debería ser positiva, dice %',
      total_esperado;
  end if;
  ok := ok + 1;

  -- 2.2.e La cola del repaso BAJA. El carnero se suelta y las ovejas que están
  --       por entrar en celo lo hacen en los primeros días; las que no quedaron
  --       preñadas repiten un ciclo después, y son menos. Si la concepción se
  --       repartiera pareja sobre toda la exposición, la temporada terminaría
  --       en una meseta plana de tres semanas — que es justo lo que una
  --       parición real no hace.
  --
  --       La encarnerada de E y F va del 20 de mayo al 10 de junio y su ventana
  --       [07-oct, 17-nov] no la comparte con ningún otro servicio.
  declare
    temprano numeric;
    tarde    numeric;
  begin
    select esperados into temprano from v_avance_paricion
     where temporada = 2026 and dia = date '2026-10-17';   -- 20-may + 150
    select esperados into tarde from v_avance_paricion
     where temporada = 2026 and dia = date '2026-11-07';   -- 10-jun + 150

    if temprano is null or tarde is null then
      raise exception 'faltan días de la ventana del repaso en la serie';
    end if;
    if temprano <= tarde then
      raise exception 'la cola del repaso no baja: 17-oct %, 07-nov % (¿concepción uniforme?)',
        temprano, tarde;
    end if;
  end;
  ok := ok + 1;

  -- 2.3. Los partos reales del día se cuentan todos —también el de la oveja
  --      de alta manual—, pero las PARIDAS del porcentaje solo cuentan
  --      inseminadas: si no, el avance podría pasar del 100 %.
  select * into r from v_avance_paricion
   where temporada = 2026 and dia = date '2026-08-02';
  if r.partos <> 3 then
    raise exception 'el 2 de agosto hubo 3 partos, la vista dice %', r.partos;
  end if;
  ok := ok + 1;

  select max(partos_acumulados), max(paridas_acumuladas) into n, n_paridas
    from v_avance_paricion where temporada = 2026;
  if n <> 5 then
    raise exception 'los partos acumulados deberían cerrar en 5, cierran en %', n;
  end if;
  if n_paridas <> 4 then
    raise exception 'las paridas deberían ser 4 (la de alta manual no cuenta), son %',
      n_paridas;
  end if;
  ok := ok + 1;

  raise notice 'métricas · avance: %/9 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 3. v_mortalidad: con fecha_muerte, nunca con estado.
-- ---------------------------------------------------------------------------

do $$
declare
  c  record;
  r  record;
  ok int := 0;
begin
  select * into c from ctx;

  -- Un cordero señalado que muere después conserva su estado `senalado` (R8),
  -- así que contar por estado lo perdería. Se lo mata acá, ya señalado.
  update corderos
     set estado = 'senalado', tatuaje = '001', fecha_senalada = date '2026-08-03',
         canela_vellon = 0, canela_no_vellon = 0, lunar_vellon = 0, lunar_no_vellon = 0,
         entropion = 'ninguno', halo_hair = 0, pigmentacion = 2,
         actualizado_por = c.usuario
   where id = c.cordero_a1;

  update corderos
     set fecha_muerte = date '2026-08-03', causa_muerte = 'infeccion',
         actualizado_por = c.usuario
   where id = c.cordero_a1;

  -- Y otro que muere entre el nacimiento y la señalada (R8): ese sí queda en
  -- estado `muerto`, porque no tiene nada que perder.
  update corderos
     set estado = 'muerto', fecha_muerte = date '2026-08-03', causa_muerte = 'infeccion',
         actualizado_por = c.usuario
   where id = c.cordero_b2;

  select * into r from v_mortalidad where temporada = 2026;

  if r.nacidos <> 7 then
    raise exception 'nacieron 7 corderos, la vista cuenta %', r.nacidos;
  end if;
  ok := ok + 1;

  if r.muertos_al_nacer <> 1 then
    raise exception 'hubo 1 muerto al nacer, la vista cuenta %', r.muertos_al_nacer;
  end if;
  ok := ok + 1;

  if r.muertos_antes_de_senalar <> 1 then
    raise exception 'hubo 1 muerto antes de señalar, la vista cuenta %',
      r.muertos_antes_de_senalar;
  end if;
  ok := ok + 1;

  -- La aserción que justifica el archivo entero: este cordero figura con
  -- estado `senalado`, así que contar muertos por estado daría uno menos.
  if r.muertos_despues_de_senalar <> 1 then
    raise exception 'el señalado que murió no se contó (la vista dice %) — ¿se está contando por estado?',
      r.muertos_despues_de_senalar;
  end if;
  ok := ok + 1;

  raise notice 'métricas · mortalidad: %/4 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Las cuatro vistas que quedan, con los datos del mismo fixture.
-- ---------------------------------------------------------------------------

do $$
declare
  n  int;
  r  record;
  ok int := 0;
begin
  -- 4.1. Tipo de nacimiento: tres únicos (C, D, E) y dos mellizos (A, B).
  select count(*) into n from v_tipo_nacimiento
   where temporada = 2026 and tipo_nacimiento = 1;
  if n <> 1 then
    raise exception 'v_tipo_nacimiento debería tener una fila para los únicos';
  end if;

  select * into r from v_tipo_nacimiento
   where temporada = 2026 and tipo_nacimiento = 1;
  if r.partos <> 3 then
    raise exception 'hubo 3 partos únicos, la vista dice %', r.partos;
  end if;

  select * into r from v_tipo_nacimiento
   where temporada = 2026 and tipo_nacimiento = 2;
  if r.partos <> 2 or r.corderos <> 4 then
    raise exception 'los mellizos son 2 partos y 4 corderos; la vista dice % y %',
      r.partos, r.corderos;
  end if;
  ok := ok + 1;

  -- 4.2. Señaladas pendientes: los vivos sin señalar y sin morir. Quedan
  --      cuatro — el señalado y los dos muertos no están.
  select coalesce(sum(pendientes), 0) into n
    from v_senaladas_pendientes where temporada = 2026;
  if n <> 4 then
    raise exception 'quedan 4 corderos por señalar, la vista dice %', n;
  end if;
  ok := ok + 1;

  -- 4.3. Peso: solo vivos con peso, y el muerto al nacer no entra.
  select coalesce(sum(con_peso), 0) into n
    from v_peso_promedio where temporada = 2026;
  if n <> 6 then
    raise exception 'hay 6 corderos vivos con peso, la vista cuenta %', n;
  end if;
  ok := ok + 1;

  -- 4.4. Condición corporal: cinco partos, uno de ellos sin dato. El null es
  --      una fila propia y no se descarta: «no se midió» es información.
  select count(*) into n from v_condicion_corporal
   where temporada = 2026 and condicion_corporal is null;
  if n <> 1 then
    raise exception 'el parto sin condición corporal debería salir como fila «sin dato»';
  end if;
  ok := ok + 1;

  -- 4.5. Prevalencias: el andamiaje de ceros. Un rasgo que nadie tuvo tiene
  --      que aparecer con cero, no faltar — si no, el tablero dibuja una
  --      matriz con huecos y nadie sabe si es «no tiene» o «no se miró».
  select count(*) into n from v_prevalencias_fenotipicas
   where temporada = 2026 and rasgo = 'pigmentacion';
  if n <> 5 then
    raise exception 'la pigmentación tiene 5 valores posibles (0–4), la vista trae %', n;
  end if;

  select * into r from v_prevalencias_fenotipicas
   where temporada = 2026 and rasgo = 'pigmentacion' and valor = '2';
  if r.corderos <> 1 or r.senalados <> 1 then
    raise exception 'el único señalado tiene pigmentación 2 (corderos %, señalados %)',
      r.corderos, r.senalados;
  end if;

  select * into r from v_prevalencias_fenotipicas
   where temporada = 2026 and rasgo = 'pigmentacion' and valor = '4';
  if r.corderos <> 0 then
    raise exception 'nadie tiene pigmentación 4: la fila debe existir con cero, dice %',
      r.corderos;
  end if;
  ok := ok + 1;

  raise notice 'métricas · las otras cuatro vistas: %/5 OK', ok;
end $$;

-- ---------------------------------------------------------------------------
-- 5. v_resumen_temporada: los dos números que se preguntan primero.
-- ---------------------------------------------------------------------------

do $$
declare
  r  record;
  ok int := 0;
begin
  select * into r from v_resumen_temporada where temporada = 2026;

  -- 5.1. Las ovejas de la temporada, hayan parido o no. La F fue servida y
  --      todavía no parió; la D parió sin haber sido servida (alta manual R9).
  --      Las seis cuentan: el denominador es el rodeo, no la lista de servicios.
  if r.ovejas <> 6 then
    raise exception 'la temporada tiene 6 ovejas, la vista dice %', r.ovejas;
  end if;
  ok := ok + 1;

  -- 5.2. Paridas: cinco de las seis.
  if r.ovejas_paridas <> 5 then
    raise exception 'parieron 5 ovejas, la vista dice %', r.ovejas_paridas;
  end if;
  ok := ok + 1;

  -- 5.3. Nacidos, sin anulados.
  if r.corderos_nacidos <> 7 then
    raise exception 'nacieron 7 corderos, la vista dice %', r.corderos_nacidos;
  end if;
  ok := ok + 1;

  -- 5.4. Señalados. Es el numerador del «% de señalada», que se mide contra
  --      las ovejas PARIDAS y no contra los corderos nacidos: la pregunta es
  --      cuántos corderos deja cada oveja que parió, así que puede pasar del
  --      100 % y eso no es un error — son los mellizos.
  if r.corderos_senalados <> 1 then
    raise exception 'hay 1 cordero señalado, la vista dice %', r.corderos_senalados;
  end if;
  ok := ok + 1;

  raise notice 'métricas · resumen de la temporada: %/4 OK', ok;
end $$;

rollback;
