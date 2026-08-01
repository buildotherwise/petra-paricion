#!/usr/bin/env python3
"""
Crea una cuenta de la app y su perfil.

    python3 scripts/crear-cuenta.py --email juan@petra.uy --nombre "Juan Pérez"
    python3 scripts/crear-cuenta.py --email carlos@... --nombre "Carlos" --rol admin

El registro público está deshabilitado: las cuentas las crea el administrador.

La contraseña se genera acá y se escribe en datos/cuentas.txt, que está fuera
del repo. NO se imprime en pantalla, para que no quede en el historial de la
terminal ni en un chat. Hay que abrir ese archivo para pasársela a la persona,
y conviene que la cambie en el primer uso.

Roles:
  operador  registra partos y señaladas, edita la temporada activa, alta manual
            de ovejas. No borra, no importa, no gestiona usuarios.
  admin     todo lo anterior + correcciones auditadas, importaciones,
            exportaciones y gestión de usuarios.
"""

import argparse
import json
import os
import secrets
import string
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO_CUENTAS = RAIZ / "datos" / "cuentas.txt"


def pedir(ruta: str, cuerpo: dict | None = None, metodo: str = "POST"):
    url = os.environ["VITE_SUPABASE_URL"].rstrip("/")
    clave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    pedido = urllib.request.Request(
        f"{url}{ruta}",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={
            "apikey": clave,
            "Authorization": f"Bearer {clave}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "User-Agent": "petra-paricion/cuentas",
        },
        method=metodo,
    )
    try:
        with urllib.request.urlopen(pedido, timeout=60) as r:
            texto = r.read().decode()
            return json.loads(texto) if texto.strip() else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"  ✗ HTTP {e.code}\n{e.read().decode(errors='replace')[:700]}")


def generar_password() -> str:
    """Legible y tipeable: en el campo se escribe una vez, en un teléfono, y a
    veces con las manos frías. Sin símbolos ni caracteres que se confundan."""
    alfabeto = "".join(c for c in string.ascii_lowercase + string.digits if c not in "l1o0")
    return "-".join(
        "".join(secrets.choice(alfabeto) for _ in range(4)) for _ in range(3)
    )


def guardar(email: str, nombre: str, rol: str, password: str) -> None:
    ARCHIVO_CUENTAS.parent.mkdir(exist_ok=True)
    cuando = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with ARCHIVO_CUENTAS.open("a") as f:
        f.write(f"{cuando}  {rol:8}  {nombre}\n")
        f.write(f"    usuario:    {email}\n")
        f.write(f"    contraseña: {password}\n\n")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--nombre", required=True)
    p.add_argument("--rol", choices=["operador", "admin"], default="operador")
    args = p.parse_args()

    password = generar_password()

    print(f"Creando {args.rol}: {args.nombre} <{args.email}>")

    usuario = pedir(
        "/auth/v1/admin/users",
        {
            "email": args.email,
            "password": password,
            # Sin verificación por correo: en el campo puede no haber acceso al
            # mail, y la cuenta la está creando el administrador a mano.
            "email_confirm": True,
        },
    )
    user_id = usuario["id"]

    pedir(
        "/rest/v1/perfiles",
        {"user_id": user_id, "nombre": args.nombre, "rol": args.rol, "activo": True},
    )

    guardar(args.email, args.nombre, args.rol, password)

    print(f"  ✓ cuenta y perfil creados  (id {user_id})")
    print(f"  ✓ credenciales en {ARCHIVO_CUENTAS.relative_to(RAIZ)} — fuera del repo")


if __name__ == "__main__":
    main()
