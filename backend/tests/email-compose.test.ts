import { describe, expect, it } from 'vitest';
import {
  buildMimeMessage,
  composeEmail,
  createUnsubscribeToken,
  extractVariables,
  htmlToPlainText,
  renderTemplate,
  verifyUnsubscribeToken,
} from '@mailstrive/shared';

describe('renderTemplate', () => {
  it('substitutes variables and tolerates spacing', () => {
    const result = renderTemplate('Hi {{name}}, welcome to {{ store_name }}', {
      name: 'Ada',
      store_name: 'Ada Goods',
    });
    expect(result).toBe('Hi Ada, welcome to Ada Goods');
  });

  it('matches keys regardless of case and separators', () => {
    expect(renderTemplate('{{storeName}}', { store_name: 'Ada Goods' })).toBe('Ada Goods');
    expect(renderTemplate('{{store_name}}', { storeName: 'Ada Goods' })).toBe('Ada Goods');
  });

  it('uses the inline default when a value is missing or blank', () => {
    expect(renderTemplate('Hi {{first_name | there}}', {})).toBe('Hi there');
    expect(renderTemplate('Hi {{first_name | there}}', { first_name: '' })).toBe('Hi there');
  });

  it('reports missing variables that have no default', () => {
    const missing: string[] = [];
    renderTemplate('{{a}} {{b | x}} {{c}}', { a: '1' }, { onMissing: (name) => missing.push(name) });
    expect(missing).toEqual(['c']);
  });

  it('escapes substituted values in HTML context', () => {
    const result = renderTemplate('<p>{{name}}</p>', {
      name: '<script>alert(1)</script>',
    }, { escapeHtml: true });

    expect(result).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(result).not.toContain('<script>');
  });

  it('does not evaluate anything beyond simple substitution', () => {
    // No expression language means no server-side template injection.
    expect(renderTemplate('{{ 7*7 }}', {})).toBe('{{ 7*7 }}');
    expect(renderTemplate('{{constructor}}', {})).toBe('');
  });
});

describe('extractVariables', () => {
  it('collects distinct names across subject and body', () => {
    expect(extractVariables('Hi {{name}}', '<p>{{name}} {{store_name | x}}</p>')).toEqual([
      'name',
      'store_name',
    ]);
  });
});

describe('htmlToPlainText', () => {
  it('produces a readable alternative and keeps link targets', () => {
    const text = htmlToPlainText(
      '<html><body><h1>Hello</h1><p>Visit <a href="https://example.com">our store</a>.</p>' +
        '<script>ignored()</script></body></html>',
    );

    expect(text).toContain('Hello');
    expect(text).toContain('our store <https://example.com>');
    expect(text).not.toContain('ignored');
    expect(text).not.toContain('<p>');
  });

  it('decodes entities', () => {
    expect(htmlToPlainText('<p>Tom &amp; Jerry&nbsp;&mdash; done</p>')).toBe('Tom & Jerry — done');
  });
});

