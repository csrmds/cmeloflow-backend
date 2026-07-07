const { default: axios, options } = require('axios')
const pool = require('../config/database');
const response = require('../utils/response')
const clientWorkflowService = require('../services/clientWorkflowService')
const n8nSubDomain = process.env.N8N_SUBDOMAIN
const domainPublicName = process.env.DOMAIN_PUBLIC_NAME
const n8nApiKey = process.env.N8N_APIKEY


exports.listByClientId = async (req, res) => {
	console.log("workflow controller listByClientId: ")
	console.log("req Param: ", req.params)
	const clientId = req.params.id
	const user_role = req.user.user_role

	if (user_role !== "admin") {
		return response.error(res, "Acesso negado", 401)
	}

	try {
		const rows = await clientWorkflowService.listByClientId(clientId)
		if (rows.length === 0) {
			return response.success(res, [], "Não foi encontrado workflows para esse cliente.", 200)
		}
		return response.success(res, rows, "Consulta realizada com sucesso.", 200)
	} catch (e) {
		return response.handleError(res, e, "Erro ao consultar workflows.")
	}
}

exports.addWorkflowClient = async (req, res) => {
	console.log("workflow controller addWorkflowClient: ")
	const user_role = req.user.user_role

	if (user_role !== "admin") {
		return response.error(res, "Acesso negado", 401)
	}

	try {
		const result = await clientWorkflowService.addWorkflowClient(req.body)
		return response.success(res, result, "Workflow adicionado ao cliente com sucesso", 200)
	} catch (e) {
		return response.handleError(res, e, "Erro ao adicionar workflow para o cliente.")
	}
}

exports.deleteWorkflowClient = async (req, res) => {
	console.log("workflow controller deleteWorkflowClient: ")
	const workflowId = req.params.id
	const user_role = req.user.user_role

	if (user_role !== "admin") {
		return response.error(res, "Acesso negado", 401)
	}

	try {
		const result = await clientWorkflowService.deleteWorkflowClient(workflowId)
		return response.success(res, result, "Workflow deletado com sucesso", 200)
	} catch (e) {
		return response.handleError(res, e, "Erro ao deletar workflow do cliente.")
	}
}

exports.verifyWorkflowClient = async (req, res) => {
	console.log("\nworkflow controller verifyWorkflowClient: ")
	const user_role = req.user.user_role
	console.log("req body: ", req.body)
	console.log("req user: ", req.user)

	if (user_role !== "admin" && user_role !== "service") {
		return response.error(res, "Acesso negado", 401)
	}

	try {
		const result = await clientWorkflowService.verifyWorkflowClient(req.body)
		return response.success(res, result, "Consulta realizada com sucesso", 200)
	} catch (e) {
		return response.handleError(res, e, "Erro ao verificar workflow do cliente.")
	}
}

// ──────────────────────────────────────────────────────────────────────────
// As funções abaixo são integração direta com a API do n8n (axios), não
// regra de negócio local — por isso permanecem no controller, sem service.
// ──────────────────────────────────────────────────────────────────────────

exports.list = async (req, res) => {
	console.log("\nworkflow controller list: ")
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const axiosOptions = {
		method: 'GET',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/workflows`,
		params: { active: 'true', tags: 'published', },
		headers: { 'x-n8n-api-key': n8nApiKey}
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			console.log("data result: ", data.data)

			return response.success(res, data.data, "Consulta realizada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao consultar workflows", 500, e)
		}
		
	} else {
		return response.error(res, "Acesso negado", 401)
	}

}


exports.getById = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const workflowId= req.params.id || null
	const axiosOptions = {
		method: 'GET',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/workflows/${workflowId}`,
		params: { excludePinnedData: 'true' },
		headers: { 'x-n8n-api-key': n8nApiKey}
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Consulta realizada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao consultar workflow", 500, e)
		}

	} else {
		return response.error(res, "Acesso negado", 401)
	}

}


exports.getTags = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const workflowId= req.params.workflowId || null
	const axiosOptions = {
		method: 'GET',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/workflows/${workflowId}/tags`,
		headers: { 'x-n8n-api-key': n8nApiKey}
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Consulta realizada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao consultar tags no workflow", 500, e)
		}
		
	} else {
		return response.error(res, "Acesso negado", 401)
	}
}


exports.setTags = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const workflowId= req.params.id || null
	const tags= req.params.tags
	const axiosOptions = {
		method: 'PUT',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/workflows/${workflowId}/tags`,
		headers: {
			'Content-Type': 'application/json',
			'x-n8n-api-key': n8nApiKey
		},
		body: { data: [ tags ] }
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Atualização realizada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao atualizar tags no workflow", 500, e)
		}

	} else {
		return response.error(res, "Acesso negado", 401)
	}

}


exports.listTags = async (req, res) => {
	console.log("\n\nworkflow controller listTags: ", req.user)
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const axiosOptions = {
		method: 'GET',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/tags`,
		params: {
			limit: '100',
		},
		headers: { 'x-n8n-api-key': n8nApiKey }
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Consulta realizada com sucesso.", 200)
		} catch(e) {
			console.log("catch e", e)
			return response.error(res, "Erro ao listar tags.", 500, e)
		}

	} else {
		return response.error(res, "Acesso negado", 401)
	}

}


exports.createTag = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const tagName= req.params.tagName
	const axiosOptions = {
		method: 'POST',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/tags`,
		headers: {
			'Content-Type': 'application/json',
			'x-n8n-api-key': n8nApiKey
		},
		data: { name: tagName }
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Tag cadastrada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao cadastrar a tag", 500, e)
		}

	} else {
		return response.error(res, "Acesso negado", 401)
	}

}

exports.deleteTag = async (req, res) => {
	const client_id = req.user.client_id
	const user_role = req.user.user_role
	const tagId = req.params.tagId
	const axiosOptions = {
		method: 'DELETE',
		url: `https://${n8nSubDomain}.${domainPublicName}/api/v1/tags/${tagId}`,
		headers: { 'x-n8n-api-key': n8nApiKey }
	}

	if (user_role === "admin") {

		try {
			const { data }  = await axios.request(axiosOptions)
			return response.success(res, data.data, "Tag deletada com sucesso.", 200)
		} catch(e) {
			return response.error(res, "Erro ao deletar tag", 500, e)
		}

	} else {
		return response.error(res, "Acesso negado", 401)
	}
}
