# Petra · Parición

App de campo offline-first para registrar parición y señalada. Reemplaza los
formularios de Zoho. La especificación funcional completa está en
[CLAUDE.md](CLAUDE.md); acá está cómo se corre y cómo se despliega.

**Estado: Fase 1 cerrada — protocolo §11 aprobado en dispositivos reales.**

| | |
|---|---|
| ✅ Esquema, RLS y auditoría | **aplicados en el proyecto**; 13 aserciones verdes en local y privilegios verificados en producción |
| ✅ Rol `powersync_role` | creado, con `REPLICATION BYPASSRLS` y sin acceso a `cambios` |
| ✅ Reglas de negocio | R1, R2, R3, R7, R12 con 68 tests |
| ✅ App PWA | login, inicio y registro de parto, sobre SQLite local |
| ✅ Instancia de PowerSync | replicando por IPv6; slot activo y WAL al día |
| ✅ Las 502 madres | importadas y verificadas contra el archivo original |
| ✅ Deploy en Vercel | desde `main`, con los headers de caché del service worker |
| ✅ Protocolo §11 | corrido en dispositivos reales |
| ⏳ Cuentas del equipo | quedan para el final, a pedido del usuario |
| ⏳ **Fase 2** | ver y corregir registros — [dónde retomar](#fase-2--dónde-retomar) |

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

## Fase 2 — dónde retomar

Poder **ver y corregir** un registro ya cargado. Los dos pedidos del usuario
—arreglar un registro rechazado y editar cualquier cosa— son el mismo problema:
un rechazado se arregla editándolo, así que comparten pantalla.

Maquetas en [`diseno/fase2.html`](diseno/fase2.html) — abrir en el navegador.

**Recomendado:** dos entradas, ninguna agrega pantallas nuevas.

- Las filas bloqueadas del buscador (ovejas que ya parieron) pasan a ser
  tocables y abren su parto. Es lo que pide la spec §7: «avisar y ofrecer
  abrirlo».
- Una lista «Partos de hoy» al pie del inicio, que cubre la corrección más
  común: la del parto recién cargado.

Se descartó una tercera pantalla de «Registros» con pestañas: no aporta nada que
las dos anteriores no den, y compite por el pulgar en una app cuyo valor es
hacer una cosa rápido.

### Tres decisiones abiertas

Editar es más riesgoso que crear: al crear, un error deja un registro de más; al
editar, pisa uno bueno. Conviene resolverlas antes de escribir código.

1. **Quitar un cordero de un parto guardado.** No puede ser un `delete` — la
   spec dice que las bajas son lógicas, para preservar la trazabilidad. Falta
   definir qué significa: ¿solo admin?, ¿queda marcado como anulado?
2. **Editar el collar de un parto guardado** puede chocar con R3 si ese número
   ya se reasignó a otro parto.
3. **Qué puede editar un operador y qué solo un admin.** Los dos roles existen
   en `perfiles` y en las políticas RLS, pero la app todavía no los distingue.

### Lo que esta fase pone a trabajar

La auditoría por campo de la Fase 1 **nunca se usó**. Con solo altas, `cambios`
guarda únicamente filas de `creacion`; el diff campo por campo —lo que permite
reconstruir una pisada accidental— recién entra en juego cuando exista la
edición. El trigger y sus tests ya están; falta el caso de uso.

### Pendiente aparte

Las **cuentas del equipo** (4–6 personas). El script está probado:

```bash
python3 scripts/crear-cuenta.py --email X --nombre "Y" --rol operador
```

---

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
src/lib/reglas.ts              R1, R2, R3, R7, R12 como funciones puras
src/lib/powersync/subida.ts    clasificación de errores de subida
src/lib/powersync/conector.ts  fetchCredentials + uploadData
src/lib/powersync/esquema.ts   réplica local (SQLite)
src/pantallas/                 Login, Inicio, RegistrarParto
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
