#!/usr/bin/env python3
"""
Carga los servicios de la temporada —inseminaciones y encarnerada— en `servicios`.

    python3 scripts/importar-servicios.py --test      # verifica lectura y validaciones
    python3 scripts/importar-servicios.py --dry-run   # informe, sin tocar la base
    python3 scripts/importar-servicios.py             # importa

Hermano de importar-madres.py y con las mismas herramientas: openpyxl para leer
y PostgREST con la service_role para escribir. Es una carga administrativa, no
una operación de campo — y se corre UNA VEZ por temporada, contra un archivo que
alguien más mantiene en otro sistema.

Lee datos/inseminacion_2026.xlsx, que trae dos hojas con vocabulario distinto:

  · «Servicios»    — la inseminación artificial. Fecha puntual, padre cierto en
    ese acto. Una oveja puede tener hasta tres, separadas ~15 días: son las que
    volvieron a entrar en celo. Se cargan con fecha_inicio = fecha_fin.
  · «Encarnerada»  — el repaso. El carnero suelto con el lote para levantar las
    que no quedaron preñadas. Trae RANGO de fechas, y se guarda como rango.

Dos cosas del archivo real que hay que tener presentes:

  · Las caravanas vienen con TIPOS DISTINTOS en cada hoja: en «Servicios» son
    texto con ceros ('0001') y en «Encarnerada» son números (1034). Se
    normalizan igual que en importar-madres.py, y los ceros a la izquierda son
    significativos: 0040 y 40 son ovejas distintas.
  · El padre también es numérico (3050, 32) y también se guarda como texto, por
    lo mismo.

Lo que este script NO hace, a propósito: crear ovejas. Una caravana que no está
en la base se reporta y no se inserta. Que falte una madre es una pregunta para
alguien, no un dato para inventar.
"""

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "datos" / "inseminacion_2026.xlsx"

# Cuántas filas por pedido. 1.359 servicios entran en tres viajes: pocos como
# para no pelear con el servidor, chicos como para que un fallo diga cuál falló.
LOTE = 500

# Las dos hojas, con el tipo que le corresponde a cada una y sus columnas. El
# mapeo es POR ENCABEZADO y no por posición: una columna agregada en el origen
# no puede correr todo un lugar en silencio.
HOJAS = (
    {
        "nombre": "servicios",
        "tipo": "inseminacion",
        "inicio": ("fecha inseminacion", "fecha inseminación", "fecha"),
        "fin": None,  # puntual: fin = inicio
    },
    {
        "nombre": "encarnerada",
        "tipo": "encarnerada",
        "inicio": ("fecha inicio",),
        "fin": ("fecha fin",),
    },
)

CARAVANA = ("caravana madre", "caravana")
PADRE = ("padre",)
CABANA = ("cabana", "cabaña")


def normalizar(valor) -> str:
    """Un valor de celda → el texto tal como debe guardarse.

    Portado de importar-madres.py sin cambios: sirve igual para la caravana y
    para el padre, que llegan con los mismos vicios de Excel.
    """
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = str(valor).strip()
    # Excel antepone un apóstrofe para forzar formato de texto; no es del dato.
    texto = texto.strip("'").strip()
    # Espacios internos repetidos: 'PI  136' y 'PI 136' son la misma oveja.
    return re.sub(r"\s+", " ", texto)


def clave_de_encabezado(valor) -> str:
    """Un encabezado → su forma comparable: sin acentos, sin mayúsculas."""
    texto = normalizar(valor).lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def fecha_de(valor) -> date | None:
    """Una celda → date, o None si no se puede leer como fecha.

    openpyxl ya convierte los seriales de Excel a datetime, que es la razón
    principal para que esta carga viva en Python: en el navegador habría que
    hacer esa conversión a mano, con el huso horario esperando para restar un
    día a cualquier medianoche.
    """
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    # Por si alguna celda quedó como serial crudo o como texto ISO.
    if isinstance(valor, (int, float)):
        try:
            return date.fromordinal(date(1899, 12, 30).toordinal() + int(valor))
        except (ValueError, OverflowError):
            return None
    texto = normalizar(valor)
    if not texto:
        return None
    try:
        return date.fromisoformat(texto[:10])
    except ValueError:
        return None


