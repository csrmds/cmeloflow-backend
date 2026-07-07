const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');


async function list() {
	const [rows] = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
	return rows;
}

async function getById(id) {
	const [rows] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);

	if (!rows.length) {
		throw new ServiceError('Cliente não encontrado', 404);
	}

	return rows[0];
}

async function create(data) {
	const {
		name,
		email,
		instagram_id,
		instagram_username,
		instagram_name,
		instagram_photo,
		status,
	} = data;

	const [result] = await pool.query(
		`INSERT INTO clients 
      (name, email, instagram_id, instagram_username, instagram_name, instagram_photo, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[name, email, instagram_id, instagram_username, instagram_name, instagram_photo, status ?? null]
	);

	const [newClient] = await pool.query('SELECT * FROM clients WHERE id = ?', [result.insertId]);
	return newClient[0];
}

async function update(id, data) {
	const {
		name,
		email,
		instagram_id,
		instagram_username,
		instagram_name,
		instagram_photo,
		status,
		about,
	} = data;

	const [result] = await pool.query(
		`UPDATE clients SET
      name = ?, email = ?, instagram_id = ?, instagram_username = ?,
      instagram_name = ?, instagram_photo = ?, status = ?, about = ?
     WHERE id = ?`,
		[name, email, instagram_id, instagram_username, instagram_name, instagram_photo, status, about, id]
	);

	if (!result.affectedRows) {
		throw new ServiceError('Cliente não encontrado', 404);
	}

	const [updated] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);
	return updated[0];
}

async function remove(id) {
	const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [id]);

	if (!result.affectedRows) {
		throw new ServiceError('Cliente não encontrado', 404);
	}

	return true;
}

module.exports = {
	list,
	getById,
	create,
	update,
	remove,
	ServiceError,
};
