const express = require('express');
const session = require('express-session');
const pinoHttp = require('pino-http');
const logger = require('./config/logger');
const { passport } = require('./config/passport')
const app = express();
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const leadRoutes = require('./routes/leadRoutes');
const clientRoutes = require('./routes/clientRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const sessionRoutes = require('./routes/sessionRoutes')
const calendarRoutes = require('./routes/calendarRoutes')

//CONFIG LOGGER
//app.use(pinoHttp({ logger }));

//CONFIG CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

//CONFIG PASSPORT
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }))
app.use(passport.initialize())


app.use(express.json());


app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/leads', leadRoutes);
app.use('/clients', clientRoutes);
app.use('/workflow', workflowRoutes);
app.use('/session', sessionRoutes)
app.use('/calendar', calendarRoutes)


app.get('/teste', (req, res) => {
  res.send('meu teste asdasd');
})


module.exports = app;