import { describe, expect, it } from 'vitest';
import { analyzeEmailHtml } from '@mailstrive/shared';

const codes = (html: string) => analyzeEmailHtml(html).map((warning) => warning.code);

describe('analyzeEmailHtml', () => {
  it('passes a well-formed email template with no warnings', () => {
    const html = `
      <html><body>
        <table role="presentation" width="600" style="width:600px;">
          <tr><td style="padding:32px;">
            <h1 style="font-size:22px;">Hello Ada,</h1>
            <p style="font-size:15px;line-height:24px;">
              We have shipped a new reporting dashboard for your store. It brings
              order trends and payouts into one place, so you can see how the
              month is going without exporting anything.
            </p>
            <img src="https://example.com/logo.png" alt="Example logo" width="120" />
            <a href="{{unsubscribe_url}}">Unsubscribe</a>
          </td></tr>
        </table>
      </body></html>`;

    expect(analyzeEmailHtml(html)).toEqual([]);
  });

  it('flags a JavaScript-driven web page as unusable', () => {
    // The shape of a single-page app export: a mount point, a bundle, and a
    // noscript fallback. This is what produces a blank email.
    const html = `<!DOCTYPE html><html><head><title>App</title></head><body>
        <div id="root"></div>
        <noscript>This page requires JavaScript to display.</noscript>
        <script src="/static/js/main.9f2c.js"></script>
      </body></html>`;

    const found = codes(html);
    expect(found).toContain('JS_RENDERED_CONTENT');
    expect(found).toContain('CONTAINS_NOSCRIPT');

    const fatal = analyzeEmailHtml(html).find((w) => w.code === 'JS_RENDERED_CONTENT');
    expect(fatal?.level).toBe('error');
    expect(fatal?.message).toMatch(/blank message/i);
  });

  it('flags scripts even when there is plenty of real content', () => {
    const html = `<html><body>
        <p>${'Real newsletter copy that a person would actually read. '.repeat(6)}</p>
        <script>trackOpen();</script>
      </body></html>`;

    const found = codes(html);
    expect(found).toContain('CONTAINS_SCRIPT');
    // Not the fatal one: the message still has readable content.
    expect(found).not.toContain('JS_RENDERED_CONTENT');
  });

  it('flags an external stylesheet', () => {
    const html = `<html><head><link rel="stylesheet" href="https://example.com/a.css"></head>
      <body><p>${'Some genuine body copy for this message. '.repeat(5)}</p></body></html>`;

    expect(codes(html)).toContain('EXTERNAL_STYLESHEET');
  });

  it('ignores markup that only Outlook can reach', () => {
    // The 96 DPI settings block every email boilerplate carries. It sits in a
    // conditional comment, so no client outside Outlook parses it -- warning
    // about the <noscript> some versions of it wrap would describe a message
    // nobody receives.
    const html = `<html><head><!--[if mso]>
        <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings></xml></noscript>
        <![endif]--></head>
      <body><p>${'Real copy a person would actually read in this message. '.repeat(4)}</p></body></html>`;

    expect(codes(html)).not.toContain('CONTAINS_NOSCRIPT');
  });

  it('still flags a noscript block that recipients would really see', () => {
    const html = `<html><body>
        <p>${'Real copy a person would actually read in this message. '.repeat(4)}</p>
        <noscript>Enable JavaScript to view this.</noscript>
      </body></html>`;

    expect(codes(html)).toContain('CONTAINS_NOSCRIPT');
  });

  it('keeps the content of a revealed conditional, which everything but Outlook shows', () => {
    // The markers are commented, the content is not -- that is the whole point
    // of the form, so stripping the markers must leave the image behind.
    const html = `<html><body>
        <p>${'Real copy a person would actually read in this message. '.repeat(4)}</p>
        <!--[if !mso]><!--><img src="https://cdn.example.com/a.png"><!--<![endif]-->
      </body></html>`;

    expect(codes(html)).toContain('IMAGE_WITHOUT_ALT');
  });

  it('does not treat a web font stylesheet as a lost design', () => {
    // The layout is inline and the stack ends in a family installed everywhere,
    // so a client that refuses the request changes the typeface, not the email.
    const html = `<html><head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap" />
      </head>
      <body style="font-family:Inter, Helvetica, Arial, sans-serif;">
        <p style="margin:0;">${'Real copy a person would actually read in this message. '.repeat(4)}</p>
      </body></html>`;

    expect(codes(html)).not.toContain('EXTERNAL_STYLESHEET');
  });

  it('flags a font stylesheet alongside a real one', () => {
    const html = `<html><head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />
        <link rel="stylesheet" href="https://example.com/site.css" />
      </head>
      <body><p>${'Real copy a person would actually read in this message. '.repeat(4)}</p></body></html>`;

    expect(codes(html)).toContain('EXTERNAL_STYLESHEET');
  });

  it('flags forms and images without alt text', () => {
    const html = `<html><body>
        <p>${'Body copy that comfortably exceeds the minimum length. '.repeat(4)}</p>
        <form action="/x"><input name="q" /></form>
        <img src="https://example.com/a.png" width="10" />
      </body></html>`;

    const found = codes(html);
    expect(found).toContain('CONTAINS_FORM');
    expect(found).toContain('IMAGE_WITHOUT_ALT');
  });

  it('does not flag an image that has alt text', () => {
    const html = `<html><body><p>${'Readable copy here. '.repeat(10)}</p>
      <img src="a.png" alt="A description" /></body></html>`;

    expect(codes(html)).not.toContain('IMAGE_WITHOUT_ALT');
  });

  it('flags a body with no readable text at all', () => {
    expect(codes('<html><body><table><tr><td></td></tr></table></body></html>')).toContain(
      'NO_TEXT_CONTENT',
    );
  });

  it('treats the shipped example template as clean', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const html = readFileSync(
      join(process.cwd(), '..', 'examples', 'merchant-announcement.html'),
      'utf8',
    );

    // The template we ship must not trip our own checks.
    expect(analyzeEmailHtml(html)).toEqual([]);
  });
});
