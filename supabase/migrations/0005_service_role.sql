-- Privilegios de service_role.
--
-- 0002_rls.sql declaró los grants explícitos para dejar de depender de la
-- casilla "Automatically expose new tables" del panel, pero solo cubrió a
-- `authenticated`. `service_role` quedó sin acceso, y es el rol que usan las
-- tareas administrativas que corren fuera de la app: importar las caravanas de
-- la temporada, provisionar cuentas, exportar.

grant select, insert, update on ovejas, partos, corderos, perfiles to service_role;

-- La auditoría se lee para exportarla, nunca se escribe: la única vía de
-- escritura sigue siendo el trigger.
grant select on cambios to service_role;

-- Sin borrado físico tampoco para el rol administrativo. Las bajas son lógicas
-- para preservar la trazabilidad, y eso no debería depender de la disciplina de
-- quien corre un script.
revoke delete on ovejas, partos, corderos, perfiles, cambios from service_role;