def ventana_razonable(temporada: int) -> tuple[date, date]:
    """Entre qué fechas puede caer un servicio de esta temporada.

    Los partos van de agosto a noviembre (R12) y la gestación son cinco meses,
    así que los servicios caen en el primer semestre del año de la temporada. El
    margen hacia atrás es generoso a propósito: lo que se busca atajar es el año
    tipeado mal o el serial leído como número, no discutirle al calendario.
    """
    return date(temporada - 1, 6, 1), date(temporada, 6, 30)


def leer_hoja(hoja: dict, filas: list, temporada: int) -> tuple[list[dict], list[dict], int]:
    """Filas crudas de una hoja → (servicios, problemas, vacías).

    Recibe las filas ya leídas y no el archivo: así las validaciones se pueden
    verificar con --test sin fabricar un xlsx.
    """
    servicios: list[dict] = []
    problemas: list[dict] = []
    vacias = 0

    if not filas:
        return servicios, problemas, vacias

    encabezado = [clave_de_encabezado(c) for c in filas[0]]

    def columna(nombres, obligatoria=True):
        for n in nombres:
            if n in encabezado:
                return encabezado.index(n)
        if obligatoria:
            raise SystemExit(
                f"La hoja «{hoja['nombre']}» no tiene la columna {nombres[0]!r}. "
                f"Encontradas: {', '.join(encabezado)}"
            )
        return None

    i_caravana = columna(CARAVANA)
    i_padre = columna(PADRE)
    i_cabana = columna(CABANA, obligatoria=False)
    i_inicio = columna(hoja["inicio"])
    i_fin = columna(hoja["fin"]) if hoja["fin"] else i_inicio

    minima, maxima = ventana_razonable(temporada)

    def celda(fila, i):
        return fila[i] if i is not None and i < len(fila) else None

    for n, fila in enumerate(filas[1:], start=2):  # start=2: fila 1 es el encabezado
        if fila is None or all(c is None or normalizar(c) == "" for c in fila):
            vacias += 1
            continue

        def anotar(motivo):
            problemas.append({"hoja": hoja["nombre"], "fila": n, "motivo": motivo})

        caravana = normalizar(celda(fila, i_caravana))
        padre = normalizar(celda(fila, i_padre))
        inicio = fecha_de(celda(fila, i_inicio))
        fin = fecha_de(celda(fila, i_fin))

        if not caravana:
            anotar("sin caravana de la madre")
            continue
        if not padre:
            anotar(f"{caravana}: sin padre")
            continue
        if inicio is None:
            anotar(f"{caravana}: la fecha no se pudo leer")
            continue
        if fin is None:
            anotar(f"{caravana}: la fecha de fin no se pudo leer")
            continue
        if fin < inicio:
            anotar(f"{caravana}: termina ({fin}) antes de empezar ({inicio})")
            continue
        if not (minima <= inicio <= maxima) or not (minima <= fin <= maxima):
            anotar(
                f"{caravana}: {inicio}–{fin} cae fuera de la temporada "
                f"({minima} a {maxima})"
            )
            continue

        servicios.append({
            "caravana": caravana,
            "tipo": hoja["tipo"],
            "fecha_inicio": inicio.isoformat(),
            "fecha_fin": fin.isoformat(),
            "padre": padre,
            "cabana": normalizar(celda(fila, i_cabana)) or None,
            "hoja": hoja["nombre"],
            "fila": n,
        })

    return servicios, problemas, vacias


