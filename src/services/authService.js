const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/jwt');

class ServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Cria um novo usuário local (email/senha).
 * @param {{ email, password, client_id, name }} data
 */
async function register(data) {
  const { email, password, client_id, name } = data;

  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, client_id, name, provider)
     VALUES (?, ?, ?, ?, 'local')`,
    [email, hash, client_id, name]
  );

  return { message: 'Usuário criado' };
}

/**
 * Autentica um usuário local e retorna o token JWT.
 * @param {{ email, password }} data
 */
async function login(data) {
  const { email, password } = data;

  const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);
  const user = rows[0];

  if (!user) {
    throw new ServiceError('Usuário não encontrado', 400);
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    throw new ServiceError('Senha inválida', 400);
  }

  const token = generateToken(user);
  return { token };
}

module.exports = {
  register,
  login,
  ServiceError,
};
