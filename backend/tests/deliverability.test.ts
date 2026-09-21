import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as dns } from 'node:dns';
import { analyzeEmailHtml, checkDomainAuthentication } from '@mailstrive/shared';

/**
 * DNS is stubbed so these assert the *rules*, not the current state of any real
 * domain -- a test that resolved live records would fail the day someone edited
 * a zone file.
 */
function stubDns(records: Record<string, string[]>) {
  vi.spyOn(dns, 'resolveTxt').mockImplementation(async (name: string) => {
    const found = records[name];
    if (!found) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    return found.map((value) => [value]);
  });
}

const findingIds = (report: { findings: Array<{ id: string }> }) =>
  report.findings.map((finding) => finding.id);

describe('checkDomainAuthentication', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('reports a missing SPF record as blocking, with the record to publish', async () => {
    stubDns({ 'example.com': [], '_dmarc.example.com': ['v=DMARC1; p=none;'] });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    expect(report.passes).toBe(false);
    expect(findingIds(report)).toContain('SPF_MISSING');
    const spf = report.findings.find((finding) => finding.id === 'SPF_MISSING');
    expect(spf?.record).toEqual({
      name: 'example.com',
      type: 'TXT',
      value: 'v=spf1 include:amazonses.com ~all',
    });
  });

  it('flags an SPF record that does not authorise SES, and suggests a merge', async () => {
    stubDns({
      'example.com': ['v=spf1 include:_spf.google.com ~all'],
      '_dmarc.example.com': ['v=DMARC1; p=none; rua=mailto:d@example.com'],
    });

    const report = await checkDomainAuthentication({ domain: 'example.com' });
    const finding = report.findings.find((item) => item.id === 'SPF_MISSING_SES');

    expect(report.passes).toBe(false);
    // The suggestion must keep the existing sender rather than replace it.
    expect(finding?.record?.value).toBe('v=spf1 include:_spf.google.com include:amazonses.com ~all');
  });

  it('rejects two SPF records, which fail SPF outright', async () => {
    stubDns({
      'example.com': ['v=spf1 include:amazonses.com ~all', 'v=spf1 include:_spf.google.com ~all'],
      '_dmarc.example.com': ['v=DMARC1; p=reject; rua=mailto:d@example.com'],
    });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    expect(findingIds(report)).toContain('SPF_MULTIPLE');
    expect(report.passes).toBe(false);
  });

  it('treats a missing DMARC record as blocking for bulk senders', async () => {
    stubDns({ 'example.com': ['v=spf1 include:amazonses.com ~all'] });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    expect(findingIds(report)).toContain('DMARC_MISSING');
    expect(report.passes).toBe(false);
  });

  it('accepts p=none but asks for it to be tightened', async () => {
    stubDns({
      'example.com': ['v=spf1 include:amazonses.com ~all'],
      '_dmarc.example.com': ['v=DMARC1; p=none;'],
    });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    // p=none satisfies the requirement, so nothing is blocking...
    expect(report.passes).toBe(true);
    // ...but it is still called out, along with the absent reporting address.
    expect(findingIds(report)).toContain('DMARC_POLICY_NONE');
    expect(findingIds(report)).toContain('DMARC_NO_REPORTING');
  });

  it('passes a fully configured domain', async () => {
    stubDns({
      'example.com': ['v=spf1 include:amazonses.com -all'],
      '_dmarc.example.com': ['v=DMARC1; p=reject; rua=mailto:dmarc@example.com'],
    });

    const report = await checkDomainAuthentication({
      domain: 'example.com',
      senderIsDomainVerified: true,
    });

    expect(report.passes).toBe(true);
    expect(findingIds(report)).toContain('DKIM_DOMAIN_VERIFIED');
  });

  it('says DNS was unreachable instead of claiming the records are missing', async () => {
    vi.spyOn(dns, 'resolveTxt').mockImplementation(async () => {
      throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.id).toBe('DNS_UNAVAILABLE');
    // Crucially, no SPF/DMARC verdict is reported at all.
    expect(findingIds(report)).not.toContain('SPF_MISSING');
    expect(findingIds(report)).not.toContain('DMARC_MISSING');
  });

  it('still treats a genuine NODATA answer as a missing record', async () => {
    vi.spyOn(dns, 'resolveTxt').mockImplementation(async () => {
      throw Object.assign(new Error('no data'), { code: 'ENODATA' });
    });

    const report = await checkDomainAuthentication({ domain: 'example.com' });

    expect(findingIds(report)).toContain('SPF_MISSING');
    expect(findingIds(report)).toContain('DMARC_MISSING');
  });

  it('calls out a domain SES has not verified, because DKIM cannot align', async () => {
    stubDns({
      'example.com': ['v=spf1 include:amazonses.com ~all'],
      '_dmarc.example.com': ['v=DMARC1; p=quarantine; rua=mailto:d@example.com'],
    });

    const report = await checkDomainAuthentication({
      domain: 'example.com',
      senderIsDomainVerified: false,
    });

    expect(report.passes).toBe(false);
    expect(findingIds(report)).toContain('DKIM_CHECK_CONSOLE');
  });
});

describe('analyzeEmailHtml placement signals', () => {
  const codes = (html: string) => analyzeEmailHtml(html).map((warning) => warning.code);

  const paragraph = (text: string) => `<p>${text.repeat(20)}</p>`;

  it('flags a message that is mostly images', () => {
    const html = `<html><body><p>Hi</p>${'<img src="https://x.example/a.png" alt="a">'.repeat(6)}</body></html>`;

    expect(codes(html)).toContain('IMAGE_HEAVY');
  });

  it('does not flag images that sit alongside real copy', () => {
    const html = `<html><body>${paragraph('Some genuine sentences for the reader. ')}<img src="https://x.example/a.png" alt="a"></body></html>`;

    expect(codes(html)).not.toContain('IMAGE_HEAVY');
  });

  it('flags a long list of links as a newsletter signal', () => {
    const links = '<a href="https://example.com/x">link</a> '.repeat(15);
    const html = `<html><body>${paragraph('Body copy. ')}${links}</body></html>`;

    expect(codes(html)).toContain('MANY_LINKS');
  });

  it('spots a 1x1 tracking pixel', () => {
    const html = `<html><body>${paragraph('Body copy. ')}<img src="https://t.example/o.gif" width="1" height="1" alt=""></body></html>`;

    expect(codes(html)).toContain('TRACKING_PIXEL');
  });

  it('treats a URL shortener as an error', () => {
    const html = `<html><body>${paragraph('Body copy. ')}<a href="https://bit.ly/abc">offer</a></body></html>`;

    expect(codes(html)).toContain('URL_SHORTENER');
  });

  it('leaves an ordinary text email alone', () => {
    const html = `<html><body>${paragraph('A short, plain update written for one reader. ')}<a href="https://example.com/a">one link</a></body></html>`;

    expect(analyzeEmailHtml(html)).toEqual([]);
  });
});
