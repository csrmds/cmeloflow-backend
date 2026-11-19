const express = require('express')
const router = express.Router()
const auth = require('../middleware/authMiddleware')
const controller = require('../controllers/stageController')

router.use(auth)

router.get('/', controller.list)
router.post('/', controller.create)
router.put('/reorder', controller.reorder) // antes de /:id
router.put('/:id', controller.update)
router.delete('/:id', controller.remove)

module.exports = router
