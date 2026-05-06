const pool = require('../config/database');

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
		source
	} = req.body;


	try {
		let clients;
		let rows;
		
		// Buscar client_id
		if (source==="whatsapp") {
			[clients] = await pool.query(
				`SELECT id FROM clients WHERE whatsapp_number = ?`,
				[client_whatsapp]
			);	
		} else {
			[clients] = await pool.query(
				`SELECT id FROM clients WHERE instagram_id = ?`,
				[instagram_user_id]
			);	
		}
		
		

		if (clients.length === 0) {
			return res.status(404).json({ error: 'Cliente não encontrado' });
		}

		const client_id = clients[0].id;

		// 1. Verifica se já existe
		if (source==="whatsapp") {
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
				status
        	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'novo')`,
				[
					client_id,
					instagram_scoped_userid,
					instagram_username,
					lead_name,
					lead_whatsapp,
					message,
					message,
					source
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

exports.updateHumanHandover= async (req, res) => {
	const handover= req.body.human_handover
	const client_id= req.body.client_id
	const lead_id= req.body.lead_id

	console.log("humandhandover req: ", req.body)

	try {
		let result;
		//const sql= `update leads set human_handover= ? where client_id= ? `, [handover, client_id]
		//console.log("SQL: ", sql)
		
		[result] = await pool.query(`update leads set human_handover= ? where client_id= ? and id = ?`, [handover, client_id, lead_id])
		//console.log("human handover: ", result, "SQL: ", sql)

		if (result.length===0) {
			return res.status(404).json({error: "Não foi possível atualizar a tabela leads", result})
		}

		return res.status(201).json({result})
		
	} catch(e) {
		return res.status(400).json({error: e })
	}
}