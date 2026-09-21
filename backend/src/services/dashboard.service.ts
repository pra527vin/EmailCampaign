import {
  eachDay,
  prisma,
  rangeBounds,
  resolveDashboardRange,
  type DashboardRange,
  type DashboardStats,
} from '@mailstrive/shared';
import { getCampaignProgress } from './campaign.service.js';

/**
 * Dashboard aggregates.
 *
 * Two kinds of number live here and they are deliberately kept apart:
 *
 *  - **Inventory** (campaigns, lists, templates, recipients) is what the
 *    account currently holds. It is not scoped to the date filter, because
 *    "templates created in the last 7 days" is not a figure anyone wants.
 *  - **Outcomes and activity** are events, and those *are* scoped. They come
 *    from `campaign_recipients` rather than the denormalised counters on
 *    `campaigns`, because a counter is an all-time total and cannot be sliced
 *    by date. That costs one grouped scan of the window, bounded by the range
 *    cap and served by the (campaign_id, updated_at) index.
 */
export async function getDashboardStats(
  userId: string,
  rangeInput: { preset?: string | null; from?: string | null; to?: string | null } = {},
): Promise<DashboardStats> {
  const range = resolveDashboardRange(rangeInput);
  const { start, end } = rangeBounds(range);

  const [
    campaignCount,
    listCount,
    templateCount,
    recipientCount,
    queuedAllTime,
    outcomes,
    activeCampaign,
    recentCampaigns,
    activity,
  ] = await Promise.all([
    prisma.campaign.count({ where: { userId } }),
    prisma.recipientList.count({ where: { userId } }),
    prisma.emailTemplate.count({ where: { userId } }),
    prisma.recipient.count({ where: { list: { userId } } }),
    prisma.campaign.aggregate({ where: { userId }, _sum: { totalRecipients: true } }),
    prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaign: { userId }, updatedAt: { gte: start, lt: end } },
      _count: true,
    }),
    prisma.campaign.findFirst({
      where: { userId, status: { in: ['QUEUED', 'SENDING', 'PAUSED'] } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, name: true, status: true },
    }),
    prisma.campaign.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
      },
    }),
    getSendActivity(userId, range),
  ]);

  const count = (status: string) =>
    outcomes.find((row) => row.status === status)?._count ?? 0;

  return {
    range,
    totals: {
      campaigns: campaignCount,
      recipientLists: listCount,
      recipients: recipientCount,
      templates: templateCount,
      emails: queuedAllTime._sum.totalRecipients ?? 0,
    },
    windowed: {
      sent: count('SENT'),
      // Rows that entered the window and have not resolved yet. Unlike the
      // all-time view this is a real count, not a subtraction, so it cannot go
      // negative when counters and rows disagree.
      pending: count('PENDING'),
      failed: count('FAILED'),
      bounced: count('BOUNCED'),
      complaints: count('COMPLAINT'),
      unsubscribed: count('UNSUBSCRIBED'),
    },
    activeCampaign: activeCampaign
      ? {
          id: activeCampaign.id,
          name: activeCampaign.name,
          status: activeCampaign.status,
          progress: await getCampaignProgress(activeCampaign.id),
        }
      : null,
    recentCampaigns: recentCampaigns.map((campaign) => ({
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
    })),
    activity,
  };
}

interface ActivityRow {
  day: Date;
  sent: bigint;
  failed: bigint;
  bounced: bigint;
}

async function getSendActivity(
  userId: string,
  range: DashboardRange,
): Promise<DashboardStats['activity']> {
  const { start, end } = rangeBounds(range);

  // Raw SQL because Prisma cannot express date_trunc grouping. Every input is a
  // bound parameter, so there is no injection surface here. `date_trunc` is
  // pinned to UTC so the buckets line up with the UTC days the range is built
  // from -- without the AT TIME ZONE the server's local timezone would decide,
  // and the first and last bar would be wrong for anyone not on UTC.
  const rows = await prisma.$queryRaw<ActivityRow[]>`
    SELECT
      date_trunc('day', cr.updated_at AT TIME ZONE 'UTC') AS day,
      COUNT(*) FILTER (WHERE cr.status = 'SENT')     AS sent,
      COUNT(*) FILTER (WHERE cr.status = 'FAILED')   AS failed,
      COUNT(*) FILTER (WHERE cr.status = 'BOUNCED')  AS bounced
    FROM campaign_recipients cr
    JOIN campaigns c ON c.id = cr.campaign_id
    WHERE c.user_id = ${userId}::uuid
      AND cr.updated_at >= ${start}
      AND cr.updated_at <  ${end}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const byDay = new Map(
    rows.map((row) => [
      row.day.toISOString().slice(0, 10),
      { sent: Number(row.sent), failed: Number(row.failed), bounced: Number(row.bounced) },
    ]),
  );

  // Emit a dense series so the chart has no gaps.
  return eachDay(range).map((date) => ({
    date,
    ...(byDay.get(date) ?? { sent: 0, failed: 0, bounced: 0 }),
  }));
}
