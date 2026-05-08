const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/jwt');

exports.register = async (req, res) => {
	const { email, password, client_id, name } = req.body;

	try {
		const hash = await bcrypt.hash(password, 10);

		const [result] = await pool.query(
			`INSERT INTO users (email, password_hash, client_id, name, provider)
       VALUES (?, ?, ?, ?, 'local')`,
			[email, hash, client_id, name]
		);

		return res.json({ message: 'Usuário criado' });
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
};

exports.login = async (req, res) => {
	const { email, password } = req.body;

	try {
		const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);

		const user = rows[0];

		if (!user) {
			return res.status(400).json({ error: 'Usuário não encontrado' });
		}

		const valid = await bcrypt.compare(password, user.password_hash);

		if (!valid) {
			return res.status(400).json({ error: 'Senha inválida' });
		}

		const token = generateToken(user);

		return res.json({ token });
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
};