const pool = require('../config/database');
const response = require('../utils/response');

/**
 * POST /session/init
 * Body: {
 *   source: "whatsapp" | "instagram" | "comment",
 *   workflow_id: string,
 *
 *   // identificação do cliente (um dos dois):
 *   client_whatsapp?: string,
 *   instagram_user_id?: string,
 *
 *   // identificação do lead (conforme source):
 *   lead_whatsapp?: string,
 *   instagram_scoped_userid?: string,
 *   instagram_username?: string,
 *   lead_name?: string,
 *   message?: string,
 * }
 *
 * Retorna tudo que o N8N precisa em uma única chamada:
 * {
 *   client: { id, name, about, whatsapp_number, instagram_id, instagram_username, status },
 *   workflow: { active: boolean },
 *   lead: { id, is_new, status, human_handover, name, whatsapp_number, instagram_username },
 *   products: [...],
 * }
 */
exports.init = async (req, res) => {
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
	} = req.body;

	if (!source || !workflow_id) {
		return response.error(res, 'source e workflow_id são obrigatórios', 400);
	}

	const conn = await pool.getConnection();
	try {
		// ── 1. Busca o cliente via view (phones + workflows) ────────────────────
		let clientRows;
		if (source === 'whatsapp') {
			if (!client_whatsapp) return response.error(res, 'client_whatsapp é obrigatório para source=whatsapp', 400);
			[clientRows] = await conn.query(
				`SELECT * FROM vw_client_phones_workflows WHERE c_phones_number = ? AND c_phones_is_primary = 1 AND c_workflow_n8n_id = ?`,
				[client_whatsapp, workflow_id]
			);
		} else {
			if (!instagram_user_id) return response.error(res, 'instagram_user_id é obrigatório para source instagram/comment', 400);
			[clientRows] = await conn.query(
				`SELECT * FROM vw_client_phones_workflows WHERE c_instagram_id = ? AND c_phones_is_primary = 1 AND c_workflow_n8n_id = ?`,
				[instagram_user_id, workflow_id]
			);
		}

		if (clientRows.length === 0) {
			return response.error(res, 'Cliente não encontrado', 404);
		}
		const client = clientRows[0];

		// ── 2. Verifica se o cliente está ativo ─────────────────────────────────
		if (client.c_status !== 'ativo') {
			return response.error(res, 'Cliente inativo', 403);
		}

		// ── 3. Verifica se o workflow está vinculado e ativo para o cliente ──────
		if (!Number(client.c_workflow_active)) {
			return response.error(res, 'Workflow não encontrado ou inativo para este cliente', 403);
		}

		// ── 1.2 Verifica se o cliente tem um segundo numero de atendimento ────────
		let clientWhatsappN2
		if (source === 'whatsapp') {
			[clientWhatsappN2] = await conn.query('select * from vw_client_phones_workflow where c_id = ? and c_phones_label = "atendimento n2" limit 1',
				[client.c_id]
			)
		}
		const whatsappN2 = clientWhatsappN2[0]

		// ── 4. Busca ou cria o lead ─────────────────────────────────────────────
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
			// Cria novo lead
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
			// Atualiza last_message
			if (message) {
				await conn.query(
					'UPDATE leads SET last_message = ?, updated_at = NOW() WHERE id = ?',
					[message, lead.id]
				);
			}
		}

		// ── 5. Carrega produtos ativos do cliente ───────────────────────────────
		const [products] = await conn.query(
			'SELECT id, name, description, price, type, keywords FROM products WHERE client_id = ? AND active = 1',
			[client.c_id]
		);

		// ── 6. Retorna tudo ─────────────────────────────────────────────────────
		return response.success(res, {
			client: {
				id: client.c_id,
				name: client.c_name,
				about: client.c_about,
				whatsapp_number: client.c_phones_number,
				whatsapp_number_n2: whatsappN2.c_phones_number,
				instagram_id: client.c_instagram_id,
				instagram_username: client.c_instagram_username,
			},
			workflow: { active: true },
			lead: { ...lead, is_new },
			products,
		}, 'Sessão iniciada com sucesso', 200);

	} catch (e) {
		return response.error(res, 'Erro ao iniciar sessão', 500, e);
	} finally {
		conn.release();
	}
};
