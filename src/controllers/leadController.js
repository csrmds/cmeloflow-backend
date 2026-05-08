const pool = require('../config/database')
const response = require('../utils/response')

exports.upsertLead = async (req, res) => {
	const {
		instagram_user_id,
		instagram_scoped_userid,
		instagram_username,
		lead_name,
		lead_whatsapp,
		client_whatsapp,
		event,
		message,
		source,
		notes
	} = req.body;


	try {
		let clients;
		let rows;

		// Buscar client_id
		if (source === "whatsapp") {
			[clients] = await pool.query(`SELECT id FROM clients WHERE whatsapp_number = ?`, [client_whatsapp] );
		} else {
			[clients] = await pool.query( `SELECT id FROM clients WHERE instagram_id = ?`, [instagram_user_id]);
		}

		if (clients.length === 0) {
			return res.status(404).json({ error: 'Cliente não encontrado' });
		}

		const client_id = clients[0].id;

		// 1. Verifica se já existe
		if (source === "whatsapp") {
			[rows] = await pool.query(
				`SELECT lead_id, client_id, client_instagram_username, lead_status, lead_human_handover FROM vw_clients_leads 
				WHERE client_whatsapp_number = ? AND lead_whatsapp_number = ?`,
				[client_whatsapp, lead_whatsapp]
			);
		} else {
			[rows] = await pool.query(
				`SELECT lead_id, client_id, client_instagram_username, lead_status, lead_human_handover FROM vw_clients_leads 
				WHERE client_instagram_id = ? AND lead_instagram_scoped_userid = ?`,
				[instagram_user_id, instagram_scoped_userid]
			);
		}


		if (rows.length === 0) {
			// 2. Cria novo lead
			const [result] = await pool.query(
				`INSERT INTO leads (
				client_id,
				instagram_scoped_userid,
				instagram_username,
				name,
				whatsapp_number,
				first_message,
				last_message,
				source,
				status,
				notes
        	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?)`,
				[
					client_id,
					instagram_scoped_userid,
					instagram_username,
					lead_name,
					lead_whatsapp,
					message,
					message,
					source,
					notes
				]
			);

			return res.json({ message: 'Lead criado', id: result.insertId, lead });

		} else {
			// 3. Atualiza lead existente
			const lead = rows[0];

			const [result] = await pool.query(
				`UPDATE leads  SET last_message = ?, updated_at = NOW() WHERE id = ?`,
				[message, lead.lead_id]
			);
			//console.log("message no update: ", result, "LEAD ROW: ", rows[0])

			return res.json({ message: 'Lead atualizado', id: lead.lead_id, lead });
		}

	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
};

exports.insert = async (req, res) => {
	console.log("leadController INSERT: ")
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const { 
		name,
		whatsapp_number,
		status,
		human_handover,
		notes,
	} = req.body

	try {
		let leadIsExist
		let result

		[leadIsExist] = await pool.query(`select * from leads where whatsapp_number = ? and client_id = ?`, [whatsapp_number, client_id])
		if (leadIsExist.length === 1) {
			return response.error(res, "Já existe um Lead cadastrado com esse número de Whatsapp.", 403)
		}

		[result] = await pool.query(`insert into leads (client_id, name, whatsapp_number, notes, status, human_handover, source) 
			values (?, ?, ?, ?, "novo", 1, "manual")`, [client_id, name, whatsapp_number, notes]
		)
		if (!result.insertId) {
			return response.error(res, "Erro ao criar novo Lead", 500)
		}

		return response.success(res, result, "Lead cadastrado com sucesso", 200)

	} catch(e) {
		console.log("erro catch: ", e)
		return response.error(res, "Erro ao criar novo Lead catch", 500, e)
	}
}

exports.list = async (req, res) => {
	//console.log("lead list controller: ", req.user)
	const client_id = req.user.client_id
	const user_role = req.user.user_role

	try {
		let rows

		if (user_role === "client") {
			[rows] = await pool.query(`select * from vw_clients_leads where client_id= ?`, [client_id])

		} else if (user_role === "admin") {
			[rows] = await pool.query(`select * from vw_clients_leads`)
		}

		res.json(rows);
	} catch (e) {
		res.status(500).json({ error: err.message })
	}
}

exports.getById = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const { id } = req.params

	try {
		let result

		if (user_role === "client") {
			[result] = await pool.query(`select * from leads where id= ? and client_id= ?`, [id, client_id])
		} else if (user_role === "admin") {
			[result] = await pool.query(`select * from leads where id= ?`, [id])
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Não foi possível encontrar o leads", result })
		}

		res.json(result)
	} catch(e) {
		res.status(500).json({ error: err.message })
	}
}

exports.update = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const { id } = req.params
	const {
		name,
		whatsapp_number,
		status,
		human_handover,
		notes
	} = req.body;

	try {
		let result

		if (user_role==="client") {
			[result] = await pool.query(`update leads set name = ?, whatsapp_number = ?, status = ?, human_handover = ?, notes = ?
				where id = ? and client_id = ? `, [name, whatsapp_number, status, human_handover, notes, id, client_id])
		} else if (user_role==="admin") {
			[result] = await pool.query(`update leads set name = ?, whatsapp_number = ?, status = ?, human_handover = ?, notes = ?
				where id = ? `, [name, whatsapp_number, status, human_handover, notes, id])
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Não foi possível atualizar a tabela leads", result })
		}

		return res.status(201).json({ result })
	} catch(e) {
		return res.status(400).json({ error: e })
	}
}

exports.delete = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const { id } = req.params

	try {
		let result
	
		if (user_role==="client") {
			[result] = await pool.query(`delete from leads where client_id = ? and id = ? `, [client_id, id])
		} else if (user_role==="admin") {
			[result] = await pool.query(`delete from leads where id = ?`, [id])
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Não foi possível deletar o lead", result })
		}

		return res.status(201).json({ result })
	} catch(e) {
		return res.status(400).json({ error: e })
	}
}

exports.updateHumanHandover = async (req, res) => {
	const handover = req.body.human_handover
	const client_id = req.body.client_id
	const lead_id = req.body.lead_id

	try {
		let result;

		[result] = await pool.query(`update leads set human_handover= ? where client_id= ? and id = ?`, [handover, client_id, lead_id])
		//console.log(mysql.format(`update leads set human_handover= ? where client_id= ? and id = ?`, [handover, client_id, lead_id]));

		if (result.length === 0) {
			return res.status(404).json({ error: "Não foi possível atualizar a tabela leads", result })
		}

		return res.status(201).json({ result })

	} catch (e) {
		return res.status(400).json({ error: e })
	}
}