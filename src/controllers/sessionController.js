const sessionService = require('../services/sessionService');
const response = require('../utils/response');

function handleError(res, err, fallbackMessage = 'Erro ao iniciar sessão') {
  if (err instanceof sessionService.ServiceError) {
    return response.error(res, err.message, err.statusCode, err);
  }
  return response.error(res, fallbackMessage, 500, err);
}

// POST /session/init
exports.init = async (req, res) => {
  try {
    const result = await sessionService.init(req.body);
    return response.success(res, result, 'Sessão iniciada com sucesso', 200);
  } catch (err) {
    return handleError(res, err);
  }
};
