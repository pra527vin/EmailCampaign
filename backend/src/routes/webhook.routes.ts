import { Router, raw } from 'express';
import { AppError, createLogger } from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { handleSesNotification } from '../services/ses-event.service.js';
import {
  confirmSubscription,
  verifySnsMessage,
  SnsVerificationError,
  type SnsMessage,
} from '../services/sns-verifier.js';

const log = createLogger('api:webhook');

export const webhookRouter = Router();

/**
 * SES event ingestion via SNS.
 *
 * SNS posts with `Content-Type: text/plain`, so the body is taken raw and
 * parsed here rather than relying on the JSON body parser. The signature is
 * verified against the AWS signing certificate before anything is trusted --
 * without that, anyone could mark addresses as bounced or complained.
 */
webhookRouter.post(
  '/ses',
  raw({ type: '*/*', limit: '512kb' }),
  asyncHandler(async (req, res) => {
    let message: SnsMessage;
    try {
      const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
      message = JSON.parse(body) as SnsMessage;
    } catch {
      throw AppError.badRequest('Webhook body is not valid JSON');
    }

    try {
      await verifySnsMessage(message);
    } catch (error) {
      if (error instanceof SnsVerificationError) {
        log.warn({ reason: error.message, topicArn: message.TopicArn }, 'Rejected SNS message');
        throw AppError.forbidden('SNS signature verification failed');
      }
      throw error;
    }

    if (message.Type === 'SubscriptionConfirmation') {
      if (!message.SubscribeURL) throw AppError.badRequest('SubscriptionConfirmation has no SubscribeURL');
      await confirmSubscription(message.SubscribeURL);
      log.info({ topicArn: message.TopicArn }, 'Confirmed SNS subscription');
      res.json({ data: { confirmed: true } });
      return;
    }

    if (message.Type === 'UnsubscribeConfirmation') {
      log.warn({ topicArn: message.TopicArn }, 'SNS topic unsubscribed from this endpoint');
      res.json({ data: { acknowledged: true } });
      return;
    }

    let notification: unknown;
    try {
      notification = JSON.parse(message.Message);
    } catch {
      throw AppError.badRequest('SNS Message payload is not valid JSON');
    }

    const result = await handleSesNotification(notification);

    // Always 200 for a verified message: a non-2xx makes SNS retry, and a
    // payload we cannot interpret will never succeed on a retry either.
    res.json({ data: result });
  }),
);

/** Liveness probe for load balancers and the SNS endpoint health check. */
webhookRouter.get('/ses', (_req, res) => {
  res.json({ data: { status: 'ready' } });
});
