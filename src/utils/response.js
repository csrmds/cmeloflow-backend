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

module.exports = { success, error };