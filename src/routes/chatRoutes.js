const express = require('express');
const router = express.Router();
const internalAuth = require('../middleware/internalAuth');
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/chatController');

// n8n grava mensagens de entrada/saída (x-api-key)
router.post('/messages/record', internalAuth, controller.recordMessage);
router.post('/messages/status', internalAuth, controller.updateStatus);

// Frontend (JWT)
router.get('/conversations', auth, controller.listConversations);
router.get('/conversations/:leadId/messages', auth, controller.getMessages);
router.post('/conversations/:leadId/messages', auth, controller.sendMessage);

module.exports = router;
