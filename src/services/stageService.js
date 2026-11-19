const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');

const KINDS = ['open', 'won', 'lost'];

const DEFAULT_STAGES = [
	{ name: 'Novo', color: '#3b82f6', kind: 'open', is_default: 1 },
	{ name: 'Em atendimento', color: '#f59e0b', kind: 'open', is_default: 0 },
	{ name: 'Fechado', color: '#22c55e', kind: 'won', is_default: 0 },
];

/**
 * Cliente alvo da operação: admin pode informar outro client_id,
 * os demais usam sempre o client_id do token.
 */
function resolveClientId(user, requested) {
	if (user.user_role === 'admin' && requested) return Number(requested);
	return user.client_id;
}

/**
 * Cria as raias padrão de um cliente (usado ao criar cliente).
 * @param {number} clientId
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [db]
 */
async function seedDefaultStages(clientId, db = pool) {
	const values = DEFAULT_STAGES.map((s, i) => [clientId, s.name, s.color, i, s.kind, s.is_default]);
	await db.query(
		`INSERT INTO lead_stages (client_id, name, color, position, kind, is_default) VALUES ?`,
		[values]
	);
}

/**
 * Retorna o id da raia padrão do cliente (onde entram os leads novos).
 * Se o cliente não tem nenhuma raia, cria as padrão.
 */
async function getDefaultStageId(clientId, db = pool) {
	const [rows] = await db.query(
		`SELECT id FROM lead_stages WHERE client_id = ?
     ORDER BY is_default DESC, position ASC, id ASC LIMIT 1`,
		[clientId]
	);
	if (rows.length) return rows[0].id;

	await seedDefaultStages(clientId, db);
	return getDefaultStageId(clientId, db);
}

/**
 * Próxima posição (final da fila) dentro de uma raia.
 */
async function nextLeadPosition(stageId, db = pool) {
	const [rows] = await db.query(
		`SELECT COALESCE(MAX(stage_position), -1) + 1 AS next FROM leads WHERE stage_id = ?`,
		[stageId]
	);
	return rows[0].next;
}

function validateName(name) {
	const value = typeof name === 'string' ? name.trim() : '';
	if (!value) throw new ServiceError('O nome da raia é obrigatório', 400);
	if (value.length > 60) throw new ServiceError('O nome da raia deve ter no máximo 60 caracteres', 400);
	return value;
}

function validateKind(kind) {
	if (!KINDS.includes(kind)) {
		throw new ServiceError(`kind inválido. Use: ${KINDS.join(', ')}`, 400);
	}
	return kind;
}

async function withTransaction(fn) {
	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();
		const result = await fn(conn);
		await conn.commit();
		return result;
	} catch (err) {
		await conn.rollback();
		throw err;
	} finally {
		conn.release();
	}
}

/**
 * Lista as raias do cliente, na ordem do quadro.
 */
async function list(user, query = {}) {
	const clientId = resolveClientId(user, query.client_id);
	const [rows] = await pool.query(
		`SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.stage_id = s.id) AS leads_count
     FROM lead_stages s WHERE s.client_id = ? ORDER BY s.position, s.id`,
		[clientId]
	);
	return rows;
}

/**
 * Cria uma raia no final do quadro.
 * @param {{ name: string, color?: string, kind?: 'open'|'won'|'lost', client_id?: number }} data
 */
async function create(user, data) {
	const clientId = resolveClientId(user, data.client_id);
	const name = validateName(data.name);
	const kind = validateKind(data.kind ?? 'open');
	const color = data.color ?? null;

	const [pos] = await pool.query(
		`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM lead_stages WHERE client_id = ?`,
		[clientId]
	);

	const [result] = await pool.query(
		`INSERT INTO lead_stages (client_id, name, color, position, kind, is_default)
     VALUES (?, ?, ?, ?, ?, 0)`,
		[clientId, name, color, pos[0].next, kind]
	);

	const [rows] = await pool.query(`SELECT * FROM lead_stages WHERE id = ?`, [result.insertId]);
	return { ...rows[0], leads_count: 0 };
}

/**
 * Atualiza nome, cor, kind e/ou is_default de uma raia.
 */
