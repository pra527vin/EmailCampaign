import { promises as dns } from 'node:dns';

/**
 * Domain authentication checks.
 *
 * Where a message lands is decided mostly before anyone reads a word of it.
 * A mailbox provider asks: is this sender who they claim to be (SPF, DKIM,
 * DMARC), and do people want their mail (reputation)? Nothing in a message can
 * substitute for the first, and these checks report on it honestly.
 *
 * SPF and DMARC are fully checkable from DNS. DKIM is not: its selector is
 * account-specific and DNS cannot be enumerated, so the DKIM finding explains
 * what to confirm in the SES console rather than pretending to verify it.
 *
 * There is deliberately nothing here about defeating spam filters. The only way
 * to reach an inbox reliably is to be a legitimate sender and look like one.
 */

export type DeliverabilityLevel = 'ok' | 'warning' | 'error' | 'info';

export interface DeliverabilityFinding {
  id: string;
  level: DeliverabilityLevel;
  title: string;
  detail: string;
  /** The DNS record to publish, when one is missing or wrong. */
  record?: { name: string; type: 'TXT' | 'CNAME'; value: string };
}

export interface DomainAuthenticationReport {
  domain: string;
  checkedAt: string;
  findings: DeliverabilityFinding[];
  /** True when nothing at `error` level remains. */
  passes: boolean;
}

/**
 * DNS codes that mean "asked successfully, there is nothing there".
 *
 * Everything else -- a refused or unreachable resolver, a timeout, SERVFAIL --
 * means the question was never answered. Those must not be reported as a
 * missing record: that would send someone to edit a zone file over a local
 * network fault.
 */
const NO_RECORD_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NOTFOUND', 'NODATA']);

class DnsUnavailableError extends Error {
  constructor(
    readonly name_: string,
    readonly code: string,
  ) {
    super(`DNS lookup for ${name_} failed (${code})`);
    this.name = 'DnsUnavailableError';
  }
}

async function txtRecords(name: string): Promise<string[]> {
  try {
    // Long TXT values arrive split into 255-byte chunks; joining restores them.
    return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''));
  } catch (error) {
    const code = (error as { code?: string })?.code ?? 'UNKNOWN';
    if (NO_RECORD_CODES.has(code)) return [];
    throw new DnsUnavailableError(name, code);
  }
}

/** The SPF mechanism that authorises Amazon SES to send for a domain. */
const SES_SPF_INCLUDE = 'amazonses.com';

function checkSpf(records: string[], domain: string): DeliverabilityFinding[] {
  const spf = records.filter((record) => record.toLowerCase().startsWith('v=spf1'));

  if (spf.length === 0) {
    return [
      {
        id: 'SPF_MISSING',
        level: 'error',
        title: 'No SPF record',
        detail:
          `${domain} publishes no SPF record, so receivers cannot confirm that Amazon SES is ` +
          'allowed to send on its behalf. This is the single most common reason bulk mail is ' +
          'filtered. Publish one TXT record at the domain apex, merging any senders you already ' +
          'use — a domain may have only one SPF record.',
        record: {
          name: domain,
          type: 'TXT',
          value: `v=spf1 include:${SES_SPF_INCLUDE} ~all`,
        },
      },
    ];
  }

  const findings: DeliverabilityFinding[] = [];

  if (spf.length > 1) {
    findings.push({
      id: 'SPF_MULTIPLE',
      level: 'error',
      title: 'More than one SPF record',
      detail:
        `${domain} publishes ${spf.length} SPF records. RFC 7208 allows exactly one; receivers ` +
        'treat multiple records as a permanent error and SPF fails outright. Merge them into a ' +
        'single record.',
    });
  }

  const value = spf[0] ?? '';

  if (!value.toLowerCase().includes(SES_SPF_INCLUDE)) {
    findings.push({
      id: 'SPF_MISSING_SES',
      level: 'error',
      title: 'SPF does not authorise Amazon SES',
      detail:
        `The SPF record exists but does not include ${SES_SPF_INCLUDE}, so mail sent through SES ` +
        `fails SPF. Add the include to the existing record rather than publishing a second one. ` +
        `Current value: ${value}`,
      record: {
        name: domain,
        type: 'TXT',
        value: value.replace(/\s*[~\-?+]all\s*$/i, ` include:${SES_SPF_INCLUDE} ~all`),
      },
    });
  } else {
    findings.push({
      id: 'SPF_OK',
      level: 'ok',
      title: 'SPF authorises Amazon SES',
      detail: value,
    });
  }

  if (/\+all\s*$/i.test(value)) {
    findings.push({
      id: 'SPF_PERMISSIVE',
      level: 'warning',
      title: 'SPF ends with +all',
      detail:
        '+all authorises every host on the internet to send as this domain, which makes the ' +
        'record worthless and is itself a negative reputation signal. Use ~all or -all.',
    });
  }

  return findings;
}

