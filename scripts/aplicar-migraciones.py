#!/usr/bin/env python3
"""
Aplica las migraciones de supabase/migrations/ por la Management API.

Por qué no `supabase db push`: la conexión directa de Postgres es IPv6 pura en
el plan Free (ver README) y muchas redes no la alcanzan — desde esta máquina da
"No route to host". La Management API va por HTTPS, que es IPv4, así que
funciona desde cualquier lado.

Deja constancia en supabase_migrations.schema_migrations, que es la misma tabla
que usa el CLI de Supabase: así `db push` no las vuelve a aplicar si algún día
se corre desde una red con IPv6.

    python3 scripts/aplicar-migraciones.py [--dry-run]

Lee SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF del entorno (los carga direnv).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "supabase" / "migrations"


def sql(consulta: str, intentos: int = 5):
    """La API limita la frecuencia de requests; reintenta con espera creciente."""
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
                # Sin User-Agent propio, Cloudflare rechaza el de urllib con un
                # 403 "error code: 1010" que no dice nada útil.
                "User-Agent": "petra-paricion/migraciones",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(pedido, timeout=90) as respuesta:
                return json.load(respuesta)
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="replace")
            transitorio = e.code in (403, 429, 502, 503, 504)
            if transitorio and intento < intentos - 1:
                time.sleep(2 * (intento + 1))
                continue
            raise SystemExit(f"\n  ✗ HTTP {e.code}\n{cuerpo[:900]}")
    raise SystemExit("  ✗ sin respuesta tras varios intentos")


def preparar_registro() -> None:
    """La misma tabla que usa el CLI de Supabase para saber qué ya corrió."""
    sql(
        """
        create schema if not exists supabase_migrations;
        create table if not exists supabase_migrations.schema_migrations (
          version    text primary key,
          statements text[],
          name       text
        );
        """
    )


def aplicadas() -> set[str]:
    filas = sql("select version from supabase_migrations.schema_migrations")
    return {f["version"] for f in filas}


def main() -> None:
    simulacion = "--dry-run" in sys.argv

    archivos = sorted(MIGRACIONES.glob("*.sql"))
    if not archivos:
        raise SystemExit(f"No hay migraciones en {MIGRACIONES}")

    print(f"Proyecto: {os.environ['SUPABASE_PROJECT_REF']}")
    preparar_registro()
    ya = aplicadas()
    print(f"Ya aplicadas: {', '.join(sorted(ya)) if ya else '(ninguna)'}\n")

    for archivo in archivos:
        version = archivo.stem.split("_")[0]
        nombre = archivo.stem

        if version in ya:
            print(f"  · {archivo.name} — ya estaba")
            continue

        if simulacion:
            print(f"  → {archivo.name} — se aplicaría ({len(archivo.read_text())} car.)")
            continue

        print(f"  → {archivo.name} … ", end="", flush=True)
        sql(archivo.read_text())
        sql(
            "insert into supabase_migrations.schema_migrations (version, name) "
            "values ($mig$" + version + "$mig$, $mig$" + nombre + "$mig$) "
            "on conflict (version) do nothing"
        )
        print("ok")
        time.sleep(1)  # respeta el límite de frecuencia de la API

    print("\nListo.")


if __name__ == "__main__":
    main()
