const authService = require('../services/authService');

function handleError(res, err, fallbackMessage = 'Erro inesperado') {
  if (err instanceof authService.ServiceError) {
	 return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message ?? fallbackMessage });
}

exports.register = async (req, res) => {
  try {
	 const result = await authService.register(req.body);
	 return res.json(result);
  } catch (err) {
	 return handleError(res, err);
  }
};

exports.login = async (req, res) => {
  try {
	 const result = await authService.login(req.body);
	 return res.json(result);
  } catch (err) {
	 return handleError(res, err);
  }
};
