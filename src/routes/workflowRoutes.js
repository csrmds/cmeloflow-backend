const express = require('express')
const router = express.Router()
const auth = require('../middleware/authMiddleware')
const controller = require ('../controllers/workflowController')

//endpoints para as TAGS
router.get('/tags', auth, controller.listTags) //list tags
router.post('/tags', auth, controller.createTag)
router.delete('/tags/:id', auth, controller.deleteTag)

//endpoint para consulta por clientId
router.get('/client/:id', auth, controller.listByClientId)

//endpoints para Workflows
router.get('/', auth, controller.list)
router.get('/:id', auth, controller.getById) //get workflow 
router.get('/:id/tags', auth, controller.getTags) //get tag do workflow
router.put('/:id/tags', auth, controller.setTags) //set tags do workflow




module.exports = router;