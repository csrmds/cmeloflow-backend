const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.CALENDAR_TOKEN_SECRET || '', 'hex');

if (KEY.length !== 32) {
	// Falha alto e cedo — não deixa o serviço rodar com chave inválida/ausente.
	throw new Error(
		'CALENDAR_TOKEN_SECRET ausente ou inválido. Deve ser uma string hex de 32 bytes (64 caracteres).'
	);
}

/**
 * Criptografa uma string (ex: access_token, refresh_token) para salvar no banco.
 * Retorna formato "iv:authTag:encrypted" (tudo em hex) em um único campo.
 */
function encrypt(plainText) {
	if (plainText == null) return null;

	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

	const encrypted = Buffer.concat([
		cipher.update(String(plainText), 'utf8'),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa um valor gerado por encrypt().
 */
function decrypt(payload) {
	if (payload == null) return null;

	const [ivHex, authTagHex, encryptedHex] = payload.split(':');
	if (!ivHex || !authTagHex || !encryptedHex) {
		throw new Error('Payload criptografado em formato inválido');
	}

	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const encrypted = Buffer.from(encryptedHex, 'hex');

	const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
	return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
