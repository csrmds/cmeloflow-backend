const pool = require('../config/database');

const VALID_ROLES = ['ai', 'human'];

/**
 * Lista os telefones de um cliente, opcionalmente filtrando por role.
 * @param {number|string} clientId
 * @param {{ role?: 'ai'|'human' }} [filters]
 */
async function list(clientId, filters = {}) {
	const { role } = filters;

	if (role && !VALID_ROLES.includes(role)) {
		throw new ServiceError('Role inválido. Use: ai | human', 400);
	}

	let query = 'SELECT * FROM client_phones WHERE client_id = ?';
	const params = [clientId];

	if (role) {
		query += ' AND role = ? AND active = 1';
		params.push(role);
	}

	query += ' ORDER BY is_primary DESC, created_at ASC';

	const [rows] = await pool.query(query, params);
	return rows;
}

/**
 * Busca um telefone específico de um cliente.
 * @param {number|string} clientId
 * @param {number|string} phoneId
 */
async function getById(clientId, phoneId) {
	const [rows] = await pool.query(
		'SELECT * FROM client_phones WHERE id = ? AND client_id = ?',
		[phoneId, clientId]
	);

	if (!rows.length) {
		throw new ServiceError('Telefone não encontrado', 404);
	}

	return rows[0];
}

/**
 * Cria um telefone para o cliente. Se marcado como primary, remove o
 * primary dos demais telefones do mesmo cliente (transação).
 * @param {number|string} clientId
 * @param {{ phone_number: string, label?: string, role?: 'ai'|'human', is_primary?: number, active?: number }} data
 */
async function create(clientId, data) {
	const {
		phone_number,
		label,
		role = 'human',
		is_primary = 0,
		active = 1,
	} = data;

	if (!phone_number) {
		throw new ServiceError('phone_number é obrigatório', 400);
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		if (is_primary) {
			await conn.query(
				'UPDATE client_phones SET is_primary = 0 WHERE client_id = ?',
				[clientId]
			);
		}

		const [result] = await conn.query(
			`INSERT INTO client_phones (client_id, phone_number, label, role, is_primary, active)
		 VALUES (?, ?, ?, ?, ?, ?)`,
			[clientId, phone_number, label ?? null, role, is_primary, active]
		);

		await conn.commit();

		const [newPhone] = await pool.query(
			'SELECT * FROM client_phones WHERE id = ?',
			[result.insertId]
		);
		return newPhone[0];
	} catch (err) {
		await conn.rollback();
		throw err;
	} finally {
		conn.release();
	}
}

/**
 * Atualiza um telefone do cliente. Mesma regra de is_primary exclusivo.
 * @param {number|string} clientId
 * @param {number|string} phoneId
 * @param {{ phone_number: string, label?: string, role: string, is_primary: number, active: number }} data
 */
async function update(clientId, phoneId, data) {
	const { phone_number, label, role, is_primary, active } = data;

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		if (is_primary) {
			await conn.query(
				'UPDATE client_phones SET is_primary = 0 WHERE client_id = ? AND id != ?',
				[clientId, phoneId]
			);
		}

		const [result] = await conn.query(
			`UPDATE client_phones SET
		  phone_number = ?, label = ?, role = ?, is_primary = ?, active = ?
		 WHERE id = ? AND client_id = ?`,
			[phone_number, label ?? null, role, is_primary, active, phoneId, clientId]
		);

		await conn.commit();

		if (!result.affectedRows) {
			throw new ServiceError('Telefone não encontrado', 404);
		}

		const [updated] = await pool.query(
			'SELECT * FROM client_phones WHERE id = ?',
			[phoneId]
		);
		return updated[0];
	} catch (err) {
		await conn.rollback();
		throw err;
	} finally {
		conn.release();
	}
}

/**
 * Remove um telefone do cliente.
 * @param {number|string} clientId
 * @param {number|string} phoneId
 */
async function remove(clientId, phoneId) {
	const [result] = await pool.query(
		'DELETE FROM client_phones WHERE id = ? AND client_id = ?',
		[phoneId, clientId]
	);

	if (!result.affectedRows) {
		throw new ServiceError('Telefone não encontrado', 404);
	}

	return true;
}

/**
 * RN001 - Verificação de telefones do cliente para workflow WhatsApp.
 * Retorna se o cliente opera em modo "single" (1 telefone) ou
 * "dual" (telefone de IA + telefone humano).
 * @param {number|string} clientId
 */
async function getWorkflowPhoneSummary(clientId) {
	const [rows] = await pool.query(
		'SELECT * FROM client_phones WHERE client_id = ? AND active = 1',
		[clientId]
	);

	if (rows.length <= 1) {
		return { mode: 'single', phone: rows[0] ?? null };
	}

	const aiPhone = rows.find((r) => r.role === 'ai') ?? null;
	const humanPhone = rows.find((r) => r.role === 'human') ?? null;

	return { mode: 'dual', ai_phone: aiPhone, human_phone: humanPhone };
}

/**
 * Erro de domínio do service, já carregando o status HTTP sugerido.
 * O controller decide se usa esse status ou não.
 */
class ServiceError extends Error {
	constructor(message, statusCode = 500) {
		super(message);
		this.name = 'ServiceError';
		this.statusCode = statusCode;
	}
}

module.exports = {
	list,
	getById,
	create,
	update,
	remove,
	getWorkflowPhoneSummary,
	ServiceError,
};
