-- Publicación de replicación lógica para PowerSync.
--
-- Lista explícita de tablas, NO `for all tables`. Dos razones:
--   1. `cambios` tiene que quedar afuera. Es auditoría: la lee la web admin
--      online, no tiene por qué viajar a los dispositivos.
--   2. PowerSync procesa TODO lo que entra en la publicación, aunque las sync
--      rules no lo usen. Publicar de más es trabajo de replicación desperdiciado.

create publication powersync
  for table public.ovejas, public.partos, public.corderos, public.perfiles;

comment on publication powersync is
  'Tablas replicadas a los dispositivos. `cambios` está deliberadamente excluida.';
