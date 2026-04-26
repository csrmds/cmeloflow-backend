const pool = require('../config/database');

exports.upsertLead = async (req, res) => {
	const {
		instagram_user_id,
		instagram_scoped_userid,
		instagram_username,
		instagram_name,
		whatsapp_lead,
		whatsapp_client,
		event,
		message,
		source
	} = req.body;


	try {
		// Buscar client_id
		if (source=="whatsapp") {
			const [clients] = await pool.query(
				`SELECT id FROM clients WHERE whatsapp_number = ?`,
				[whatsapp_client]
			);	
		} else {
			const [clients] = await pool.query(
				`SELECT id FROM clients WHERE instagram_id = ?`,
				[instagram_user_id]
			);	
		}
		

		if (clients.length === 0) {
			return res.status(404).json({ error: 'Cliente não encontrado' });
		}

		const client_id = clients[0].id;

		// 1. Verifica se já existe
		if (source=="whatsapp") {
			const [rows] = await pool.query(
				`SELECT lead_id, client_id, client_instagram_username FROM vw_clients_leads 
				WHERE client_whatsapp_number = ? AND lead_whatsapp_number = ?`,
				[whatsapp_client, whatsapp_lead]
			);
		} else {
			const [rows] = await pool.query(
				`SELECT lead_id, client_id, client_instagram_username FROM vw_clients_leads 
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
				instagram_name,
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
					instagram_name,
					whatsapp_lead,
					message,
					message,
					source
				]
			);

			return res.json({ message: 'Lead criado', id: result.insertId });

		} else {
			// 3. Atualiza lead existente
			const lead = rows[0];

			const [result] = await pool.query(
				`UPDATE leads  SET last_message = ?, updated_at = NOW() WHERE id = ?`,
				[message, lead.lead_id]
			);
			//console.log("message no update: ", result, "LEAD ROW: ", rows[0])

			return res.json({ message: 'Lead atualizado', id: lead.lead_id });
		}

	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
};