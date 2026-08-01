#!/usr/bin/env python3
"""
Carga las caravanas de las madres de la temporada en la tabla `ovejas`.

    python3 scripts/importar-madres.py --test      # verifica la normalización
    python3 scripts/importar-madres.py --dry-run   # informe, sin tocar la base
    python3 scripts/importar-madres.py             # importa

Lee datos/caravanas.xlsx. Escribe por PostgREST con la service_role, así que
saltea RLS: es una carga administrativa, no una operación de campo.

Sobre la normalización — lo que el archivo real trae y por qué importa:

  · 91 caravanas tienen ceros a la izquierda ('0001', '0013'). Excel las guardó
    como texto y hay que dejarlas así: '0013' y '13' son ovejas distintas, y el
    buscador de la app filtra sobre ese texto.
  · 391 vienen como número. Se pasan a texto sin reformatear.
  · 20 son alfanuméricas ('PI 136', 'T. 096 V (2096)'). Se conservan tal cual;
    el buscador llega a ellas por sus dígitos (ver src/lib/busqueda.ts).
  · Excel a veces deja un apóstrofe delante del texto para forzar el formato.
    Ese apóstrofe no es parte de la caravana.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "datos" / "caravanas.xlsx"


def normalizar(valor) -> str:
    """Un valor de celda → la caravana tal como debe guardarse."""
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = str(valor).strip()
    # Excel antepone un apóstrofe para forzar formato de texto; no es del dato.
    texto = texto.strip("'").strip()
    # Espacios internos repetidos: 'PI  136' y 'PI 136' son la misma oveja.
    return re.sub(r"\s+", " ", texto)


def autoverificar() -> None:
    casos = [
        ("0001", "0001", "los ceros a la izquierda se conservan"),
        (13, "13", "los números se pasan a texto sin reformatear"),
        (13.0, "13", "un float entero no queda como '13.0'"),
        ("'0499'", "0499", "se saca el apóstrofe que agrega Excel"),
        ("  1742  ", "1742", "se recortan los espacios"),
        ("PI  136", "PI 136", "los espacios internos se colapsan"),
        ("T. 096 V (2096)", "T. 096 V (2096)", "las alfanuméricas quedan intactas"),
        (None, "", "una celda vacía queda vacía"),
    ]
    for entrada, esperado, motivo in casos:
        obtenido = normalizar(entrada)
        assert obtenido == esperado, f"{motivo}: {entrada!r} → {obtenido!r}, se esperaba {esperado!r}"
    print(f"normalización: {len(casos)}/{len(casos)} OK")


def leer_caravanas() -> list[str]:
    import openpyxl

    if not ARCHIVO.exists():
        raise SystemExit(f"No está {ARCHIVO}")

    libro = openpyxl.load_workbook(ARCHIVO, read_only=True, data_only=True)
    hoja = libro[libro.sheetnames[0]]

    filas = list(hoja.iter_rows(values_only=True))
    if not filas:
        raise SystemExit("El archivo está vacío")

    # La primera fila es encabezado si no parece una caravana.
    primera = normalizar(filas[0][0] if filas[0] else None)
    desde = 1 if primera.lower() in {"caravana", "caravanas"} else 0

    return [c for c in (normalizar(f[0] if f else None) for f in filas[desde:]) if c]


def informe(caravanas: list[str]) -> list[str]:
    repetidas = {c: n for c, n in Counter(caravanas).items() if n > 1}
    alfanumericas = sorted({c for c in caravanas if not c.isdigit()})
    con_cero = [c for c in caravanas if c.startswith("0")]

    print(f"  leídas:            {len(caravanas)}")
    print(f"  únicas:            {len(set(caravanas))}")
    print(f"  con cero adelante: {len(con_cero)}")
    print(f"  alfanuméricas:     {len(alfanumericas)}")

    if repetidas:
        print(f"\n  ⚠ REPETIDAS ({len(repetidas)}) — la base las rechazaría:")
        for c, n in sorted(repetidas.items()):
            print(f"      {c} ×{n}")

    if alfanumericas:
        print("\n  Para revisar a ojo — se guardan tal cual:")
        for c in alfanumericas:
            print(f"      {c}")

    return sorted(set(caravanas))


def insertar(caravanas: list[str], temporada: int) -> None:
    url = os.environ["VITE_SUPABASE_URL"].rstrip("/")
    clave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    filas = [
        {"temporada": temporada, "caravana": c, "precargada": True}
        for c in caravanas
    ]

    pedido = urllib.request.Request(
        # Upsert: correr el importador dos veces no duplica ni falla.
        f"{url}/rest/v1/ovejas?on_conflict=temporada,caravana",
        data=json.dumps(filas).encode(),
        headers={
            "apikey": clave,
            "Authorization": f"Bearer {clave}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
            "User-Agent": "petra-paricion/importador",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            print(f"\n  insertadas/actualizadas: {len(filas)}  (HTTP {r.status})")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"\n  ✗ HTTP {e.code}\n{e.read().decode(errors='replace')[:900]}")


def main() -> None:
    if "--test" in sys.argv:
        autoverificar()
        return

    temporada = int(os.environ["VITE_TEMPORADA"])
    autoverificar()

    print(f"\nArchivo: {ARCHIVO.relative_to(RAIZ)}")
    caravanas = leer_caravanas()
    print(f"Temporada: {temporada}\n")
    unicas = informe(caravanas)

    if "--dry-run" in sys.argv:
        print("\n(simulacro: no se tocó la base)")
        return

    insertar(unicas, temporada)


if __name__ == "__main__":
    main()
