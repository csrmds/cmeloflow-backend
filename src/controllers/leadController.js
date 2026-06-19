const leadService = require('../services/leadService');
const response = require('../utils/response');

function handleError(res, err, fallbackMessage = 'Erro inesperado') {
  if (err instanceof leadService.ServiceError) {
    return response.error(res, err.message, err.statusCode, err);
  }
  return response.error(res, fallbackMessage, 500, err);
}

// POST /leads  (chamado pelo n8n via x-api-key — sempre WhatsApp no MVP)
exports.upsertLead = async (req, res) => {
  try {
    const result = await leadService.upsertLead(req.body);
    const message = result.created ? 'Lead criado' : 'Lead atualizado';
    return res.json({ message, id: result.id, lead: result.lead });
  } catch (err) {
    return handleError(res, err, 'Erro ao processar lead');
  }
};

// POST /leads/create  (frontend, autenticado)
exports.insert = async (req, res) => {
  try {
    const result = await leadService.insert(req.user, req.body);
    return response.success(res, result, 'Lead cadastrado com sucesso', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao criar novo Lead');
  }
};

// GET /leads
exports.list = async (req, res) => {
  try {
    const rows = await leadService.list(req.user);
    return res.json(rows);
  } catch (err) {
    return handleError(res, err, 'Erro ao listar leads');
  }
};

// GET /leads/:id
exports.getById = async (req, res) => {
  try {
    const result = await leadService.getById(req.user, req.params.id);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Erro ao buscar lead');
  }
};

// PUT /leads/:id
exports.update = async (req, res) => {
  try {
    const result = await leadService.update(req.user, req.params.id, req.body);
    return response.success(res, result, 'Lead atualizado com sucesso.', 200);
  } catch (err) {
    return handleError(res, err, 'Erro ao atualizar lead');
  }
};

// DELETE /leads/:id
exports.delete = async (req, res) => {
  try {
    const result = await leadService.remove(req.user, req.params.id);
    return res.status(201).json({ result });
  } catch (err) {
    return handleError(res, err, 'Erro ao deletar lead');
  }
};

// POST /leads/humanhandover  (chamado pelo n8n via x-api-key)
exports.updateHumanHandover = async (req, res) => {
  try {
    const result = await leadService.updateHumanHandover(req.body);
    return res.status(201).json({ result });
  } catch (err) {
    return handleError(res, err, 'Erro ao atualizar atendimento humano');
  }
};