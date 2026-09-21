import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';
import {
  inspectUnsubscribeToken,
  processUnsubscribe,
} from '../services/unsubscribe.service.js';
import { unsubscribeTokenParams } from '../validation/schemas.js';

export const unsubscribeRouter = Router();

/**
 * Public, unauthenticated, and intentionally exempt from CSRF.
 *
 * RFC 8058 requires that a mailbox provider can POST to the
 * `List-Unsubscribe` URL with no user interaction. The signed token in the path
 * is the authorisation; it names exactly one address and cannot be altered.
 */

// One-click target used by the List-Unsubscribe header.
unsubscribeRouter.post(
  '/:token',
  validate({ params: unsubscribeTokenParams }),
  asyncHandler(async (req, res) => {
    const result = await processUnsubscribe(req.params.token as string, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      source: 'one-click',
    });
    res.json({ data: result });
  }),
);

// Read-only lookup so the confirmation page can name the address.
unsubscribeRouter.get(
  '/:token',
  validate({ params: unsubscribeTokenParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: inspectUnsubscribeToken(req.params.token as string) });
  }),
);

// Confirmation from the hosted unsubscribe page.
unsubscribeRouter.post(
  '/:token/confirm',
  validate({ params: unsubscribeTokenParams }),
  asyncHandler(async (req, res) => {
    const result = await processUnsubscribe(req.params.token as string, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      source: 'web',
    });
    res.json({ data: result });
  }),
);
