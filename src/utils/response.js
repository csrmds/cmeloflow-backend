const ServiceError = require('./ServiceError');
const logger = require('../config/logger');

const handleError = (res, err, fallbackMessage = 'Erro inesperado') => {
	logger.error({ err }, fallbackMessage);
	if (err instanceof ServiceError) {
		return error(res, err.message, err.statusCode, err);
	}
	return error(res, fallbackMessage, 500, err);
};

const success = (res, data = {}, message = "Sucesso", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
};

const error = (res, message = "Erro inesperado", statusCode = 500, err = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: err?.message ?? err ?? null
  });
};

module.exports = { success, error, handleError };