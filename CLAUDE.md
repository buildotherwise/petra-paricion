# Especificación — Sistema de registro de Parición y Señalada

**Establecimiento:** Petra (norte de Uruguay) · Cría de Merino Australiano
**Objetivo:** reemplazar los formularios de Zoho Forms por un sistema propio, offline-first, multi-dispositivo, con plataforma web de administración y dashboards.
**Contingencia:** durante esta temporada Zoho Forms queda disponible como respaldo.

---

## 1. Contexto operativo

- La parición dura varias semanas. Los registros se hacen en el campo, frecuentemente **sin conexión a internet**.
- Dos momentos de captura por cordero:
  1. **Parición** (nacimiento): identificación de la madre, datos básicos del cordero.
  2. **Señalada/tatuaje** (5–10 días después): se aplica el tatuaje identificatorio en la oreja y se completa la información fenotípica.
- Las **caravanas de las madres se precargan** desde la lista de ovejas inseminadas, para eliminar errores de tipeo.
- Los **collares** se usan solo en partos múltiples (mellizos/trillizos) para distinguir corderos entre sí y asociarlos a su madre hasta la señalada. Luego se liberan y reutilizan.
- Dispositivos: iPhones del personal + 1 tablet Android dedicada (máximo ~5 dispositivos). La tablet Android se considera el **dispositivo principal** de captura.
- Volumen estimado: cientos a pocos miles de corderos por temporada. Escala chica; priorizar simplicidad y robustez sobre performance.

## 2. Requisitos no funcionales

- **Offline-first total:** toda funcionalidad de captura debe operar sin conexión, por días si es necesario. Al recuperar señal, sincronización automática bidireccional.
- **PWA instalable** ("agregar a pantalla de inicio") que funcione igual en iOS Safari y Android Chrome. Sin pasar por App Store / Play Store.
- **Indicador permanente de sincronización:** en todas las pantallas debe verse cuántos cambios locales están pendientes de subir. Con pendientes = 0, el dispositivo puede perderse o reinstalarse sin pérdida de datos.
- **UX de campo:** botones grandes (mínimo 48px), alto contraste (uso a pleno sol), teclado numérico donde aplique, flujo de registro de un parto en menos de 45 segundos, mínimo tipeo libre.
- **Auditoría:** todo cambio registra dispositivo/usuario, timestamp y valores anterior/nuevo.
- **Continuidad histórica:** mantener la codificación de los formularios Zoho (Halo hair 0/1, Pigmentación 0–4, etc.) para que los datos sean comparables entre temporadas.

## 3. Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| App de campo + web admin | React + TypeScript + Vite, `vite-plugin-pwa` | Una sola codebase; vistas de admin habilitadas por rol |
| Base local y sincronización | **PowerSync** (`@powersync/web`, SQLite local) | Réplica local por dispositivo, sync bidireccional, cola de subida persistente, reintentos |
| Backend | **Supabase** (Postgres + Auth) | Ya disponible en la infraestructura del usuario |
| Dashboards | **Integrados en la web admin** (Recharts) | Métricas definidas como vistas SQL en Postgres, para poder conectar un BI externo a futuro sin rehacer nada |
| Estilos | CSS simple o Tailwind | Mantener dependencias mínimas |

### Identidad visual (paleta derivada del logo de Petra)

| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#2A2410` | Texto principal, botón de señalada, barras oscuras |
| `--paper` | `#F4F0E3` | Fondo general (marfil cálido) |
| `--brand` | `#6B5A1E` | **Acciones principales** — oro del logo oscurecido para cumplir contraste AA (6,8:1) con texto blanco a pleno sol |
| `--brand-press` | `#514413` | Estado presionado |
| `--brand-tint` | `#EFE8CF` | Fondos suaves (champán del emblema) |
| `--gold` | `#8C7A2E` | Oro del logo: marca, enlaces, acentos |
| `--tag` | `#F4C21F` | Chips de caravana (amarillo real de las caravanas) |
| `--ok` / `--amber` / `--red` | `#2E6B3F` / `#A34B00` / `#B3261E` | **Semánticos, no se marcan:** sincronizado / pendiente / error-muerto. La claridad del indicador de sync prima sobre la marca |
| `--line` / `--muted` | `#E0D9C4` / `#7A7259` | Bordes y texto secundario |

La marca en encabezados se compone con el **emblema del carnero solo** —`public/emblema.png`, recortado del logo por `scripts/generar-iconos.py`— más «Petra» en serif y «MERINO AUSTRALIANO» debajo, espaciada. **No usar el ícono de la PWA como marca:** ese es el logo entero comprimido en un cuadrado, y a 30 px su lettering queda en menos de tres píxeles de alto. Un ícono de app y una marca de encabezado no son la misma imagen. Abajo de 384 px de pantalla la línea de la raza se esconde: medido, la marca completa más la pastilla de sync en su peor caso piden 363 px, y una raza recortada a mitad de palabra se ve peor que ausente. Lo que cede es siempre lo decorativo, nunca el indicador de sincronización. **Nota importante:** el oro puro del logo (`#8C7A2E`) tiene contraste 3,0:1 sobre blanco — insuficiente para texto o botones; usarlo solo decorativamente y usar `--brand` para todo lo interactivo. Archivos: `logo_petra_sin_fondo.png` (versión con transparencia generada desde el JPG original; apta para fondos claros).

### Usuarios y permisos

**Autenticación:** Supabase Auth con email + contraseña. **Registro público deshabilitado** — las cuentas las crea el administrador con `scripts/crear-cuenta.py` o desde el panel de Supabase. **No desde la web admin:** crear un usuario exige `service_role`, o sea una Edge Function con la llave de administración expuesta a una pantalla, para cuatro o seis cuentas. Escala esperada: 4–6 cuentas.

