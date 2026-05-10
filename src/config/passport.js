const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
const { generateToken } = require('../utils/jwt');

const FRONTEND_URL =
	process.env.NODE_ENV === 'production'
		? 'https://cmeloflow.com.br'
		: 'http://localhost:3001';



passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			callbackURL: process.env.GOOGLE_CALLBACK_URL,
		},
		async (accessToken, refreshToken, profile, done) => {
			try {
				const googleId = profile.id;
				const email = profile.emails?.[0]?.value ?? null;
				const name = profile.displayName ?? null;

				// console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL);
				// console.log("passport FRONTEND_URL: ", FRONTEND_URL)

				// 1. Tenta encontrar pelo provider_user_id
				let [rows] = await pool.query( `SELECT * FROM users WHERE provider = 'google' AND provider_user_id = ?`, [googleId] );

				let user = rows[0];

				// 2. Se não encontrou pelo provider_user_id, tenta pelo e-mail
				if (!user && email) {
					[rows] = await pool.query( `SELECT * FROM users WHERE email = ?`, [email] );
					user = rows[0];

					// Vincula o provider ao usuário existente
					if (user) {
						await pool.query( `UPDATE users SET provider = 'google', provider_user_id = ? WHERE id = ?`, [googleId, user.id] );
					}
				}

				// 3. Se ainda não existe, cria um novo usuário
				// client_id = 1 é um fallback; ajuste conforme sua regra de negócio
				if (!user) {
					const [resultClient] = await pool.query(`insert into clients (name, email, status)
						values (?, ?, "inativo")`,
						[name, email])
					const clientId= resultClient.insertId

					const [result] = await pool.query(
						`INSERT INTO users (email, name, provider, provider_user_id, client_id, role)
             		VALUES (?, ?, 'google', ?, ?, 'client')`,
						[email, name, googleId, clientId]
					);

					[rows] = await pool.query( `SELECT * FROM users WHERE id = ?`, [result.insertId] );
					user = rows[0];
				}

				return done(null, user);
			} catch (err) {
				return done(err, null);
			}
		}
	)
);

// Necessário pelo Passport, mas não usamos sessão — só JWT
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, { id }));

module.exports = { passport, FRONTEND_URL };
