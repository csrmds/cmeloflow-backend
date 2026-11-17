const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');

const PAYMENT_METHODS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro'];
const STATUSES = ['open', 'finalized', 'cancelled'];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Define o escopo de acesso a partir do usuário.
 * - client/service: restrito ao próprio client_id
 * - admin: sem restrição (clientId = null)
 */
function getScope(user) {
	const { client_id, user_role } = user || {};

	if (user_role === 'admin') return { clientId: null, isAdmin: true };
	if ((user_role === 'client' || user_role === 'service') && client_id) {
		return { clientId: Number(client_id), isAdmin: false };
	}
	throw new ServiceError('Acesso negado', 403);
}

function toInt(value, field, { min = 0, required = true } = {}) {
	if (value === undefined || value === null || value === '') {
		if (required) throw new ServiceError(`${field} é obrigatório`, 400);
		return null;
	}
	const n = Number(value);
	if (!Number.isInteger(n) || n < min) {
		throw new ServiceError(`${field} inválido`, 400);
	}
	return n;
}

function parseId(id) {
	const n = Number(id);
	if (!Number.isInteger(n) || n <= 0) throw new ServiceError('ID inválido', 400);
	return n;
}

function validatePaymentMethod(method) {
	if (!method || !PAYMENT_METHODS.includes(method)) {
		throw new ServiceError(`Forma de pagamento inválida. Use: ${PAYMENT_METHODS.join(', ')}`, 400);
	}
	return method;
}

/**
 * Normaliza os itens recebidos. Quando vem product_id, nome e preço são
 * buscados em products (do mesmo cliente) caso não tenham sido informados.
 * Descrição e preço ficam congelados no item.
 */
async function resolveItems(conn, clientId, rawItems) {
	if (!Array.isArray(rawItems) || rawItems.length === 0) {
		throw new ServiceError('Informe ao menos um item', 400);
	}
	if (rawItems.length > 100) {
		throw new ServiceError('Máximo de 100 itens por venda', 400);
	}

	const items = [];

	for (const raw of rawItems) {
		const quantity = toInt(raw.quantity ?? 1, 'Quantidade', { min: 1 });
		const discount = toInt(raw.discount_cents ?? 0, 'Desconto do item', { min: 0 });

		let productId = null;
		let description = typeof raw.description === 'string' ? raw.description.trim() : '';
		let unitPrice =
			raw.unit_price_cents === undefined || raw.unit_price_cents === null || raw.unit_price_cents === ''
				? null
				: toInt(raw.unit_price_cents, 'Preço unitário', { min: 0 });

		if (raw.product_id !== undefined && raw.product_id !== null && raw.product_id !== '') {
			productId = toInt(raw.product_id, 'Produto', { min: 1 });

			const [rows] = await conn.query(
				`SELECT id, name, price FROM products WHERE id = ? AND client_id = ?`,
				[productId, clientId]
			);
			if (rows.length === 0) {
				throw new ServiceError(`Produto ${productId} não encontrado para este cliente`, 400);
			}
			if (!description) description = rows[0].name;
			if (unitPrice === null) unitPrice = Math.round(Number(rows[0].price ?? 0) * 100);
		}

		if (!description) throw new ServiceError('Descrição do item é obrigatória', 400);
		if (description.length > 255) throw new ServiceError('Descrição do item muito longa (máx. 255)', 400);
		if (unitPrice === null) throw new ServiceError('Preço unitário é obrigatório', 400);
		if (discount > quantity * unitPrice) {
			throw new ServiceError('Desconto do item maior que o valor do item', 400);
		}

		items.push({ productId, description, quantity, unitPrice, discount });
	}

	return items;
}

async function insertItems(conn, clientId, saleId, items) {
	const values = items.map((i) => [
		clientId,
		saleId,
		i.productId,
		i.description,
		i.quantity,
		i.unitPrice,
		i.discount,
	]);

	await conn.query(
		`INSERT INTO sale_items
		(client_id, sale_id, product_id, description, quantity, unit_price_cents, discount_cents)
		VALUES ?`,
		[values]
	);
}

/**
 * Recalcula o total da venda: soma dos itens - desconto da venda.
 * Lança erro se o desconto for maior que a soma dos itens.
 */
