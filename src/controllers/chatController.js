const chatService = require('../services/chatService');
const response = require('../utils/response');

// GET /chat/conversations
exports.listConversations = async (req, res) => {
	try {
		const rows = await chatService.listConversations(req.user.client_id);
		return response.success(res, rows, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar conversas');
	}
};

// GET /chat/conversations/:leadId/messages?after=ID
exports.getMessages = async (req, res) => {
	try {
		const rows = await chatService.getMessages(req.user.client_id, req.params.leadId, req.query.after);
		return response.success(res, rows, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao buscar mensagens');
	}
};

// POST /chat/conversations/:leadId/messages   body: { body }
exports.sendMessage = async (req, res) => {
	try {
		const msg = await chatService.sendMessage(req.user.client_id, req.params.leadId, req.body.body);
		return response.success(res, msg, 'Mensagem enviada', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao enviar mensagem');
	}
};

// POST /chat/messages/record  (n8n via x-api-key)
exports.recordMessage = async (req, res) => {
	try {
		const result = await chatService.recordMessage(req.body);
		return response.success(res, result, 'Mensagem registrada', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao registrar mensagem');
	}
};

// POST /chat/messages/status  (n8n via x-api-key)
exports.updateStatus = async (req, res) => {
	try {
		const result = await chatService.updateStatus(req.body);
		return response.success(res, result, 'Status processado', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar status da mensagem');
	}
};
