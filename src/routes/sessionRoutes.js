const express = require('express');
const router = express.Router();
//const internalAuth = require('../middleware/internalAuth');
const auth = require('../middleware/authMiddleware')
const controller = require('../controllers/sessionController');

// Chamado pelo N8N com x-api-key no header
//router.post('/init', internalAuth, controller.init);
router.post('/init', auth, controller.init);

module.exports = router;
