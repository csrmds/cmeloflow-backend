const pool = require('../config/database');

class ServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Lista os workflows vinculados a um cliente (tabela local client_workflows,
 * não é a lista de workflows do n8n).
 * @param {number|string} clientId
 */
async function listByClientId(clientId) {
  const [rows] = await pool.query(
    `SELECT * FROM client_workflows WHERE client_id = ?`,
    [clientId]
  );
  return rows;
}

/**
 * Vincula um workflow do n8n a um cliente.
 * @param {{ workflowId: string, clientId: number, workflowName?: string }} data
 */
async function addWorkflowClient(data) {
  const { workflowId, clientId, workflowName } = data;

  const [result] = await pool.query(
    `INSERT INTO client_workflows (client_id, workflow_id, workflow_name, active)
     VALUES (?, ?, ?, '1')`,
    [clientId, workflowId, workflowName]
  );

  if (result.affectedRows === 0) {
    throw new ServiceError('Erro ao adicionar workflow para o cliente.', 400);
  }

  return result;
}

/**
 * Remove o vínculo de um workflow com um cliente.
 * @param {number|string} clientWorkflowId - id da linha em client_workflows (não é o workflow_id do n8n)
 */
async function deleteWorkflowClient(clientWorkflowId) {
  const [result] = await pool.query(
    `DELETE FROM client_workflows WHERE id = ?`,
    [clientWorkflowId]
  );

  if (result.affectedRows === 0) {
    throw new ServiceError('Erro ao deletar workflow do cliente.', 400);
  }

  return result;
}

/**
 * RN001-adjacent: verifica se um cliente possui um workflow específico
 * vinculado, ativo, no telefone principal. Usado pelo n8n/service role
 * antes de processar uma mensagem.
 * @param {{ workflowId: string, clientWhatsapp: string }} data
 */
async function verifyWorkflowClient(data) {
  const { workflowId, clientWhatsapp } = data;

  const [result] = await pool.query(
    `SELECT * FROM vw_client_phones_workflows
     WHERE c_phones_number = ? AND c_workflow_n8n_id = ? AND c_phones_is_primary = ? AND c_status = ? LIMIT 1`,
    [clientWhatsapp, workflowId, 1, 'ativo']
  );

  return result;
}

module.exports = {
  listByClientId,
  addWorkflowClient,
  deleteWorkflowClient,
  verifyWorkflowClient,
  ServiceError,
};
