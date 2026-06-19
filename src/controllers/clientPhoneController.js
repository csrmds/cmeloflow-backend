const clientPhoneService = require('../services/clientPhoneService');

function handleError(res, err, fallbackMessage = 'Erro inesperado') {
	if (err instanceof clientPhoneService.ServiceError) {
		return res.status(err.statusCode).json({ error: err.message });
	}
	return res.status(500).json({ error: err.message ?? fallbackMessage });
}

// GET /clients/:clientId/phones
// Query param opcional: ?role=ai|human
exports.list = async (req, res) => {
	const { clientId } = req.params;
	const { role } = req.query;

	try {
		const rows = await clientPhoneService.list(clientId, { role });
		return res.json(rows);
	} catch (err) {
		return handleError(res, err);
	}
};

// GET /clients/:clientId/phones/:id
exports.getById = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		const phone = await clientPhoneService.getById(clientId, id);
		return res.json(phone);
	} catch (err) {
		return handleError(res, err);
	}
};

// POST /clients/:clientId/phones
exports.create = async (req, res) => {
	const { clientId } = req.params;

	try {
		const newPhone = await clientPhoneService.create(clientId, req.body);
		return res.status(201).json(newPhone);
	} catch (err) {
		return handleError(res, err);
	}
};

// PUT /clients/:clientId/phones/:id
exports.update = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		const updated = await clientPhoneService.update(clientId, id, req.body);
		return res.json(updated);
	} catch (err) {
		return handleError(res, err);
	}
};

// DELETE /clients/:clientId/phones/:id
exports.remove = async (req, res) => {
	const { clientId, id } = req.params;

	try {
		await clientPhoneService.remove(clientId, id);
		return res.json({ message: 'Telefone removido com sucesso' });
	} catch (err) {
		return handleError(res, err);
	}
};

// GET /clients/:clientId/phones/workflow-summary
// RN001 - usado durante configuração do workflow de WhatsApp
exports.workflowSummary = async (req, res) => {
	const { clientId } = req.params;

	try {
		const summary = await clientPhoneService.getWorkflowPhoneSummary(clientId);
		return res.json(summary);
	} catch (err) {
		return handleError(res, err);
	}
};