**Roles**, guardados en una tabla `perfiles`:

```sql
create table perfiles (
  user_id uuid primary key references auth.users(id),
  nombre  text not null,
  rol     text not null check (rol in ('operador','admin')),
  activo  boolean not null default true
);
```

- **`operador`** (app de campo): crear partos y corderos, completar señaladas, editar registros de la temporada activa, alta manual de ovejas. No puede borrar, importar ni gestionar usuarios.
- **`admin`** (web): todo lo anterior + correcciones con auditoría, importación de inseminadas, exportaciones, gestión de usuarios. Los borrados son siempre lógicos (nunca `delete` físico), para preservar la trazabilidad.

**Aplicación de permisos:** Row Level Security habilitado en todas las tablas; las políticas verifican usuario autenticado + `perfiles.activo = true` + rol según la operación. Así los permisos se cumplen en el servidor aunque el cliente esté comprometido. El acceso de un BI externo futuro va por un usuario Postgres de solo lectura, separado de Auth.

**Cuentas y auditoría:** una cuenta por persona (recomendado, mejora la auditoría de `creado_por`/`actualizado_por`). La tablet compartida puede tener su propia cuenta (`tablet-campo`) si la usan varias personas indistintamente — decidirlo en la reunión operativa.

**Sesiones y offline:** sesiones de larga duración con renovación automática de token al reconectar; en el campo la app nunca pide login. El único requisito es haber iniciado sesión una vez con conexión al instalar la app en el dispositivo. Existe un **«Cerrar sesión»** al pie del inicio, discreto —para la tablet compartida y las pruebas con otras cuentas, no para el día a día—, con doble guarda: se bloquea con cargas sin subir y también con cargas rechazadas, porque `disconnectAndClear()` borra la réplica local entera y `subidas_rechazadas` es la última copia de esos datos. Si la sesión se cae con trabajo local adentro, la pantalla de login lo dice y pide entrar con la misma cuenta.

**Dispositivo perdido o robado:** el admin desactiva la cuenta (`activo = false`) y revoca sus sesiones desde Supabase; el dispositivo pierde la capacidad de subir datos. Todo lo ya sincronizado está a salvo en el servidor; solo se perdería lo pendiente de subir en ese aparato (de nuevo: el indicador de pendientes es el hábito clave).

**Baja de personal:** desactivar la cuenta, nunca eliminarla, para que la auditoría histórica conserve quién registró qué.

## 4. Modelo de datos (Postgres / Supabase)

> **El SQL de abajo es el diseño; la base tiene cuatro diferencias que conviene tener presentes.** `creado_por` y `actualizado_por` son `uuid not null references auth.users(id)`, no `text`: el aparato va en una columna aparte, `dispositivo text`, que también existe en `ovejas`, `partos` y `corderos` junto con `creado_en` y `actualizado_en`. La tabla `cambios` tiene además `tipo` (`creacion`/`actualizacion`), `dispositivo` y `reportado_en` —el reloj del dispositivo, contra `realizado_en` que es el del servidor—, su `campo` es *nullable* (null en las creaciones), y **la escribe un trigger `auditar()`, no la app**. `causa_muerte_t` existe con siete valores (migración 0006) aunque su `create type` no figure abajo. Y `partos.collar_puesto` existe desde la 0008.

Principio central: **el cordero es una única entidad** que se crea en la parición y se completa en la señalada. No existen dos registros a vincular a posteriori.