async function recalcTotal(conn, saleId, discountCents) {
	const [rows] = await conn.query(
		`SELECT COALESCE(SUM(total_cents), 0) AS items_total, COUNT(*) AS items_count
		FROM sale_items WHERE sale_id = ?`,
		[saleId]
	);

	const itemsTotal = Number(rows[0].items_total);
	if (Number(rows[0].items_count) === 0) {
		throw new ServiceError('Informe ao menos um item', 400);
	}

	const total = itemsTotal - Number(discountCents);
	if (total < 0) {
		throw new ServiceError('Desconto da venda maior que o total dos itens', 400);
	}

	await conn.query(`UPDATE sales SET total_cents = ? WHERE id = ?`, [total, saleId]);
	return total;
}

async function assertLead(conn, clientId, leadId) {
	if (leadId === null) return;
	const [rows] = await conn.query(`SELECT id FROM leads WHERE id = ? AND client_id = ?`, [leadId, clientId]);
	if (rows.length === 0) {
		throw new ServiceError('Lead não encontrado para este cliente', 400);
	}
}

/** Busca a venda travando a linha (FOR UPDATE) dentro de uma transação. */
async function lockSale(conn, scope, id) {
	const saleId = parseId(id);

	const [rows] = scope.isAdmin
		? await conn.query(`SELECT * FROM sales WHERE id = ? FOR UPDATE`, [saleId])
		: await conn.query(`SELECT * FROM sales WHERE id = ? AND client_id = ? FOR UPDATE`, [saleId, scope.clientId]);

	if (rows.length === 0) throw new ServiceError('Venda não encontrada', 404);
	return rows[0];
}

async function withTransaction(fn) {
	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();
		const result = await fn(conn);
		await conn.commit();
		return result;
	} catch (err) {
		try {
			await conn.rollback();
		} catch (_) { /* ignora erro de rollback */ }
		throw err;
	} finally {
		conn.release();
	}
}

/* ------------------------------------------------------------------ */
/* operações                                                           */
/* ------------------------------------------------------------------ */

/**
 * Cria uma venda com itens.
 * - Por padrão nasce 'open'. Com finalize=true (+ payment_method) já nasce finalizada.
 * - O número sequencial por cliente é preenchido pelo trigger trg_sales_number.
 *
 * @param {{ client_id: number, user_role: string }} user
 * @param {{
 *   client_id?: number,           // só admin
 *   lead_id?: number,
 *   source?: string,
 *   discount_cents?: number,
 *   notes?: string,
 *   calendar_event_id?: string,
 *   finalize?: boolean,
 *   payment_method?: string,
 *   items: Array<{ product_id?, description?, quantity?, unit_price_cents?, discount_cents? }>
 * }} data
 */
async function create(user, data = {}) {
	const scope = getScope(user);

	let clientId = scope.clientId;
	if (scope.isAdmin) {
		clientId = toInt(data.client_id, 'client_id', { min: 1 });
	}

	const leadId = toInt(data.lead_id, 'lead_id', { min: 1, required: false });
	const discountCents = toInt(data.discount_cents ?? 0, 'Desconto da venda', { min: 0 });
	const source = data.source ? String(data.source).slice(0, 50) : 'manual';
	const notes = data.notes ? String(data.notes) : null;
	const calendarEventId = data.calendar_event_id ? String(data.calendar_event_id).slice(0, 255) : null;
	const finalize = data.finalize === true || data.finalize === 'true';
	const paymentMethod = data.payment_method ? validatePaymentMethod(data.payment_method) : null;

	if (finalize && !paymentMethod) {
		throw new ServiceError('Forma de pagamento é obrigatória para finalizar', 400);
	}

	return withTransaction(async (conn) => {
		const [clients] = await conn.query(`SELECT id FROM clients WHERE id = ?`, [clientId]);
		if (clients.length === 0) throw new ServiceError('Cliente não encontrado', 404);

		await assertLead(conn, clientId, leadId);
		const items = await resolveItems(conn, clientId, data.items);

		// number = 0 é sobrescrito pelo trigger trg_sales_number
		const [result] = await conn.query(
			`INSERT INTO sales (client_id, number, lead_id, source, discount_cents, payment_method, calendar_event_id, notes)
			VALUES (?, 0, ?, ?, ?, ?, ?, ?)`,
			[clientId, leadId, source, discountCents, paymentMethod, calendarEventId, notes]
		);
		const saleId = result.insertId;

		await insertItems(conn, clientId, saleId, items);
		const total = await recalcTotal(conn, saleId, discountCents);

		if (finalize) {
			await conn.query(
				`UPDATE sales SET status = 'finalized', finalized_at = NOW() WHERE id = ?`,
				[saleId]
			);
		}

		const [rows] = await conn.query(`SELECT id, number, status, total_cents FROM sales WHERE id = ?`, [saleId]);
		return { ...rows[0], total_cents: total };
	});
}

