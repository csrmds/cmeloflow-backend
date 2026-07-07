const clientService = require('../services/clientService');
const response = require('../utils/response');

// GET /clients
exports.list = async (req, res) => {
  try {
	 const rows = await clientService.list();
	 return response.success(res, rows, 'Lista consultada com sucesso', 200)
  } catch (err) {
	 return response.handleError(res, err, 'Erro ao listar clientes');
  }
};

// GET /clients/:id
exports.getById = async (req, res) => {
  try {
	 const client = await clientService.getById(req.params.id);
	 return response.success(res, client, 'Cliente consultado com sucesso', 200)
  } catch (err) {
	 return response.handleError(res, err, 'Erro ao consultar cliente');
  }
};

// POST /clients
exports.create = async (req, res) => {
  try {
	 const newClient = await clientService.create(req.body);
	 //return res.status(201).json(newClient);
	 return response.success(res, newCliente, 'Cliente cadastrado com sucesso', 201)
  } catch (err) {
	 return response.handleError(res, err, 'Erro ao criar cliente');
  }
};

// PUT /clients/:id
exports.update = async (req, res) => {
  try {
	 const updated = await clientService.update(req.params.id, req.body);
	 return response.success(res, updated, 'Cliente atualizado com sucesso', 200)
  } catch (err) {
	 return response.handleError(res, err, 'Erro ao atualizar cliente');
  }
};

// DELETE /clients/:id
exports.remove = async (req, res) => {
  try {
	 await clientService.remove(req.params.id);
	 //return res.json({ message: 'Cliente removido com sucesso' });
	 return response.success(res, {}, 'Cliente removido com sucesso', 204)
  } catch (err) {
	 return response.handleError(res, err, 'Erro ao remover cliente');
  }
};