```sql
create type sexo_t          as enum ('macho', 'hembra');
create type condicion_t     as enum ('vivo', 'muerto');
create type marca_collar_t  as enum ('punto_arriba', 'cruz_al_medio', 'punto_abajo');
create type entropion_t     as enum ('ninguno', 'ojo_derecho', 'ojo_izquierdo', 'ambos');
create type estado_cordero_t as enum ('nacido', 'senalado', 'muerto');
create type madre_t         as enum ('biologica', 'nodriza');
create type motivo_anulacion_t as enum ('duplicado', 'otra_oveja', 'otro_parto', 'otro');
create type servicio_t      as enum ('inseminacion', 'encarnerada');

-- Madres: se precargan por CSV antes de la temporada
create table ovejas (
  id                 uuid primary key default gen_random_uuid(),
  temporada          int  not null,                -- ej. 2026
  caravana           text not null,
  -- fecha_inseminacion y padre EXISTIERON acá y se eliminaron en la 0010: un
  -- date y un text no pueden decir «hasta cuatro servicios, con padres
  -- distintos, uno de ellos con rango». Ver la tabla `servicios` más abajo.
  precargada         boolean not null default true, -- false = alta manual en campo (revisar en web)
  observaciones      text,
  unique (temporada, caravana)
);

-- Los hechos reproductivos de cada madre (migración 0010). Su lectura por
-- PostgREST es solo para admin, como `cambios`; desde la 0018 sí se replica a
-- los dispositivos —proyectada, sin auditoría— porque el padre probable del
-- alta se calcula en el corral, sin señal (§7).
--
-- SERVICIO = inseminación artificial: fecha puntual, padre cierto, hasta tres
-- por oveja separadas ~15 días (el ciclo estral). ENCARNERADA = el repaso, el
-- carnero suelto con el lote, y va con RANGO. La IA se guarda como un rango de
-- un día para que la ventana de parto sea UNA fórmula sin ramas:
-- [fecha_inicio + 145, fecha_fin + 155]. La CABAÑA es del padre, no de la madre.
create table servicios (
  id           uuid primary key default gen_random_uuid(),
  oveja_id     uuid not null references ovejas(id),
  tipo         servicio_t not null,          -- 'inseminacion' | 'encarnerada'
  fecha_inicio date not null,
  fecha_fin    date not null,                -- = fecha_inicio en la inseminación
  padre        text not null,                -- texto como la caravana: '32' ≠ '0032'
  cabana       text,
  -- actualizado_por es NULLABLE, como en ovejas: la carga de referencia corre
  -- server-side y el trigger auditar() no escribe sin autor. Una corrección
  -- posterior desde la web sí queda firmada.
  constraint servicios_idempotencia unique (oveja_id, tipo, fecha_inicio, padre)
);

-- Un parto por oveja por temporada
create table partos (
  id                  uuid primary key,             -- UUID generado en el dispositivo
  oveja_id            uuid not null references ovejas(id),
  fecha               date not null,
  condicion_corporal  numeric(3,2),                 -- escala 1–5 en cuartos
  collar_numero       text,                         -- solo múltiples; también lo lleva la madre
  observaciones       text,
  creado_en           timestamptz not null default now(),
  creado_por          text not null,                -- id de dispositivo/usuario
  unique (oveja_id)
);

create table corderos (
  id                uuid primary key,               -- UUID generado en el dispositivo
  parto_id          uuid not null references partos(id),
  temporada         int  not null,                  -- denormalizado desde la oveja
  estado            estado_cordero_t not null default 'nacido',

  -- Etapa 1: parición
  sexo              sexo_t not null,
  condicion         condicion_t not null,           -- vivo/muerto AL NACER
  peso_kg           numeric(4,2) check (peso_kg > 0 and peso_kg <= 8),
  collar_marca      marca_collar_t,                  -- el NÚMERO está en partos
  madre_tipo        madre_t not null default 'biologica',
  madre_crianza_id  uuid references ovejas(id),      -- si nodriza

  -- Etapa 2: señalada (nullable hasta completarse)
  tatuaje           text,
  fecha_senalada    date,
  canela_vellon     smallint check (canela_vellon in (0,1)),
  canela_no_vellon  smallint check (canela_no_vellon in (0,1)),
  lunar_vellon      smallint check (lunar_vellon in (0,1)),
  lunar_no_vellon   smallint check (lunar_no_vellon in (0,1)),
  entropion         entropion_t,
  halo_hair         smallint check (halo_hair in (0,1)),
  pigmentacion      smallint check (pigmentacion between 0 and 4),
  sexo_discrepancia boolean not null default false,  -- ver regla R6

  -- Muerte, al nacer o posterior (R8)
  fecha_muerte      date,
  causa_muerte      causa_muerte_t,

  -- Baja lógica del error de carga (R13). Los tres van juntos o ninguno.
  anulado_en        timestamptz,
  anulado_por       uuid references auth.users(id),
  anulado_motivo    motivo_anulacion_t,

  observaciones     text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text not null
);

-- Tatuaje único por temporada (permite null mientras no está señalado)
create unique index corderos_tatuaje_unico
  on corderos (temporada, tatuaje) where tatuaje is not null;

-- Auditoría de cambios (la app escribe una fila por campo modificado en ediciones)
create table cambios (
  id             bigint generated always as identity primary key,
  tabla          text not null,
  registro_id    uuid not null,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  realizado_por  text not null,
  realizado_en   timestamptz not null default now()
);

-- Vista de resumen: el tipo de nacimiento SE DERIVA, nunca se tipea
create view partos_resumen as
select
  p.id, p.oveja_id, o.caravana, p.fecha, p.condicion_corporal,
  -- Los anulados no cuentan: un muerto existió, un anulado no (R13).
  count(c.id) filter (where c.anulado_en is null)                           as tipo_nacimiento,
  count(c.id) filter (where c.anulado_en is null and c.condicion = 'vivo')  as nacidos_vivos,
  count(c.id) filter (where c.anulado_en is null and c.estado = 'senalado') as senalados,
  count(c.id) filter (where c.anulado_en is not null)                       as anulados
from partos p
join ovejas o on o.id = p.oveja_id
left join corderos c on c.parto_id = p.id
group by p.id, o.caravana;
```

## 5. Reglas de negocio y validaciones

