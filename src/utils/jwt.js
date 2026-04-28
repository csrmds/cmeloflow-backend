const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      user_role: user.role,
      client_id: user.client_id
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { generateToken };