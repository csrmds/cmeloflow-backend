const { google } = require('googleapis');
const pool = require('../config/database');
const ServiceError = require('../utils/ServiceError');
const { encrypt, decrypt } = require('../utils/tokenCrypto');

const SCOPES = [
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/userinfo.email',
	'https://www.googleapis.com/auth/userinfo.profile',
];

function newOAuthClient() {
	return new google.auth.OAuth2(
		process.env.GOOGLE_CALENDAR_CLIENT_ID,
		process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
		process.env.GOOGLE_CALENDAR_CALLBACK_URL
	);
}

function toMysqlDatetime(epochMs) {
	if (!epochMs) return null;
	return new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Gera a URL de consentimento do Google para o Cliente conectar a agenda.
 * O clientId vai no `state` para recuperarmos no callback.
 * @param {number|string} clientId
 */
function getAuthUrl(clientId) {
	console.log("\n\nCalendar Service - getAuthUrl")
	const oauth2Client = newOAuthClient();

	return oauth2Client.generateAuthUrl({
		access_type: 'offline', // necessário para vir refresh_token
		prompt: 'consent',      // força reemissão do refresh_token mesmo se já autorizou antes
		scope: SCOPES,
		state: String(clientId),
	});
}

/**
 * Troca o `code` do callback OAuth pelos tokens e salva (criptografados) no banco.
 * @param {string} code
 * @param {number|string} clientId
 */
async function connectCalendar(code, clientId) {
	console.log("\n\nCalendar Service - connectCalendar")
	const oauth2Client = newOAuthClient();
	const { tokens } = await oauth2Client.getToken(code);

	if (!tokens.refresh_token) {
		throw new ServiceError(
			'Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente novamente.',
			400
		);
	}

	oauth2Client.setCredentials(tokens);
	const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
	const { data: profile } = await oauth2.userinfo.get();

	await pool.query(
		`INSERT INTO client_calendar_credentials
			(client_id, provider, google_account_email, access_token, refresh_token, token_expiry, scope)
		 VALUES (?, 'google', ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE
			google_account_email = VALUES(google_account_email),
			access_token = VALUES(access_token),
			refresh_token = VALUES(refresh_token),
			token_expiry = VALUES(token_expiry),
			scope = VALUES(scope),
			updated_at = NOW()`,
		[
			clientId,
			profile.email ?? null,
			encrypt(tokens.access_token),
			encrypt(tokens.refresh_token),
			toMysqlDatetime(tokens.expiry_date),
			tokens.scope ?? null,
		]
	);

	// console.log("dados insert: ", [
	// 	clientId,
	// 	profile.email ?? null,
	// 	encrypt(tokens.access_token),
	// 	encrypt(tokens.refresh_token),
	// 	toMysqlDatetime(tokens.expiry_date),
	// 	tokens.scope ?? null,
	// ])


	return { connected: true, email: profile.email ?? null };
}

/**
 * Busca a linha de credenciais do cliente (usada internamente).
 * @param {number|string} clientId
 */
async function getCredentialsRow(clientId) {
	console.log("\n\nCalendar Service - getCredentialsRow")
	const [rows] = await pool.query(
		`SELECT * FROM client_calendar_credentials WHERE client_id = ? AND provider = 'google'`,
		[clientId]
	);

	if (!rows.length) {
		throw new ServiceError('Cliente não possui Google Agenda conectada', 404);
	}

	return rows[0];
}

/**
 * Retorna um OAuth2Client autenticado para o client_id, pronto pra chamar a API.
 * Se o access_token estiver expirado, a lib renova sozinha (evento 'tokens')
 * e aqui persistimos o novo access_token no banco.
 * @param {number|string} clientId
 * @param {object} [credRow] - linha já carregada de client_calendar_credentials (evita 2ª query)
 */
async function getAuthenticatedClient(clientId, credRow = null) {
	console.log("\n\nCalendar Service - getAuthenticatedClient")
	const cred = credRow ?? (await getCredentialsRow(clientId));
	const oauth2Client = newOAuthClient();

	oauth2Client.setCredentials({
		access_token: decrypt(cred.access_token),
		refresh_token: decrypt(cred.refresh_token),
		expiry_date: cred.token_expiry,
	});

	// Dispara quando a lib renova o access_token automaticamente numa chamada.
	oauth2Client.on('tokens', async (newTokens) => {
		if (!newTokens.access_token) return;
		try {
			await pool.query(
				`UPDATE client_calendar_credentials
				 SET access_token = ?, token_expiry = ?, updated_at = NOW()
				 WHERE client_id = ? AND provider = 'google'`,
				[encrypt(newTokens.access_token), toMysqlDatetime(newTokens.expiry_date), clientId]
			);
		} catch (err) {
			console.error('Falha ao persistir access_token renovado:', err.message);
		}
	});


	//console.log("oauth2Client: ", oauth2Client)
	return oauth2Client;
}

/**
 * Resolve qual calendarId usar: o informado explicitamente, senão o
 * default_calendar_id salvo do cliente, senão 'primary'.
 * @param {object} credRow
 * @param {string|null} calendarId
 */
function resolveCalendarId(credRow, calendarId) {
	return calendarId || credRow.default_calendar_id || 'primary';
}

/**
 * Lista as agendas (calendars) disponíveis na conta Google conectada.
 * Usado no frontend para o Cliente escolher qual agenda usar.
 * @param {number|string} clientId
 */
async function listCalendars(clientId) {
	console.log("\n\nCalendar Service - listCalendars")
	const auth = await getAuthenticatedClient(clientId);
	const calendar = google.calendar({ version: 'v3', auth });

	const { data } = await calendar.calendarList.list();

	//console.log("dataList: ", data)

	return (data.items ?? [])
		.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
		.map((c) => ({
			id: c.id,
			summary: c.summary,
			primary: Boolean(c.primary),
			accessRole: c.accessRole,
			backgroundColor: c.backgroundColor,
		}));
}

/**
 * Retorna o calendarId atualmente configurado como padrão do cliente
 * (ou 'primary' se nenhum foi definido ainda).
 * @param {number|string} clientId
 */
async function getDefaultCalendarId(clientId) {
	console.log("\n\nCalendar Service - getDefaultCalendarId")
	const credRow = await getCredentialsRow(clientId);
	return resolveCalendarId(credRow, null);
}

/**
 * Define qual agenda deve ser usada por padrão quando calendarId não for
 * informado (ex: chamadas vindas do N8N/IA).
 * @param {number|string} clientId
 * @param {string} calendarId
 */
async function setDefaultCalendar(clientId, calendarId) {
	console.log("\n\nCalendar Service - setDefaultCalendar")
	if (!calendarId) {
		throw new ServiceError('calendarId é obrigatório', 400);
	}

	const [result] = await pool.query(
		`UPDATE client_calendar_credentials
		 SET default_calendar_id = ?, updated_at = NOW()
		 WHERE client_id = ? AND provider = 'google'`,
		[calendarId, clientId]
	);

	if (!result.affectedRows) {
		throw new ServiceError('Cliente não possui Google Agenda conectada', 404);
	}

	return { default_calendar_id: calendarId };
}

/**
 * Consulta horários ocupados no intervalo (usado pela IA pra sugerir horários livres).
 * @param {number|string} clientId
 * @param {string} timeMin - ISO 8601
 * @param {string} timeMax - ISO 8601
 * @param {string} [calendarId] - se omitido, usa a agenda padrão do cliente
 */
async function getAvailability(clientId, timeMin, timeMax, calendarId = null) {
	console.log("\n\nCalendar Service - getAvailability")
	const credRow = await getCredentialsRow(clientId);
	const auth = await getAuthenticatedClient(clientId, credRow);
	const calendar = google.calendar({ version: 'v3', auth });
	const resolvedId = resolveCalendarId(credRow, calendarId);

	const { data } = await calendar.freebusy.query({
		requestBody: {
			timeMin,
			timeMax,
			items: [{ id: resolvedId }],
		},
	});

	const busy = data.calendars?.[resolvedId]?.busy ?? [];
	return { calendarId: resolvedId, timeMin, timeMax, busy };
}

/**
 * Lista eventos num intervalo — usado pelo react-big-calendar no frontend.
 * @param {number|string} clientId
 * @param {string} timeMin - ISO 8601
 * @param {string} timeMax - ISO 8601
 * @param {string} [calendarId] - se omitido, usa a agenda padrão do cliente
 */
async function listEvents(clientId, timeMin, timeMax, calendarId = null) {
	console.log("\n\nCalendarService listEvents:")
	const credRow = await getCredentialsRow(clientId);
	const auth = await getAuthenticatedClient(clientId, credRow);
	const calendar = google.calendar({ version: 'v3', auth });
	const resolvedId = resolveCalendarId(credRow, calendarId);

	const { data } = await calendar.events.list({
		calendarId: resolvedId,
		timeMin,
		timeMax,
		singleEvents: true,
		orderBy: 'startTime',
	});

	//console.log("\nEvents:\n:", data.items)

	return data.items ?? [];
}

/**
 * Cria um evento na agenda do Cliente.
 * @param {number|string} clientId
 * @param {{ summary: string, description?: string, start: string, end: string, attendeeEmail?: string, calendarId?: string }} eventData
 */
async function createEvent(clientId, eventData) {
	const { summary, description, start, end, attendeeEmail, calendarId } = eventData;

	if (!summary || !start || !end) {
		throw new ServiceError('summary, start e end são obrigatórios', 400);
	}

	const credRow = await getCredentialsRow(clientId);
	const auth = await getAuthenticatedClient(clientId, credRow);
	const calendar = google.calendar({ version: 'v3', auth });
	const resolvedId = resolveCalendarId(credRow, calendarId);

	const { data } = await calendar.events.insert({
		calendarId: resolvedId,
		requestBody: {
			summary,
			description,
			start: { dateTime: start },
			end: { dateTime: end },
			attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
		},
	});

	return data;
}

/**
 * Atualiza um evento existente.
 * @param {number|string} clientId
 * @param {string} eventId
 * @param {{ summary?: string, description?: string, start?: string, end?: string, calendarId?: string }} eventData
 */
async function updateEvent(clientId, eventId, eventData) {
	const credRow = await getCredentialsRow(clientId);
	const auth = await getAuthenticatedClient(clientId, credRow);
	const calendar = google.calendar({ version: 'v3', auth });
	const resolvedId = resolveCalendarId(credRow, eventData.calendarId);

	const requestBody = {};
	if (eventData.summary) requestBody.summary = eventData.summary;
	if (eventData.description !== undefined) requestBody.description = eventData.description;
	if (eventData.start) requestBody.start = { dateTime: eventData.start };
	if (eventData.end) requestBody.end = { dateTime: eventData.end };
	if (eventData.attendeeEmail !== undefined) {
		requestBody.attendees = eventData.attendeeEmail
			? [{ email: eventData.attendeeEmail }]
			: [];
	}

	const { data } = await calendar.events.patch({
		calendarId: resolvedId,
		eventId,
		requestBody,
	});

	return data;
}

/**
 * Remove um evento da agenda.
 * @param {number|string} clientId
 * @param {string} eventId
 * @param {string} [calendarId] - se omitido, usa a agenda padrão do cliente
 */
async function deleteEvent(clientId, eventId, calendarId = null) {
	console.log("\n\nCalendar Service - deleteEvent")
	const credRow = await getCredentialsRow(clientId);
	const auth = await getAuthenticatedClient(clientId, credRow);
	const calendar = google.calendar({ version: 'v3', auth });
	const resolvedId = resolveCalendarId(credRow, calendarId);

	const result= await calendar.events.delete({
		calendarId: resolvedId,
		eventId,
	});

	console.log("result calendar.events.delete: \n", result)

	return true;
}

module.exports = {
	getAuthUrl,
	connectCalendar,
	listCalendars,
	getDefaultCalendarId,
	setDefaultCalendar,
	getAvailability,
	listEvents,
	createEvent,
	updateEvent,
	deleteEvent,
	ServiceError,
};