- **R1 — Tipo de nacimiento derivado:** nunca se ingresa manualmente. Se calcula como cantidad de corderos del parto. En pantalla y exportaciones se muestra el valor derivado (1/2/3).
- **R2 — Collar solo en múltiples:** el **número de collar es del parto**, no del cordero: lo llevan todos los hermanos y también la madre (sin marca). Se pide una sola vez, al agregar el segundo cordero. Lo que distingue a cada hermano es la **marca**, que se exige a todos —vivos y muertos— antes de poder confirmarlos. En partos únicos los campos de collar no se muestran. Si un parto múltiple vuelve a ser único, la app **pregunta si la madre sigue con el collar puesto** (`partos.collar_puesto`): antes de guardar el parto el collar se suelta solo, pero después de guardado el collar puede estar físicamente en el animal y solo lo sabe quien lo está mirando. El **número** queda reservado igual — ver R3.
- **R3 — Un número, una temporada:** un número de collar usado no vuelve a estar disponible hasta la temporada siguiente. No lo liberan la muerte de un cordero (R8), ni la señalada, ni la anulación: el collar es un objeto que sigue puesto en la madre y en los hermanos hasta que alguien va y lo saca, y ninguno de esos hechos lo saca de la oveja. Dentro del parto, cada marca se usa una sola vez — y la marca de un cordero anulado sí se libera, porque no es un objeto aparte sino la que lleva ese collar. Validación en la app contra la base local; la web muestra un panel de duplicados por si dos dispositivos offline asignaron el mismo collar (caso muy improbable con 5 dispositivos: resolver manualmente).
- **R4 — Condición corporal una sola vez:** es atributo del parto, no del cordero. Se pide una vez, con la escala visible (1 muy flaca … 5 muy gorda).
- **R5 — Corderos muertos al nacer:** requieren sexo, **causa de muerte** (lista cerrada de siete motivos, heredada de Zoho) y **fecha de muerte** — que no puede ser anterior al parto ni posterior a hoy. El peso es opcional. En partos múltiples llevan collar y marca igual que los vivos. No pasan por señalada. Estado = `muerto`.
- **R6 — Confirmación de sexo en la señalada:** la app muestra el sexo registrado al nacer y pide confirmarlo con un toque. Si el operador indica lo contrario, se actualiza el sexo, se marca `sexo_discrepancia = true` y el caso aparece en el panel de revisión web. Así el dato duplicado de Zoho se convierte en una verificación que detecta errores de vínculo en vez de generarlos.
- **R7 — Rangos de peso:** advertencia (no bloqueo) fuera de **2,5–6,0 kg**; bloqueo fuera de **0,5–8,0 kg** y con más de dos decimales. Umbrales calibrados contra los 468 corderos vivos de 2025 (mediana 4,14 · máximo 6,90): el aviso sobre 6 kg salta en 1 de cada 33 partos — a 5 kg saltaría en 1 de cada 6 y el equipo aprendería a descartarlo.
- **R8 — Muerte entre nacimiento y señalada:** acción "Registrar muerte" sobre el cordero → estado `muerto`, `fecha_muerte` y **causa obligatoria** (la restricción `muerte_documentada` la exige, y sin causa no hay análisis de mortalidad; la lista trae "Sin diagnóstico" para cuando de verdad no se sabe). `condicion` no cambia: dice cómo nació. **No libera el collar** (R3). El parto conserva el conteo de nacidos. Solo se aplica a corderos sin señalar: la muerte de un señalado perdería el hecho de haberlo sido y se corrige desde la web.
- **R13 — Anulación de un cordero:** para el error de carga —se cargó de más, o dos veces—, no para lo que le pasó al animal. Es baja lógica (`anulado_en`, `anulado_por`, `anulado_motivo` de lista cerrada), porque el borrado está revocado en todas las tablas. Un anulado **no cuenta** para el tipo de nacimiento (R1) ni para la señalada, y sigue visible en la ficha, tachado y con autor. No se puede anular un cordero señalado —tiene el tatuaje puesto— ni el último que queda: un parto sin corderos no puede existir, porque alguien vio parir a la oveja. Si el parto entero está mal, lo que corresponde es cambiar la madre.
- **R9 — Oveja fuera de la lista:** si una madre no aparece en la búsqueda, alta manual con `precargada = false`. Aparece en el panel de revisión web para verificar la caravana.
- **R10 — Nodriza:** si un cordero pasa a criarse con otra madre, se registra `madre_tipo = nodriza` y `madre_crianza_id`, conservando siempre el parto (madre biológica) original.
- **R11 — Señalada completa o nada:** el pasaje a estado `senalado` exige tatuaje + todos los campos fenotípicos. No se admiten señaladas a medias, y la restricción `senalada_completa` lo hace cumplir en la base, no solo en la app. No hay borrador: salir a la mitad deja al cordero sin señalar, tal como estaba. `fecha_senalada` es siempre hoy y no se pide en el campo — un control más por cordero, seiscientas veces, para un dato que en la práctica nunca difiere; se corrige desde la web. **Ojo:** `validarFechaNacimiento` no sirve para validarla, porque un cordero nacido el 28 de noviembre se señala en diciembre, fuera de la ventana de parición.
- **R14 — Tatuaje:** tres dígitos, del **001 al 999**, siempre con los ceros a la izquierda, y **único por temporada** (índice parcial `corderos_tatuaje_unico`). Se normaliza *siempre* antes de guardar: la columna es `text`, así que sin normalizar «7» y «007» serían dos tatuajes distintos para Postgres y el mismo número en dos orejas. La app **sugiere el siguiente libre contando desde el último puesto**, no desde el mayor de la temporada, y salteando los ya ocupados. Sigue sin rellenar huecos hacia atrás —un número salteado casi siempre es un cordero que murió, y reusarlo confundiría dos animales en el histórico—, pero un número suelto muy arriba ya no envenena la serie: el 27 de agosto de 2026 una cordera terminó con el **910** en la oreja por un error al manipular la tatuadora, y el mayor más uno dejó sugiriendo 911 el resto de la temporada, con la persona corrigiendo a mano cada cordero. Contando desde el último, ese número molesta **una sola vez**: la primera corrección a mano vuelve a poner la serie en su lugar. Medido sobre las 199 señaladas ya cargadas, la regla vieja acertaba 79 y la nueva 142. «El último» es la última señalada cargada ordenada por `fecha_senalada` y recién después por `actualizado_en`, para que corregir hoy una señalada de agosto no la convierta en la última. La sugerencia se calcula sobre la réplica local, así que **la señalada es la única operación de la app que necesita estar al día**: un aparato con días sin bajar datos cuenta desde un cordero viejo, propone números que otro ya gastó y el rechazo llega cuando el animal ya tiene el tatuaje puesto. Se **avisa, no se bloquea** — negarse a trabajar sin señal en un corral que rara vez la tiene convertiría un riesgo raro en un bloqueo seguro. Contención de fondo: nunca hay dos aparatos señalando a la vez.
- **R12 — Fechas:** fecha de nacimiento por defecto = hoy. Tiene que caer dentro de la **ventana de parición de la temporada — del 1 de agosto al 30 de noviembre** del año correspondiente — y nunca en el futuro. Dentro de esa ventana no hay límite de días hacia atrás: un parto puede encontrarse bastante después de ocurrido, y mientras caiga en la temporada es un dato legítimo. Lo que se bloquea es la fecha de otro año o fuera de esos cuatro meses, que solo puede ser un error de tipeo.

## 6. Sincronización (PowerSync + Supabase)