/**
 * Lista vendas. Admin vê todos os clientes; client/service só os próprios.
 * Filtros opcionais: status, lead_id, client_id (admin), limit, offset.
 */
async function list(user, filters = {}) {
	const scope = getScope(user);

	const where = [];
	const params = [];

	if (!scope.isAdmin) {
		where.push('s.client_id = ?');
		params.push(scope.clientId);
	} else if (filters.client_id) {
		where.push('s.client_id = ?');
		params.push(toInt(filters.client_id, 'client_id', { min: 1 }));
	}

	if (filters.status) {
		if (!STATUSES.includes(filters.status)) throw new ServiceError('Status inválido', 400);
		where.push('s.status = ?');
		params.push(filters.status);
	}

	if (filters.lead_id) {
		where.push('s.lead_id = ?');
		params.push(toInt(filters.lead_id, 'lead_id', { min: 1 }));
	}

	let limit = filters.limit ? toInt(filters.limit, 'limit', { min: 1 }) : 100;
	if (limit > 500) limit = 500;
	const offset = filters.offset ? toInt(filters.offset, 'offset', { min: 0 }) : 0;

	const [rows] = await pool.query(
		`SELECT
			s.*,
			l.name AS lead_name,
			l.whatsapp_number AS lead_whatsapp_number,
			c.name AS client_name,
			(SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS items_count
		FROM sales s
		LEFT JOIN leads l ON l.id = s.lead_id
		INNER JOIN clients c ON c.id = s.client_id
		${where.length ? 'WHERE ' + where.join(' AND ') : ''}
		ORDER BY s.created_at DESC, s.id DESC
		LIMIT ? OFFSET ?`,
		[...params, limit, offset]
	);

	return rows;
}

/** Busca uma venda com seus itens. */
async function getById(user, id) {
	const scope = getScope(user);
	const saleId = parseId(id);

	const base = `SELECT s.*, l.name AS lead_name, l.whatsapp_number AS lead_whatsapp_number, c.name AS client_name
		FROM sales s
		LEFT JOIN leads l ON l.id = s.lead_id
		INNER JOIN clients c ON c.id = s.client_id
		WHERE s.id = ?`;

	const [rows] = scope.isAdmin
		? await pool.query(base, [saleId])
		: await pool.query(`${base} AND s.client_id = ?`, [saleId, scope.clientId]);

	if (rows.length === 0) throw new ServiceError('Venda não encontrada', 404);

	const [items] = await pool.query(
		`SELECT id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents
		FROM sale_items WHERE sale_id = ? ORDER BY id`,
		[saleId]
	);

	return { ...rows[0], items };
}

/**
 * Atualiza uma venda ABERTA. Se `items` vier, substitui todos os itens.
 * Campos aceitos: lead_id, source, discount_cents, notes, calendar_event_id, items.
 */
