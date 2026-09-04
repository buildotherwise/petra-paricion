# Protocolo de sincronización (CLAUDE.md §11)

Los seis pasos que hay que ver funcionar antes del día 1, con qué mirar en cada
uno. Se corrió entero en la Fase 1; desde entonces entraron la señalada, la
edición, la anulación, la muerte, la web admin y el tablero — o sea casi todos
los caminos de escritura—, así que vuelve a correrse sobre el código final.

Para verificar cada paso, desde la máquina de escritorio:

```bash
python3 scripts/estado-de-la-base.py            # inventario y últimos partos
python3 scripts/estado-de-la-base.py --cambios  # además, la auditoría
python3 scripts/estado-de-la-base.py --watch    # se refresca solo cada 10 s
```

---

## Dos reglas para no ensuciar la temporada

**1. Las ovejas de la prueba se dan de alta a mano, con caravanas `PRUEBA-1`,
`PRUEBA-2`…** No se usan las 503 precargadas.

El motivo no es el orden: `partos` tiene `unique (oveja_id)`, así que un parto
de prueba sobre una oveja real **bloquea su parto de verdad**. Si esa oveja pare
mientras la prueba sigue cargada, el operador va a cargarla y la app le va a
decir «esa oveja ya tiene parto registrado». Con alta manual (R9) eso no puede
pasar: las ovejas de prueba son ovejas nuevas, y la limpieza las borra por
`precargada = false` sin tocar ninguna real.

**2. No se señala nada.** El tatuaje que sugiere la app se cuenta *desde el
último puesto* (R14), así que cualquier tatuaje de prueba —el 001 o el 900, da
igual— pasa a ser el último y el primer cordero real arranca detrás de él. El
protocolo no necesita señalar nada. Si igual querés probar ese camino, sabé que
la primera señalada real va a necesitar que le corrijas el número a mano: una
sola vez, porque de ahí en adelante la serie se acomoda sola.

Los **collares** no tienen ese problema: da lo mismo qué número se use. No hay
restricción de rango en ningún lado —la app solo exige que no esté vacío y que
no esté ya usado, y en la base la columna es `text` sin ningún CHECK—, y un
número usado queda tomado toda la temporada (R3) tenga el valor que tenga. Lo
único que los libera es la limpieza. Una versión anterior de este documento
recomendaba «del 90 para arriba» suponiendo que en el campo se reparten desde
el 1; eso nunca se verificó y no cambia nada, así que se sacó.

Dato aparte que sí conviene saber: los collares se comparan **sin ceros a la
izquierda**. El `12` y el `012` son el mismo collar — que es lo correcto, porque
son el mismo objeto colgado del cuello de la misma oveja.

**Y la limpieza va el mismo día.** `scripts/limpiar-datos-de-prueba.sql`, desde
el SQL Editor de Supabase. Se niega a correr si apareció un parto posterior al
corte, así que una vez que llegue el primer parto real deja de servir.

---

## Antes de empezar

- [ ] El deploy de Vercel terminó y los aparatos abrieron la app **una vez con
      señal** después de ese deploy. Los que tenían la PWA instalada de antes
      traen el service worker viejo, que no busca versiones nuevas: hay que
      cerrarla del todo y volver a abrirla una vez para que tome la que sí lo
      hace.
- [ ] Los dos aparatos tienen sesión iniciada. Para el protocolo alcanza con la
      misma cuenta en los dos: lo que los distingue en la auditoría es la
      columna `dispositivo`, no el usuario.
- [ ] iPhones en **iOS 16.4 o más nuevo** (OPFS). Si alguno es más viejo, la app
      ahora lo dice al abrir en vez de quedarse en «Sin datos aún».
- [ ] Anotar el estado inicial: `python3 scripts/estado-de-la-base.py`.

---

## 1 · Tres partos en modo avión

**En el aparato:** modo avión → registrar 3 partos con alta manual (`PRUEBA-1`,
`PRUEBA-2`, `PRUEBA-3`), uno de ellos con mellizos y el número de collar que
tengas a mano.

