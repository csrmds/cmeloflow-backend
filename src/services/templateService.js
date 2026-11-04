const axios = require('axios');
const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');

const graphUrl = () =>
	`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v25.0'}`;

const headers = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}` });

const CATEGORIES = ['UTILITY', 'MARKETING'];
const LANGUAGES = ['pt_BR', 'en_US', 'es'];
const FIELDS = 'id,name,status,category,language,components,rejected_reason';

/** Mensagem de erro mais útil devolvida pela Graph API. */
function metaMessage(err) {
	const e = err.response?.data?.error;
	return e?.error_user_msg || e?.error_user_title || e?.message || err.message;
}

/** WABA do número principal e ativo do cliente. */
async function getWabaId(clientId) {
	const [rows] = await pool.query(
		`SELECT waba_id FROM client_phones
		 WHERE client_id = ? AND is_primary = 1 AND active = 1 LIMIT 1`,
		[clientId]
	);
	if (!rows.length) throw new ServiceError('Cliente não possui número principal ativo', 422);
	if (!rows[0].waba_id) throw new ServiceError('Número principal sem waba_id da Meta', 422);
	return rows[0].waba_id;
}

/** Quantidade de variáveis {{n}} (ordenadas) de um texto. */
function variableNumbers(text) {
	const nums = [...String(text).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
	return [...new Set(nums)].sort((a, b) => a - b);
}

/** Resume um template da Meta para o frontend. */
function simplify(t) {
	const comp = (type) => t.components?.find((c) => c.type === type);
	const body = comp('BODY')?.text ?? '';
	return {
		id: t.id,
		name: t.name,
		status: t.status,
		category: t.category,
		language: t.language,
		body,
		footer: comp('FOOTER')?.text ?? null,
		variables: variableNumbers(body).length,
		rejected_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
	};
}

/** Substitui {{n}} pelas variáveis informadas. */
function renderBody(text, variables = []) {
	return String(text).replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? '');
}

async function list(clientId) {
	const wabaId = await getWabaId(clientId);
	try {
		const { data } = await axios.get(`${graphUrl()}/${wabaId}/message_templates`, {
			headers: headers(),
			params: { fields: FIELDS, limit: 100 },
		});
		return (data?.data ?? []).map(simplify);
	} catch (err) {
		throw new ServiceError(`Falha ao listar modelos: ${metaMessage(err)}`, 502);
	}
}

/**
 * Valida os dados e monta o corpo do POST /{waba}/message_templates.
 * @param {{ name, category, language?, body, footer?, examples?: string[] }} data
 */
function buildPayload(data) {
	const name = String(data.name ?? '').trim();
	const body = String(data.body ?? '').trim();
	const footer = String(data.footer ?? '').trim();
	const category = String(data.category ?? '').toUpperCase();
	const language = data.language || 'pt_BR';
	const examples = (data.examples ?? []).map((e) => String(e).trim());

	if (!/^[a-z0-9_]{1,512}$/.test(name)) {
		throw new ServiceError('Nome inválido: use apenas letras minúsculas, números e _', 400);
	}
	if (!CATEGORIES.includes(category)) {
		throw new ServiceError('Categoria inválida (use UTILITY ou MARKETING)', 400);
	}
	if (!LANGUAGES.includes(language)) throw new ServiceError('Idioma inválido', 400);
	if (!body) throw new ServiceError('O texto do modelo é obrigatório', 400);
	if (body.length > 1024) throw new ServiceError('O texto deve ter até 1024 caracteres', 400);
	if (footer.length > 60) throw new ServiceError('O rodapé deve ter até 60 caracteres', 400);

	const nums = variableNumbers(body);
	if (nums.some((n, i) => n !== i + 1)) {
		throw new ServiceError('As variáveis devem ser sequenciais: {{1}}, {{2}}, ...', 400);
	}
	if (/^\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}$/.test(body)) {
		throw new ServiceError('O texto não pode começar nem terminar com uma variável', 400);
	}
	if (nums.length && (examples.length !== nums.length || examples.some((e) => !e))) {
		throw new ServiceError(`Informe um exemplo para cada uma das ${nums.length} variáveis`, 400);
	}

	const bodyComponent = { type: 'BODY', text: body };
	if (nums.length) bodyComponent.example = { body_text: [examples] };

	const components = [bodyComponent];
	if (footer) components.push({ type: 'FOOTER', text: footer });

	return { name, language, category, components };
}

async function create(clientId, data) {
	const payload = buildPayload(data);
	const wabaId = await getWabaId(clientId);
	try {
		const { data: res } = await axios.post(
			`${graphUrl()}/${wabaId}/message_templates`,
			payload,
			{ headers: headers() }
		);
		return { id: res.id, status: res.status, category: res.category, name: payload.name };
	} catch (err) {
		throw new ServiceError(`Falha ao criar modelo: ${metaMessage(err)}`, 502);
	}
}

/** Busca um template aprovado pelo nome e idioma (usado no envio). */
async function findApproved(wabaId, name, language) {
	try {
		const { data } = await axios.get(`${graphUrl()}/${wabaId}/message_templates`, {
			headers: headers(),
			params: { name, fields: FIELDS, limit: 50 },
		});
		const found = (data?.data ?? []).find((t) => t.name === name && t.language === language);
		if (!found) throw new ServiceError('Modelo não encontrado', 404);
		if (found.status !== 'APPROVED') {
			throw new ServiceError(`Modelo ainda não aprovado (status: ${found.status})`, 422);
		}
		return simplify(found);
	} catch (err) {
		if (err instanceof ServiceError) throw err;
		throw new ServiceError(`Falha ao buscar modelo: ${metaMessage(err)}`, 502);
	}
}

module.exports = { list, create, findApproved, renderBody, buildPayload, metaMessage };
