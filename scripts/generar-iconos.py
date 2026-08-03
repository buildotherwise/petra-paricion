#!/usr/bin/env python3
"""
Genera todos los assets de imagen a partir de logo_petra_sin_fondo.png.

    python3 scripts/generar-iconos.py

Existe porque el logo original no sirve tal cual para íconos de app, y las
razones no son obvias:

  · No es cuadrado (731×630). El manifiesto declara íconos de 192×192 y
    512×512; una imagen con otra relación de aspecto queda deformada o
    rechazada. Hay que componerla centrada sobre un lienzo cuadrado.

  · No tiene margen: el contenido llega borde a borde. Android recorta los
    íconos `maskable` a un círculo o squircle y se come cerca del 10% de cada
    lado, así que el logo tiene que entrar en la zona segura central.

  · iOS no respeta la transparencia en los íconos de pantalla de inicio: los
    compone sobre NEGRO. Un PNG transparente termina como un logo dorado sobre
    un cuadrado negro, que es exactamente lo contrario de la marca. El
    apple-touch-icon va con fondo opaco.
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "logo_petra_sin_fondo.png"
PUBLIC = RAIZ / "public"

PAPEL = (244, 240, 227, 255)  # --paper, el fondo de la app


def recortado() -> Image.Image:
    """El logo sin borde transparente, para poder controlar el margen acá."""
    im = Image.open(ORIGEN).convert("RGBA")
    caja = im.getbbox()
    return im.crop(caja) if caja else im


def emblema(logo: Image.Image) -> Image.Image:
    """
    Solo el medallón del carnero, sin el lettering.

    El encabezado de la app lo muestra a ~26 px. El logo entero a ese tamaño es
    una mancha: «PETRA» y «MERINO AUSTRALIANO» quedan en menos de tres píxeles
    de alto cada uno. El emblema solo, en cambio, se reconoce.

    El corte se encuentra solo: se busca la primera banda de filas totalmente
    transparentes, que es la que separa el medallón de la palabra. Buscarlo en
    vez de escribir un número fijo hace que el recorte siga andando si el logo
    original cambia de proporción.
    """
    alfa = logo.split()[3]
    ancho, alto = logo.size

    vacia = None
    for y in range(alto):
        hay = any(alfa.getpixel((x, y)) > 24 for x in range(0, ancho, 3))
        if not hay and vacia is None:
            vacia = y
        elif hay and vacia is not None:
            if y - vacia >= 4:
                recorte = logo.crop((0, 0, ancho, vacia))
                caja = recorte.getbbox()
                return recorte.crop(caja) if caja else recorte
            vacia = None

    raise SystemExit('No encontré la separación entre el emblema y el lettering.')


def componer(logo: Image.Image, lado: int, ocupacion: float, fondo=None) -> Image.Image:
    """Centra el logo en un lienzo cuadrado ocupando `ocupacion` del lado."""
    lienzo = Image.new("RGBA", (lado, lado), fondo or (0, 0, 0, 0))

    disponible = int(lado * ocupacion)
    escala = min(disponible / logo.width, disponible / logo.height)
    ancho, alto = round(logo.width * escala), round(logo.height * escala)
    escalado = logo.resize((ancho, alto), Image.LANCZOS)

    lienzo.paste(escalado, ((lado - ancho) // 2, (lado - alto) // 2), escalado)
    return lienzo


def guardar(im: Image.Image, nombre: str) -> None:
    destino = PUBLIC / nombre
    im.save(destino, "PNG", optimize=True)
    kb = destino.stat().st_size / 1024
    print(f"  {nombre:26} {im.width}×{im.height}  {kb:6.0f} KB")


def main() -> None:
    logo = recortado()
    print(f"origen: {ORIGEN.name} → contenido {logo.width}×{logo.height}\n")

    # Login: conserva la proporción original, sin lienzo cuadrado.
    # Se muestra a 12rem de ancho; en pantallas 3x eso son 576 px reales.
    ancho = 720
    guardar(
        logo.resize((ancho, round(logo.height * ancho / logo.width)), Image.LANCZOS),
        "logo-login.png",
    )

    # Íconos `any`: transparentes, con un respiro para que no toquen el borde.
    guardar(componer(logo, 192, 0.86), "icono-192.png")
    guardar(componer(logo, 512, 0.86), "icono-512.png")

    # `maskable`: fondo opaco y logo al 60%, para sobrevivir el recorte de
    # Android a círculo o squircle.
    guardar(componer(logo, 512, 0.60, PAPEL), "icono-maskable-512.png")

    # iOS compone los íconos sobre negro si son transparentes: fondo opaco.
    guardar(componer(logo, 180, 0.78, PAPEL), "apple-touch-icon.png")

    # El encabezado de la app: solo el medallón, que a 26 px todavía se lee.
    # A 3x son 78 px reales, así que 160 sobra y pesa poco.
    marca = emblema(logo)
    guardar(
        marca.resize((160, round(marca.height * 160 / marca.width)), Image.LANCZOS),
        "emblema.png",
    )


if __name__ == "__main__":
    main()
