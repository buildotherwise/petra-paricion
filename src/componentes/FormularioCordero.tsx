import { useState } from 'react';
import { Caravana } from './Caravana';
import { SelectorMarcaCollar } from './MarcaCollar';
import { BuscadorCaravana, type OvejaElegida } from './BuscadorCaravana';
import {
  CAUSAS_MUERTE,
  collarDisponible,
  hoyISO,
  validarFechaMuerte,
  validarPeso,
  type CausaMuerte,
  type CorderoDelParto,
  type MarcaCollar,
} from '../lib/reglas';

/**
 * El formulario de un cordero, con o sin parto guardado detrás.
 *
 * Vive acá y no en la pantalla de alta porque la ficha necesita exactamente lo
 * mismo para corregir un cordero ya cargado. Duplicarlo significaría que un
 * arreglo en uno no llega al otro — que es lo que pasó con el buscador y las
 * caravanas alfanuméricas.
 */

export interface BorradorCordero extends CorderoDelParto {
  sexo: 'macho' | 'hembra';
  peso_kg: number | null;
  causa_muerte: CausaMuerte | null;
  fecha_muerte: string | null;
  /** R10: si se cría con otra madre, se conserva siempre el parto biológico. */
  madre_crianza: OvejaElegida | null;
  observaciones: string;
}

/** Recorta lo tipeado a dos decimales, en vez de avisar después. */
export function limitarDecimales(texto: string): string {
  const limpio = texto.replace(/[^0-9.,]/g, '');
  const partes = limpio.replace('.', ',').split(',');
  if (partes.length < 2) return limpio;
  return `${partes[0]},${(partes[1] ?? '').slice(0, 2)}`;
}

