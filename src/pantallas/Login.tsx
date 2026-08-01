import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Único momento en que la app pide credenciales: la primera vez, con conexión.
 * Después la sesión se renueva sola y en el campo nunca vuelve a preguntar.
 *
 * No hay registro público — las cuentas las crea el administrador.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

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
      {/* El logo ya trae el lettering "Petra · Merino Australiano"; repetirlo
          debajo sería decir dos veces lo mismo. */}
      <img src="/icono-512.png" alt="Petra · Merino Australiano" />

      <h1 className="titulo">Parición</h1>
      <p className="subtitulo">Entrá una vez con señal. Después funciona sin conexión.</p>

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
