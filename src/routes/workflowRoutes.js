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
router.post('/client', auth, controller.addWorkflowClient)
router.delete('/client/:id', auth, controller.deleteWorkflowClient)
router.post('/client/verify-workflow/', auth, controller.verifyWorkflowClient)

//endpoints para Workflows
router.get('/', auth, controller.list) //list workflows
router.get('/:id', auth, controller.getById) //get workflow by id 
router.get('/:id/tags', auth, controller.getTags) //get tag do workflow
router.put('/:id/tags', auth, controller.setTags) //set tags do workflow




module.exports = router;