- [ ] Después de cada uno, la pastilla del encabezado sube: «1 registro sin
      subir», «2 registros…», «3 registros…». Cuenta **cargas**, no filas: el
      parto de mellizos suma uno solo aunque sean tres filas.
- [ ] Salir del modo avión y esperar. La pastilla pasa a **«Todo sincronizado»**.
- [ ] `estado-de-la-base.py` muestra los 3 partos con su aparato y su hora.

> Si la pastilla dijera **«3 sin subir — con problemas»** en rojo, no es falta de
> señal: es el sync roto (cuenta desactivada, sesión inválida). Esa distinción es
> nueva y es justamente lo que hay que ver funcionar.

## 2 · Dos aparatos offline, partos distintos

**En los dos:** modo avión. En el A, un parto sobre `PRUEBA-4`; en el B, uno
sobre `PRUEBA-5`. Reconectar **primero el A, y cuando quede en cero, el B**.

- [ ] Los dos llegan: `estado-de-la-base.py` muestra los dos partos, con
      `aparato` distinto.
- [ ] Ninguno duplicado, y los del paso 1 siguen ahí.
- [ ] En el aparato A aparece el parto que cargó el B (baja del servidor).

## 3 · Dos aparatos editan el mismo cordero

**Los dos con señal primero**, para que ambos tengan el mismo cordero en su
réplica. Después los dos en modo avión.

En el A: abrir un cordero de `PRUEBA-1` → Editar → peso **4,00 kg**.
En el B: el mismo cordero → Editar → peso **5,00 kg**.

Reconectar **primero el A, después el B**.

- [ ] Gana el último: el peso final es **5,00**.
- [ ] `estado-de-la-base.py --cambios` muestra **las dos ediciones**, cada una
      con su aparato y su hora. Ese es el punto: la pisada se puede reconstruir.

## 4 · La cola sobrevive a cerrar la app

**En el aparato:** modo avión → registrar un parto (`PRUEBA-6`) → **cerrar la
PWA del todo** (no mandarla al fondo: cerrarla desde el conmutador de apps).

- [ ] Volver a abrirla, todavía en modo avión: la pastilla sigue diciendo
      «1 registro sin subir».
- [ ] Salir del modo avión: sube y queda en «Todo sincronizado».

## 5 · Reinstalar un aparato ya sincronizado

**En el aparato B**, con todo en cero: borrar la PWA de la pantalla de inicio,
volver a instalarla desde el navegador y entrar con la cuenta.

- [ ] Baja la temporada completa: las 503 ovejas se buscan, y los partos de los
      pasos anteriores están todos.
- [ ] La pastilla queda en «Todo sincronizado» (y no en «Sin datos aún», que es
      lo que se ve mientras la primera bajada no terminó).

## 6 · Volumen y tiempo offline

El §11 pide 48 h con ~50 registros. Con la temporada arrancando eso no entra en
el calendario, y lo que la prueba busca de verdad es que un lote grande suba sin
perder nada y que la cola aguante. Versión practicable:

**En el aparato:** modo avión → cargar **20 partos** (`PRUEBA-7` en adelante),
la mitad con mellizos ⇒ ~50 filas. Dejarlo en modo avión **toda la noche**, con
la app cerrada.

- [ ] A la mañana siguiente la pastilla sigue marcando los 20 sin subir.
- [ ] Salir del modo avión: suben todos.
- [ ] Los conteos cierran: `estado-de-la-base.py` da la suma exacta de todo lo
      cargado en los seis pasos, sin faltantes ni repetidos.

---

## Cierre

- [ ] Anotar cualquier cosa rara: qué paso, qué aparato, qué decía la pastilla.
- [ ] **Limpiar:** ajustar el `corte` de `scripts/limpiar-datos-de-prueba.sql` a
      un momento posterior a la última carga de prueba, y correrlo desde el SQL
      Editor de Supabase. Tiene que dejar 503 ovejas, 1.359 servicios y cero
      partos, corderos y auditoría.
- [ ] Confirmar con `python3 scripts/estado-de-la-base.py`.
- [ ] Recién ahí, crear las cuentas del equipo (`scripts/crear-cuenta.py`).