async function update(user, id, data) {
	return withTransaction(async (conn) => {
		const [found] = await conn.query(`SELECT * FROM lead_stages WHERE id = ? FOR UPDATE`, [id]);
		const stage = found[0];
		if (!stage || (user.user_role !== 'admin' && stage.client_id !== user.client_id)) {
			throw new ServiceError('Raia não encontrada', 404);
		}

		const name = data.name !== undefined ? validateName(data.name) : stage.name;
		const kind = data.kind !== undefined ? validateKind(data.kind) : stage.kind;
		const color = data.color !== undefined ? data.color : stage.color;

		if (data.is_default === false && stage.is_default) {
			throw new ServiceError('Defina outra raia como padrão em vez de remover a marcação desta', 400);
		}
		if (data.is_default) {
			await conn.query(`UPDATE lead_stages SET is_default = 0 WHERE client_id = ?`, [stage.client_id]);
		}
		const isDefault = data.is_default ? 1 : stage.is_default;

		await conn.query(
			`UPDATE lead_stages SET name = ?, color = ?, kind = ?, is_default = ? WHERE id = ?`,
			[name, color, kind, isDefault, id]
		);

		const [rows] = await conn.query(`SELECT * FROM lead_stages WHERE id = ?`, [id]);
		return rows[0];
	});
}

/**
 * Reordena as raias. `ids` deve conter TODAS as raias do cliente, na nova ordem.
 * @param {{ ids: number[], client_id?: number }} data
 */
async function reorder(user, data) {
	const clientId = resolveClientId(user, data.client_id);
	const ids = Array.isArray(data.ids) ? data.ids.map(Number) : [];

	return withTransaction(async (conn) => {
		const [current] = await conn.query(
			`SELECT id FROM lead_stages WHERE client_id = ? FOR UPDATE`,
			[clientId]
		);
		const currentIds = current.map((r) => r.id).sort((a, b) => a - b);
		const sent = [...ids].sort((a, b) => a - b);

		if (
			currentIds.length !== sent.length ||
			currentIds.some((v, i) => v !== sent[i])
		) {
			throw new ServiceError('A lista de raias está incompleta ou contém raias inválidas', 400);
		}

		for (let i = 0; i < ids.length; i++) {
			await conn.query(`UPDATE lead_stages SET position = ? WHERE id = ?`, [i, ids[i]]);
		}
		return ids;
	});
}

/**
 * Remove uma raia. Os leads vão para `move_to` (ou, se omitido, para a raia padrão/primeira restante).
 * Não permite remover a única raia do cliente.
 * @param {number|string} id
 * @param {{ move_to?: number|string }} query
 */
async function remove(user, id, query = {}) {
	return withTransaction(async (conn) => {
		const [found] = await conn.query(`SELECT * FROM lead_stages WHERE id = ? FOR UPDATE`, [id]);
		const stage = found[0];
		if (!stage || (user.user_role !== 'admin' && stage.client_id !== user.client_id)) {
			throw new ServiceError('Raia não encontrada', 404);
		}

		const [others] = await conn.query(
			`SELECT id, is_default FROM lead_stages WHERE client_id = ? AND id <> ?
       ORDER BY is_default DESC, position ASC, id ASC`,
			[stage.client_id, stage.id]
		);
		if (others.length === 0) {
			throw new ServiceError('Não é possível remover a única raia do quadro', 400);
		}

		let target = others[0];
		if (query.move_to) {
			target = others.find((o) => o.id === Number(query.move_to));
			if (!target) throw new ServiceError('Raia de destino inválida', 400);
		}

		// Leads vão para o final da raia de destino, mantendo a ordem relativa
		const offset = await nextLeadPosition(target.id, conn);
		const [moved] = await conn.query(
			`UPDATE leads SET stage_id = ?, stage_position = stage_position + ? WHERE stage_id = ?`,
			[target.id, offset, stage.id]
		);

		await conn.query(`DELETE FROM lead_stages WHERE id = ?`, [stage.id]);

		// Se removeu a padrão, a raia de destino assume o posto
		if (stage.is_default) {
			await conn.query(`UPDATE lead_stages SET is_default = 1 WHERE id = ?`, [target.id]);
		}

		// Recompacta as posições das raias restantes
		const [remaining] = await conn.query(
			`SELECT id FROM lead_stages WHERE client_id = ? ORDER BY position, id`,
			[stage.client_id]
		);
		for (let i = 0; i < remaining.length; i++) {
			await conn.query(`UPDATE lead_stages SET position = ? WHERE id = ?`, [i, remaining[i].id]);
		}

		return { moved_leads: moved.affectedRows, move_to: target.id };
	});
}

module.exports = {
	seedDefaultStages,
	getDefaultStageId,
	nextLeadPosition,
	list,
	create,
	update,
	reorder,
	remove,
	ServiceError,
};
