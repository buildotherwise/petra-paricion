import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { usarPendientes, usarRechazados } from '../componentes/IndicadorSync';

/**
 * Único momento en que la app pide credenciales: la primera vez, con conexión.
 * Después la sesión se renueva sola y en el campo nunca vuelve a preguntar.
 *
 * No hay registro público — las cuentas las crea el administrador.
 */

/**
 * Si la sesión se cayó con trabajo local adentro, esta pantalla es lo único
 * que se ve — y sin el aviso, nada dice que hay cargas por perder. Entrar con
 * OTRA cuenta las perdería igual: la cola se subiría con el usuario nuevo y
 * el servidor la rechaza (`actualizado_por = auth.uid()`).
 */
function avisoDeTrabajoLocal(pendientes: number, rechazados: number): string | null {
  const cargas = (n: number) => `${n} ${n === 1 ? 'carga' : 'cargas'}`;
  const partes: string[] = [];
  if (pendientes > 0) partes.push(`${cargas(pendientes)} sin subir`);
  if (rechazados > 0) partes.push(`${cargas(rechazados)} con error`);
  if (partes.length === 0) return null;
  return `Este aparato tiene ${partes.join(' y ')}. Entrá con la misma cuenta que las registró para no perderlas.`;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const trabajoLocal = avisoDeTrabajoLocal(usarPendientes(), usarRechazados());

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEntrando(true);
    setError(null);

    const { error: fallo } = await supabase.auth.signInWithPassword({ email, password: clave });

    if (fallo !== null) {
      setError(
        fallo.message === 'Invalid login credentials'
          ? 'Ese correo o esa contraseña no coinciden.'
          : 'No se pudo entrar. Revisá que tengas señal e intentá de nuevo.',
      );
      setEntrando(false);
    }
  }

  return (
    <form className="login area-segura" onSubmit={entrar}>
      {/* Asset propio de 640px: el de 512 se ablanda al agrandarlo en pantallas
          3x. El logo ya trae el lettering "Petra · Merino Australiano", así que
          repetirlo debajo sería decir dos veces lo mismo. */}
      <img src="/logo-login.png" alt="Petra · Merino Australiano" />

      <h1 className="titulo">Parición</h1>
      <p className="subtitulo">Entrá una vez con señal. Después funciona sin conexión.</p>

      {trabajoLocal !== null && (
        <p className="aviso aviso--atencion" role="alert">
          {trabajoLocal}
        </p>
      )}

      {error !== null && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          className="entrada"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="clave">
          Contraseña
        </label>
        <input
          id="clave"
          className="entrada"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
      </div>

      <button type="submit" className="boton boton--principal" disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
