# Petra · Parición

App de campo offline-first para registrar parición y señalada. Reemplaza los
formularios de Zoho. La especificación funcional completa está en
[CLAUDE.md](CLAUDE.md); acá está cómo se corre y cómo se despliega.

**Estado: Fases 1 y 2 cerradas.**

| | |
|---|---|
| ✅ Esquema, RLS y auditoría | **aplicados en el proyecto**; 22 aserciones verdes en local y privilegios verificados en producción |
| ✅ Rol `powersync_role` | creado, con `REPLICATION BYPASSRLS` y sin acceso a `cambios` |
| ✅ Reglas de negocio | R1, R2, R3, R7, R8, R12, R13 con 131 tests |
| ✅ App PWA | registro de parto, fichas, corrección, muerte, nodriza, anulación y rechazados |
| ✅ Instancia de PowerSync | replicando por IPv6; slot activo y WAL al día |
| ✅ Las 502 madres | importadas y verificadas contra el archivo original |
| ✅ Deploy en Vercel | desde `main`, con los headers de caché del service worker |
| ✅ Protocolo §11 | corrido en dispositivos reales |
| ✅ Auditoría por campo | en uso: cada edición deja su diff en `cambios` |
| ⏳ Cuentas del equipo | quedan para el final, a pedido del usuario |
| ⏳ **Fase 3** | señalada — lista de pendientes, fenotipo y confirmación de sexo |

---

## Bloque 0 — Lo que hay que crear a mano

Sin esto la app no se conecta a nada. Es el camino crítico.

### 1. Supabase

Crear cuenta y un proyecto `petra-paricion` en la región **South America (São
Paulo)**. Después, de `Project Settings → API` anotar:

- `Project URL` → va a `VITE_SUPABASE_URL`
- `anon / publishable key` → va a `VITE_SUPABASE_ANON_KEY`
- `service_role key` → va a `SUPABASE_SERVICE_ROLE_KEY` (solo para scripts, nunca al navegador)
- el `project ref` (los 20 caracteres del subdominio)

Y en `Account → Access Tokens`, crear un **Personal Access Token** para el MCP.

### 2. PowerSync Cloud

Cuenta en [powersync.com](https://powersync.com). El free tier (2 GB
sincronizados/mes, 50 conexiones concurrentes, sin tarjeta) sobra para cinco
dispositivos. La instancia se crea recién en el paso 6, cuando el esquema exista.

### 3. Vercel

Cuenta y equipo, para el deploy.

### 4. La lista de caravanas

El archivo con las madres de la temporada. Sin él, las ovejas entran solo por
alta manual en el campo (R9).

### 5. Las cuentas del equipo

Nombre y correo de cada persona que va a registrar (4–6). Una cuenta por
persona: así la auditoría responde *quién*, no solo *qué aparato*.

---

## Puesta en marcha

```bash
cp .env.example .env.local        # completar con los valores del Bloque 0
direnv allow                      # una sola vez

pnpm install
pnpm dev
```

**Las credenciales no van a `~/.zshrc`.** Un Personal Access Token de Supabase
es de la **cuenta entera**, no de un proyecto: exportarlo globalmente le daría
a cualquier proceso, en cualquier carpeta, acceso a todos los proyectos
Supabase. `direnv` carga `.env.local` al entrar a este directorio y lo descarga
al salir, así que las variables existen solo acá. `.mcp.json` las toma de ahí.

Si `direnv` no está: `brew install direnv` y agregar el hook al shell.

### IPv6: leer esto antes de conectar nada

Supabase tiene **tres** direcciones distintas y se usan para cosas distintas:

| Cadena | Para qué | Red |
|---|---|---|
| `https://<ref>.supabase.co` | La app (`VITE_SUPABASE_URL`) | HTTPS, indistinto |
| `db.<ref>.supabase.co:5432` — *direct* | **Solo PowerSync** | **IPv6 únicamente** en el plan Free |
| `aws-N-sa-east-1.pooler.supabase.com:5432` — *session pooler* | Migraciones y consultas | IPv4 |

Dos hechos que no se pueden esquivar:

- **La replicación lógica no pasa por el pooler.** Supabase lo dice
  explícitamente: para replicación hay que usar la conexión directa. Así que
  PowerSync necesita sí o sí la directa, que en el plan Free es IPv6 pura.
- **El add-on de IPv4 no existe en el plan Free.** Requiere Pro (US$25/mes)
  más el add-on (US$4/mes).

La buena noticia es que **PowerSync Cloud tiene egress IPv6** (rango
`2602:817::/44`), así que el plan Free alcanza. Pero es lo primero que hay que
verificar al crear la instancia: si PowerSync no conecta, no hay sync y todo lo
demás da igual.

