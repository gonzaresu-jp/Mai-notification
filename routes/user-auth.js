'use strict';

const auth = require('../auth');
const { upsertUser, upsertDiscordUser, migrateSubscription, unlinkUserDevices, safeRedirect } = require('./user-helpers');

function register(app, db, authLimiter) {
  const limiter = authLimiter || ((req, res, next) => next());

  app.get('/auth/google', limiter, (req, res) => {
    const returnTo = req.query.returnTo || '/';
    const clientId = req.query.client_id || '';
    const state = Buffer.from(JSON.stringify({ returnTo, clientId })).toString('base64url');
    res.redirect(auth.getAuthUrl(state));
  });

  app.get('/auth/google/callback', limiter, async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');
    let stateData = { returnTo: '/', clientId: '' };
    try { stateData = JSON.parse(Buffer.from(state || '', 'base64url').toString()); } catch {}
    try {
      const googleUser = await auth.exchangeCodeForUser(code);
      const user = await upsertUser(db, googleUser);
      if (stateData.clientId) await migrateSubscription(db, stateData.clientId, user.id);
      const token = auth.signToken({ userId: user.id, email: user.email || user.google_id || user.discord_id });
      res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
      console.log(`[auth] Google login: user_id=${user.id} email=${user.email}`);
      safeRedirect(res, stateData.returnTo);
    } catch (e) {
      console.error('[auth/google/callback]', e.message || e);
      res.status(500).send('Authentication failed.');
    }
  });

  app.get('/auth/discord', limiter, (req, res) => {
    const returnTo = req.query.returnTo || '/';
    const clientId = req.query.client_id || '';
    const state = Buffer.from(JSON.stringify({ returnTo, clientId })).toString('base64url');
    const authUrl = auth.getDiscordAuthUrl(state);
    console.log('[auth/discord] Full Redirect URL:', authUrl);
    res.redirect(authUrl);
  });

  app.get('/auth/discord/callback', limiter, async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) { console.warn('[auth/discord/callback] Discord returned error:', error, error_description); return res.status(400).send(`Authentication failed: ${error_description || error}`); }
    if (!code) { console.warn('[auth/discord/callback] Missing code. Query:', req.query); return res.status(400).send('Missing authorization code'); }
    let stateData = { returnTo: '/', clientId: '' };
    try { stateData = JSON.parse(Buffer.from(state || '', 'base64url').toString()); } catch {}
    try {
      const discordUser = await auth.exchangeDiscordCodeForUser(code);
      const user = await upsertDiscordUser(db, discordUser);
      if (stateData.clientId) await migrateSubscription(db, stateData.clientId, user.id);
      const token = auth.signToken({ userId: user.id, email: user.email || user.discord_id || user.google_id });
      res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);
      console.log(`[auth] Discord login: user_id=${user.id} email=${user.email}`);
      safeRedirect(res, stateData.returnTo);
    } catch (e) {
      console.error('[auth/discord/callback] Exchange error:', e.message || (e.response ? JSON.stringify(e.response.data) : e));
      res.status(500).send('Authentication failed during token exchange.');
    }
  });

  app.post('/auth/logout', auth.optionalAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const clientId = body.clientId || body.client_id || req.query?.clientId || req.query?.client_id || '';
      const fcmToken = body.fcmToken || req.query?.fcmToken || '';
      if (req.userId && (clientId || fcmToken)) await unlinkUserDevices(db, req.userId, { clientId, fcmToken });
    } catch (e) { console.warn('[auth/logout] unlink failed:', e && e.message ? e.message : e); }
    res.clearCookie(auth.COOKIE_NAME);
    res.json({ success: true });
  });

  app.get('/auth/logout', limiter, auth.optionalAuth, async (req, res) => {
    try {
      const clientId = req.query?.clientId || req.query?.client_id || '';
      const fcmToken = req.query?.fcmToken || '';
      if (req.userId && (clientId || fcmToken)) await unlinkUserDevices(db, req.userId, { clientId, fcmToken });
    } catch (e) { console.warn('[auth/logout] unlink failed:', e && e.message ? e.message : e); }
    res.clearCookie(auth.COOKIE_NAME);
    safeRedirect(res, req.query.returnTo);
  });
}

module.exports = { register };
