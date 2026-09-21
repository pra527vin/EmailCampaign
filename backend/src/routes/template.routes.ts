import { Router } from 'express';
import type { TemplateStatus } from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';
import { currentUser, requestContext } from '../middleware/auth.js';
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  setTemplateStatus,
  updateTemplate,
} from '../services/template.service.js';
import {
  createTemplateBody,
  idParams,
  templateListQuery,
  templateStatusBody,
  updateTemplateBody,
} from '../validation/schemas.js';

export const templateRouter = Router();

templateRouter.get(
  '/',
  validate({ query: templateListQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      status?: TemplateStatus;
    };
    res.json({ data: await listTemplates({ userId: user.id, ...query }) });
  }),
);

templateRouter.post(
  '/',
  validate({ body: createTemplateBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const template = await createTemplate(user.id, req.body, requestContext(req));
    res.status(201).json({ data: template });
  }),
);

templateRouter.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await getTemplate(user.id, req.params.id as string) });
  }),
);

templateRouter.put(
  '/:id',
  validate({ params: idParams, body: updateTemplateBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const template = await updateTemplate(
      user.id,
      req.params.id as string,
      req.body,
      requestContext(req),
    );
    res.json({ data: template });
  }),
);

templateRouter.patch(
  '/:id/status',
  validate({ params: idParams, body: templateStatusBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { status } = req.body as { status: TemplateStatus };
    const template = await setTemplateStatus(
      user.id,
      req.params.id as string,
      status,
      requestContext(req),
    );
    res.json({ data: template });
  }),
);

templateRouter.post(
  '/:id/duplicate',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const copy = await duplicateTemplate(user.id, req.params.id as string, requestContext(req));
    res.status(201).json({ data: copy });
  }),
);

templateRouter.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await deleteTemplate(user.id, req.params.id as string, requestContext(req));
    res.status(204).send();
  }),
);
