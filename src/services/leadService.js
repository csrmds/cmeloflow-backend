const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');
const stageService = require('./stageService');


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
 *   email?: string,
 *   notes?: string,
 * }} data
 */
async function upsertLead(data) {
	const { lead_name, lead_whatsapp, client_whatsapp, email, notes } = data;

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
		`SELECT lead_id, client_id, lead_stage_id, lead_stage_name, lead_human_handover FROM vw_clients_leads
     WHERE client_whatsapp_number = ? AND lead_whatsapp_number = ?`,
		[client_whatsapp, lead_whatsapp]
	);

	// 3. Cria novo lead
	if (rows.length === 0) {
		const stage_id = await stageService.getDefaultStageId(client_id);
		const stage_position = await stageService.nextLeadPosition(stage_id);

		const [result] = await pool.query(
			`INSERT INTO leads (
			client_id,
			name,
			whatsapp_number,
			email,
			source,
			stage_id,
			stage_position,
			notes
      ) VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, ?)`,
			[client_id, lead_name, lead_whatsapp, email, stage_id, stage_position, notes]
		);

		const lead = {
			id: result.insertId,
			client_id,
			name: lead_name ?? null,
			whatsapp_number: lead_whatsapp,
			email: email,
			stage_id,
			human_handover: 0,
		};

		return { created: true, id: result.insertId, lead };
	}

	// 4. Atualiza lead existente
	const existingLead = rows[0];

	//await pool.query( `UPDATE leads SET updated_at = NOW() WHERE id = ?`, [existingLead.lead_id] );

	return { created: false, id: existingLead.lead_id, lead: existingLead };
}

/**
 * Cria um lead manualmente (fluxo autenticado, via frontend).
 * @param {{ client_id: number }} user - req.user (client_id do token)
 * @param {{ name?: string, whatsapp_number: string, notes?: string }} data
 */
