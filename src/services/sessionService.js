const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');

/**
 * RN003 - Inicialização de sessão de atendimento (chamado pelo n8n).
 *
 * Resolve em uma única chamada tudo que o n8n precisa para iniciar/continuar
 * um atendimento via WhatsApp: dados do cliente, status do workflow, dados
 * do lead (criando se necessário) e produtos ativos do cliente.
 *
 * @param {{
 *   source: 'whatsapp' | 'instagram' | 'comment',
 *   workflow_id: string,
 *   client_whatsapp?: string,
 *   instagram_user_id?: string,
 *   lead_whatsapp?: string,
 *   instagram_scoped_userid?: string,
 *   instagram_username?: string,
 *   lead_name?: string,
 *   message?: string,
 * }} data
 */
async function init(data) {
	const {
		source,
		workflow_id,
		client_whatsapp,
		instagram_user_id,
		lead_whatsapp,
		instagram_scoped_userid,
		instagram_username,
		lead_name,
		message,
	} = data;

	if (!source || !workflow_id) {
		throw new ServiceError('source e workflow_id são obrigatórios', 400);
	}

	const conn = await pool.getConnection();
	try {
		// 1. Busca o cliente via view (phones + workflows)
		let clientRows;
		if (source === 'whatsapp') {
			if (!client_whatsapp) {
				throw new ServiceError('client_whatsapp é obrigatório para source=whatsapp', 400);
			}
			[clientRows] = await conn.query(
				`SELECT * FROM vw_client_phones_workflows WHERE c_phones_number = ? AND c_phones_is_primary = 1 AND c_workflow_n8n_id = ?`,
				[client_whatsapp, workflow_id]
			);
		} else {
			if (!instagram_user_id) {
				throw new ServiceError('instagram_user_id é obrigatório para source instagram/comment', 400);
			}
			[clientRows] = await conn.query(
				`SELECT * FROM vw_client_phones_workflows WHERE c_instagram_id = ? AND c_phones_is_primary = 1 AND c_workflow_n8n_id = ?`,
				[instagram_user_id, workflow_id]
			);
		}

		if (clientRows.length === 0) {
			throw new ServiceError('Cliente não encontrado', 404);
		}
		const client = clientRows[0];

		// 2. Verifica se o cliente está ativo
		if (client.c_status !== 'ativo') {
			throw new ServiceError('Cliente inativo', 403);
		}

		// 3. Verifica se o workflow está vinculado e ativo para o cliente
		if (!Number(client.c_workflow_active)) {
			throw new ServiceError('Workflow não encontrado ou inativo para este cliente', 403);
		}

		// 3.2 Verifica se o cliente tem um segundo número de atendimento (N2)
		let clientWhatsappN2;
		if (source === 'whatsapp') {
			[clientWhatsappN2] = await conn.query(
				'SELECT * FROM vw_client_phones_workflows WHERE c_id = ? AND c_phones_label = "atendimento n2" LIMIT 1',
				[client.c_id]
			);
		}
		const whatsappN2 = clientWhatsappN2?.[0] ?? null;

		// 4. Busca ou cria o lead
		let leadRows;
		if (source === 'whatsapp') {
			[leadRows] = await conn.query(
				`SELECT id, name, whatsapp_number, instagram_username, status, human_handover
         FROM leads WHERE client_id = ? AND whatsapp_number = ?`,
				[client.c_id, lead_whatsapp]
			);
		} else {
			[leadRows] = await conn.query(
				`SELECT id, name, whatsapp_number, instagram_username, status, human_handover
         FROM leads WHERE client_id = ? AND instagram_scoped_userid = ?`,
				[client.c_id, instagram_scoped_userid]
			);
		}

		let lead;
		let is_new = false;

		if (leadRows.length === 0) {
			const [insertResult] = await conn.query(
				`INSERT INTO leads
           (client_id, instagram_scoped_userid, instagram_username, name,
            whatsapp_number, first_message, last_message, source, status, human_handover)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo', 0)`,
				[
					client.c_id,
					instagram_scoped_userid ?? null,
					instagram_username ?? null,
					lead_name ?? null,
					lead_whatsapp ?? null,
					message ?? null,
					message ?? null,
					source,
				]
			);
			is_new = true;
			lead = {
				id: insertResult.insertId,
				name: lead_name ?? null,
				whatsapp_number: lead_whatsapp ?? null,
				instagram_username: instagram_username ?? null,
				status: 'novo',
				human_handover: 0,
			};
		} else {
			lead = leadRows[0];
			if (message) {
				await conn.query(
					'UPDATE leads SET last_message = ?, updated_at = NOW() WHERE id = ?',
					[message, lead.id]
				);
			}
		}

		// 5. Carrega produtos ativos do cliente
		const [products] = await conn.query(
			'SELECT id, name, description, price, type, keywords, requires_scheduling FROM products WHERE client_id = ? AND active = 1',
			[client.c_id]
		);

		// 6. Verificar se o cliente tem credenciais do google agenda
		const [calRows] = await conn.query(
			`SELECT default_calendar_id FROM client_calendar_credentials WHERE client_id = ? AND provider = 'google'`,
			[client.c_id]
		);
		// 6.1 Consulta configurações de horario do cliente
		const [schedulingResult] = await conn.query( `select * from client_scheduling_config where client_id = ?`, [client.c_id])

		const calendar = {
			connected: calRows.length > 0,
			default_calendar_id: calRows[0]?.default_calendar_id ?? null,
			scheduling: schedulingResult[0] ?? null
		};


		// 7. Retorna tudo
		return {
			client: {
				id: client.c_id,
				name: client.c_name,
				about: client.c_about,
				whatsapp_number: client.c_phones_number,
				whatsapp_number_n2: whatsappN2?.c_phones_number ?? null,
				instagram_id: client.c_instagram_id,
				instagram_username: client.c_instagram_username,
			},
			workflow: { active: true },
			lead: { ...lead, is_new },
			//products,
			calendar,
		};
	} finally {
		conn.release();
	}
}

module.exports = {
	init,
	ServiceError,
};
