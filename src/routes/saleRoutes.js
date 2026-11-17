const express = require('express');
const router = express.Router();

const controller = require('../controllers/saleController');
const auth = require('../middleware/authMiddleware');
const internalAuth = require('../middleware/internalAuth');

//chamada SEM auth de usuário (n8n) -> usa API-key no header
router.post('/service/create', internalAuth, controller.createByService);

//chamadas COM auth - frontend
router.use(auth);
router.get('/dashboard', controller.dashboard);
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.put('/:id/finalize', controller.finalize);
router.put('/:id/cancel', controller.cancel);

module.exports = router;