describe('unsubscribe tokens', () => {
  const secret = 'unit-test-secret-that-is-more-than-32-characters-long';

  it('round-trips the payload', () => {
    const token = createUnsubscribeToken({ e: 'A@Example.com', c: 'camp-1', r: 'cr-1' }, secret);
    const payload = verifyUnsubscribeToken(token, secret);

    expect(payload).toMatchObject({ e: 'a@example.com', c: 'camp-1', r: 'cr-1' });
  });

  it('rejects a tampered payload', () => {
    const token = createUnsubscribeToken({ e: 'victim@example.com' }, secret);
    const forgedPayload = Buffer.from(
      JSON.stringify({ e: 'someone-else@example.com', t: Math.floor(Date.now() / 1000) }),
    ).toString('base64url');
    const forged = `${forgedPayload}.${token.split('.')[1]}`;

    expect(verifyUnsubscribeToken(forged, secret)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = createUnsubscribeToken({ e: 'a@example.com' }, 'another-secret-of-sufficient-length-here');
    expect(verifyUnsubscribeToken(token, secret)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyUnsubscribeToken('nonsense', secret)).toBeNull();
    expect(verifyUnsubscribeToken('', secret)).toBeNull();
  });
});

describe('composeEmail', () => {
  const recipient = {
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    company: 'Ada Goods',
    storeName: 'Ada Goods',
    storeUrl: 'https://ada.example.com',
    customFields: { plan: 'Pro' },
  };

  it('personalises subject and body for one recipient only', () => {
    const composed = composeEmail({
      subject: 'Update for {{store_name}}',
      htmlContent: '<html><body><p>Hi {{first_name}}, you are on {{plan}}.</p></body></html>',
      recipient,
    });

    expect(composed.subject).toBe('Update for Ada Goods');
    expect(composed.html).toContain('Hi Ada, you are on Pro.');
    expect(composed.text).toContain('Hi Ada, you are on Pro.');
  });

  it('appends an unsubscribe footer when the template has none', () => {
    const composed = composeEmail({
      subject: 'Hello',
      htmlContent: '<html><body><p>Body</p></body></html>',
      recipient,
    });

    expect(composed.html).toContain(composed.unsubscribeUrl);
    expect(composed.html).toContain('Unsubscribe');
    expect(composed.text).toContain(composed.unsubscribeUrl);
    // Injected before </body>, not appended after the document.
    expect(composed.html.trimEnd().endsWith('</body></html>')).toBe(true);
  });

  it('does not duplicate the footer when the template already links out', () => {
    const composed = composeEmail({
      subject: 'Hello',
      htmlContent: '<html><body><a href="{{unsubscribe_url}}">Opt out</a></body></html>',
      recipient,
    });

    const occurrences = composed.html.split(composed.unsubscribeToken).length - 1;
    expect(occurrences).toBe(1);
  });

  it('produces a distinct unsubscribe token per recipient', () => {
    const first = composeEmail({ subject: 'x', htmlContent: '<p>x</p>', recipient });
    const second = composeEmail({
      subject: 'x',
      htmlContent: '<p>x</p>',
      recipient: { ...recipient, email: 'other@example.com' },
    });

    expect(first.unsubscribeToken).not.toBe(second.unsubscribeToken);
  });

  it('does not let a CSV column override the recipient address', () => {
    const composed = composeEmail({
      subject: '{{email}}',
      htmlContent: '<p>{{email}}</p>',
      recipient: { ...recipient, customFields: { email: 'attacker@evil.test' } },
    });

    expect(composed.subject).toBe('ada@example.com');
    expect(composed.html).toContain('ada@example.com');
    expect(composed.html).not.toContain('attacker@evil.test');
  });
});

describe('buildMimeMessage', () => {
  const base = {
    from: { email: 'campaigns@example.com', name: 'Example Team' },
    to: { email: 'ada@example.com', name: 'Ada Lovelace' },
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
  };

  it('emits the required RFC 5322 headers', () => {
    const { raw, messageId } = buildMimeMessage(base);
    const headers = raw.split('\r\n\r\n')[0] ?? '';

    expect(headers).toContain('From: "Example Team" <campaigns@example.com>');
    expect(headers).toContain('To: "Ada Lovelace" <ada@example.com>');
    expect(headers).toContain('MIME-Version: 1.0');
    expect(headers).toContain(`Message-ID: ${messageId}`);
    expect(headers).toMatch(/Date: \w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}/);
    expect(headers).toContain('Content-Type: multipart/alternative; boundary=');
  });

  it('addresses exactly one recipient and never uses CC or BCC', () => {
    const { raw } = buildMimeMessage(base);
    const headers = raw.split('\r\n\r\n')[0] ?? '';

    expect((headers.match(/^To:/gm) ?? []).length).toBe(1);
    expect(headers).not.toMatch(/^Cc:/im);
    expect(headers).not.toMatch(/^Bcc:/im);
  });

  it('adds List-Unsubscribe and one-click support when a URL is supplied', () => {
    const { raw } = buildMimeMessage({
      ...base,
      listUnsubscribeUrl: 'https://api.example.com/api/unsubscribe/tok',
      listUnsubscribeMailto: 'support@example.com',
    });

    expect(raw).toContain(
      'List-Unsubscribe: <mailto:support@example.com>, <https://api.example.com/api/unsubscribe/tok>',
    );
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  });

  it('omits List-Unsubscribe-Post when there is no https target', () => {
    const { raw } = buildMimeMessage({ ...base, listUnsubscribeMailto: 'support@example.com' });
    expect(raw).not.toContain('List-Unsubscribe-Post');
  });

  it('carries both a text and an HTML part', () => {
    const { raw, boundary } = buildMimeMessage(base);

    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(raw.split(`--${boundary}`).length - 1).toBe(3); // two parts plus the closing delimiter
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('RFC 2047-encodes a non-ASCII subject', () => {
    const { raw } = buildMimeMessage({ ...base, subject: 'Grüße aus München' });
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it('strips CR/LF so a value cannot inject extra headers', () => {
    const { raw } = buildMimeMessage({
      ...base,
      subject: 'Hello\r\nBcc: victim@example.com',
    });
    const headers = raw.split('\r\n\r\n')[0] ?? '';

    expect(headers).not.toMatch(/^Bcc:/im);
    expect(headers).toContain('Subject: Hello Bcc: victim@example.com');
  });
});
