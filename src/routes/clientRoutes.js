const express = require('express');
const router = express.Router();

const clientController = require('../controllers/clientController');
const clientPhoneController = require('../controllers/clientPhoneController');
const auth = require('../middleware/authMiddleware');

router.use(auth);

// Clients
router.get('/', clientController.list);
router.get('/:id', clientController.getById);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.delete('/:id', clientController.remove);

// Client Phones (nested)
router.get('/:clientId/phones', clientPhoneController.list);         // ?role=ai|human
router.get('/:clientId/phones/:id', clientPhoneController.getById);
router.post('/:clientId/phones', clientPhoneController.create);
router.put('/:clientId/phones/:id', clientPhoneController.update);
router.delete('/:clientId/phones/:id', clientPhoneController.remove);

module.exports = router;
