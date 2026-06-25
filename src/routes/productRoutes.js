const express = require('express');
const router = express.Router();

const controller = require('../controllers/productController');
const auth = require('../middleware/authMiddleware');

router.use(auth);

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;