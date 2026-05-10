require('dotenv').config({
  path: `.env.${process.env.NODE_ENV || 'local' }`
});

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});