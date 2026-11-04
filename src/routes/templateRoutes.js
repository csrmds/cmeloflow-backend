const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/templateController');

router.get('/', auth, controller.list);
router.post('/', auth, controller.create);

module.exports = router;