def deduplicar(servicios: list[dict]) -> tuple[list[dict], list[dict]]:
    """Saca los repetidos exactos del archivo, con la misma clave que la base.

    Es la restricción `servicios_idempotencia` de la migración 0010. Sacarlos
    acá no es lo que garantiza que no entren dos veces —eso lo garantiza el
    servidor—: es para poder decir cuántos venían repetidos antes de escribir.
    """
    vistos = set()
    unicos, repetidos = [], []
    for s in servicios:
        clave = (s["caravana"], s["tipo"], s["fecha_inicio"], s["padre"])
        if clave in vistos:
            repetidos.append(s)
        else:
            vistos.add(clave)
            unicos.append(s)
    return unicos, repetidos


def leer_archivo(temporada: int) -> tuple[list[dict], list[dict], int]:
    import openpyxl

    if not ARCHIVO.exists():
        raise SystemExit(f"No está {ARCHIVO}")

    libro = openpyxl.load_workbook(ARCHIVO, read_only=True, data_only=True)
    por_nombre = {clave_de_encabezado(n): n for n in libro.sheetnames}

    servicios, problemas, vacias = [], [], 0
    for hoja in HOJAS:
        real = por_nombre.get(hoja["nombre"])
        if real is None:
            raise SystemExit(
                f"El archivo no tiene la hoja «{hoja['nombre']}». "
                f"Tiene: {', '.join(libro.sheetnames)}"
            )
        filas = list(libro[real].iter_rows(values_only=True))
        s, p, v = leer_hoja(hoja, filas, temporada)
        servicios += s
        problemas += p
        vacias += v

    return servicios, problemas, vacias


# ---------------------------------------------------------------------------
# La base
# ---------------------------------------------------------------------------


def pedir(ruta: str, metodo="GET", cuerpo=None, prefer=None, con_rango=False):
    url = os.environ["VITE_SUPABASE_URL"].rstrip("/")
    clave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    cabeceras = {
        "apikey": clave,
        "Authorization": f"Bearer {clave}",
        "Content-Type": "application/json",
        "User-Agent": "petra-paricion/importador",
    }
    if prefer:
        cabeceras["Prefer"] = prefer

    pedido = urllib.request.Request(
        f"{url}/rest/v1/{ruta}",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers=cabeceras,
        method=metodo,
    )
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            texto = r.read().decode()
            datos = json.loads(texto) if texto else []
            return (datos, r.headers.get("Content-Range")) if con_rango else datos
    except urllib.error.HTTPError as e:
        raise SystemExit(f"\n  ✗ HTTP {e.code}\n{e.read().decode(errors='replace')[:900]}")


def total_de(ruta: str) -> int:
    """Cuántas filas hay, según el servidor y no según cuántas nos mandó.

    Contar el largo de la respuesta es contar hasta donde llegue el tope de filas
    de PostgREST —el mismo que obliga a paginar en otras partes—, así que una
    tabla más grande que el tope se informaría como si tuviera exactamente el
    tope. `count=exact` lo dice en la cabecera: `0-502/503`.
    """
    _, rango = pedir(f"{ruta}&limit=0", prefer="count=exact", con_rango=True)
    if rango is None or "/" not in rango:
        raise SystemExit(f"  ✗ el servidor no informó el total de {ruta}")
    return int(rango.rsplit("/", 1)[1])


def madres_de_la_temporada(temporada: int) -> dict[str, str]:
    """caravana → id, leído de la base. Es el cruce que decide qué se inserta."""
    filtro = f"ovejas?select=id,caravana&temporada=eq.{temporada}"
    esperadas = total_de(filtro)
    filas = pedir(f"{filtro}&limit=5000")

    # Si el tope del proyecto cortara la respuesta, las madres que faltan se
    # reportarían como «sin madre en la base» y sus servicios no se cargarían.
    # Es un falso negativo ruidoso y recuperable, pero mejor no descubrirlo
    # leyendo una lista de cuatrocientas caravanas.
    if len(filas) != esperadas:
        raise SystemExit(
            f"  ✗ la base tiene {esperadas} ovejas y el servidor devolvió {len(filas)}: "
            "la respuesta se cortó. Hay que paginar antes de seguir."
        )
    return {f["caravana"]: f["id"] for f in filas}


