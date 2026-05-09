const pool = require('../config/database');
const response = require('../utils/response')

exports.create = async (req, res) => {
	const { name, description, price } = req.body;
	const client_id = req.user.client_id;

	try {
		const [result] = await pool.query(
			`INSERT INTO products (name, description, price, client_id) VALUES (?, ?, ?, ?)`,
			[name, description, price, client_id]
		);

		res.json({ id: result.insertId });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.list = async (req, res) => {
	const client_id = req.user.client_id;
	const user_role= req.user.user_role;
	const client_whatsapp = req.body?.client_whatsapp || null;
	//console.log("Log user client_id: ", req.user.user_role)

	try {
		let rows

		if (user_role==="client") {
			[rows] = await pool.query( `SELECT * FROM products WHERE client_id = ?`, [client_id] );
		} else if (user_role==="admin") {
			[rows] = await pool.query(
				`SELECT products.*, clients.name as client_name, clients.whatsapp_number as client_whatsapp_number
					FROM products 
					INNER JOIN clients
					ON products.client_id = clients.id`,
			);
		} else if (user_role === "service") {
			[rows] = await pool.query(
				`SELECT products.*, clients.name as client_name, clients.whatsapp_number as client_whatsapp_number
					FROM products 
					INNER JOIN clients
					ON products.client_id = clients.id
					and clients.whatsapp_number = ?`, [client_whatsapp]
			)
		}
		
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.update = async (req, res) => {
	console.log("productController update: ", req.body)
	console.log("user data: ", req.user)
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const { id } = req.params
	const { name, description, price, keywords, type } = req.body

	try {
		let result

		if (user_role === "client") {
			[result] = await pool.query(
				`UPDATE products  SET name = ?, description = ?, price = ?, keywords = ?, type = ? WHERE id = ? AND client_id = ?`,
				[name, description, price, keywords, type, id, client_id]
			)
		} else if (user_role === "service" || user_role === "admin" ) {
			[result] = await pool.query(
				`UPDATE products  SET name = ?, description = ?, price = ?, keywords = ?, type = ? WHERE id = ?`,
				[name, description, price, keywords, type, id]
			)
		}

		if (result.affectedRows === 0) {
			return response.error(res, "Erro ao atualizar produto.", 500, result)
		}

		return response.success(res, result, "Produto atualizado com sucesso", 200)
	} catch (err) {
		return response.error(res, "Erro ao atualizar produto.", 500, err)
	}
};

exports.remove = async (req, res) => {
	const { id } = req.params;
	const client_id = req.user.client_id;

	try {
		await pool.query( `DELETE FROM products WHERE id = ? AND client_id = ?`, [id, client_id] );

		res.json({ message: 'Removido' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};