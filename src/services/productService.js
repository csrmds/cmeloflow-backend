const pool = require('../config/database');

class ServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Cria um produto para o cliente autenticado.
 * @param {{ client_id: number }} user
 * @param {{ name, description, price }} data
 */
async function create(user, data) {
  const { name, description, price } = data;
  const { client_id } = user;

  const [result] = await pool.query(
    `INSERT INTO products (name, description, price, client_id) VALUES (?, ?, ?, ?)`,
    [name, description, price, client_id]
  );

  return { id: result.insertId };
}

/**
 * Lista produtos. Comportamento depende do role:
 * - client: só os produtos do próprio cliente.
 * - admin: todos os produtos, com JOIN em clients (nome + whatsapp).
 * - service: produtos do cliente identificado por client_whatsapp (vindo no body).
 *
 * NOTA: o caso "service" depende de client_whatsapp no body — isso é uma
 * limitação conhecida (ver TODO em src/lib/services/admin-products.ts no
 * frontend). Mantido aqui sem alteração de comportamento.
 *
 * @param {{ client_id: number, user_role: string }} user
 * @param {string|null} clientWhatsapp
 */
async function list(user, clientWhatsapp) {
  const { client_id, user_role } = user;

  if (user_role === 'client') {
    const [rows] = await pool.query(
      `SELECT * FROM products WHERE client_id = ?`,
      [client_id]
    );
    return rows;
  }

  if (user_role === 'admin') {
    const [rows] = await pool.query(
      `SELECT products.*, clients.name as client_name, clients.whatsapp_number as client_whatsapp_number
       FROM products
       INNER JOIN clients ON products.client_id = clients.id`
    );
    return rows;
  }

  if (user_role === 'service') {
    const [rows] = await pool.query(
      `SELECT products.*, clients.name as client_name, clients.whatsapp_number as client_whatsapp_number
       FROM products
       INNER JOIN clients
       ON products.client_id = clients.id
       AND clients.whatsapp_number = ?`,
      [clientWhatsapp]
    );
    return rows;
  }

  return [];
}

/**
 * Atualiza um produto. client só pode atualizar o próprio; admin/service
 * podem atualizar qualquer produto.
 * @param {{ client_id: number, user_role: string }} user
 * @param {number|string} id
 * @param {{ name, description, price, keywords, type }} data
 */
async function update(user, id, data) {
  const { client_id, user_role } = user;
  const { name, description, price, keywords, type } = data;

  let result;

  if (user_role === 'client') {
    [result] = await pool.query(
      `UPDATE products SET name = ?, description = ?, price = ?, keywords = ?, type = ? WHERE id = ? AND client_id = ?`,
      [name, description, price, keywords, type, id, client_id]
    );
  } else if (user_role === 'service' || user_role === 'admin') {
    [result] = await pool.query(
      `UPDATE products SET name = ?, description = ?, price = ?, keywords = ?, type = ? WHERE id = ?`,
      [name, description, price, keywords, type, id]
    );
  } else {
    throw new ServiceError('Acesso negado', 403);
  }

  if (result.affectedRows === 0) {
    throw new ServiceError('Erro ao atualizar produto.', 404);
  }

  return result;
}

/**
 * Remove um produto do cliente autenticado.
 * @param {{ client_id: number }} user
 * @param {number|string} id
 */
async function remove(user, id) {
  const { client_id } = user;

  await pool.query(`DELETE FROM products WHERE id = ? AND client_id = ?`, [id, client_id]);
  return true;
}

module.exports = {
  create,
  list,
  update,
  remove,
  ServiceError,
};
