const express = require('express');
const router = express.Router();
const internalAuth = require('../middleware/internalAuth');
const controller = require('../controllers/leadController');

// ⚠️ SEM auth (vai ser chamado pelo n8n)
router.post('/', internalAuth, controller.upsertLead);

module.exports = router;