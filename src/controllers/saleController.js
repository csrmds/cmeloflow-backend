const saleService = require('../services/saleService');
const response = require('../utils/response');

exports.create = async (req, res) => {
	try {
		const result = await saleService.create(req.user, req.body);
		return response.success(res, result, 'Venda criada com sucesso', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar venda');
	}
};

exports.list = async (req, res) => {
	try {
		const rows = await saleService.list(req.user, req.query);
		return response.success(res, rows, 'Consulta realizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar vendas');
	}
};

exports.getById = async (req, res) => {
	try {
		const result = await saleService.getById(req.user, req.params.id);
		return response.success(res, result, 'Venda encontrada', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar venda');
	}
};

exports.update = async (req, res) => {
	try {
		const result = await saleService.update(req.user, req.params.id, req.body);
		return response.success(res, result, 'Venda atualizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar venda');
	}
};

exports.finalize = async (req, res) => {
	try {
		const result = await saleService.finalize(req.user, req.params.id, req.body);
		return response.success(res, result, 'Venda finalizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao finalizar venda');
	}
};

exports.cancel = async (req, res) => {
	try {
		const result = await saleService.cancel(req.user, req.params.id, req.body);
		return response.success(res, result, 'Venda cancelada', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao cancelar venda');
	}
};

exports.dashboard = async (req, res) => {
	try {
		const rows = await saleService.dashboard(req.user, req.query);
		return response.success(res, rows, 'Consulta realizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar dashboard de vendas');
	}
};

/**
 * Chamada pelo n8n (x-api-key): registra uma venda para um cliente.
 * Body: { client_id, lead_id?, source?, finalize?, payment_method?, items: [...] }
 */
exports.createByService = async (req, res) => {
	try {
		const { client_id } = req.body;
		const result = await saleService.create(
			{ client_id, user_role: 'service' },
			req.body
		);
		return response.success(res, result, 'Venda criada com sucesso', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar venda');
	}
};
