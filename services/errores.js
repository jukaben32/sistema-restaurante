// Error con mensaje seguro para mostrar al usuario (las rutas responden 400 con este texto;
// cualquier otro error se registra y se responde como 500 genérico).
class ErrorPublico extends Error {
    constructor(message) {
        super(message);
        this.name = 'ErrorPublico';
        this.publico = true;
    }
}

module.exports = { ErrorPublico };