Para todo lo que no sea replicación se usa la **Management API**, que va por
HTTPS y por lo tanto por IPv4. El `POOLER_URL` queda como alternativa opcional,
solo si hace falta una sesión interactiva de `psql`.

### Aplicar el esquema

```bash
python3 scripts/aplicar-migraciones.py --dry-run   # ver qué haría
python3 scripts/aplicar-migraciones.py
```

Aplica `supabase/migrations/*.sql` en orden y deja constancia en
`supabase_migrations.schema_migrations` — la misma tabla que usa el CLI de
Supabase, así que `db push` no las vuelve a aplicar si algún día se corre desde
una red con IPv6.

Después, el rol de replicación:

```bash
python3 scripts/crear-rol-powersync.py
```

Genera la contraseña, crea el rol con `REPLICATION BYPASSRLS` y la guarda en
`.env.local` (nunca la imprime). Esa contraseña va en la connection string de
PowerSync y **no se recupera después**: si se pierde, hay que rotarla con
`--rotar` y recargarla en PowerSync.

### 6. Configurar PowerSync

Al crear el proyecto en PowerSync:

- **Región `BR`**, no `US` (que es el default). Supabase está en São Paulo y la
  replicación es un enlace permanente entre ambos: ponerlos en el mismo
  continente evita que cada byte del WAL cruce el ecuador.
- **Solo la instancia `Production`.** Cada instancia abre su propio slot de
  replicación sobre el mismo Postgres, y un slot inactivo acumula WAL hasta
  llenar el disco — de los pocos modos de falla que pueden tumbar una base
  Supabase del plan Free. Sin una base de desarrollo aparte, la instancia de
  Development no aporta nada. El plan Free permite 2, así que se puede crear
  después si hace falta probar cambios de sync rules.
- **Ojo:** los proyectos Free se desactivan tras **una semana sin actividad**.
  Durante la parición hay uso diario, pero entre temporadas hay que tenerlo
  presente.

Después, en la instancia:

1. `Database Connections` → pestaña **Postgres**, apuntando a la **conexión
   directa** (`db.<ref>.supabase.co`, NO el pooler — ver la nota de IPv6 más
   arriba), con usuario `powersync_role`. PowerSync ya trae el CA de Supabase,
   así que `verify-full` funciona sin configurar nada más.
2. En `Client Auth`, activar **Use Supabase Auth** y **dejar el campo de JWT
   secret vacío**: los proyectos nuevos usan claves asimétricas y PowerSync
   autoconfigura el JWKS. (Solo los proyectos legacy con HS256 necesitan pegar
   el secreto.)
3. Pegar el contenido de [`powersync/sync-config.yaml`](powersync/sync-config.yaml).
4. La `Instance URL` va a `VITE_POWERSYNC_URL`.

---

## Fase 2 — qué quedó hecho

Ver y corregir un registro ya cargado. Maquetas y decisiones —incluidas las
alternativas descartadas— en [`diseno/fase2-pantallas.html`](diseno/fase2-pantallas.html).

**Tres entradas a un parto guardado**, ninguna con pantalla propia en el inicio:
las filas del buscador que ya parieron ahora se abren, «Partos de hoy» al pie del
inicio, y desde ahí una sección de partos registrados con buscador por caravana o
collar.

**Lo que se puede corregir:** datos del parto, cualquier cordero, la madre del
parto (el error de la caravana equivocada), y agregar un cordero que faltaba.
Todo pasa por `src/lib/powersync/escritura.ts`.

**Lo que se puede registrar:** muerte posterior al nacimiento (R8), nodriza
después del parto (R10) y anulación de un cordero cargado por error (R13).

### Tres decisiones que conviene no deshacer

**El collar no vuelve.** Un número usado queda tomado toda la temporada: no lo
liberan la muerte, ni la señalada, ni la anulación. El collar es un objeto que
sigue puesto en la madre hasta que alguien va y lo saca, y ninguno de esos hechos
lo saca de la oveja. Al anular un cordero que deja el parto en único, la app
pregunta si la madre lo tiene puesto (`partos.collar_puesto`) — es lo único que
no puede deducir. El número queda reservado en los dos casos.

**Toda edición escribe `actualizado_por`.** La política de RLS exige
`actualizado_por = auth.uid()` y evalúa la fila **resultante**: si B edita un
parto que creó A sin tocar esa columna, Postgres devuelve 42501, el clasificador
lo trata como error de dato y descarta el cambio. Por eso hay un solo camino para
editar y no una escritura suelta por pantalla.

**Un rechazo guarda toda la transacción.** Antes se registraba solo la operación
que fallaba, y los corderos de un parto de mellizos rechazado se perdían sin
dejar rastro. Ahora se guardan la que falló y las posteriores, agrupadas por
`carga_id` — las anteriores sí entraron al servidor. Y «quitar de la lista» borra
la última copia que queda del registro, así que pide confirmación mostrándolo.