def insertar(servicios: list[dict]) -> int:
    """Inserta en lotes. Devuelve cuántos entraron de verdad."""
    entrados = 0
    for desde in range(0, len(servicios), LOTE):
        lote = servicios[desde:desde + LOTE]
        filas = [
            {k: s[k] for k in ("oveja_id", "tipo", "fecha_inicio", "fecha_fin", "padre", "cabana")}
            for s in lote
        ]
        # `resolution=ignore-duplicates` es ON CONFLICT DO NOTHING: reejecutar el
        # importador no toca lo que ya está —así no ensucia `cambios` ni pisa una
        # corrección hecha a mano— y la respuesta trae solo lo que entró, que es
        # de dónde sale el conteo.
        nuevas = pedir(
            "servicios?on_conflict=oveja_id,tipo,fecha_inicio,padre&select=id",
            metodo="POST",
            cuerpo=filas,
            prefer="resolution=ignore-duplicates,return=representation",
        )
        entrados += len(nuevas)
        print(f"  lote {desde // LOTE + 1}: {len(lote)} enviados, {len(nuevas)} nuevos")
    return entrados


def contar_en_la_base(temporada: int) -> int:
    """Los servicios de ESTA temporada, contados por el servidor.

    `servicios` no tiene columna temporada —se deriva por la oveja—, así que el
    filtro viaja como un embed interno sobre `ovejas`. Sin eso el número sería el
    total histórico y dejaría de significar algo en cuanto haya una segunda
    temporada.
    """
    return total_de(
        f"servicios?select=id,ovejas!inner(temporada)&ovejas.temporada=eq.{temporada}"
    )


# ---------------------------------------------------------------------------
# Autoverificación
# ---------------------------------------------------------------------------


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

    # Las fechas, incluida la que llega como serial de Excel.
    assert fecha_de(datetime(2026, 3, 9)) == date(2026, 3, 9), "datetime de openpyxl"
    assert fecha_de(46090) == date(2026, 3, 9), f"serial de Excel: {fecha_de(46090)}"
    assert fecha_de("2026-03-09") == date(2026, 3, 9), "texto ISO"
    assert fecha_de("marzo") is None, "un texto que no es fecha"
    assert fecha_de(None) is None, "una celda vacía"
    print("fechas: 5/5 OK")

    # La lectura de una hoja, con una fila buena y una de cada problema. La
    # hoja de inseminación viene con las caravanas como TEXTO, que es como está
    # en el archivo real.
    hoja_ia = HOJAS[0]
    filas = [
        ("Caravana madre", "Fecha inseminacion", "Padre", "Cabaña"),
        ("0001", datetime(2026, 3, 9), 3050, "PETRA"),          # buena
        (None, None, None, None),                                # vacía
        ("", datetime(2026, 3, 9), 3050, "PETRA"),               # sin caravana
        ("0002", datetime(2026, 3, 9), None, "PETRA"),           # sin padre
        ("0003", "cuando florezca el ceibo", 3050, "PETRA"),     # fecha ilegible
        ("0004", datetime(2020, 3, 9), 3050, "PETRA"),           # fuera de temporada
        ("0001", datetime(2026, 3, 9), 3050, "PETRA"),           # repetida exacta
    ]
    servicios, problemas, vacias = leer_hoja(hoja_ia, filas, 2026)
    assert vacias == 1, f"la fila vacía se cuenta aparte (contó {vacias})"
    assert len(problemas) == 4, f"cuatro filas con problema, hubo {len(problemas)}"
    assert len(servicios) == 2, f"dos filas buenas (una repetida), hubo {len(servicios)}"
    assert servicios[0]["caravana"] == "0001", "la caravana conserva sus ceros"
    assert servicios[0]["padre"] == "3050", "el padre se guarda como texto"
    assert servicios[0]["fecha_inicio"] == servicios[0]["fecha_fin"], \
        "la inseminación es un rango de un día"

    unicos, repetidos = deduplicar(servicios)
    assert len(unicos) == 1 and len(repetidos) == 1, "el repetido exacto se separa"
    print("hoja de inseminación: 8/8 OK")

    # Y la encarnerada, con las caravanas como NÚMERO y su rango de verdad.
    hoja_enc = HOJAS[1]
    filas = [
        ("Caravana madre", "Fecha inicio", "Fecha fin", "Padre", "Cabaña"),
        (1034, datetime(2026, 4, 21), datetime(2026, 5, 13), 3020, "PETRA"),
        (1035, datetime(2026, 5, 13), datetime(2026, 4, 21), 3020, "PETRA"),  # al revés
    ]
    servicios, problemas, vacias = leer_hoja(hoja_enc, filas, 2026)
    assert len(servicios) == 1, f"una sola fila buena, hubo {len(servicios)}"
    assert servicios[0]["caravana"] == "1034", "la caravana numérica se pasa a texto"
    assert servicios[0]["fecha_inicio"] == "2026-04-21", "el rango arranca donde dice"
    assert servicios[0]["fecha_fin"] == "2026-05-13", "y termina donde dice"
    assert len(problemas) == 1 and "antes de empezar" in problemas[0]["motivo"], \
        "el rango al revés se rechaza con su motivo"
    print("hoja de encarnerada: 5/5 OK")


