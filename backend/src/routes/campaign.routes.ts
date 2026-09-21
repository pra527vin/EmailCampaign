import { Router } from 'express';
import {
  AppError,
  DashboardRangeError,
  resolveOptionalRange,
  type CampaignRecipientStatus,
  type CampaignStatus,
} from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';
import { currentUser, requestContext } from '../middleware/auth.js';
import {
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignProgress,
  listCampaignRecipients,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  retryFailedRecipients,
  startCampaign,
  updateCampaign,
} from '../services/campaign.service.js';
import { listCampaignEvents } from '../services/ses-event.service.js';
import {
  campaignListQuery,
  campaignRecipientsQuery,
  createCampaignBody,
  idParams,
  paginationQuery,
  updateCampaignBody,
} from '../validation/schemas.js';

export const campaignRouter = Router();

campaignRouter.get(
  '/',
  validate({ query: campaignListQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { preset, from, to, ...query } = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      status?: CampaignStatus;
      preset?: string;
      from?: string;
      to?: string;
    };

    try {
      const range = resolveOptionalRange({ preset, from, to });
      res.json({ data: await listCampaigns({ userId: user.id, ...query, range }) });
    } catch (error) {
      // A range the caller got wrong is their mistake, not a server fault.
      if (error instanceof DashboardRangeError) throw AppError.badRequest(error.message);
      throw error;
    }
  }),
);

campaignRouter.post(
  '/',
  validate({ body: createCampaignBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const campaign = await createCampaign(user.id, req.body, requestContext(req));
    res.status(201).json({ data: campaign });
  }),
);

campaignRouter.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await getCampaign(user.id, req.params.id as string) });
  }),
);

campaignRouter.put(
  '/:id',
  validate({ params: idParams, body: updateCampaignBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const campaign = await updateCampaign(
      user.id,
      req.params.id as string,
      req.body,
      requestContext(req),
    );
    res.json({ data: campaign });
  }),
);

/** Lightweight endpoint the UI polls while a campaign is running. */
campaignRouter.get(
  '/:id/progress',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const campaign = await getCampaign(user.id, req.params.id as string);
    res.json({
      data: {
        status: campaign.status,
        progress: await getCampaignProgress(campaign.id),
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        lastError: campaign.lastError,
      },
    });
  }),
);

campaignRouter.get(
  '/:id/recipients',
  validate({ params: idParams, query: campaignRecipientsQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      status?: CampaignRecipientStatus;
    };
    res.json({
      data: await listCampaignRecipients({
        userId: user.id,
        campaignId: req.params.id as string,
        ...query,
      }),
    });
  }),
);

campaignRouter.get(
  '/:id/events',
  validate({ params: idParams, query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.json({
      data: await listCampaignEvents({
        userId: user.id,
        campaignId: req.params.id as string,
        page,
        pageSize,
      }),
    });
  }),
);

/** The lifecycle verbs all share one shape, so they share one adapter. */
const action = (
  handler: (
    userId: string,
    campaignId: string,
    context: ReturnType<typeof requestContext>,
  ) => Promise<unknown>,
) =>
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const result = await handler(user.id, req.params.id as string, requestContext(req));
    res.json({ data: result });
  });

campaignRouter.post(
  '/:id/duplicate',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const campaign = await duplicateCampaign(
      user.id,
      req.params['id'] as string,
      requestContext(req),
    );
    res.status(201).json({ data: campaign });
  }),
);

campaignRouter.post('/:id/start', validate({ params: idParams }), action(startCampaign));
campaignRouter.post('/:id/pause', validate({ params: idParams }), action(pauseCampaign));
campaignRouter.post('/:id/resume', validate({ params: idParams }), action(resumeCampaign));
campaignRouter.post('/:id/cancel', validate({ params: idParams }), action(cancelCampaign));
campaignRouter.post(
  '/:id/retry-failed',
  validate({ params: idParams }),
  action(retryFailedRecipients),
);

campaignRouter.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await deleteCampaign(user.id, req.params.id as string, requestContext(req));
    res.status(204).send();
  }),
);
