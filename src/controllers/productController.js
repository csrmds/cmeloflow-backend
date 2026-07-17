const productService = require('../services/productService');
const response = require('../utils/response');


exports.create = async (req, res) => {
	try {
		const result = await productService.create(req.user, req.body);
		return response.success(res, result, 'Produto criado com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar produto');
	}
};

exports.list = async (req, res) => {
	console.log("\n\nProduct Controller")
	try {
		console.log("req user: ", req.user)
		const rows = await productService.list(req.user);
		return response.success(res, rows, 'Consulta realizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar produtos');
	}
};

exports.getById = async (req, res) => {
	console.log("Product Controller getById: ")
	try {
		const result = await productService.getById(req.user, req.params.id)
		console.log("result: ", result[0])
		return response.success(res, result[0], 'Produto encontrado', 200)
	} catch (err) {
		return response.handleError(res, err, 'Erro ao procurar o produto');
	}
}

exports.update = async (req, res) => {
	try {
		const result = await productService.update(req.user, req.params.id, req.body);
		return response.success(res, result, 'Produto atualizado com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar produto');
	}
};

exports.remove = async (req, res) => {
	try {
		await productService.remove(req.user, req.params.id);
		return response.success(res, {}, 'Removido', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao remover produto');
	}
};


exports.listByClientId = async (req, res) => {
	console.log("\n\nProduct Controller - listByClientId")
	try {
		//console.log("req: ", req.body)
		const rows = await productService.list(req.body.user);
		return response.success(res, rows, 'Consulta realizada com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar produtos');
	}
};