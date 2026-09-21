import { Router } from 'express';
import {
  AppError,
  checkDomainAuthentication,
  getAccountStatus,
  getEmailSendQueue,
  getIdentityStatus,
  loadEnv,
  prisma,
  smtpHost,
  verifySmtpConnection,
  type SuppressionReason,
} from '@mailstrive/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';
import { currentUser, requestContext, requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.service.js';
import { recordAudit, listAuditLogs } from '../services/audit.service.js';
import {
  listSuppressions,
  suppress,
  unsuppress,
} from '../services/suppression.service.js';
import {
  createUserBody,
  idParams,
  paginationQuery,
  suppressionBody,
  suppressionListQuery,
  updateUserBody,
} from '../validation/schemas.js';

export const settingsRouter = Router();

/**
 * Sender configuration and live SES state.
 *
 * Never returns credentials -- only whether they work and what the account is
 * allowed to do. A failure to reach SES is reported as a status, not a 500, so
 * the page still renders when AWS is unreachable or keys are missing.
 */
settingsRouter.get(
  '/sender',
  asyncHandler(async (_req, res) => {
    const env = loadEnv();

    const base = {
      fromEmail: env.SES_FROM_EMAIL,
      fromName: env.SES_FROM_NAME ?? null,
      replyToEmail: env.SES_REPLY_TO_EMAIL ?? null,
      region: env.AWS_REGION,
      configurationSet: env.SES_CONFIGURATION_SET ?? null,
      configuredSendRate: env.SES_MAX_SEND_RATE,
      configuredDailyQuota: env.SES_DAILY_QUOTA,
      dryRun: env.SES_SANDBOX_DRY_RUN,
      transport: env.SES_TRANSPORT,
      smtpEndpoint:
        env.SES_TRANSPORT === 'smtp' ? `${smtpHost()}:${env.SES_SMTP_PORT}` : null,
      credentialsSource:
        env.SES_TRANSPORT === 'smtp'
          ? 'ses-smtp-credentials'
          : env.AWS_ACCESS_KEY_ID
            ? 'environment'
            : 'default-provider-chain',
      webhookUrl: `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/webhooks/ses`,
    };

    if (env.SES_SANDBOX_DRY_RUN) {
      return res.json({
        data: { ...base, reachable: false, reason: 'Dry-run mode is enabled; SES is not contacted.' },
      });
    }

    /**
     * Over SMTP there is no API to ask. Connecting and authenticating proves
     * the credentials work, which is the question this page exists to answer;
     * quota, sending status and identity verification are API-only and are
     * simply absent rather than guessed at.
     */
    if (env.SES_TRANSPORT === 'smtp') {
      try {
        await verifySmtpConnection();
        return res.json({
          data: {
            ...base,
            reachable: true,
            reason:
              'Connected and authenticated over SMTP. Account quota and identity verification ' +
              'are only available over the SES API, so they are not shown here.',
          },
        });
      } catch (error) {
        return res.json({
          data: { ...base, reachable: false, reason: (error as Error).message },
        });
      }
    }

    try {
      const domain = env.SES_FROM_EMAIL.split('@')[1];
      const [account, addressIdentity, domainIdentity] = await Promise.all([
        getAccountStatus(),
        getIdentityStatus(env.SES_FROM_EMAIL),
        domain ? getIdentityStatus(domain) : Promise.resolve(null),
      ]);

      // Either the address or its domain being verified is sufficient for SES.
      const identity = addressIdentity?.verified ? addressIdentity : (domainIdentity ?? addressIdentity);

      res.json({
        data: {
          ...base,
          reachable: true,
          account,
          identity,
          senderVerified: Boolean(addressIdentity?.verified || domainIdentity?.verified),
        },
      });
    } catch (error) {
      res.json({
        data: { ...base, reachable: false, reason: (error as Error).message },
      });
    }
  }),
);

/**
 * Whether the sending domain is set up to be trusted.
 *
 * Inbox placement is decided mostly by authentication and reputation, not by
 * anything in the message, so this reports on DNS rather than on content. The
 * DKIM part cannot be answered from DNS alone; when the SES API is reachable we
 * ask it whether the domain itself is verified, and otherwise say what to check.
 */
settingsRouter.get(
  '/deliverability',
  asyncHandler(async (_req, res) => {
    const env = loadEnv();
    const domain = env.SES_FROM_EMAIL.split('@')[1];
    if (!domain) throw AppError.badRequest('SES_FROM_EMAIL has no domain part');

    // SMTP credentials cannot call the SES API, so domain verification is
    // reported as unknown rather than guessed at.
    let senderIsDomainVerified: boolean | null = null;
    if (env.SES_TRANSPORT === 'api' && !env.SES_SANDBOX_DRY_RUN) {
      try {
        senderIsDomainVerified = (await getIdentityStatus(domain))?.verified ?? false;
      } catch {
        senderIsDomainVerified = null;
      }
    }

    res.json({ data: await checkDomainAuthentication({ domain, senderIsDomainVerified }) });
  }),
);

/** Queue depth, so an operator can see whether the worker is keeping up. */
settingsRouter.get(
  '/queue',
  asyncHandler(async (_req, res) => {
    try {
      const queue = getEmailSendQueue();
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      res.json({ data: { reachable: true, counts } });
    } catch (error) {
      res.json({ data: { reachable: false, reason: (error as Error).message } });
    }
  }),
);

// --- Suppression list -------------------------------------------------------

settingsRouter.get(
  '/suppressions',
  validate({ query: suppressionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
      reason?: SuppressionReason;
    };
    res.json({ data: await listSuppressions(query) });
  }),
);

