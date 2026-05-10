const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { passport, FRONTEND_URL } = require('../config/passport')
const { generateToken } = require('../utils/jwt')

// Rotas locais (email/senha)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Inicia o fluxo OAuth com o Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }))

// Callback — Google redireciona aqui após autenticação
router.get('/google/callback', passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login?error=oauth`, session: false }),
	(req, res) => {
		const token = generateToken(req.user);
		res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`)
	}
)

module.exports = router;