function checkDmarc(records: string[], domain: string): DeliverabilityFinding[] {
  const dmarc = records.filter((record) => record.toLowerCase().startsWith('v=dmarc1'));

  if (dmarc.length === 0) {
    return [
      {
        id: 'DMARC_MISSING',
        level: 'error',
        title: 'No DMARC record',
        detail:
          'Google and Yahoo require a DMARC policy from bulk senders. Without one, mail to their ' +
          'users is rejected or filtered regardless of anything else. Start at p=none, which ' +
          'enforces nothing and only collects reports, then tighten once those reports are clean.',
        record: {
          name: `_dmarc.${domain}`,
          type: 'TXT',
          value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}`,
        },
      },
    ];
  }

  const value = dmarc[0] ?? '';
  const policy = /\bp\s*=\s*(none|quarantine|reject)\b/i.exec(value)?.[1]?.toLowerCase() ?? 'none';
  const hasReporting = /\brua\s*=\s*mailto:/i.test(value);
  const findings: DeliverabilityFinding[] = [];

  findings.push({
    id: 'DMARC_PRESENT',
    level: 'ok',
    title: `DMARC published with p=${policy}`,
    detail: value,
  });

  if (policy === 'none') {
    findings.push({
      id: 'DMARC_POLICY_NONE',
      level: 'warning',
      title: 'DMARC policy is p=none',
      detail:
        'p=none satisfies the bulk sender requirement but asks receivers to enforce nothing, so ' +
        'it does little for reputation and none for spoofing. Once SPF and DKIM both pass and ' +
        'align for a few weeks, move to p=quarantine and then p=reject.',
    });
  }

  if (!hasReporting) {
    findings.push({
      id: 'DMARC_NO_REPORTING',
      level: 'warning',
      title: 'DMARC has no reporting address',
      detail:
        'Without a rua= address you receive no aggregate reports, which are the only way to see ' +
        'whether your mail actually passes alignment at each receiver.',
    });
  }

  return findings;
}

/**
 * DKIM alignment, which DNS cannot answer on its own.
 *
 * SES signs with its own `amazonses.com` key unless the *domain* is verified
 * with Easy DKIM. That signature is valid, but it does not align with the From
 * domain, so DMARC then rests entirely on SPF. Verifying the address alone is
 * not enough, and this is the step most often skipped.
 */
function dkimGuidance(domain: string, senderIsDomainVerified: boolean | null): DeliverabilityFinding {
  if (senderIsDomainVerified === true) {
    return {
      id: 'DKIM_DOMAIN_VERIFIED',
      level: 'ok',
      title: 'Sending domain is verified in SES',
      detail:
        `SES holds a verified identity for ${domain}, so messages are DKIM-signed with a key ` +
        'that aligns with the From address.',
    };
  }

  return {
    id: 'DKIM_CHECK_CONSOLE',
    level: senderIsDomainVerified === false ? 'error' : 'info',
    title:
      senderIsDomainVerified === false
        ? `${domain} is not verified in SES — DKIM will not align`
        : 'Confirm DKIM signs with your own domain',
    detail:
      `Verify the domain ${domain} in SES (not just the individual address) and publish the three ` +
      'CNAME records Easy DKIM generates. Without that, SES signs with amazonses.com: the ' +
      'signature is valid but does not align with your From domain, so DMARC passes only if SPF ' +
      'does. DKIM selectors cannot be discovered from DNS, so this one has to be confirmed in the ' +
      'SES console.',
  };
}

export async function checkDomainAuthentication(params: {
  domain: string;
  /** From the SES API when available; null when running on SMTP credentials. */
  senderIsDomainVerified?: boolean | null;
}): Promise<DomainAuthenticationReport> {
  const domain = params.domain.trim().toLowerCase();

  let apexTxt: string[];
  let dmarcTxt: string[];
  try {
    [apexTxt, dmarcTxt] = await Promise.all([
      txtRecords(domain),
      txtRecords(`_dmarc.${domain}`),
    ]);
  } catch (error) {
    // Report the outage as an outage. Claiming the records are absent would be
    // worse than saying nothing.
    return {
      domain,
      checkedAt: new Date().toISOString(),
      passes: false,
      findings: [
        {
          id: 'DNS_UNAVAILABLE',
          level: 'warning',
          title: 'Could not read DNS',
          detail:
            `${(error as Error).message}. This says nothing about the records themselves -- the ` +
            'lookup did not complete. Check that this host can reach a DNS resolver, then ' +
            're-check.',
        },
      ],
    };
  }

  const findings = [
    ...checkSpf(apexTxt, domain),
    ...checkDmarc(dmarcTxt, domain),
    dkimGuidance(domain, params.senderIsDomainVerified ?? null),
  ];

  return {
    domain,
    checkedAt: new Date().toISOString(),
    findings,
    passes: !findings.some((finding) => finding.level === 'error'),
  };
}
