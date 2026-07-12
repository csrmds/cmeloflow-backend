const calendarService = require('../services/googleCalendarService');
const response = require('../utils/response');
const { FRONTEND_URL } = require('../config/passport');

// ──────────────────────────────────────────────────────────────────────────
// Fluxo OAuth (frontend, autenticado com JWT do Cliente)
// ──────────────────────────────────────────────────────────────────────────

// GET /calendar/google/connect
exports.getConnectUrl = async (req, res) => {
	try {
		const url = calendarService.getAuthUrl(req.user.client_id);
		return response.success(res, { url }, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao gerar URL de conexão com Google');
	}
};

// GET /calendar/google/callback (redirect do Google — sem JWT, client_id vem do state)
exports.googleCallback = async (req, res) => {
	const { code, state, error } = req.query;

	if (error || !code || !state) {
		return res.redirect(`${FRONTEND_URL}/perfil?calendar_error=1`);
	}

	try {
		await calendarService.connectCalendar(code, state);
		return res.redirect(`${FRONTEND_URL}/perfil?calendar_connected=1`);
	} catch (err) {
		console.error('Erro ao conectar Google Calendar:', err.message);
		return res.redirect(`${FRONTEND_URL}/perfil?calendar_error=1`);
	}
};

// ──────────────────────────────────────────────────────────────────────────
// Gerenciamento de agendas (frontend, autenticado)
// ──────────────────────────────────────────────────────────────────────────

// GET /calendar/calendars
exports.listCalendars = async (req, res) => {
	try {
		const calendars = await calendarService.listCalendars(req.user.client_id);
		return response.success(res, calendars, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar agendas');
	}
};

// POST /calendar/default   body: { calendarId }
exports.setDefaultCalendar = async (req, res) => {
	try {
		const result = await calendarService.setDefaultCalendar(req.user.client_id, req.body.calendarId);
		return response.success(res, result, 'Agenda padrão atualizada', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao definir agenda padrão');
	}
};

// ──────────────────────────────────────────────────────────────────────────
// Eventos — frontend (autenticado, react-big-calendar)
// ──────────────────────────────────────────────────────────────────────────

// GET /calendar/events   query: timeMin, timeMax, calendarId?
exports.listEvents = async (req, res) => {
	const { timeMin, timeMax, calendarId } = req.query;

	if (!timeMin || !timeMax) {
		return response.error(res, 'timeMin e timeMax são obrigatórios', 400);
	}

	try {
		const events = await calendarService.listEvents(req.user.client_id, timeMin, timeMax, calendarId);
		return response.success(res, events, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao listar eventos');
	}
};

// PUT /calendar/events/:id
exports.updateEvent = async (req, res) => {
	try {
		const event = await calendarService.updateEvent(req.user.client_id, req.params.id, req.body);
		return response.success(res, event, 'Evento atualizado com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar evento');
	}
};

// DELETE /calendar/events/:id   query: calendarId?
exports.deleteEvent = async (req, res) => {
	try {
		await calendarService.deleteEvent(req.user.client_id, req.params.id, req.query.calendarId);
		return response.success(res, {}, 'Evento removido com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao remover evento');
	}
};

// ──────────────────────────────────────────────────────────────────────────
// Chamadas do N8N (sem JWT — internalAuth via x-api-key, client_id no body)
// ──────────────────────────────────────────────────────────────────────────

// POST /calendar/availability   body: { client_id, timeMin, timeMax, calendarId? }
exports.checkAvailability = async (req, res) => {
	const { client_id, timeMin, timeMax, calendarId } = req.body;

	if (!client_id || !timeMin || !timeMax) {
		return response.error(res, 'client_id, timeMin e timeMax são obrigatórios', 400);
	}

	try {
		const availability = await calendarService.getAvailability(client_id, timeMin, timeMax, calendarId);
		return response.success(res, availability, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar disponibilidade');
	}
};

// POST /calendar/events/create   body: { client_id, summary, description?, start, end, attendeeEmail?, calendarId? }
exports.createEventInternal = async (req, res) => {
	const { client_id, ...eventData } = req.body;

	if (!client_id) {
		return response.error(res, 'client_id é obrigatório', 400);
	}

	try {
		const event = await calendarService.createEvent(client_id, eventData);
		return response.success(res, event, 'Evento criado com sucesso', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar evento');
	}
};