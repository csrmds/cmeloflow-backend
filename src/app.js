const express = require('express');
const app = express();

app.use(express.json());

const authRoutes = require('./routes/authRoutes');

app.use('/auth', authRoutes);

app.get('/teste', (req, res) => {
  res.send('meu teste');
})


module.exports = app;