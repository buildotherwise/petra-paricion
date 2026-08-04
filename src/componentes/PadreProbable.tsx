import { useQuery } from '@powersync/react';
import {
  gestacionLegible,
  padreProbable,
  tienePadre,
  type ServicioDeLaMadre,
} from '../lib/paternidad';
import { fechaLarga } from '../lib/parto';

/**
 * Quién sería el padre de este parto, dicho mientras se carga.
 *
 * No es un adorno informativo: **es el control de la caravana**. El error más
 * caro del sistema es registrar el parto en la oveja equivocada y hasta ahora
 * nada lo atajaba. Que ningún servicio de esa madre explique la fecha es la
 * única señal disponible en el corral, con el animal delante y antes de
 * guardar.
 *
 * Por eso avisa y no bloquea, igual que el peso fuera de rango (R7) y el aviso
 * de sincronización de la señalada (R14): quien está mirando al animal sabe más
 * que una cuenta de días, y un parto adelantado de verdad existe.
 *
 * Sale de la réplica local —`servicios` se replica desde la 0018— así que
 * funciona sin señal, que es donde hace falta.
 */
export function PadreProbable({
  ovejaId,
  fecha,
}: {
  ovejaId: string;
  /** La fecha del parto: si cambia, el padre cambia con ella. */
  fecha: string;
}) {
  const { data: servicios } = useQuery<ServicioDeLaMadre>(
    'SELECT tipo, fecha_inicio, fecha_fin, padre, cabana FROM servicios WHERE oveja_id = ?',
    [ovejaId],
  );

  const resultado = padreProbable(servicios, fecha);

  // Una oveja de alta manual (R9) no tiene servicios y nunca los va a tener.
  // No es un problema que haya que resolver, así que no se dice nada: un
  // cartel permanente en un caso normal es ruido que enseña a no mirar.
  if (!tienePadre(resultado) && resultado.motivo === 'sin-servicios') return null;

  if (!tienePadre(resultado)) {
    return (
      <div className="padre padre--dudoso" role="status">
        <span className="padre-etiqueta">Ningún servicio explica esta fecha</span>
        <p className="padre-quien">Revisá la caravana</p>
        <p className="padre-gestacion">
          El más cercano es el {resultado.padre}, del {fechaLarga(resultado.fechaInicio)}: serían{' '}
          {gestacionLegible(resultado.gestacionMin, resultado.gestacionMax)}. Si la oveja y la fecha
          son estas, el parto se adelantó — se guarda igual.
        </p>
      </div>
    );
  }

  return (
    <div className="padre" role="status">
      <span className="padre-etiqueta">
        {resultado.confianza === 'cierto' ? 'Padre' : 'Padre probable'}
      </span>
      <p className="padre-quien">
        {resultado.padre}
        {resultado.cabana !== null && resultado.cabana !== '' && (
          <small> · cabaña {resultado.cabana}</small>
        )}
      </p>
      <p className="padre-gestacion">
        {resultado.tipo === 'encarnerada' ? 'Encarnerada del' : 'Inseminación del'}{' '}
        {fechaLarga(resultado.fechaInicio)} ·{' '}
        {gestacionLegible(resultado.gestacionMin, resultado.gestacionMax)} de gestación
        {resultado.alternativas > 0 && ' · hay otro servicio posible'}
      </p>
    </div>
  );
}

/**
 * Lo mismo en una línea, para el resumen.
 *
 * El resumen es el último lugar donde se puede frenar algo antes de guardar, y
 * ahí el padre no compite con nada: es un dato más de la lista de lo que se
 * está por confirmar.
 */
export function LineaPadre({ ovejaId, fecha }: { ovejaId: string; fecha: string }) {
  const { data: servicios } = useQuery<ServicioDeLaMadre>(
    'SELECT tipo, fecha_inicio, fecha_fin, padre, cabana FROM servicios WHERE oveja_id = ?',
    [ovejaId],
  );

  const resultado = padreProbable(servicios, fecha);

  // Trae su propia tarjeta: si no hay nada que decir tampoco tiene que quedar
  // un recuadro vacío en el resumen.
  if (!tienePadre(resultado)) {
    if (resultado.motivo === 'sin-servicios') return null;
    return (
      <div className="tarjeta" style={{ marginTop: 'var(--sp-3)' }}>
        <div className="dato">
          <span>Padre</span>
          <b className="padre-sin">Ningún servicio explica la fecha</b>
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta" style={{ marginTop: 'var(--sp-3)' }}>
      <div className="dato">
        <span>{resultado.confianza === 'cierto' ? 'Padre' : 'Padre probable'}</span>
        <b>
          {resultado.padre}
          <small className="padre-dias">
            {' '}
            · {gestacionLegible(resultado.gestacionMin, resultado.gestacionMax)}
          </small>
        </b>
      </div>
    </div>
  );
}
