const pool = require('../config/database');

// GET /clients/:clientId/phones
// Query param opcional: ?role=ai|human
exports.list = async (req, res) => {
  const { clientId } = req.params;
  const { role } = req.query;

  const validRoles = ['ai', 'human'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role inválido. Use: ai | human' });
  }

  try {
    let query = 'SELECT * FROM client_phones WHERE client_id = ?';
    const params = [clientId];

    if (role) {
      query += ' AND role = ? AND active = 1';
      params.push(role);
    }

    query += ' ORDER BY is_primary DESC, created_at ASC';

    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /clients/:clientId/phones/:id
exports.getById = async (req, res) => {
  const { clientId, id } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM client_phones WHERE id = ? AND client_id = ?',
      [id, clientId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Telefone não encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /clients/:clientId/phones
exports.create = async (req, res) => {
  const { clientId } = req.params;
  const { phone_number, label, role = 'human', is_primary = 0, active = 1 } = req.body;

  if (!phone_number) return res.status(400).json({ error: 'phone_number é obrigatório' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Se is_primary = 1, tira o primary dos outros registros do mesmo client
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
    return res.status(201).json(newPhone[0]);
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// PUT /clients/:clientId/phones/:id
exports.update = async (req, res) => {
  const { clientId, id } = req.params;
  const { phone_number, label, role, is_primary, active } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Se is_primary = 1, tira o primary dos outros registros do mesmo client
    if (is_primary) {
      await conn.query(
        'UPDATE client_phones SET is_primary = 0 WHERE client_id = ? AND id != ?',
        [clientId, id]
      );
    }

    const [result] = await conn.query(
      `UPDATE client_phones SET
        phone_number = ?, label = ?, role = ?, is_primary = ?, active = ?
       WHERE id = ? AND client_id = ?`,
      [phone_number, label ?? null, role, is_primary, active, id, clientId]
    );

    await conn.commit();

    if (!result.affectedRows) return res.status(404).json({ error: 'Telefone não encontrado' });

    const [updated] = await pool.query(
      'SELECT * FROM client_phones WHERE id = ?',
      [id]
    );
    return res.json(updated[0]);
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// DELETE /clients/:clientId/phones/:id
exports.remove = async (req, res) => {
  const { clientId, id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM client_phones WHERE id = ? AND client_id = ?',
      [id, clientId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Telefone não encontrado' });
    return res.json({ message: 'Telefone removido com sucesso' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
