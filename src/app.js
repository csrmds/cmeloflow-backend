const express = require('express');
const app = express();

//CORS config
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const leadRoutes = require('./routes/leadRoutes');
const clientRoutes = require('./routes/clientRoutes')


app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/leads', leadRoutes);
app.use('/clients', clientRoutes);


app.get('/teste', (req, res) => {
  res.send('meu teste asdasd');
})


module.exports = app;