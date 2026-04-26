const express = require('express');
const app = express();

app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const leadRoutes = require('./routes/leadRoutes');


app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/leads', leadRoutes);


app.get('/teste', (req, res) => {
  res.send('meu teste asdasd');
})


module.exports = app;