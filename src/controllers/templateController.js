const templateService = require('../services/templateService');
const response = require('../utils/response');

// Cliente usa o próprio client_id; admin pode consultar outro cliente via ?client_id=
const resolveClientId = (req) => {
	const isAdmin = req.user?.user_role === 'admin' || req.user?.role === 'admin';
	const fromQuery = Number(req.query.client_id);
	return isAdmin && fromQuery ? fromQuery : req.user.client_id;
};

// GET /templates
exports.list = async (req, res) => {
	try {
		const rows = await templateService.list(resolveClientId(req));
		return response.success(res, rows, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar modelos');
	}
};

// POST /templates   body: { name, category, language?, body, footer?, examples? }
exports.create = async (req, res) => {
	try {
		const result = await templateService.create(resolveClientId(req), req.body);
		return response.success(res, result, 'Modelo enviado para aprovação da Meta', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar modelo');
	}
};
