const calendarService = require('../services/googleCalendarService');
const response = require('../utils/response');
const logger = require('../config/logger');
const { FRONTEND_URL } = require('../config/passport');

// ──────────────────────────────────────────────────────────────────────────
// Fluxo OAuth (frontend, autenticado com JWT do Cliente)
// ──────────────────────────────────────────────────────────────────────────

// GET /calendar/google/connect
exports.getConnectUrl = async (req, res) => {
	try {
		const url = calendarService.getAuthUrl(req.user.client_id);
		console.log("getConnectUrl: ", url)
		return response.success(res, { url }, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao gerar URL de conexão com Google');
	}
};

// GET /calendar/google/callback (redirect do Google — sem JWT, client_id vem do state)
exports.googleCallback = async (req, res) => {
	const { code, state, error } = req.query;

	if (error || !code || !state) {
		console.log("googleCallback error: ", error)
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

// GET /calendar/default
exports.getDefaultCalendar = async (req, res) => {
	try {
		const calendarId = await calendarService.getDefaultCalendarId(req.user.client_id);
		return response.success(res, { calendarId }, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar agenda padrão');
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
	logger.info('Calendar Controller - listEvents');
	const { timeMin, timeMax, calendarId } = req.query;
	logger.info({ params: req.body }, 'params');

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

// POST /calendar/lead-events   body: { client_id, lead_whatsapp, calendarId?, timeMin?, timeMax?, maxResults? }
exports.listEventsByLead = async (req, res) => {
	const client_id= req.user.client_id ?? req.body.client_id
	const { lead_whatsapp, calendarId, timeMin, timeMax, maxResults } = req.body;

	if (!client_id || !lead_whatsapp) {
		return response.error(res, 'client_id e lead_whatsapp são obrigatórios', 400);
	}

	try {
		const events = await calendarService.listEventsByLead(client_id, lead_whatsapp, {
			calendarId, timeMin, timeMax, maxResults,
		});
		return response.success(res, events, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar agendamentos do lead');
	}
};

// POST /calendar/events   body: { summary, description?, start, end, attendeeEmail?, calendarId? }
exports.createEvent = async (req, res) => {
	logger.info('Calendar Controller - createEvent');
	logger.info({ params: req.body }, 'params');
	try {
		const event = await calendarService.createEvent(req.user.client_id, req.body);
		return response.success(res, event, 'Evento criado com sucesso', 201);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao criar evento');
	}
};

// PUT /calendar/events/:id
exports.updateEvent = async (req, res) => {
	logger.info('Calendar Controller - updateEvent');
	logger.info({ params: req.body }, 'params');

	const client_id= req.user.client_id ?? req.body.client_id

	if (!client_id || !req.params.id ) {
		return response.erro(res, 'client_id, id são obrigatórios', 400)
	}

	try {
		const event = await calendarService.updateEvent(client_id, req.params.id, req.body);
		return response.success(res, event, 'Evento atualizado com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao atualizar evento');
	}
};

// DELETE /calendar/events/:id   query: calendarId?
exports.deleteEvent = async (req, res) => {
	logger.info('Calendar Controller - deleteEvent');
	logger.info({ params: req.body }, 'params');

	const client_id= req.user.client_id ?? req.body.client_id

	if (!client_id || !req.params.id || !req.query.calendarId) {
		return response.erro(res, 'client_id, id e calendarId são obrigatórios', 400)
	}

	try {
		const result= await calendarService.deleteEvent(client_id, req.params.id, req.query.calendarId);
		console.log("await calendarService.deleteEvent: ", result)
		return response.success(res, {}, 'Evento removido com sucesso', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao remover evento');
	}
};

// ──────────────────────────────────────────────────────────────────────────
// Chamadas do N8N (sem JWT — internalAuth via x-api-key, client_id no body)
// ──────────────────────────────────────────────────────────────────────────

// POST /calendar/agent/availability   body: { client_id, timeMin, timeMax, calendarId? }
exports.checkAvailability = async (req, res) => {
	logger.info('Calendar Controller - checkAvailability');
	const { client_id, timeMin, timeMax, calendarId } = req.body;
	logger.info({ params: req.body }, 'params');

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

// POST /calendar/agent/create   
// body: { client_id, summary, description?, start, end, attendeeEmail?, calendarId? }
exports.createEventInternal = async (req, res) => {
	logger.info('Calendar Controller - createEventInternal');
	const { client_id, ...eventData } = req.body;
	logger.info({ params: req.body }, 'params');

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

// POST /calendar/agent/next-available-slots
// body: { client_id, timeMin, timeMax, calendarId?, slotDurationMinutes?, businessHourStart?, businessHourEnd?, maxResults? }
exports.getNextAvailableSlots = async (req, res) => {
	logger.info('Calendar Controller - getNextAvailableSlots');
	const {
		client_id, timeMin, timeMax, calendarId,
		slotDurationMinutes, businessHourStart, businessHourEnd,
		maxResults, maxDaysLookahead,
	} = req.body;
	logger.info({ params: req.body }, 'params');

	if (!client_id || !timeMin || !timeMax) {
		return response.error(res, 'client_id, timeMin e timeMax são obrigatórios', 400);
	}

	try {
		const result = await calendarService.getNextAvailableSlots(
			client_id, timeMin, timeMax, calendarId,
			{ slotDurationMinutes, businessHourStart, businessHourEnd, maxResults, maxDaysLookahead }
		);
		return response.success(res, result, '', 200);
	} catch (err) {
		return response.handleError(res, err, 'Erro ao consultar próximos horários disponíveis');
	}
};