async function insert(user, data) {
	const { client_id } = user;
	const { name, whatsapp_number, email, notes } = data;

	const [existing] = await pool.query(
		`SELECT id FROM leads WHERE whatsapp_number = ? AND client_id = ?`,
		[whatsapp_number, client_id]
	);

	if (existing.length === 1) {
		throw new ServiceError( 'Já existe um Lead cadastrado com esse número de Whatsapp.', 403 );
	}

	const stage_id = await stageService.getDefaultStageId(client_id);
	const stage_position = await stageService.nextLeadPosition(stage_id);

	const [result] = await pool.query(
		`INSERT INTO leads (client_id, name, whatsapp_number, email, notes, stage_id, stage_position, human_handover, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'manual')`,
		[client_id, name, whatsapp_number, email, notes, stage_id, stage_position]
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
	console.log("leadService - client_id: ", client_id)

	if (user_role === 'admin') {
		const [rows] = await pool.query(`SELECT * FROM vw_clients_leads`);
		return rows;
	}
	
	const [rows] = await pool.query( `SELECT * FROM vw_clients_leads WHERE client_id = ?`, [client_id] );
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

	return result[0];
}

/**
 * Atualiza um lead. Se `stage_id` vier no body e for diferente do atual,
 * o lead é movido para o final dessa raia.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 * @param {{ name, whatsapp_number, email, stage_id?, human_handover, notes }} data
 */
async function update(user, id, data) {
	const { client_id, user_role } = user;
	const { name, whatsapp_number, email, stage_id, human_handover, notes } = data;

	const [result] =
		user_role === 'admin'
			? await pool.query(
				`UPDATE leads SET name = ?, whatsapp_number = ?, email = ?, human_handover = ?, notes = ?
           WHERE id = ?`,
				[name, whatsapp_number, email, human_handover, notes, id]
			)
			: await pool.query(
				`UPDATE leads SET name = ?, whatsapp_number = ?, email = ?, human_handover = ?, notes = ?
           WHERE id = ? AND client_id = ?`,
				[name, whatsapp_number, email, human_handover, notes, id, client_id]
			);

	if (result.affectedRows === 0) {
		throw new ServiceError('Não foi possível atualizar o lead', 404);
	}

	if (stage_id) {
		await moveToStage(user, id, { stage_id });
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
 * Núcleo da movimentação: reposiciona o lead na raia de destino e recompacta as posições
 * da raia de origem. Deve ser chamado dentro de uma transação.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ id: number, client_id: number, stage_id: number|null }} lead
 * @param {number} stageId
 * @param {number|undefined} position  índice 0-based; omitido = final da raia
 */
async function placeLead(conn, lead, stageId, stageKind, position) {
	const [targetRows] = await conn.query(
		`SELECT id FROM leads WHERE stage_id = ? AND id <> ? ORDER BY stage_position, id FOR UPDATE`,
		[stageId, lead.id]
	);
	const ids = targetRows.map((r) => r.id);

	const sameStage = lead.stage_id === stageId;
	if (sameStage && position === undefined) return;

	// Raias Ganho/Perdido listam só os leads recentes: o card entra sempre no topo,
	// assim o índice do front não conflita com leads ocultos pelo filtro de período.
	const idx =
		stageKind !== 'open'
			? 0
			: position === undefined
				? ids.length
				: Math.max(0, Math.min(Number(position) || 0, ids.length));
	ids.splice(idx, 0, lead.id);

	// updated_at = updated_at: reindexar posições não conta como atualização do lead
	for (let i = 0; i < ids.length; i++) {
		await conn.query(
			`UPDATE leads SET stage_id = ?, stage_position = ?, updated_at = updated_at WHERE id = ?`,
			[stageId, i, ids[i]]
		);
	}
	if (!sameStage) {
		await conn.query(
			`UPDATE leads SET stage_changed_at = NOW(), updated_at = updated_at WHERE id = ?`,
			[lead.id]
		);
	}

	if (lead.stage_id && !sameStage) {
		const [sourceRows] = await conn.query(
			`SELECT id FROM leads WHERE stage_id = ? ORDER BY stage_position, id`,
			[lead.stage_id]
		);
		for (let i = 0; i < sourceRows.length; i++) {
			await conn.query(`UPDATE leads SET stage_position = ?, updated_at = updated_at WHERE id = ?`, [i, sourceRows[i].id]);
		}
	}
}

/**
 * Move um lead para uma raia (e posição) do quadro.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 * @param {{ stage_id: number|string, position?: number }} data
 */
async function moveToStage(user, id, data) {
	const { client_id, user_role } = user;
	const stageId = Number(data.stage_id);
	if (!stageId) throw new ServiceError('stage_id é obrigatório', 400);

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [leadRows] =
			user_role === 'admin'
				? await conn.query(`SELECT id, client_id, stage_id FROM leads WHERE id = ? FOR UPDATE`, [id])
				: await conn.query(
					`SELECT id, client_id, stage_id FROM leads WHERE id = ? AND client_id = ? FOR UPDATE`,
					[id, client_id]
				);
		if (leadRows.length === 0) throw new ServiceError('Lead não encontrado', 404);
		const lead = leadRows[0];

		const [stageRows] = await conn.query(
			`SELECT id, kind FROM lead_stages WHERE id = ? AND client_id = ?`,
			[stageId, lead.client_id]
		);
		if (stageRows.length === 0) throw new ServiceError('Raia não encontrada', 404);

		await placeLead(conn, lead, stageId, stageRows[0].kind, data.position);

		await conn.commit();
		return { id: lead.id, stage_id: stageId };
	} catch (err) {
		await conn.rollback();
		throw err;
	} finally {
		conn.release();
	}
}

/**
 * Move um lead pelo NOME da raia. Chamado pelo n8n (x-api-key).
 * @param {{ client_id: number, lead_id: number, stage_name: string }} data
 */