export function FormularioCordero({
  inicial,
  esMultiple,
  fechaParto,
  madreBiologicaId,
  collarNumero,
  numerosUsados,
  ocupadas,
  murioDespues = false,
  titulo,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorCordero | null;
  esMultiple: boolean;
  fechaParto: string;
  madreBiologicaId: string;
  /** Número ya asignado al parto. Si es null y el parto es múltiple, se pide. */
  collarNumero: string | null;
  /** Todo collar usado en la temporada: una vez usado no vuelve (R3). */
  numerosUsados: readonly string[];
  ocupadas: readonly MarcaCollar[];
  /**
   * El cordero nació vivo y murió después (R8). Entonces «al nacer» no se toca:
   * cambiarlo a muerto pisaría la fecha y la causa de una muerte que sí ocurrió,
   * y el formulario no tiene cómo saber cuál de las dos es la buena.
   */
  murioDespues?: boolean;
  titulo?: string | undefined;
  onGuardar: (cordero: BorradorCordero, numero: string | null) => void;
  onCancelar: () => void;
}) {
  const [sexo, setSexo] = useState<'macho' | 'hembra' | null>(inicial?.sexo ?? null);
  const [condicion, setCondicion] = useState<'vivo' | 'muerto'>(inicial?.condicion ?? 'vivo');
  // Con coma, como se escribe y se lee en Uruguay.
  const [peso, setPeso] = useState(
    inicial?.peso_kg !== null && inicial?.peso_kg !== undefined
      ? inicial.peso_kg.toFixed(2).replace('.', ',')
      : '',
  );
  const [numero, setNumero] = useState(collarNumero ?? '');
  const [marca, setMarca] = useState<MarcaCollar | null>(inicial?.collar_marca ?? null);
  const [causa, setCausa] = useState<CausaMuerte | ''>(inicial?.causa_muerte ?? '');
  const [fechaMuerte, setFechaMuerte] = useState(inicial?.fecha_muerte ?? fechaParto);
  const [nodriza, setNodriza] = useState<OvejaElegida | null>(inicial?.madre_crianza ?? null);
  const [buscandoNodriza, setBuscandoNodriza] = useState(inicial?.madre_crianza != null);
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');

  const pesoNumero = peso.trim() === '' ? null : Number(peso.replace(',', '.'));
  const validacionPeso = validarPeso(pesoNumero);

  // El número solo se pide una vez por parto: si ya está, se muestra fijo.
  const pideNumero = esMultiple && collarNumero === null;
  const numeroLibre =
    !pideNumero || numero.trim() === '' ? true : collarDisponible(numero, numerosUsados);

  const pideMuerte = condicion === 'muerto' && !murioDespues;
  const validacionMuerte = pideMuerte
    ? validarFechaMuerte(fechaMuerte, fechaParto, hoyISO())
    : ({ valida: true } as const);

  const puedeGuardar =
    sexo !== null &&
    validacionPeso.estado !== 'bloqueo' &&
    // R2: en parto múltiple no se confirma un cordero sin collar Y marca.
    (!esMultiple || (marca !== null && (collarNumero !== null || numero.trim() !== ''))) &&
    numeroLibre &&
    // R10: elegir nodriza sin decir cuál dejaría el dato a medias.
    (!buscandoNodriza || nodriza !== null) &&
    (!pideMuerte || (causa !== '' && validacionMuerte.valida));

  return (
    <>
      <h1 className="titulo">{titulo ?? (inicial === null ? 'Nuevo cordero' : 'Editar cordero')}</h1>
      <p className="subtitulo">{esMultiple ? 'Parto múltiple' : 'Primer cordero del parto'}</p>

      <div className="campo">
        <span className="etiqueta">Sexo</span>
        <div className="opciones">
          <button
            type="button"
            className="opcion"
            aria-pressed={sexo === 'macho'}
            onClick={() => setSexo('macho')}
          >
            Macho
          </button>
          <button
            type="button"
            className="opcion"
            aria-pressed={sexo === 'hembra'}
            onClick={() => setSexo('hembra')}
          >
            Hembra
          </button>
        </div>
      </div>

      {murioDespues ? (
        <div className="campo">
          <span className="etiqueta">Al nacer</span>
          <p className="aviso aviso--atencion" style={{ marginBottom: 0 }}>
            Este cordero nació vivo y murió después. Para corregir la muerte, usá «Corregir la
            muerte» en la ficha.
          </p>
        </div>
      ) : (
        <div className="campo">
          <span className="etiqueta">Al nacer</span>
          <div className="opciones">
            <button
              type="button"
              className="opcion"
              aria-pressed={condicion === 'vivo'}
              onClick={() => setCondicion('vivo')}
            >
              Vivo
            </button>
            <button
              type="button"
              className="opcion"
              aria-pressed={condicion === 'muerto'}
              onClick={() => setCondicion('muerto')}
            >
              Muerto
            </button>
          </div>
        </div>
      )}

      {pideMuerte && (
        <>
          <div className="campo">
            <label className="etiqueta" htmlFor="causa">
              Motivo de muerte
            </label>
            <select
              id="causa"
              className="desplegable"
              value={causa}
              onChange={(e) => setCausa(e.target.value as CausaMuerte | '')}
            >
              <option value="">Elegir…</option>
              {CAUSAS_MUERTE.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="etiqueta" htmlFor="fecha-muerte">
              Fecha de muerte
            </label>
            <input
              id="fecha-muerte"
              className="entrada"
              type="date"
              value={fechaMuerte}
              min={fechaParto}
              max={hoyISO()}
              onChange={(e) => setFechaMuerte(e.target.value)}
            />
            {!validacionMuerte.valida && (
              <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}>
                {validacionMuerte.motivo}
              </p>
            )}
          </div>
        </>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="peso">
          Peso en kg {condicion === 'muerto' && '· opcional'}
        </label>
        <input
          id="peso"
          className="entrada entrada--cifra"
          inputMode="decimal"
          placeholder="0,00"
          value={peso}
          onChange={(e) => setPeso(limitarDecimales(e.target.value))}
        />
        {validacionPeso.estado !== 'ok' && (
          <p
            className={
              validacionPeso.estado === 'bloqueo' ? 'aviso aviso--error' : 'aviso aviso--atencion'
            }
            style={{ marginTop: 'var(--sp-2)', marginBottom: 0 }}
          >
            {validacionPeso.mensaje}
          </p>
        )}
      </div>

      {esMultiple && (
        <>
          <div className="campo">
            <span className="etiqueta">Collar del parto</span>
            {pideNumero ? (
              <>
                <input
                  className="entrada entrada--cifra"
                  inputMode="numeric"
                  placeholder="00"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  aria-label="Número de collar del parto"
                />
                <p
                  style={{
                    margin: 'var(--sp-2) 0 0',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--tinta-suave)',
                  }}
                >
                  Va en todos los corderos del parto y también en la madre.
                </p>
                {!numeroLibre && (
                  <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-3)', marginBottom: 0 }}>
                    Ese collar ya se usó esta temporada. Elegí otro número.
                  </p>
                )}
              </>
            ) : (
              <div className="collar-asignado">
                <b>{collarNumero}</b>
                <small>
                  Ya asignado al parto.
                  <br />
                  Solo falta la marca de este cordero.
                </small>
              </div>
            )}
          </div>

          <div className="campo">
            <span className="etiqueta">Marca de este cordero</span>
            <SelectorMarcaCollar valor={marca} ocupadas={ocupadas} onChange={setMarca} />
          </div>
        </>
      )}

      {/* R10: la nodriza no reemplaza a la madre biológica — el parto sigue
          siendo de la oveja que parió. Solo dice con quién se cría. */}
      <div className="campo">
        <span className="etiqueta">Se cría con</span>
        <div className="opciones">
          <button
            type="button"
            className="opcion"
            aria-pressed={!buscandoNodriza}
            onClick={() => {
              setBuscandoNodriza(false);
              setNodriza(null);
            }}
          >
            Su madre
          </button>
          <button
            type="button"
            className="opcion"
            aria-pressed={buscandoNodriza}
            onClick={() => setBuscandoNodriza(true)}
          >
            Nodriza
          </button>
        </div>

        {buscandoNodriza && (
          <div style={{ marginTop: 'var(--sp-3)' }}>
            {nodriza === null ? (
              <>
                <span className="etiqueta">Caravana de la nodriza</span>
                <BuscadorCaravana excluirId={madreBiologicaId} onElegir={setNodriza} />
              </>
            ) : (
              <div className="collar-asignado">
                <Caravana numero={nodriza.caravana} grande />
                <button
                  type="button"
                  className="boton--texto"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setNodriza(null)}
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="observaciones">
          Observaciones · opcional
        </label>
        <textarea
          id="observaciones"
          className="entrada"
          rows={3}
          placeholder="Algo que valga la pena recordar de este cordero"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </div>

      <div className="barra-accion">
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal"
          disabled={!puedeGuardar}
          onClick={() => {
            if (sexo === null) return;
            onGuardar(
              {
                id: inicial?.id ?? crypto.randomUUID(),
                // Un borrador nunca está anulado: la anulación es para lo ya
                // guardado. Va explícito porque las reglas lo piden.
                anulado_en: inicial?.anulado_en ?? null,
                sexo,
                condicion,
                peso_kg: pesoNumero,
                collar_marca: esMultiple ? marca : null,
                // Con murioDespues la muerte no se toca: se conserva tal cual
                // vino, para no pisar una muerte que sí ocurrió.
                causa_muerte: murioDespues
                  ? (inicial?.causa_muerte ?? null)
                  : condicion === 'muerto' && causa !== ''
                    ? causa
                    : null,
                fecha_muerte: murioDespues
                  ? (inicial?.fecha_muerte ?? null)
                  : condicion === 'muerto'
                    ? fechaMuerte
                    : null,
                madre_crianza: nodriza,
                observaciones: observaciones.trim(),
              },
              pideNumero && numero.trim() !== '' ? numero.trim() : null,
            );
          }}
        >
          Listo
        </button>
      </div>
    </>
  );
}
