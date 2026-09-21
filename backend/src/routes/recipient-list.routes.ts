import { Router } from 'express';
import multer from 'multer';
import { AppError, loadEnv } from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { uploadRateLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { currentUser, requestContext } from '../middleware/auth.js';
import {
  deleteRecipientList,
  getRecipientList,
  importCsv,
  listRecipientLists,
  listRecipients,
  updateRecipient,
  updateRecipientList,
  type RecipientUpdate,
} from '../services/recipient-list.service.js';
import {
  idParams,
  paginationQuery,
  recipientParams,
  updateRecipientBody,
  updateRecipientListBody,
  uploadListBody,
} from '../validation/schemas.js';
import type { ColumnMapping } from '../services/csv.service.js';

export const recipientListRouter = Router();

/**
 * Uploads are buffered in memory rather than written to disk first: the size
 * ceiling is enforced by multer before a single byte reaches the parser, and
 * keeping the bytes in one place makes hashing and archiving atomic.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: loadEnv().MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, callback) => {
    const allowedMime = [
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    const looksLikeCsv = /\.csv$/i.test(file.originalname);
    if (!looksLikeCsv || !allowedMime.includes(file.mimetype)) {
      callback(AppError.badRequest('Only .csv files can be uploaded'));
      return;
    }
    callback(null, true);
  },
});

recipientListRouter.post(
  '/upload',
  uploadRateLimiter(),
  upload.single('file'),
  validate({ body: uploadListBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!req.file) throw AppError.badRequest('Attach a CSV file in the "file" field');

    const body = req.body as {
      name: string;
      description?: string;
      skipSuppressed: boolean;
      columnMap?: ColumnMapping[];
    };

    const result = await importCsv({
      userId: user.id,
      name: body.name,
      description: body.description,
      fileName: req.file.originalname,
      fileBuffer: req.file.buffer,
      skipSuppressed: body.skipSuppressed,
      columnMap: body.columnMap,
      context: requestContext(req),
    });

    res.status(201).json({ data: result });
  }),
);

recipientListRouter.get(
  '/',
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { page, pageSize, search } = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
    };
    res.json({ data: await listRecipientLists({ userId: user.id, page, pageSize, search }) });
  }),
);

recipientListRouter.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await getRecipientList(user.id, req.params['id'] as string) });
  }),
);

recipientListRouter.get(
  '/:id/recipients',
  validate({ params: idParams, query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { page, pageSize, search } = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
    };
    res.json({
      data: await listRecipients({
        userId: user.id,
        listId: req.params['id'] as string,
        page,
        pageSize,
        search,
      }),
    });
  }),
);

recipientListRouter.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await deleteRecipientList(user.id, req.params['id'] as string, requestContext(req));
    res.status(204).send();
  }),
);

recipientListRouter.patch(
  '/:id',
  validate({ params: idParams, body: updateRecipientListBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({
      data: await updateRecipientList({
        userId: user.id,
        listId: req.params['id'] as string,
        data: req.body as { name?: string; description?: string | null },
        context: requestContext(req),
      }),
    });
  }),
);

recipientListRouter.patch(
  '/:id/recipients/:recipientId',
  validate({ params: recipientParams, body: updateRecipientBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({
      data: await updateRecipient({
        userId: user.id,
        listId: req.params['id'] as string,
        recipientId: req.params['recipientId'] as string,
        data: req.body as RecipientUpdate,
        context: requestContext(req),
      }),
    });
  }),
);
