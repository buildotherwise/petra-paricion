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

La marca en encabezados se compone con el emblema del carnero + "PETRA · MERINO AUSTRALIANO" en serif (Georgia) dorada, espaciada. **Nota importante:** el oro puro del logo (`#8C7A2E`) tiene contraste 3,0:1 sobre blanco — insuficiente para texto o botones; usarlo solo decorativamente y usar `--brand` para todo lo interactivo. Archivos: `logo_petra_sin_fondo.png` (versión con transparencia generada desde el JPG original; apta para fondos claros).

### Usuarios y permisos

**Autenticación:** Supabase Auth con email + contraseña. **Registro público deshabilitado** — las cuentas las crea el administrador (desde la web admin o el panel de Supabase). Escala esperada: 4–6 cuentas.

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

**Sesiones y offline:** sesiones de larga duración con renovación automática de token al reconectar; en el campo la app nunca pide login. El único requisito es haber iniciado sesión una vez con conexión al instalar la app en el dispositivo.

**Dispositivo perdido o robado:** el admin desactiva la cuenta (`activo = false`) y revoca sus sesiones desde Supabase; el dispositivo pierde la capacidad de subir datos. Todo lo ya sincronizado está a salvo en el servidor; solo se perdería lo pendiente de subir en ese aparato (de nuevo: el indicador de pendientes es el hábito clave).

**Baja de personal:** desactivar la cuenta, nunca eliminarla, para que la auditoría histórica conserve quién registró qué.

## 4. Modelo de datos (Postgres / Supabase)

Principio central: **el cordero es una única entidad** que se crea en la parición y se completa en la señalada. No existen dos registros a vincular a posteriori.

