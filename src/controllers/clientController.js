const pool = require('../config/database');

// GET /clients
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM clients ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /clients/:id
exports.getById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /clients
exports.create = async (req, res) => {
  const {
    name,
    email,
    instagram_id,
    instagram_username,
    instagram_name,
    instagram_photo,
    whatsapp_number,
    status,
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO clients 
        (name, email, instagram_id, instagram_username, instagram_name, instagram_photo, whatsapp_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, instagram_id, instagram_username, instagram_name, instagram_photo, whatsapp_number, status ?? null]
    );

    const [newClient] = await pool.query('SELECT * FROM clients WHERE id = ?', [result.insertId]);
    return res.status(201).json(newClient[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// PUT /clients/:id
exports.update = async (req, res) => {
  // console.log("client update controller: ", req.body)
  // console.log("req params: ", req.params.id)
  const id = req.params.id;
  const {
    name,
    email,
    instagram_id,
    instagram_username,
    instagram_name,
    instagram_photo,
    whatsapp_number,
    status,
    about,
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE clients SET
        name = ?, email = ?, instagram_id = ?, instagram_username = ?,
        instagram_name = ?, instagram_photo = ?, whatsapp_number = ?, status = ?, about = ?
       WHERE id = ?`,
      [name, email, instagram_id, instagram_username, instagram_name, instagram_photo, whatsapp_number, status, about, id]
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'Cliente não encontrado' });

    const [updated] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);
    return res.json(updated[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// DELETE /clients/:id
exports.remove = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json({ message: 'Cliente removido com sucesso' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
