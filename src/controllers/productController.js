const pool = require('../config/database');

exports.create = async (req, res) => {
  const { name, description, price } = req.body;
  const client_id = req.user.client_id;

  try {
    const [result] = await pool.query(
      `INSERT INTO products (name, description, price, client_id)
       VALUES (?, ?, ?, ?)`,
      [name, description, price, client_id]
    );

    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.list = async (req, res) => {
  const client_id = req.user.client_id;

  try {
    const [rows] = await pool.query(
      `SELECT * FROM products WHERE client_id = ?`,
      [client_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, description, price } = req.body;
  const client_id = req.user.client_id;

  try {
    await pool.query(
      `UPDATE products 
       SET name = ?, description = ?, price = ?
       WHERE id = ? AND client_id = ?`,
      [name, description, price, id, client_id]
    );

    res.json({ message: 'Atualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const client_id = req.user.client_id;

  try {
    await pool.query(
      `DELETE FROM products WHERE id = ? AND client_id = ?`,
      [id, client_id]
    );

    res.json({ message: 'Removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};