# ---------------------------------------------------------------------------


def main() -> None:
    if "--test" in sys.argv:
        autoverificar()
        return

    temporada = int(os.environ["VITE_TEMPORADA"])
    autoverificar()

    print(f"\nArchivo: {ARCHIVO.relative_to(RAIZ)}")
    print(f"Temporada: {temporada}\n")

    servicios, problemas, vacias = leer_archivo(temporada)
    servicios, repetidos = deduplicar(servicios)

    por_tipo = Counter(s["tipo"] for s in servicios)
    print(f"  inseminaciones:  {por_tipo['inseminacion']}")
    print(f"  encarneradas:    {por_tipo['encarnerada']}")
    print(f"  ovejas distintas: {len({s['caravana'] for s in servicios})}")
    print(f"  padres distintos: {len({s['padre'] for s in servicios})}")
    if vacias:
        print(f"  filas vacías:    {vacias}")
    if repetidos:
        print(f"  repetidas en el archivo: {len(repetidos)}  (se cargan una vez)")

    if problemas:
        print(f"\n  ⚠ FILAS CON PROBLEMA ({len(problemas)}) — no se cargan:")
        for p in problemas[:40]:
            print(f"      {p['hoja']} fila {p['fila']}: {p['motivo']}")
        if len(problemas) > 40:
            print(f"      … y {len(problemas) - 40} más")

    print("\nCruzando contra las madres de la base…")
    madres = madres_de_la_temporada(temporada)
    print(f"  ovejas en la base: {len(madres)}")

    sin_madre, a_insertar = [], []
    for s in servicios:
        id_oveja = madres.get(s["caravana"])
        if id_oveja is None:
            sin_madre.append(s)
        else:
            a_insertar.append({**s, "oveja_id": id_oveja})

    if sin_madre:
        caravanas = sorted({s["caravana"] for s in sin_madre})
        print(f"\n  ⚠ SIN MADRE EN LA BASE ({len(sin_madre)} servicios, "
              f"{len(caravanas)} caravanas) — no se cargan:")
        for c in caravanas[:40]:
            print(f"      {c}")
        if len(caravanas) > 40:
            print(f"      … y {len(caravanas) - 40} más")
        print("      Revisar el archivo o dar de alta la madre. No se crean solas.")

    print(f"\n  a insertar: {len(a_insertar)}")

    if "--dry-run" in sys.argv:
        print("\n(simulacro: no se tocó la base)")
        return

    if not a_insertar:
        print("\nNo hay nada para insertar.")
        return

    print()
    entrados = insertar(a_insertar)
    print(f"\n  nuevos: {entrados}   ya estaban: {len(a_insertar) - entrados}")
    print(f"  en la base ahora: {contar_en_la_base(temporada)} servicios de la temporada")


if __name__ == "__main__":
    main()