- **Alcance del sync:** todos los dispositivos replican la temporada activa completa (ovejas, partos, corderos) más `perfiles` y `servicios`. El volumen es chico (miles de filas), así que sync total es simple y suficiente; no hace falta particionar por dispositivo. **`servicios` es la única que baja sin ser escribible desde el campo** y baja *proyectada* —solo los hechos reproductivos, sin auditoría—: la necesita el padre probable del alta (§7), que tiene que calcularse sin señal. Sus políticas RLS no cambiaron: siguen en `es_admin()` para cualquier lectura o escritura por PostgREST. **Las sync rules se pegan a mano en el panel de PowerSync**, así que tocar `powersync/sync-config.yaml` no alcanza — hay que copiarlo allá.
- **Escrituras:** cada alta/edición se aplica primero a la base SQLite local y entra en la cola de subida de PowerSync. El backend valida y persiste en Postgres.
- **Conflictos:** el perfil de uso hace casi imposible que dos dispositivos editen el mismo registro simultáneamente (cada parto lo registra quien lo encuentra). Estrategia: last-write-wins por registro + tabla `cambios` para reconstruir cualquier pisada accidental desde la web.
- **Identificadores:** UUIDs generados en el dispositivo. Jamás depender de secuencias del servidor para crear registros offline.
- **Indicador de pendientes:** contador visible en el header de todas las pantallas ("3 sin sincronizar" / "Todo sincronizado ✓"). Es la señal operativa clave del día a día.
- **Nota iOS:** Safari puede purgar almacenamiento de sitios sin uso prolongado. Mitigación: instalar como PWA en pantalla de inicio, sincronizar al menos una vez al día, y recordar que todo lo ya sincronizado se restaura solo desde el servidor. El único dato en riesgo es lo pendiente de subir — de ahí la importancia del indicador.

## 7. Pantallas — app de campo

**Inicio:** temporada activa, estado de sincronización, dos botones grandes —`Registrar parto` y `Señalada`— y los contadores **agrupados por unidad**: `PARTOS: hoy · en la temporada` y `CORDEROS: nacidos · sin señalar`. Los tres en una fila mezclaban partos con corderos sin decirlo, y con tres partos que dieron cinco corderos los números parecían contradecirse. El sustantivo se dice una vez, arriba de cada grupo. «Sin señalar» es el único contador tocable: lleva a la señalada.

**Registrar parto:**
1. Buscador de caravana: campo numérico que filtra la lista precargada al escribir. Opción "No está en la lista" → alta manual (R9). Si la oveja ya tiene parto registrado, avisar y ofrecer abrirlo (evita duplicados).
2. Fecha (default hoy) y condición corporal (selector 1–5 con descripciones cortas). Debajo de la fecha, el **padre probable** de ese parto (§9) — ahí y no en el paso de la caravana porque depende de la fecha, y si alguien la corrige el padre se corrige con ella. **No es un adorno informativo: es el control de la caravana.** El error más caro del sistema es registrar el parto en la oveja equivocada, y que ningún servicio de esa madre explique la fecha es la única señal disponible en el corral, con el animal delante y antes de guardar. Avisa y no bloquea (como R7 y R14): un parto adelantado de verdad existe, y quien mira al animal sabe más que una cuenta de días. Se repite en una línea del resumen, que es el último lugar donde se puede frenar algo. En una oveja de alta manual (R9), que nunca va a tener servicios, no se dice nada — un cartel permanente en un caso normal es ruido que enseña a no mirar.
3. Corderos: botón "+ Agregar cordero" → sexo (dos botones), vivo/muerto, peso (teclado numérico), collar si corresponde (R2).
4. Resumen ("Mellizos: 1 macho vivo 4,2 kg — collar 12 punto arriba / 1 hembra viva 3,8 kg — collar 13 punto arriba") → Guardar.

**Señalada:** se señala **en tandas y por la madre** — se agarra la oveja y lo primero que se sabe es su caravana, aun en los partos únicos, que no llevan collar. Por eso el buscador va arriba y la lista de pendientes abajo, y no al revés: una lista de doscientos corderos ordenada por antigüedad no ayuda a encontrar la oveja que ya se tiene agarrada.
1. Buscador de caravana o collar; debajo, los partos con corderos sin señalar, los más viejos primero. Un aviso al entrar si el aparato hace más de 12 h que no baja datos — ver R14.
2. En partos múltiples, elegir al hermano por su **marca de collar dibujada** (la posición es el dato, no la palabra). En partos únicos esta pantalla se saltea.
3. Detalle en **una sola pantalla con scroll**, no un asistente: confirmación de sexo (R6), tatuaje (R14), entropión, matriz de canela y lunar, halo hair, pigmentación, observaciones → `Guardar la señalada`. Completa o nada (R11). El botón está **apagado mientras falte algo** y vuelve a apagarse si se des-selecciona un campo.
4. Al guardar: con **un** pendiente el botón lleva derecho a ese hermano; con **dos o más** vuelve a la lista a elegir, porque el orden lo pone quien agarra los corderos y no la app — entrar al que la app eligió significa que si en la mano está el otro, ya se está en la pantalla equivocada y todavía no se sabe.

**Canela y lunar:** las cuatro columnas de Zoho (`canela_vellon`, `canela_no_vellon`, `lunar_vellon`, `lunar_no_vellon`) se capturan como **dos rasgos por dos ubicaciones** en una matriz 2×2, con una barra «Ninguna de las cuatro» que resuelve de un toque el caso mayoritario. La barra no es un adorno: sin ella una casilla apagada no distingue «no tiene» de «todavía no lo miré», y como las columnas son `smallint check in (0,1)` la app estaría escribiendo ceros que nadie afirmó.

**La señalada no toca el collar.** Se saca de hecho al terminar el parto, pero la app no pregunta: el número queda tomado toda la temporada igual (R3) y `partos.collar_puesto` sigue siendo solo del caso de la Fase 2.