async function moveToStageByName(data) {
	const { client_id, lead_id, stage_name } = data;
	if (!client_id || !lead_id || !stage_name) {
		throw new ServiceError('client_id, lead_id e stage_name são obrigatórios', 400);
	}

	const [stages] = await pool.query(
		`SELECT id FROM lead_stages WHERE client_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
		[client_id, String(stage_name).trim()]
	);
	if (stages.length === 0) throw new ServiceError('Raia não encontrada', 404);

	return moveToStage({ client_id, user_role: 'client' }, lead_id, { stage_id: stages[0].id });
}

/**
 * Reabre automaticamente um lead que estava numa raia Ganho/Perdido quando ele volta a conversar.
 * Move o lead para a raia padrão do cliente. Chamado pelo sessionService a cada mensagem recebida.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ id: number, stage_id: number|null }} lead
 * @param {number} clientId
 * @returns {Promise<number|null>} novo stage_id, ou null se nada mudou
 */
async function reopenIfClosed(conn, lead, clientId) {
	if (!lead.stage_id) return null;

	const [rows] = await conn.query(`SELECT kind FROM lead_stages WHERE id = ?`, [lead.stage_id]);
	if (!rows.length || rows[0].kind === 'open') return null;

	const defaultStageId = await stageService.getDefaultStageId(clientId, conn);
	if (defaultStageId === lead.stage_id) return null;

	await conn.beginTransaction();
	try {
		await placeLead(conn, lead, defaultStageId, 'open', undefined);
		await conn.commit();
	} catch (err) {
		await conn.rollback();
		throw err;
	}
	return defaultStageId;
}

const BOARD_PERIODS = [7, 30, 90];

/**
 * Quadro Kanban: raias do cliente com seus leads.
 * Raias Ganho/Perdido mostram só os leads que entraram nelas nos últimos `days` dias
 * (7, 30 ou 90; `days=all` mostra tudo). O padrão é 30. Cada raia fechada devolve `hidden_count`.
 * @param {{ client_id: number, user_role: string }} user
 * @param {{ client_id?: number, days?: string|number }} query  (só admin pode informar client_id)
 */
async function board(user, query = {}) {
	const clientId =
		user.user_role === 'admin' && query.client_id ? Number(query.client_id) : user.client_id;

	let days = 30;
	if (query.days === 'all') days = null;
	else if (query.days !== undefined) {
		const n = Number(query.days);
		if (!BOARD_PERIODS.includes(n)) {
			throw new ServiceError('days inválido. Use 7, 30, 90 ou all', 400);
		}
		days = n;
	}

	const [stages] = await pool.query(
		`SELECT id, name, color, position, kind, is_default FROM lead_stages
     WHERE client_id = ? ORDER BY position, id`,
		[clientId]
	);
	if (stages.length === 0) return { stages: [], days };


	const [leads] = await pool.query(
		`SELECT l.id, l.name, l.whatsapp_number, l.email, l.instagram_username, l.source,
            l.human_handover, l.notes, l.stage_id, l.stage_position, l.stage_changed_at,
            l.created_at, l.updated_at
     FROM leads l
     LEFT JOIN lead_stages ls ON ls.id = l.stage_id
     WHERE l.client_id = ?
       AND (ls.kind IS NULL OR ls.kind = 'open' ${days === null ? '' : 'OR l.stage_changed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'})
     ORDER BY l.stage_position, l.id`,
		days === null ? [clientId] : [clientId, days]
	);

	const hidden = new Map();
	if (days !== null) {
		const [rows] = await pool.query(
			`SELECT l.stage_id, COUNT(*) AS total
       FROM leads l JOIN lead_stages ls ON ls.id = l.stage_id
       WHERE l.client_id = ? AND ls.kind <> 'open' AND l.stage_changed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY l.stage_id`,
			[clientId, days]
		);
		rows.forEach((r) => hidden.set(r.stage_id, Number(r.total)));
	}

	const defaultStage = stages.find((s) => s.is_default) ?? stages[0];
	const byStage = new Map(
		stages.map((s) => [s.id, { ...s, leads: [], hidden_count: hidden.get(s.id) ?? 0 }])
	);

	for (const lead of leads) {
		const column = byStage.get(lead.stage_id) ?? byStage.get(defaultStage.id);
		column.leads.push(lead);
	}

	return { stages: [...byStage.values()], days };
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
	board,
	moveToStage,
	moveToStageByName,
	reopenIfClosed,
	remove,
	updateHumanHandover,
	ServiceError,
};