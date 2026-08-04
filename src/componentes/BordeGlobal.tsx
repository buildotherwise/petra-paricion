import { Component, type ReactNode } from 'react';

/**
 * El borde de último recurso, alrededor de la app entera.
 *
 * Sin él, cualquier excepción durante un render deja la pantalla en blanco —
 * con el cordero en la mano y sin un solo botón. Acá no hay reintento fino:
 * recargar es lo único honesto que se puede ofrecer, y no pierde nada, porque
 * lo registrado vive en la base local y la cola de subida sobrevive al cierre.
 * El aviso lo dice, que es lo que a las seis de la mañana importa.
 *
 * Usa solo clases de app.css, que viaja en el bundle principal: no puede
 * depender de nada que se cargue bajo demanda.
 */
export class BordeGlobal extends Component<{ children: ReactNode }, { fallo: Error | null }> {
  state: { fallo: Error | null } = { fallo: null };

  static getDerivedStateFromError(fallo: Error): { fallo: Error } {
    return { fallo };
  }

  render(): ReactNode {
    if (this.state.fallo === null) return this.props.children;
    return (
      <div className="app">
        <main className="contenido area-segura">
          <h1 className="titulo">Algo falló en la app</h1>
          <p className="subtitulo">
            Lo ya registrado está guardado en este aparato y no se pierde. Recargá para seguir.
          </p>
          {/* El mensaje crudo, como en la bandeja de rechazos: feo pero
              rastreable. Sin él nadie puede averiguar qué pasó. */}
          <p className="aviso aviso--error">{this.state.fallo.message}</p>
          <button
            type="button"
            className="boton boton--principal"
            onClick={() => window.location.reload()}
          >
            Recargar la app
          </button>
        </main>
      </div>
    );
  }
}