**El collar es una segunda chapa, no un dato de texto.** En partos múltiples va al lado de la caravana, en champán y con la marca dibujada adentro: la caravana cuelga de la oreja de la madre y el collar va en el cuello, así que son dos objetos y se ven distintos. Va donde se compara contra el animal —señalar, elegir el hermano, ficha del parto, ficha del cordero— y **no** en las listas de búsqueda, donde el collar ya aparece como texto en la línea chica y ahí está bien: esas pantallas se miran sin el cordero en la mano. La regla: *chapa donde se compara contra el animal, texto donde solo se consulta.* En un cordero ya señalado la chapa grande pasa a ser el tatuaje, que es su nombre a partir de ese momento.

**Partos registrados:** sección propia, con buscador por caravana o collar y la lista de la temporada agrupada por jornada. Se llega desde el pie de «Partos de hoy», en el inicio.

**Ficha del parto:** se mira, y editar es un paso aparte — es la pantalla que más se abre sin intención de cambiar nada, y un formulario siempre activo cambia un dato de un roce. Datos del parto, lista de corderos, "Agregar un cordero" y "Cambiar la madre" (el error de la caravana equivocada, frenado en el teléfono si la oveja destino ya parió).

**Ficha de cordero:** ver/corregir cualquier registro, con las acciones "Registrar muerte" (R8), "Asignar nodriza" (R10) y "Anular cordero" (R13) a la vista, no detrás de un menú.

**Registros con error:** detrás de la pastilla roja del encabezado. Lista de cargas rechazadas por el servidor, con el motivo en castellano llano y todo lo que se había cargado. Quitar una de la lista **pierde datos a propósito** —es la última copia que queda— así que pasa por una confirmación que lo muestra por última vez. El historial de cambios NO está en el teléfono: `cambios` queda fuera de la replicación y su lectura es solo para admin (va en la web, §8).

**Cómo viene la parición:** el tablero de la web (§9), montado como pantalla de campo — misma pieza, mismas nueve tarjetas, mismo chunk, con la escala tipográfica de campo y en una columna (`.tablero-campo` en `tablero.css`). Se entra por el pie de «Partos de hoy», **solo con rol admin**, y no tiene URL propia: la única entrada es ese link. El guard por rol va igual dentro de la pantalla (`TableroCampo.tsx`), porque `history.state` sobrevive al cambio de usuario en la tablet compartida. Es la única pantalla de la app de campo que necesita señal —las métricas son vistas de Postgres— y la bajada lo dice al entrar; su chunk queda fuera del precache, así que la primera apertura sin señal la ataja un ErrorBoundary con reintento en vez de dejar la app en blanco.

## 8. Plataforma web (admin)

Misma app, vistas habilitadas por rol admin, pensada para escritorio con conexión. **Sin link desde la app de campo:** se entra tipeando `/admin/...` desde una PC — desde el celular se veía como lo que es, una pantalla de escritorio. El guard por rol (`PuertaAdmin`) sigue igual; lo que el campo ofrece en su lugar es el tablero (§7).

- Tablas de partos y corderos con filtros (fecha, estado, tipo de nacimiento, discrepancias) y edición con registro en `cambios`.
- **Panel de revisión: ocho preguntas.** Las cinco de esta lista —ovejas de alta manual, discrepancias de sexo, collares duplicados, pesos fuera de rango, corderos sin señalar con más de 15 días— más tres que salieron de maquetar: **partos sin corderos** (la más importante: el conector descarta la transacción entera desde la operación que falla y el parto se inserta antes que sus corderos, así que es la única de las ocho sin falsos positivos), **marcas repetidas dentro de un parto** y **fechas de señalada imposibles**. Cada fila trae el contexto que la vuelve accionable —el tipo de parto al lado de un peso bajo, los hermanos al lado de una discrepancia, las precargadas parecidas al lado de un alta manual— y **el cero se muestra**: «ninguno» es una respuesta, y una lista vacía parece una consulta rota.
- **Importación de servicios: no está en la web.** Es una carga que se hace **una vez** —no una por temporada; si el proyecto se reutiliza el año que viene, cómo entran los datos del año que viene se decide entonces—, así que vive en `scripts/importar-servicios.py`, hermano de `importar-madres.py`: openpyxl, `--dry-run` con informe antes de escribir, y `Prefer: resolution=ignore-duplicates` sobre el `unique` de la tabla, que hace inocuo reejecutarlo. Una pantalla usada una sola vez es mantenimiento sin uso: parser de xlsx en el navegador, seriales de fecha a mano y un chunk más fuera del precache. Una caravana que no cruza contra `ovejas` **se reporta y no se inserta**; las madres no se crean solas.
- **Exportación** CSV/Excel: planilla plana de corderos con columnas equivalentes a los formularios Zoho históricos, más una exportación completa del modelo. Lleva además el **padre derivado** (`padre`, `cabana_padre`, `servicio_tipo`, `gestacion_dias`, `padre_confianza`), que es lo único del archivo que llega del servidor: la exportación lee `v_paternidad`, que es una vista y no se replica. Sin señal esas columnas van vacías y la pantalla lo avisa. `padre_confianza` es lo que permite quedarse solo con lo que la regla vieja afirmaba (§9).
- **Historial de cambios** al pie de cada ficha, y solo en la web: `cambios` sigue fuera de la replicación, así que es lo único que la web admin lee por internet.
- **Correcciones que el teléfono no hace:** la fecha de la señalada, la muerte de un cordero ya señalado (sin tocar `estado`) y deshacer una anulación.
- Sección de **Dashboards** integrada (ver §9).

**Ojo con el alcance del rol.** Ninguna política de RLS distingue admin de operador en `ovejas`, `partos` ni `corderos`: las tres son `using (perfil_activo())`. Lo único que el servidor protege de verdad es `cambios` (solo `es_admin()`) y `perfiles`. Esconder botones separa superficies, no permisos.

