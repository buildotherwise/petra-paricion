-- Ninguna vista nace con permiso de lectura.
--
-- `partos_resumen` existe desde 0001 y en producción no la puede leer nadie de
-- la app: los privilegios por defecto del rol dueño sobre `public` le dan a
-- `authenticated` todo menos SELECT (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN),
-- así que PostgREST devuelve 42501. Los grants explícitos de 0002 cubrieron las
-- cuatro tablas y se olvidaron de la vista, que es el único objeto del esquema
-- que no aparece en esa lista.
--
-- Estuvo dos meses así sin que se notara, por dos razones que conviene tener
-- presentes: la app nunca la consulta —los conteos de R1 se calculan sobre la
-- réplica local de cada dispositivo— y los tests que sí la consultan
-- (anulacion.test.sql) corren como dueño, igual que el SQL Editor de Supabase,
-- que es donde uno iría a probarla a mano.
--
-- Importa ahora porque la segunda tanda de la Fase 4 agrega siete vistas de
-- métricas. Sin esto las siete nacen rotas del mismo modo, y se descubre con
-- los tableros a medio hacer.

-- Sin security_invoker la vista corre con los privilegios de su dueño y saltea
-- el RLS de las tablas base: le mostraría todos los partos a cualquier
-- `authenticated`, incluso a una cuenta desactivada — que es la diferencia
-- entre desactivar a alguien y creer que se lo desactivó. Es inocuo mientras
-- nadie pueda leerla; deja de serlo en la línea siguiente.
alter view partos_resumen set (security_invoker = true);

grant select on partos_resumen to authenticated;
grant select on partos_resumen to service_role;

comment on view partos_resumen is
  'R1: el tipo de nacimiento nunca se tipea, se cuenta. Los anulados no cuentan; se exponen aparte para que la web pueda revisarlos. Toda vista nueva necesita SUS DOS LÍNEAS —security_invoker y el grant— o nace muda: lo verifica supabase/tests/vistas.test.sql.';
