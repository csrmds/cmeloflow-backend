const productService = require('../services/productService');
const response = require('../utils/response');

function handleError(res, err, fallbackMessage = 'Erro inesperado') {
  if (err instanceof productService.ServiceError) {
    return response.error(res, err.message, err.statusCode, err);
  }
  return response.error(res, fallbackMessage, 500, err);
}

exports.create = async (req, res) => {
  try {
    const result = await productService.create(req.user, req.body);
    return response.success(res, result, 'Produto criado com sucesso', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao criar produto');
  }
};

exports.list = async (req, res) => {
  try {
    //const clientWhatsapp = req.body?.client_whatsapp || null;
    const rows = await productService.list(req.user);
    return response.success(res, rows, 'Consulta realizada com sucesso', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao listar produtos');
  }
};

exports.getById = async (req, res) => {
	try {
		const result = await productService.getById(req.user, req.params.id)
		return response.success(res, result, 'Produto encontrado')
	} catch (err) {
		return handleError(res, err, 'Erro ao procurar o produto');
	}
}

exports.update = async (req, res) => {
  try {
    const result = await productService.update(req.user, req.params.id, req.body);
    return response.success(res, result, 'Produto atualizado com sucesso', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao atualizar produto');
  }
};

exports.remove = async (req, res) => {
  try {
    await productService.remove(req.user, req.params.id);
    return response.success(res, {}, 'Removido', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao remover produto');
  }
};