### Pendiente aparte

Las **cuentas del equipo** (4–6 personas). El script está probado:

```bash
python3 scripts/crear-cuenta.py --email X --nombre "Y" --rol operador
```

## Deploy

El proyecto de Vercel se conecta al repo de GitHub, así que cada push a `main`
publica solo. En el dashboard: *Add New → Project → Import* desde
`buildotherwise/petra-paricion`. El preset de Vite se detecta solo.

**Las variables de entorno hay que cargarlas en Vercel antes del primer build.**
Son de build time: si faltan, el bundle sale con `undefined` y la app no abre.
Van **solo estas cuatro**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_POWERSYNC_URL
VITE_TEMPORADA
```

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` y `POWERSYNC_DB_PASSWORD`
**no van a Vercel**: son de las tareas administrativas locales y ahí quedarían
expuestas sin ninguna necesidad.

### Los headers de `vercel.json`

El archivo no lleva comentarios porque el esquema de Vercel rechaza cualquier
propiedad que no conozca — ni siquiera un `comment`. La explicación va acá:

| Ruta | Caché | Por qué |
|---|---|---|
| `sw.js` | sin caché | Si el navegador sirve un service worker viejo, la app queda congelada en una versión anterior. El síntoma es «actualicé y no cambió nada», que desde el campo no apunta a la causa. |
| `workbox-*.js`, `registerSW.js`, `manifest.webmanifest` | sin caché | Acompañan al service worker; cachearlos produce el mismo bloqueo. |
| `assets/*` | inmutable, 1 año | Llevan hash en el nombre: si cambia el contenido cambia la URL. Es lo que hace que la app abra al instante sin señal. |

El `rewrite` a `index.html` deja funcionando cualquier ruta profunda. Hoy la app
es de una sola pantalla y no lo necesita, pero cuesta nada y evita una sorpresa
cuando se agregue navegación.

---

## Verificación

```bash
pnpm verificar        # typecheck + tests + migraciones y auditoría contra Postgres
```

`scripts/verificar-sql.sh` levanta una base desechable (Postgres local si hay
uno corriendo, si no Docker), aplica las cuatro migraciones y corre los tests
del trigger de auditoría. No toca el proyecto real.

Antes del día 1 hay que correr además el **protocolo de sincronización** de
CLAUDE.md §11, con los dispositivos reales. Es el criterio de salida de la
Fase 1 y no es negociable.

---

## Cómo está organizado

```
src/lib/reglas.ts              R1, R2, R3, R7, R8, R12, R13 como funciones puras
src/lib/rechazos.ts            los errores del servidor, en castellano
src/lib/navegacion.tsx         la pila de pantallas
src/lib/powersync/subida.ts    clasificación de errores de subida
src/lib/powersync/escritura.ts el único camino para editar algo guardado
src/lib/powersync/conector.ts  fetchCredentials + uploadData
src/lib/powersync/esquema.ts   réplica local (SQLite)
src/pantallas/                 Login, Inicio, RegistrarParto, PartosRegistrados,
                               FichaParto, FichaCordero, Rechazados
supabase/migrations/           esquema, RLS, auditoría, publicación
scripts/                       migraciones, rol de PowerSync, verificación SQL
powersync/sync-config.yaml     qué se replica a cada dispositivo
```

Las agent skills de PowerSync no se versionan; se instalan con:

```bash
npx skills add powersync-ja/agent-skills
```

### Tres decisiones que conviene no deshacer

**`OPFSCoopSyncVFS` no es opcional.** El VFS por defecto (IndexedDB) tiene un
`RangeError: Maximum call stack size exceeded` conocido en Safari con queries
grandes, y es el único con multi-tab estable en iOS. La mitad de los
dispositivos del campo son iPhones.

**Los errores de subida se clasifican, no se atrapan.** Reintentar un error de
datos traba la cola para siempre y todo lo que se registre después queda atrás.
Descartar un error de red pierde un parto. La decisión está en
`src/lib/powersync/subida.ts` con tests, y lo descartado queda registrado en la
tabla local `subidas_rechazadas` para que la app pueda avisar.

**La auditoría la escribe Postgres, no la app.** Un trigger `SECURITY DEFINER`
escribe una fila resumen por INSERT y una fila por campo en cada UPDATE. La
tabla `cambios` tiene RLS de solo lectura para admin y ninguna política de
escritura: la única vía es el trigger. Y queda fuera de la publicación de
PowerSync, así que no se replica a los dispositivos.

### Instalación en los dispositivos

En **iOS tiene que ser desde "Agregar a pantalla de inicio"**. Las PWA
instaladas no sufren el borrado a 7 días de ITP; una pestaña de Safari sí. El
primer login necesita conexión; después no vuelve a pedir credenciales.
