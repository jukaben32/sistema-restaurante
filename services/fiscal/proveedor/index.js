// Elige el proveedor de e-CF según la configuración. Para cambiar de proveedor solo hay que agregar otro archivo con la misma interfaz:
//   enviar(cfg, payload) · consultar(cfg, ncf) · anularSecuencias(cfg, rangos) · probar(cfg)
const mseller = require('./mseller');
const simulado = require('./simulado');

function obtener(cfg) {
    return cfg.proveedor === 'simulado' ? simulado : mseller;
}

module.exports = { obtener, mseller, simulado };
