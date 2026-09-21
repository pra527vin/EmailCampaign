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

export const apiRouter = Router();

// --- Public --------------------------------------------------------------
apiRouter.use('/auth', authRouter);
apiRouter.use('/unsubscribe', unsubscribeRouter);
apiRouter.use('/webhooks', webhookRouter);

// --- Authenticated -------------------------------------------------------
apiRouter.use('/recipient-lists', requireAuth, recipientListRouter);
apiRouter.use('/templates', requireAuth, templateRouter);
apiRouter.use('/campaigns', requireAuth, campaignRouter);
apiRouter.use('/settings', requireAuth, settingsRouter);

apiRouter.get(
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
apiRouter.post(
  '/preview',
  requireAuth,
  validate({ body: previewBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await buildPreview({ userId: user.id, ...req.body }) });
  }),
);