```sql
create type sexo_t          as enum ('macho', 'hembra');
create type condicion_t     as enum ('vivo', 'muerto');
create type marca_collar_t  as enum ('punto_arriba', 'cruz_al_medio', 'punto_abajo');
create type entropion_t     as enum ('ninguno', 'ojo_derecho', 'ojo_izquierdo', 'ambos');
create type estado_cordero_t as enum ('nacido', 'senalado', 'muerto');
create type madre_t         as enum ('biologica', 'nodriza');
create type motivo_anulacion_t as enum ('duplicado', 'otra_oveja', 'otro_parto', 'otro');

-- Madres: se precargan por CSV antes de la temporada
create table ovejas (
  id                 uuid primary key default gen_random_uuid(),
  temporada          int  not null,                -- ej. 2026
  caravana           text not null,
  fecha_inseminacion date,
  padre              text,                          -- carnero / semen, si se conoce
  precargada         boolean not null default true, -- false = alta manual en campo (revisar en web)
  observaciones      text,
  unique (temporada, caravana)
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
- **R11 — Señalada completa o nada:** el pasaje a estado `senalado` exige tatuaje + todos los campos fenotípicos. No se admiten señaladas a medias.
- **R12 — Fechas:** fecha de nacimiento por defecto = hoy. Tiene que caer dentro de la **ventana de parición de la temporada — del 1 de agosto al 30 de noviembre** del año correspondiente — y nunca en el futuro. Dentro de esa ventana no hay límite de días hacia atrás: un parto puede encontrarse bastante después de ocurrido, y mientras caiga en la temporada es un dato legítimo. Lo que se bloquea es la fecha de otro año o fuera de esos cuatro meses, que solo puede ser un error de tipeo.

## 6. Sincronización (PowerSync + Supabase)

- **Alcance del sync:** todos los dispositivos replican la temporada activa completa (ovejas, partos, corderos). El volumen es chico (miles de filas), así que sync total es simple y suficiente; no hace falta particionar por dispositivo.
- **Escrituras:** cada alta/edición se aplica primero a la base SQLite local y entra en la cola de subida de PowerSync. El backend valida y persiste en Postgres.
- **Conflictos:** el perfil de uso hace casi imposible que dos dispositivos editen el mismo registro simultáneamente (cada parto lo registra quien lo encuentra). Estrategia: last-write-wins por registro + tabla `cambios` para reconstruir cualquier pisada accidental desde la web.
- **Identificadores:** UUIDs generados en el dispositivo. Jamás depender de secuencias del servidor para crear registros offline.
- **Indicador de pendientes:** contador visible en el header de todas las pantallas ("3 sin sincronizar" / "Todo sincronizado ✓"). Es la señal operativa clave del día a día.
- **Nota iOS:** Safari puede purgar almacenamiento de sitios sin uso prolongado. Mitigación: instalar como PWA en pantalla de inicio, sincronizar al menos una vez al día, y recordar que todo lo ya sincronizado se restaura solo desde el servidor. El único dato en riesgo es lo pendiente de subir — de ahí la importancia del indicador.

## 7. Pantallas — app de campo

**Inicio:** temporada activa, contadores del día (partos hoy / total temporada / pendientes de señalar), estado de sincronización, dos botones grandes: `Registrar parto` y `Señalada`.

**Registrar parto:**
1. Buscador de caravana: campo numérico que filtra la lista precargada al escribir. Opción "No está en la lista" → alta manual (R9). Si la oveja ya tiene parto registrado, avisar y ofrecer abrirlo (evita duplicados).
2. Fecha (default hoy) y condición corporal (selector 1–5 con descripciones cortas).
3. Corderos: botón "+ Agregar cordero" → sexo (dos botones), vivo/muerto, peso (teclado numérico), collar si corresponde (R2).
4. Resumen ("Mellizos: 1 macho vivo 4,2 kg — collar 12 punto arriba / 1 hembra viva 3,8 kg — collar 13 punto arriba") → Guardar.

**Señalada:**
1. Lista de pendientes (estado `nacido`), ordenada por fecha de nacimiento, buscable por caravana de la madre o número de collar.
2. Detalle: datos del nacimiento visibles, confirmación de sexo (R6), tatuaje (teclado numérico), botoneras para fenotipo (0/1 y 0–4), entropión, observaciones → `Ingresar`.

**Partos registrados:** sección propia, con buscador por caravana o collar y la lista de la temporada agrupada por jornada. Se llega desde el pie de «Partos de hoy», en el inicio.

**Ficha del parto:** se mira, y editar es un paso aparte — es la pantalla que más se abre sin intención de cambiar nada, y un formulario siempre activo cambia un dato de un roce. Datos del parto, lista de corderos, "Agregar un cordero" y "Cambiar la madre" (el error de la caravana equivocada, frenado en el teléfono si la oveja destino ya parió).

**Ficha de cordero:** ver/corregir cualquier registro, con las acciones "Registrar muerte" (R8), "Asignar nodriza" (R10) y "Anular cordero" (R13) a la vista, no detrás de un menú.

**Registros con error:** detrás de la pastilla roja del encabezado. Lista de cargas rechazadas por el servidor, con el motivo en castellano llano y todo lo que se había cargado. Quitar una de la lista **pierde datos a propósito** —es la última copia que queda— así que pasa por una confirmación que lo muestra por última vez. El historial de cambios NO está en el teléfono: `cambios` queda fuera de la replicación y su lectura es solo para admin (va en la web, §8).

## 8. Plataforma web (admin)

Misma app, vistas habilitadas por rol admin, pensada para escritorio con conexión:

- Tablas de partos y corderos con filtros (fecha, estado, tipo de nacimiento, discrepancias) y edición con registro en `cambios`.
- **Panel de revisión:** ovejas de alta manual, discrepancias de sexo, collares duplicados, pesos fuera de rango, corderos sin señalar con más de 15 días.
- **Importación** de la lista de inseminadas: CSV con columnas `caravana,fecha_inseminacion,padre` (validar duplicados y formato antes de insertar).
- **Exportación** CSV/Excel: planilla plana de corderos con columnas equivalentes a los formularios Zoho históricos, más una exportación completa del modelo.
- Sección de **Dashboards** integrada (ver §9).

## 9. Dashboards (integrados en la web admin)

Los reportes se implementan como una sección de la propia plataforma web, con gráficas en Recharts. **Cada métrica se define como una vista SQL en Postgres** (`v_avance_paricion`, `v_mortalidad`, `v_prevalencias_fenotipicas`, etc.) y la web solo las consume y grafica. Esto mantiene la lógica de cálculo en un solo lugar, auditable, y permite conectar un BI externo (Metabase propio, Looker Studio) en el futuro sin rehacer nada — basta un usuario Postgres de solo lectura apuntando a las mismas vistas.

Tarjetas del dashboard:

1. Avance: % de ovejas paridas sobre inseminadas, curva diaria de partos (comparable contra fechas esperadas si hay fecha de inseminación).
2. Distribución de tipo de nacimiento (únicos/mellizos/trillizos) y % de mellicería.
3. Mortalidad: al nacer y entre nacimiento y señalada.
4. Peso promedio al nacer por sexo y tipo de nacimiento.
5. Señaladas pendientes (conteo y antigüedad).
6. Prevalencias fenotípicas: entropión, pigmentación, halo hair, canela, lunar.
7. Distribución de condición corporal de las madres.

## 10. Plan de iteraciones (temporada arranca en días)

**Fase 1 — Captura de partos (días 1–3):**
esquema en Supabase + repo + PWA con flujo "Registrar parto" guardando en local + integración PowerSync + importador CSV de caravanas + indicador de pendientes. *Criterio de salida:* prueba en dos dispositivos reales en modo avión, reconexión y verificación de datos en Supabase.

**Fase 2 — Ver y corregir (días 3–5):**
ficha del parto y del cordero, edición de lo guardado, cambio de madre, registro de muertes (R8), nodriza posterior (R10), anulación de corderos (R13) y bandeja de registros rechazados. En paralelo: carga real junto con Zoho (solo la tablet duplica registros los primeros 2–3 días para validar paridad) y ajustes de UX con el equipo. Maquetas y decisiones en `diseno/fase2-pantallas.html`.

**Fase 3 — Señalada (días 5–10):**
lista de pendientes + flujo de señalada + confirmación de sexo. Llega antes de la primera señalada real.

**Fase 4 — Web admin y reportes (semanas 2–3):**
tablas, panel de revisión, exportaciones, vistas SQL de métricas y sección de dashboards. Al cerrar esta fase se retira el respaldo Zoho.

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
- **PowerSync docs MCP:** documentación oficial en tiempo real (sync rules YAML, conector de backend, SDK web). Instalar también sus agent skills.
- **Playwright MCP:** pruebas en navegador real — viewport móvil, recorridos de los flujos, simulación de pérdida de conexión, verificación del service worker y de la cola de sincronización.
