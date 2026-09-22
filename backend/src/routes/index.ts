import { Router } from 'express';
import { AppError, DashboardRangeError } from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getDashboardStats } from '../services/dashboard.service.js';
import { buildPreview } from '../services/preview.service.js';
import { dashboardStatsQuery, previewBody } from '../validation/schemas.js';
import { authRouter } from './auth.routes.js';
import { campaignRouter } from './campaign.routes.js';
import { recipientListRouter } from './recipient-list.routes.js';
import { settingsRouter } from './settings.routes.js';
import { templateRouter } from './template.routes.js';
import { unsubscribeRouter } from './unsubscribe.routes.js';
import { webhookRouter } from './webhook.routes.js';

/**
 * Stable, unversioned surface.
 *
 * `/unsubscribe` is baked into the `List-Unsubscribe` header of every email
 * already sent, and `/webhooks/ses` is registered with AWS SNS as a fixed
 * endpoint URL. Neither can move behind a version prefix without breaking a
 * contract with someone outside this codebase, so they stay off `/v1`
 * permanently. See docs/adr/0002-api-versioning.md.
 */
export const publicApiRouter = Router();
publicApiRouter.use('/unsubscribe', unsubscribeRouter);
publicApiRouter.use('/webhooks', webhookRouter);

/**
 * Versioned surface: everything the bundled frontend calls. Mounted at
 * /api/v1 so its response shapes can change behind a new version without
 * breaking existing clients once one exists beyond this frontend.
 */
export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/recipient-lists', requireAuth, recipientListRouter);
v1Router.use('/templates', requireAuth, templateRouter);
v1Router.use('/campaigns', requireAuth, campaignRouter);
v1Router.use('/settings', requireAuth, settingsRouter);

v1Router.get(
  '/dashboard/stats',
  requireAuth,
  validate({ query: dashboardStatsQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { preset, from, to } = req.query as {
      preset?: string;
      from?: string;
      to?: string;
    };
    try {
      res.json({ data: await getDashboardStats(user.id, { preset, from, to }) });
    } catch (error) {
      // A range the caller got wrong is their mistake, not a server fault.
      // Without this it would surface as a 500 and tell them nothing.
      if (error instanceof DashboardRangeError) throw AppError.badRequest(error.message);
      throw error;
    }
  }),
);

/**
 * Preview is a POST because the editor sends an unsaved body, which can be
 * megabytes and does not belong in a URL.
 */
v1Router.post(
  '/preview',
  requireAuth,
  validate({ body: previewBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await buildPreview({ userId: user.id, ...req.body }) });
  }),
);
