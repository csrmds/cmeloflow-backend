const clientService = require('../services/clientService');

function handleError(res, err, fallbackMessage = 'Erro inesperado') {
  if (err instanceof clientService.ServiceError) {
	 return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message ?? fallbackMessage });
}

// GET /clients
exports.list = async (req, res) => {
  try {
	 const rows = await clientService.list();
	 return res.json(rows);
  } catch (err) {
	 return handleError(res, err);
  }
};

// GET /clients/:id
exports.getById = async (req, res) => {
  try {
	 const client = await clientService.getById(req.params.id);
	 return res.json(client);
  } catch (err) {
	 return handleError(res, err);
  }
};

// POST /clients
exports.create = async (req, res) => {
  try {
	 const newClient = await clientService.create(req.body);
	 return res.status(201).json(newClient);
  } catch (err) {
	 return handleError(res, err);
  }
};

// PUT /clients/:id
exports.update = async (req, res) => {
  try {
	 const updated = await clientService.update(req.params.id, req.body);
	 return res.json(updated);
  } catch (err) {
	 return handleError(res, err);
  }
};

// DELETE /clients/:id
exports.remove = async (req, res) => {
  try {
	 await clientService.remove(req.params.id);
	 return res.json({ message: 'Cliente removido com sucesso' });
  } catch (err) {
	 return handleError(res, err);
  }
};
