const sessionService = require('../services/sessionService');
const response = require('../utils/response');


// POST /session/init
exports.init = async (req, res) => {
  try {
    const result = await sessionService.init(req.body);
    return response.success(res, result, 'Sessão iniciada com sucesso', 200);
  } catch (err) {
    return response.handleError(res, err);
  }
};
