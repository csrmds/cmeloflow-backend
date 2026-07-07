const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');


/**
 * RN002 - Upsert de lead via WhatsApp.
 * Chamado pelo n8n (sem auth de usuário, via x-api-key) quando uma
 * mensagem chega pelo WhatsApp do cliente.
 *
 * MVP: fonte fixa em "whatsapp". Integração com Instagram fica para
 * uma fase futura — por isso não há ramificação por `source` aqui.
 *
 * @param {{
 *   lead_name?: string,
 *   lead_whatsapp: string,
 *   client_whatsapp: string,
 *   message?: string,
 *   notes?: string,
 * }} data
 */
async function upsertLead(data) {
	const { lead_name, lead_whatsapp, client_whatsapp, message, notes } = data;

	if (!client_whatsapp) {
		throw new ServiceError('client_whatsapp é obrigatório', 400);
	}
	if (!lead_whatsapp) {
		throw new ServiceError('lead_whatsapp é obrigatório', 400);
	}

	// 1. Busca o client_id a partir do whatsapp do cliente
	const [clients] = await pool.query(
		`SELECT id FROM clients WHERE whatsapp_number = ?`,
		[client_whatsapp]
	);

	if (clients.length === 0) {
		throw new ServiceError('Cliente não encontrado', 404);
	}

	const client_id = clients[0].id;

	// 2. Verifica se o lead já existe para esse cliente
	const [rows] = await pool.query(
		`SELECT lead_id, client_id, lead_status, lead_human_handover FROM vw_clients_leads
     WHERE client_whatsapp_number = ? AND lead_whatsapp_number = ?`,
		[client_whatsapp, lead_whatsapp]
	);

	// 3. Cria novo lead
	if (rows.length === 0) {
		const [result] = await pool.query(
			`INSERT INTO leads (
        client_id,
        name,
        whatsapp_number,
        first_message,
        last_message,
        source,
        status,
        notes
      ) VALUES (?, ?, ?, ?, ?, 'whatsapp', 'novo', ?)`,
			[client_id, lead_name, lead_whatsapp, message, message, notes]
		);

		const lead = {
			id: result.insertId,
			client_id,
			name: lead_name ?? null,
			whatsapp_number: lead_whatsapp,
			status: 'novo',
			human_handover: 0,
		};

		return { created: true, id: result.insertId, lead };
	}

	// 4. Atualiza lead existente
	const existingLead = rows[0];

	await pool.query(
		`UPDATE leads SET last_message = ?, updated_at = NOW() WHERE id = ?`,
		[message, existingLead.lead_id]
	);

	return { created: false, id: existingLead.lead_id, lead: existingLead };
}

/**
 * Cria um lead manualmente (fluxo autenticado, via frontend).
 * @param {{ client_id: number }} user - req.user (client_id do token)
 * @param {{ name?: string, whatsapp_number: string, notes?: string }} data
 */
async function insert(user, data) {
	const { client_id } = user;
	const { name, whatsapp_number, notes } = data;

	const [existing] = await pool.query(
		`SELECT id FROM leads WHERE whatsapp_number = ? AND client_id = ?`,
		[whatsapp_number, client_id]
	);

	if (existing.length === 1) {
		throw new ServiceError(
			'Já existe um Lead cadastrado com esse número de Whatsapp.',
			403
		);
	}

	const [result] = await pool.query(
		`INSERT INTO leads (client_id, name, whatsapp_number, notes, status, human_handover, source)
     VALUES (?, ?, ?, ?, 'novo', 1, 'manual')`,
		[client_id, name, whatsapp_number, notes]
	);

	if (!result.insertId) {
		throw new ServiceError('Erro ao criar novo Lead', 500);
	}

	return result;
}

/**
 * Lista leads. Admin vê todos os clientes, client vê só os próprios.
 * @param {{ client_id: number, user_role: string }} user
 */
async function list(user) {
	const { client_id, user_role } = user;

	if (user_role === 'admin') {
		const [rows] = await pool.query(`SELECT * FROM vw_clients_leads`);
		return rows;
	}

	const [rows] = await pool.query(
		`SELECT * FROM vw_clients_leads WHERE client_id = ?`,
		[client_id]
	);
	return rows;
}

/**
 * Busca lead por id. Admin pode ver de qualquer cliente, client só o seu.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 */
async function getById(user, id) {
	const { client_id, user_role } = user;

	const [result] =
		user_role === 'admin'
			? await pool.query(`SELECT * FROM leads WHERE id = ?`, [id])
			: await pool.query(
				`SELECT * FROM leads WHERE id = ? AND client_id = ?`,
				[id, client_id]
			);

	if (result.length === 0) {
		throw new ServiceError('Não foi possível encontrar o lead', 404);
	}

	return result;
}

/**
 * Atualiza um lead.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 * @param {{ name, whatsapp_number, status, human_handover, notes }} data
 */
async function update(user, id, data) {
	const { client_id, user_role } = user;
	const { name, whatsapp_number, status, human_handover, notes } = data;

	const [result] =
		user_role === 'admin'
			? await pool.query(
				`UPDATE leads SET name = ?, whatsapp_number = ?, status = ?, human_handover = ?, notes = ?
           WHERE id = ?`,
				[name, whatsapp_number, status, human_handover, notes, id]
			)
			: await pool.query(
				`UPDATE leads SET name = ?, whatsapp_number = ?, status = ?, human_handover = ?, notes = ?
           WHERE id = ? AND client_id = ?`,
				[name, whatsapp_number, status, human_handover, notes, id, client_id]
			);

	if (result.affectedRows === 0) {
		throw new ServiceError('Não foi possível atualizar o lead', 404);
	}

	return result;
}

/**
 * Remove um lead.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 */
async function remove(user, id) {
	const { client_id, user_role } = user;

	const [result] =
		user_role === 'admin'
			? await pool.query(`DELETE FROM leads WHERE id = ?`, [id])
			: await pool.query(
				`DELETE FROM leads WHERE client_id = ? AND id = ?`,
				[client_id, id]
			);

	if (result.affectedRows === 0) {
		throw new ServiceError('Não foi possível deletar o lead', 404);
	}

	return result;
}

/**
 * Atualiza o flag de atendimento humano de um lead.
 * Chamado pelo n8n (sem auth de usuário, via x-api-key).
 * @param {{ human_handover: number, client_id: number, lead_id: number }} data
 */
async function updateHumanHandover(data) {
	const { human_handover, client_id, lead_id } = data;

	const [result] = await pool.query(
		`UPDATE leads SET human_handover = ? WHERE client_id = ? AND id = ?`,
		[human_handover, client_id, lead_id]
	);

	if (result.affectedRows === 0) {
		throw new ServiceError('Não foi possível atualizar a tabela leads', 404);
	}

	return result;
}

module.exports = {
	upsertLead,
	insert,
	list,
	getById,
	update,
	remove,
	updateHumanHandover,
	ServiceError,
};