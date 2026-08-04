#!/usr/bin/env python3
"""
Qué hay en la base de la temporada, ahora mismo.

Existe para el protocolo de sincronización (CLAUDE.md §11): la pregunta que se
repite en cada paso es «¿llegó?», y contestarla abriendo el panel de Supabase,
buscando el SQL Editor y escribiendo una consulta es suficiente fricción como
para que la prueba se haga a medias.

    python3 scripts/estado-de-la-base.py            # inventario y últimos partos
    python3 scripts/estado-de-la-base.py --cambios  # además, la auditoría reciente
    python3 scripts/estado-de-la-base.py --watch    # se refresca cada 10 segundos

Solo lee. Va por la Management API, igual que aplicar-migraciones.py, porque la
conexión directa de Postgres es IPv6 pura en el plan Free.

Lee SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF del entorno (los carga direnv).
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request


def consultar(sql: str, intentos: int = 4):
    """Una consulta de lectura. La API limita la frecuencia; reintenta."""
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    ref = os.environ["SUPABASE_PROJECT_REF"]
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"

    for intento in range(intentos):
        pedido = urllib.request.Request(
            url,
            data=json.dumps({"query": sql}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                # Sin User-Agent propio, Cloudflare rechaza el de urllib con un
                # 403 "error code: 1010" que no dice nada útil.
                "User-Agent": "petra-paricion/estado",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(pedido, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="replace")
            if e.code in (403, 429, 502, 503, 504) and intento < intentos - 1:
                time.sleep(2 * (intento + 1))
                continue
            raise SystemExit(f"✗ HTTP {e.code}\n{cuerpo[:600]}")


def tabla(filas, columnas):
    """Una tabla de ancho fijo, sin dependencias."""
    if not filas:
        return "   (ninguno)"
    anchos = [
        max(len(c), max(len(str(f.get(c, ""))) for f in filas)) for c in columnas
    ]
    lineas = ["   " + "  ".join(c.ljust(a) for c, a in zip(columnas, anchos))]
    lineas.append("   " + "  ".join("─" * a for a in anchos))
    for f in filas:
        lineas.append(
            "   " + "  ".join(str(f.get(c, "")).ljust(a) for c, a in zip(columnas, anchos))
        )
    return "\n".join(lineas)


def informe(ver_cambios: bool) -> str:
    partes = []

    inventario = consultar("""
        select
          (select count(*) from ovejas)                                     as ovejas,
          (select count(*) from ovejas where precargada = false)            as alta_manual,
          (select count(*) from partos)                                     as partos,
          (select count(*) from corderos where anulado_en is null)          as corderos,
          (select count(*) from corderos where anulado_en is not null)      as anulados,
          (select count(*) from corderos where tatuaje is not null)         as senalados,
          (select count(*) from cambios)                                    as auditoria
    """)[0]

    partes.append(
        "INVENTARIO   "
        + " · ".join(f"{k}: {v}" for k, v in inventario.items())
    )

    partes.append("\nÚLTIMOS PARTOS (los más nuevos arriba)")
    partes.append(tabla(consultar("""
        select o.caravana,
               p.fecha::text                                   as fecha,
               coalesce(p.collar_numero, '—')                  as collar,
               (select count(*) from corderos c
                 where c.parto_id = p.id and c.anulado_en is null)::text as corderos,
               coalesce(p.dispositivo, '—')                    as aparato,
               to_char(p.creado_en at time zone 'America/Montevideo',
                       'DD/MM HH24:MI:SS')                     as cargado
          from partos p join ovejas o on o.id = p.oveja_id
         order by p.creado_en desc limit 12
    """), ["caravana", "fecha", "collar", "corderos", "aparato", "cargado"]))

    if ver_cambios:
        partes.append("\nAUDITORÍA RECIENTE (para el last-write-wins del paso 3)")
        partes.append(tabla(consultar("""
            select c.tabla,
                   coalesce(c.campo, '(alta)')                  as campo,
                   coalesce(left(c.valor_anterior, 18), '—')    as antes,
                   coalesce(left(c.valor_nuevo, 18), '—')       as despues,
                   coalesce(c.dispositivo, '—')                 as aparato,
                   to_char(c.realizado_en at time zone 'America/Montevideo',
                           'DD/MM HH24:MI:SS')                  as cuando
              from cambios c
             order by c.realizado_en desc limit 15
        """), ["tabla", "campo", "antes", "despues", "aparato", "cuando"]))

    return "\n".join(partes)


def main() -> None:
    ver_cambios = "--cambios" in sys.argv
    if "--watch" in sys.argv:
        try:
            while True:
                subprocess.run(["clear"], check=False)
                print(informe(ver_cambios))
                print("\n(ctrl-c para salir · se refresca en 10 s)")
                time.sleep(10)
        except KeyboardInterrupt:
            print()
    else:
        print(informe(ver_cambios))


if __name__ == "__main__":
    main()