settingsRouter.post(
  '/suppressions',
  validate({ body: suppressionBody }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { email: string; reason: SuppressionReason; notes?: string };

    await suppress({ ...body, source: `manual:${user.email}` });
    await recordAudit({
      action: 'suppression.added',
      userId: user.id,
      entityType: 'suppression',
      entityId: body.email,
      metadata: { reason: body.reason },
      ...requestContext(req),
    });

    res.status(201).json({ data: { email: body.email, reason: body.reason } });
  }),
);

settingsRouter.delete(
  '/suppressions/:email',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const email = decodeURIComponent(req.params.email as string);

    const removed = await unsuppress(email);
    if (!removed) throw AppError.notFound('Suppression entry');

    await recordAudit({
      action: 'suppression.removed',
      userId: user.id,
      entityType: 'suppression',
      entityId: email,
      ...requestContext(req),
    });

    res.status(204).send();
  }),
);

// --- Audit log --------------------------------------------------------------

settingsRouter.get(
  '/audit-logs',
  requireRole('ADMIN'),
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = req.query as unknown as {
      page: number;
      pageSize: number;
      search?: string;
    };
    res.json({ data: await listAuditLogs({ page, pageSize, action: search }) });
  }),
);

// --- User management (admin only) -------------------------------------------

settingsRouter.get(
  '/users',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    res.json({ data: users });
  }),
);

settingsRouter.post(
  '/users',
  requireRole('ADMIN'),
  validate({ body: createUserBody }),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const body = req.body as { email: string; name: string; password: string; role: 'ADMIN' | 'MEMBER' };

    const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (existing) throw AppError.conflict('A user with that email already exists');

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    await recordAudit({
      action: 'user.created',
      userId: admin.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ...requestContext(req),
    });

    res.status(201).json({ data: user });
  }),
);

settingsRouter.patch(
  '/users/:id',
  requireRole('ADMIN'),
  validate({ params: idParams, body: updateUserBody }),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const targetId = req.params.id as string;
    const body = req.body as { name?: string; role?: 'ADMIN' | 'MEMBER'; isActive?: boolean };

    // Removing your own access would leave you unable to undo it.
    if (targetId === admin.id && (body.isActive === false || body.role === 'MEMBER')) {
      throw AppError.badRequest('You cannot deactivate or demote your own account');
    }

    const user = await prisma.user.update({
      where: { id: targetId },
      data: body,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    // A deactivated user must lose their live sessions immediately.
    if (body.isActive === false) {
      await prisma.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await recordAudit({
      action: 'user.updated',
      userId: admin.id,
      entityType: 'user',
      entityId: targetId,
      metadata: body,
      ...requestContext(req),
    });

    res.json({ data: user });
  }),
);
