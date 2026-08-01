# Petra · Parición

App de campo offline-first para registrar parición y señalada. Reemplaza los
formularios de Zoho. La especificación funcional completa está en
[CLAUDE.md](CLAUDE.md); acá está cómo se corre y cómo se despliega.

**Estado: Fase 1 construida, esperando cuentas para conectarla.**

| | |
|---|---|
| ✅ Esquema, RLS y auditoría | migraciones aplicables, 13 aserciones verdes contra Postgres 17 |
| ✅ Reglas de negocio | R1, R2, R3, R7, R12 con 50 tests |
| ✅ App PWA | login, inicio y registro de parto, corriendo sobre SQLite local |
| ⏳ Conexión a Supabase y PowerSync | **bloqueado: faltan las cuentas del Bloque 0** |
| ⏳ Importador de caravanas | **bloqueado: falta el archivo con la lista de madres** |
| ⏳ Deploy y prueba en dispositivos | después de lo anterior |

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
# Credenciales
cp .env.example .env.local        # completar con los valores del Bloque 0

# Para el MCP de Supabase y los scripts, en ~/.zshrc:
export SUPABASE_ACCESS_TOKEN="el-personal-access-token"
export SUPABASE_PROJECT_REF="el-project-ref"

pnpm install
pnpm dev
```

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

Para todo lo que no sea replicación —migraciones, tests, consultas— se usa el
**session pooler**, que es IPv4 y funciona desde cualquier red.

### Aplicar el esquema

```bash
brew install supabase/tap/supabase
supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Por el pooler: la conexión directa es IPv6 y muchas redes no la alcanzan.
supabase db push --db-url "$POOLER_URL"
```

Después, el rol de replicación (lleva contraseña, por eso va aparte del repo):

```bash
psql "$POOLER_URL" \
  -v powersync_password="$(openssl rand -base64 24)" \
  -f supabase/manual/powersync-rol.sql
```

Guardá esa contraseña — va en la connection string de PowerSync y no se
recupera después.

### 6. Configurar PowerSync

1. Instancia nueva apuntando a la **direct connection string** de Supabase
   (`db.<ref>.supabase.co`, NO el pooler — ver la nota de IPv6 más arriba), con
   usuario `powersync_role`. PowerSync ya trae el CA de Supabase, así que
   `verify-full` funciona sin configurar nada más.
2. En `Client Auth`, activar **Use Supabase Auth** y **dejar el campo de JWT
   secret vacío**: los proyectos nuevos usan claves asimétricas y PowerSync
   autoconfigura el JWKS. (Solo los proyectos legacy con HS256 necesitan pegar
   el secreto.)
3. Pegar el contenido de [`powersync/sync-rules.yaml`](powersync/sync-rules.yaml).
4. La `Instance URL` va a `VITE_POWERSYNC_URL`.

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
supabase/manual/               lo que lleva secretos y no se versiona ejecutado
powersync/sync-rules.yaml      qué se replica a cada dispositivo
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
