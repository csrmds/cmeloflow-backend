const express = require('express');
const app = express();

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