**Ninguna vista nace legible.** Los privilegios por defecto del schema `public` le dan a `authenticated` todo menos `SELECT`, así que toda vista nueva necesita `grant select ... to authenticated` y `security_invoker = true` explícitos, o PostgREST devuelve 42501 y la vista saltea el RLS de quien consulta. Lo verifica `supabase/tests/vistas.test.sql`.

## 9. Dashboards (integrados en la web admin)

Los reportes se implementan como una sección de la propia plataforma web, con gráficas en Recharts. **Cada métrica se define como una vista SQL en Postgres** (`v_avance_paricion`, `v_mortalidad`, `v_prevalencias_fenotipicas`, etc.) y la web solo las consume y grafica. Esto mantiene la lógica de cálculo en un solo lugar, auditable, y permite conectar un BI externo (Metabase propio, Looker Studio) en el futuro sin rehacer nada — basta un usuario Postgres de solo lectura apuntando a las mismas vistas.

Las ocho vistas nacieron en `0011_vistas_metricas.sql` —`v_avance_paricion` se redefinió después en la `0014`, la `0015` y la `0016`, que es la vigente— y **cada una lleva sus dos líneas** —`security_invoker = true` y el `grant select`— o `supabase/tests/vistas.test.sql` falla: ese test recorre todas las vistas de `public` y no perdona ninguna. `src/lib/tablero.ts` traduce las filas a lo que dibuja cada tarjeta y es lo único con tests: **el caso difícil de un tablero es el vacío**, y cada transformación tiene su aserción de entrada vacía ⇒ ceros. El tablero va detrás de su propio `lazy()` —con **dos** importadores dinámicos del mismo módulo: `WebAdmin.tsx` y `TableroCampo.tsx`— y su chunk queda **fuera del precache** (`globIgnores`): es lo único de la app que no funciona sin señal. En la web va sin bajada (decirlo cada vez es explicarle la arquitectura a quien vino a mirar cómo viene la parición); la pantalla de campo sí lo advierte en la suya, y en los dos lados cada tarjeta degrada sola, con su error en castellano y su botón de reintentar.

**El padre del cordero se deriva, no se carga** (`v_paternidad`). La pregunta no es «¿quién entra en la ventana?» sino **«¿cuál explica mejor esta fecha?»**: se ordenan los servicios de la madre por qué tan lejos de **150 días** queda la gestación que implican, y gana el primero. Así siempre hay un candidato, y el único silencio que queda es que ni el mejor entre en **140–160** — el mismo rango que usa la curva esperada, para que el proyecto tenga *una* definición de gestación posible. Ante empate gana el servicio más nuevo, por el mismo argumento de la 0016: volver a servirse prueba que el anterior falló.

La versión anterior exigía la ventana `[servicio + 145, servicio + 155]` y **exactamente un** candidato. Se cambió (migración 0018) porque con los primeros partos cargados dejó tres de seis sin padre, y ninguno por falta de datos: implicaban gestaciones de 142, 143 y 144 días. Un cordero nacido a los 143 días es un cordero normal. Ensanchar la ventana no alcanzaba —una ventana tiene dos formas de callarse, que el parto se caiga por un día o que entren dos servicios— así que se cambió la pregunta.

Lo que se afirma viene con su reserva: **`confianza`** es `cierto` (gestación 145–155, lo que la regla vieja afirmaba) o `probable` (140–160, lo que antes se callaba), y **`alternativas`** cuenta los otros servicios posibles *de un padre distinto*, que es la ambigüedad de verdad — dos servicios del mismo carnero no tienen nada que decidir. Quien analice el plantel y quiera la exigencia vieja filtra por `confianza = 'cierto'`. Sigue valiendo el principio que ordena todo esto: un cordero con padre equivocado en un plantel de cabaña es peor que uno sin padre asignado, porque el segundo se investiga y el primero se hereda; por eso el rango se corta donde se corta.

Tarjetas del dashboard:

1. Avance: % de ovejas paridas sobre **servidas** —no sobre inseminadas: hay dieciséis que solo fueron al repaso— y curva diaria de partos contra la esperada. **El retorno al celo se lee en los dos sentidos** (migración `0016`): que una oveja se haya reinseminado prueba que volvió al celo y que la anterior falló, así que de sus IA solo cuenta la última; y que NO se haya reinseminado *habiendo tenido otra tanda por delante* prueba lo contrario, así que pesa mucho más que una de la última tanda, donde no hubo nada que observar. Las dos lecturas salen del mismo número medido —el retorno tras la primera IA, 248 de 484— vía `p = 1 − R/s` y `w = p/(p+(1−p)(1−s))`; `s`, la sensibilidad de la detección de celo, es el único supuesto y vive en un solo lugar de la vista. La encarnerada siempre cuenta, porque el carnero suelto expone a todas y su presencia no prueba nada. **La curva suma la preñez esperada, no las servidas** (~460 de 503): `sum(esperados) = inseminadas` fue una aserción del test hasta la `0015` y era el defecto —tres normalizaciones reponían la preñez que el modelo decía que no iba a existir—. La gestación es normal 140–160 con pico en 150, ancha a propósito: con la triangular 145–155 el 15 de agosto valía exactamente cero, porque una tanda cerraba el 14 y la siguiente abría el 16. El calendario es continuo — sin los días en cero, las tres tandas de la inseminación se aplanarían en una sola loma.

