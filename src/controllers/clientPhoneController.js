const clientPhoneService = require('../services/clientPhoneService');
const response = require('../utils/response');


// GET /clients/:clientId/phones
// Query param opcional: ?role=ai|human
exports.list = async (req, res) => {
	const { clientId } = req.params;
	const { role } = req.query;

	try {
		const rows = await clientPhoneService.list(clientId, { role });
		return response.success(res, rows, '', 200)
	} catch (err) {
		return response.handleError(res, err);
	}
};

// GET /clients/:clientId/phones/:id
exports.getById = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		const phone = await clientPhoneService.getById(clientId, id);
		return response.success(res, phone, '', 200)
	} catch (err) {
		return response.handleError(res, err);
	}
};

// POST /clients/:clientId/phones
exports.create = async (req, res) => {
	const { clientId } = req.params;

	try {
		const newPhone = await clientPhoneService.create(clientId, req.body);
		return response.success(res, newPhone, 'Telefone cadastrado com sucesso', 201)
	} catch (err) {
		return response.handleError(res, err);
	}
};

// PUT /clients/:clientId/phones/:id
exports.update = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		const updated = await clientPhoneService.update(clientId, id, req.body);
		return response.success(res, updated, 'Telefone atualizado com sucesso', 200)
	} catch (err) {
		return response.handleError(res, err);
	}
};

// DELETE /clients/:clientId/phones/:id
exports.remove = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		await clientPhoneService.remove(clientId, id);
		return response.success(res, {}, 'Telefone removido com sucesso', 204)
	} catch (err) {
		return response.handleError(res, err);
	}
};

// GET /clients/:clientId/phones/workflow-summary
// RN001 - usado durante configuração do workflow de WhatsApp
exports.workflowSummary = async (req, res) => {
	const { clientId } = req.params;

	try {
		const summary = await clientPhoneService.getWorkflowPhoneSummary(clientId);
		return response.success(res, summary, '', 200)
	} catch (err) {
		return response.handleError(res, err);
	}
};
