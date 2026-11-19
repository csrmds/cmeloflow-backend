const stageService = require('../services/stageService');
const response = require('../utils/response');

// GET /stages
exports.list = async (req, res) => {
	try {
		const rows = await stageService.list(req.user, req.query);
		return response.success(res, rows, 'Consulta realizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar raias');
	}
};

// POST /stages
exports.create = async (req, res) => {
	try {
		const result = await stageService.create(req.user, req.body);
		return response.success(res, result, 'Raia criada com sucesso', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar raia');
	}
};

// PUT /stages/reorder
exports.reorder = async (req, res) => {
	try {
		const result = await stageService.reorder(req.user, req.body);
		return response.success(res, result, 'Raias reordenadas', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao reordenar raias');
	}
};

// PUT /stages/:id
exports.update = async (req, res) => {
	try {
		const result = await stageService.update(req.user, req.params.id, req.body);
		return response.success(res, result, 'Raia atualizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar raia');
	}
};

// DELETE /stages/:id?move_to=ID
exports.remove = async (req, res) => {
	try {
		const result = await stageService.remove(req.user, req.params.id, req.query);
		return response.success(res, result, 'Raia removida com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao remover raia');
	}
};