**El % de señalada** (`v_resumen_temporada`) se mide contra las ovejas PARIDAS, no contra los corderos nacidos: cuenta cuántos corderos marcados deja cada oveja que parió, así que **pasar del 100 % es lo esperable** con mellicería y no un error. La supervivencia la contesta `v_mortalidad`, cuya cifra es la mortalidad total sobre nacidos y cuyas tres etapas comparten ese mismo denominador para que sumen la cifra de arriba.
2. Distribución de tipo de nacimiento (únicos/mellizos/trillizos) y % de mellicería.
3. Mortalidad: al nacer y entre nacimiento y señalada. **Se cuenta con `fecha_muerte is not null`, nunca con `estado = 'muerto'`:** un cordero que muere después de señalado conserva su estado `senalado`, porque perderlo borraría el hecho de haberlo sido (R8).
4. Peso promedio al nacer por sexo y tipo de nacimiento.
5. Señaladas pendientes (conteo y antigüedad).
6. Prevalencias fenotípicas: entropión, pigmentación, halo hair, canela, lunar.
7. Distribución de condición corporal de las madres.
8. Paternidad: **partos** por padre derivado —no corderos: los mellizos comparten padre por construcción y contarlos inflaría la mellicería en un gráfico de carneros—, con cuántos son ciertos y cuántos probables, y al pie las caravanas de los que quedaron sin padre, que son las que se miran a mano.

## 10. Plan de iteraciones (temporada arranca en días)

**Fase 1 — Captura de partos (días 1–3):**
esquema en Supabase + repo + PWA con flujo "Registrar parto" guardando en local + integración PowerSync + importador CSV de caravanas + indicador de pendientes. *Criterio de salida:* prueba en dos dispositivos reales en modo avión, reconexión y verificación de datos en Supabase.

**Fase 2 — Ver y corregir (días 3–5):**
ficha del parto y del cordero, edición de lo guardado, cambio de madre, registro de muertes (R8), nodriza posterior (R10), anulación de corderos (R13) y bandeja de registros rechazados. En paralelo: carga real junto con Zoho (solo la tablet duplica registros los primeros 2–3 días para validar paridad) y ajustes de UX con el equipo. Maquetas y decisiones en `diseno/fase2-pantallas.html`.

**Fase 3 — Señalada (días 5–10):**
buscador de pendientes + flujo de señalada + confirmación de sexo (R6) + tatuaje correlativo (R14). Llega antes de la primera señalada real. Maquetas y decisiones en `diseno/fase3-pantallas.html`.

**Fase 4 — Web admin y reportes (semanas 2–3):**
tablas, panel de revisión, exportaciones, vistas SQL de métricas y sección de dashboards. Al cerrar esta fase se retira el respaldo Zoho. Fue en dos tandas, las dos hechas: la primera —tablas, revisión, historial y exportación— en `diseno/fase4-pantallas.html`; la segunda —modelo de servicios, importación y tableros— en `diseno/fase4-tablero.html`.

## 11. Protocolo de pruebas de sincronización (obligatorio antes del día 1)

1. Modo avión → registrar 3 partos → reconectar → verificar llegada a Supabase y contador en 0.
2. Dos dispositivos offline registran partos distintos → ambos sincronizan → sin pérdidas ni duplicados.
3. Dos dispositivos editan el mismo cordero offline → verificar last-write-wins y trazabilidad en `cambios`.
4. Cerrar y reabrir la PWA con pendientes en cola → la cola sobrevive.
5. Reinstalar la PWA en un dispositivo ya sincronizado → los datos se restauran completos desde el servidor.
6. Dispositivo 48 h offline con ~50 registros → sync exitoso al volver.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bug de sync en producción con datos irreemplazables | Zoho como respaldo activo; protocolo §11; doble carga en tablet los primeros días |
| iOS purga almacenamiento local | PWA instalada + sync diaria + indicador de pendientes visible |
| Pérdida/rotura de dispositivo en el campo | Todo lo sincronizado se restaura desde el servidor; fomentar sync al volver a señal |
| Caravana mal precargada o ilegible | Alta manual con marca de revisión (R9) + panel web |
| Resistencia del equipo al cambio | Reunión previa (ver agenda), prueba en seco antes del día 1, flujo más corto que Zoho |

## 13. MCPs para el desarrollo con Claude Code

Los MCPs son herramientas de la fase de desarrollo; el sistema terminado no depende de ninguno. Configurarlos en `.mcp.json` en la raíz del repo:

```json
{
  "mcpServers": {
    "supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp" },
    "powersync-docs": { "type": "http", "url": "https://docs.powersync.com/mcp" },
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] }
  }
}
```

- **Supabase MCP:** esquema, migraciones, RLS, inspección de datos. Las migraciones viven como SQL versionado en el repo (el MCP las aplica; el repo es la fuente de verdad). **Con datos reales de temporada: modo solo lectura o proyecto de desarrollo separado.** Complementar con la CLI de Supabase (desarrollo local, generación de tipos).

  **Probar la app contra el proyecto real escribe en el proyecto real, y la única barrera confiable es no apuntarle.** Sembrar datos en la réplica local y «cortar el sync» no alcanza: la cola de subida sobrevive al `disconnect()`, y cualquier cosa que vuelva a llamar a `conectarSync()` —entrar con una cuenta, por ejemplo— la vacía contra el servidor sin preguntar. Pasó una vez, el 2 de agosto de 2026: tres partos de prueba terminaron en la base de la temporada. Y no se pudieron borrar, porque el `delete` está revocado incluso para `service_role` (`0005_service_role.sql`) — la limpieza tiene que salir del SQL Editor de Supabase, que corre como dueño (ver `scripts/limpiar-datos-de-prueba.sql` como modelo). Para probar de verdad: un proyecto Supabase separado con su propio `.env.local`.
- **PowerSync docs MCP:** documentación oficial en tiempo real (sync rules YAML, conector de backend, SDK web). Instalar también sus agent skills.
- **Playwright MCP:** pruebas en navegador real — viewport móvil, recorridos de los flujos, simulación de pérdida de conexión, verificación del service worker y de la cola de sincronización.
