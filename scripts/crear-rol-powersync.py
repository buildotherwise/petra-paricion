#!/usr/bin/env python3
"""
Crea el rol de replicación que usa PowerSync para leer el WAL.

Va por la Management API por la misma razón que las migraciones: la conexión
directa de Postgres es IPv6 pura y muchas redes no la alcanzan (ver README).

La contraseña se genera acá y se guarda en .env.local, que está en .gitignore.
No se imprime en pantalla: hay que leerla del archivo para pegarla en el
dashboard de PowerSync. Después de eso no se puede recuperar — habría que
rotarla.

    python3 scripts/crear-rol-powersync.py
"""

import json
import os
import re
import secrets
import string
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENV_LOCAL = RAIZ / ".env.local"
CLAVE = "POWERSYNC_DB_PASSWORD"


def sql(consulta: str, intentos: int = 5):
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    ref = os.environ["SUPABASE_PROJECT_REF"]
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"

    for intento in range(intentos):
        pedido = urllib.request.Request(
            url,
            data=json.dumps({"query": consulta}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "petra-paricion/rol-powersync",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(pedido, timeout=90) as respuesta:
                return json.load(respuesta)
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="replace")
            if e.code in (403, 429, 502, 503, 504) and intento < intentos - 1:
                time.sleep(2 * (intento + 1))
                continue
            raise SystemExit(f"  ✗ HTTP {e.code}\n{cuerpo[:900]}")
    raise SystemExit("  ✗ sin respuesta tras varios intentos")


def generar_password() -> str:
    """Sin símbolos: la contraseña viaja dentro de una URI de conexión y los
    caracteres especiales obligarían a percent-encodearla."""
    alfabeto = string.ascii_letters + string.digits
    return "".join(secrets.choice(alfabeto) for _ in range(32))


def guardar_en_env(password: str) -> None:
    lineas = ENV_LOCAL.read_text().splitlines() if ENV_LOCAL.exists() else []
    lineas = [ln for ln in lineas if not ln.startswith(f"{CLAVE}=")]
    lineas += [
        "",
        "# Contraseña de powersync_role, generada por scripts/crear-rol-powersync.py.",
        "# Va en la connection string que se le carga a la instancia de PowerSync.",
        f"{CLAVE}={password}",
    ]
    ENV_LOCAL.write_text("\n".join(lineas) + "\n")


def main() -> None:
    ref = os.environ["SUPABASE_PROJECT_REF"]

    existe = sql(
        "select exists (select 1 from pg_roles where rolname = 'powersync_role') as existe"
    )[0]["existe"]

    if existe and "--rotar" not in sys.argv:
        raise SystemExit(
            "powersync_role ya existe.\n"
            "Si perdiste la contraseña, corré de nuevo con --rotar "
            "(hay que recargarla en PowerSync después)."
        )

    password = generar_password()

    if existe:
        print("Rotando la contraseña de powersync_role…")
        sql(f"alter role powersync_role with password '{password}'")
    else:
        print("Creando powersync_role…")
        # REPLICATION habilita la lectura del WAL. BYPASSRLS es necesario
        # porque el recorte por usuario lo hacen las sync rules, no RLS: sin
        # bypass PowerSync no vería ninguna fila.
        sql(
            f"""
            create role powersync_role with replication bypassrls login
              password '{password}';
            grant select on all tables in schema public to powersync_role;
            alter default privileges in schema public
              grant select on tables to powersync_role;
            -- La auditoría no se replica.
            revoke select on public.cambios from powersync_role;
            """
        )

    guardar_en_env(password)

    print("\n✓ Listo. La contraseña quedó en .env.local, en POWERSYNC_DB_PASSWORD.")
    print("\nConnection string para PowerSync (Database Connections → Postgres):\n")
    print(f"  host      db.{ref}.supabase.co")
    print("  port      5432")
    print("  database  postgres")
    print("  user      powersync_role")
    print("  password  (la de .env.local)")
    print("  SSL       verify-full — PowerSync ya trae el CA de Supabase")


if __name__ == "__main__":
    main()
