// Cifrado simétrico (AES-256-GCM) para secretos guardados en la BD (llaves de Stripe).
// La llave sale de APP_ENCRYPTION_KEY (recomendado) o, si falta, de SESSION_SECRET.
// Relacionado con: services/stripe.js y routes/configuracion.js (/configuracion/stripe)
const crypto = require('crypto');

function getKey() {
    const base = process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
    if (!base) throw new Error('Falta APP_ENCRYPTION_KEY (o SESSION_SECRET) en .env para cifrar secretos');
    return crypto.createHash('sha256').update(String(base)).digest();
}

function encrypt(plain) {
    if (plain == null || plain === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
    if (!payload) return null;
    const [v, ivB64, tagB64, dataB64] = String(payload).split(':');
    if (v !== 'v1') throw new Error('Formato de secreto cifrado no soportado');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
