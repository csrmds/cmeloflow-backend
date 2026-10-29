const axios = require('axios');
const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');

const graphUrl = () =>
	`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v25.0'}`;

/**
 * Lista conversas do cliente: todos os leads com WhatsApp, ordenados pela
 * última mensagem (leads sem mensagens aparecem no fim).
 */
async function listConversations(clientId) {
	const [rows] = await pool.query(
		`SELECT l.id AS lead_id, l.name, l.whatsapp_number, l.human_handover,
		        m.body AS last_body, m.direction AS last_direction, m.created_at AS last_at
		 FROM leads l
		 LEFT JOIN chat_messages m
		   ON m.id = (SELECT MAX(id) FROM chat_messages WHERE lead_id = l.id)
		 WHERE l.client_id = ?
		 ORDER BY COALESCE(m.id, 0) DESC, l.id DESC`,
		[clientId]
	);
	return rows;
}

async function getLead(clientId, leadId) {
	console.log("getLead function:", clientId, leadId)
	const [rows] = await pool.query(
		'SELECT id, whatsapp_number FROM leads WHERE id = ? AND client_id = ?',
		[leadId, clientId]
	);
	console.log(rows)
	if (!rows.length) throw new ServiceError('Lead não encontrado', 404);
	return rows[0];
}

/**
 * Mensagens de um lead. afterId opcional (polling traz só as novas).
 */
async function getMessages(clientId, leadId, afterId = 0) {
	await getLead(clientId, leadId);
	const [rows] = await pool.query(
		`SELECT id, direction, sender, body, status, error_code, error_message, created_at
		 FROM chat_messages
		 WHERE lead_id = ? AND client_id = ? AND id > ?
		 ORDER BY id ASC LIMIT 500`,
		[leadId, clientId, Number(afterId) || 0]
	);
	return rows;
}

/**
 * Envia mensagem de texto pelo número principal e ativo do cliente (Cloud API)
 * e grava no histórico. Marca o lead como atendimento humano para a IA parar.
 */
async function sendMessage(clientId, leadId, body) {
	const text = (body ?? '').trim();
	if (!text) throw new ServiceError('Mensagem vazia', 400);

	const lead = await getLead(clientId, leadId);
	if (!lead.whatsapp_number) {
		throw new ServiceError('Este lead não possui número de WhatsApp', 422);
	}

	const [phones] = await pool.query(
		`SELECT id, phone_number_id FROM client_phones
		 WHERE client_id = ? AND is_primary = 1 AND active = 1 LIMIT 1`,
		[clientId]
	);
	if (!phones.length) {
		throw new ServiceError('Cliente não possui número principal ativo', 422);
	}
	const phone = phones[0];
	if (!phone.phone_number_id) {
		throw new ServiceError('Número principal sem phone_number_id da Meta', 422);
	}

	let waMessageId = null;
	try {
		const { data } = await axios.post( `${graphUrl()}/${phone.phone_number_id}/messages`,
			{
				messaging_product: 'whatsapp',
				to: String(lead.whatsapp_number).replace(/\D/g, ''),
				type: 'text',
				text: { body: text },
			},
			{ headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}` } }
		);
		console.log("graphUrl Response: ", data)
		waMessageId = data?.messages?.[0]?.id ?? null;
	} catch (err) {
		const msg = err.response?.data?.error?.message ?? err.message;
		throw new ServiceError(`Falha ao enviar pelo WhatsApp: ${msg}`, 502);
	}

	const [result] = await pool.query(
		`INSERT INTO chat_messages (client_id, lead_id, client_phone_id, direction, sender, body, wa_message_id)
		 VALUES (?, ?, ?, 'out', 'client', ?, ?)`,
		[clientId, leadId, phone.id, text, waMessageId]
	);

	await pool.query( 'UPDATE leads SET human_handover = 1, updated_at = NOW() WHERE id = ?', [leadId] );

	return { id: result.insertId, direction: 'out', sender: 'client', body: text, status: 'sent' };
}

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };

/**
 * Chamado pelo n8n (x-api-key) com cada item de statuses[] do webhook da Meta.
 * Atualiza o status da mensagem enviada (sent/delivered/read/failed).
 * Se a mensagem não existe (ex.: enviada pela IA e não gravada), responde updated:false.
 * @param {{ wa_message_id, status, error_code?, error_message? }} data
 */
async function updateStatus(data) {
	const { wa_message_id, status } = data;
	if (!wa_message_id || !status) {
		throw new ServiceError('wa_message_id e status são obrigatórios', 400);
	}
	if (!['sent', 'delivered', 'read', 'failed'].includes(status)) {
		throw new ServiceError('status inválido', 400);
	}

	const [rows] = await pool.query(
		'SELECT id, status FROM chat_messages WHERE wa_message_id = ?',
		[wa_message_id]
	);
	if (!rows.length) return { updated: false };

	const current = rows[0].status;
	// Não regride status (ex.: webhook "sent" chegando depois de "delivered")
	if (status !== 'failed' && (STATUS_RANK[status] ?? 0) <= (STATUS_RANK[current] ?? 0)) {
		return { updated: false };
	}

	await pool.query(
		'UPDATE chat_messages SET status = ?, error_code = ?, error_message = ? WHERE id = ?',
		[
			status,
			status === 'failed' ? data.error_code ?? null : null,
			status === 'failed' ? String(data.error_message ?? '').slice(0, 500) || null : null,
			rows[0].id,
		]
	);
	return { updated: true };
}

/**
 * Chamado pelo n8n (x-api-key) para gravar mensagens de entrada (lead) e de
 * saída da IA.
 * @param {{ client_id, lead_whatsapp, direction: 'in'|'out', sender?: 'lead'|'client'|'ai', body, wa_message_id? }} data
 */
async function recordMessage(data) {
	const { client_id, lead_whatsapp, direction, body, wa_message_id } = data;
	if (!client_id || !lead_whatsapp || !direction || !body) {
		throw new ServiceError('client_id, lead_whatsapp, direction e body são obrigatórios', 400);
	}
	if (!['in', 'out'].includes(direction)) {
		throw new ServiceError('direction deve ser in ou out', 400);
	}
	const sender = data.sender ?? (direction === 'in' ? 'lead' : 'ai');

	const [leads] = await pool.query(
		'SELECT id FROM leads WHERE client_id = ? AND whatsapp_number = ?',
		[client_id, lead_whatsapp]
	);
	if (!leads.length) throw new ServiceError('Lead não encontrado', 404);

	const [result] = await pool.query(
		`INSERT IGNORE INTO chat_messages (client_id, lead_id, direction, sender, body, wa_message_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[client_id, leads[0].id, direction, sender, body, wa_message_id ?? null]
	);

	return { id: result.insertId || null, duplicated: result.affectedRows === 0 };
}

module.exports = { listConversations, getMessages, sendMessage, recordMessage, updateStatus, ServiceError };
