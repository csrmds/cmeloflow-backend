const express = require('express');
const router = express.Router();
const internalAuth = require('../middleware/internalAuth');
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/calendarController');

// Fluxo OAuth — /google/connect inicia autenticado (JWT), /google/callback é
// redirect do Google e por isso não tem JWT (o client_id vem no `state`).
router.get('/google/connect', auth, controller.getConnectUrl);
router.get('/google/callback', controller.googleCallback);

// Gerenciamento de agendas — chamadas pelo frontend (JWT)
router.get('/calendars', auth, controller.listCalendars);
router.get('/default', auth, controller.getDefaultCalendar);
router.post('/default', auth, controller.setDefaultCalendar);

// Eventos — chamadas pelo frontend (JWT), usado pelo react-big-calendar
router.get('/events', auth, controller.listEvents);
router.post('/events/lead', auth, controller.listEventsByLead);
router.post('/events', auth, controller.createEvent);
router.put('/events/:id', auth, controller.updateEvent);
router.delete('/events/:id', auth, controller.deleteEvent);

// Chamadas SEM auth de usuário — vai ser chamado pelo n8n com x-api-key no header
router.post('/agent/availability', internalAuth, controller.checkAvailability);
router.post('/agent/create', internalAuth, controller.createEventInternal);
router.put('/agent/update/:id', internalAuth, controller.updateEvent);
router.delete('/agent/delete/:id', internalAuth, controller.deleteEvent);
router.post('/agent/next-available-slots', internalAuth, controller.getNextAvailableSlots);
router.post('/agent/lead-events', internalAuth, controller.listEventsByLead);

module.exports = router;