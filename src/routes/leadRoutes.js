const express = require('express')
const router = express.Router()
const internalAuth = require('../middleware/internalAuth')
const auth = require('../middleware/authMiddleware')
const controller = require('../controllers/leadController')

//chamadas SEM auth (vai ser chamado pelo n8n) -> usa API-key no header das chamadas
router.post('/', internalAuth, controller.upsertLead)
router.post('/humanhandover', internalAuth, controller.updateHumanHandover)

//chamadas COM auth - chamadas pelo frontend - usa token de autenticação recebido no login
router.post('/create', auth, controller.insert)
router.get('/', auth, controller.list)
router.get('/:id', auth, controller.getById)
router.put('/:id', auth, controller.update)
router.delete('/:id', auth, controller.delete)

module.exports = router