async function update(user, id, data = {}) {
	const scope = getScope(user);

	return withTransaction(async (conn) => {
		const sale = await lockSale(conn, scope, id);

		if (sale.status !== 'open') {
			throw new ServiceError('Só é possível editar vendas abertas', 409);
		}

		const sets = [];
		const params = [];

		if (data.lead_id !== undefined) {
			const leadId = toInt(data.lead_id, 'lead_id', { min: 1, required: false });
			await assertLead(conn, sale.client_id, leadId);
			sets.push('lead_id = ?');
			params.push(leadId);
		}
		if (data.source !== undefined) {
			sets.push('source = ?');
			params.push(data.source ? String(data.source).slice(0, 50) : null);
		}
		if (data.notes !== undefined) {
			sets.push('notes = ?');
			params.push(data.notes ? String(data.notes) : null);
		}
		if (data.calendar_event_id !== undefined) {
			sets.push('calendar_event_id = ?');
			params.push(data.calendar_event_id ? String(data.calendar_event_id).slice(0, 255) : null);
		}

		let discountCents = Number(sale.discount_cents);
		if (data.discount_cents !== undefined) {
			discountCents = toInt(data.discount_cents, 'Desconto da venda', { min: 0 });
			sets.push('discount_cents = ?');
			params.push(discountCents);
		}

		if (sets.length > 0) {
			await conn.query(`UPDATE sales SET ${sets.join(', ')} WHERE id = ?`, [...params, sale.id]);
		}

		if (data.items !== undefined) {
			const items = await resolveItems(conn, sale.client_id, data.items);
			await conn.query(`DELETE FROM sale_items WHERE sale_id = ?`, [sale.id]);
			await insertItems(conn, sale.client_id, sale.id, items);
		}

		const total = await recalcTotal(conn, sale.id, discountCents);
		return { id: sale.id, number: sale.number, status: sale.status, total_cents: total };
	});
}

/** Finaliza uma venda aberta. Exige forma de pagamento. */
async function finalize(user, id, data = {}) {
	const scope = getScope(user);
	const paymentMethod = validatePaymentMethod(data.payment_method);

	return withTransaction(async (conn) => {
		const sale = await lockSale(conn, scope, id);

		if (sale.status !== 'open') {
			throw new ServiceError('Só é possível finalizar vendas abertas', 409);
		}

		const total = await recalcTotal(conn, sale.id, sale.discount_cents);

		await conn.query(
			`UPDATE sales SET status = 'finalized', payment_method = ?, finalized_at = NOW() WHERE id = ?`,
			[paymentMethod, sale.id]
		);

		return { id: sale.id, number: sale.number, status: 'finalized', total_cents: total };
	});
}

/** Cancela uma venda (aberta ou finalizada). Nunca apaga. */
async function cancel(user, id, data = {}) {
	const scope = getScope(user);
	const reason = data.reason ? String(data.reason).slice(0, 255) : null;

	return withTransaction(async (conn) => {
		const sale = await lockSale(conn, scope, id);

		if (sale.status === 'cancelled') {
			throw new ServiceError('Venda já está cancelada', 409);
		}

		await conn.query(
			`UPDATE sales SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?`,
			[reason, sale.id]
		);

		return { id: sale.id, number: sale.number, status: 'cancelled' };
	});
}

/**
 * Dados do dashboard (view vw_sales_dashboard): receita, nº de vendas e
 * ticket médio por mês e origem. Padrão: últimos 6 meses.
 */
async function dashboard(user, filters = {}) {
	const scope = getScope(user);

	let months = filters.months ? toInt(filters.months, 'months', { min: 1 }) : 6;
	if (months > 36) months = 36;

	const where = [
		`month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m')`,
	];
	const params = [months - 1];

	if (!scope.isAdmin) {
		where.push('client_id = ?');
		params.push(scope.clientId);
	} else if (filters.client_id) {
		where.push('client_id = ?');
		params.push(toInt(filters.client_id, 'client_id', { min: 1 }));
	}

	const [rows] = await pool.query(
		`SELECT client_id, month, source, sales_count, revenue_cents, avg_ticket_cents
		FROM vw_sales_dashboard
		WHERE ${where.join(' AND ')}
		ORDER BY month DESC, revenue_cents DESC`,
		params
	);

	return rows.map((r) => ({
		client_id: r.client_id,
		month: r.month,
		source: r.source,
		sales_count: Number(r.sales_count),
		revenue_cents: Number(r.revenue_cents),
		avg_ticket_cents: Number(r.avg_ticket_cents),
	}));
}

module.exports = {
	PAYMENT_METHODS,
	create,
	list,
	getById,
	update,
	finalize,
	cancel,
	dashboard,
	ServiceError,
};
