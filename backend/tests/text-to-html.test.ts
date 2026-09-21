import { describe, expect, it } from 'vitest';
import { htmlToPlainText, plainTextToHtml, renderTemplate } from '@mailstrive/shared';

describe('plainTextToHtml', () => {
  it('escapes markup so a plain-text body cannot inject HTML', () => {
    const html = plainTextToHtml('Price < 10 & rising <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt; 10 &amp; rising');
  });

  it('escapes quotes, which would otherwise break out of an attribute', () => {
    const html = plainTextToHtml(`He said "hi" and 'bye'`);
    expect(html).toContain('&quot;hi&quot;');
    expect(html).toContain('&#39;bye&#39;');
  });

  it('leaves merge variables intact for the renderer', () => {
    const html = plainTextToHtml('Hi {{first_name | there}}, from {{store_name}}.');
    expect(html).toContain('{{first_name | there}}');
    expect(html).toContain('{{store_name}}');
  });

  it('still renders those variables after conversion', () => {
    const html = plainTextToHtml('Hi {{first_name}} at {{store_name}}.');
    const out = renderTemplate(html, { first_name: 'Ada', store_name: 'Acme' } as never);
    expect(out).toContain('Hi Ada at Acme.');
  });

  it('treats a blank line as a paragraph break and a single newline as a line break', () => {
    const html = plainTextToHtml('One\nTwo\n\nThree');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('<br />');
  });

  it('survives an empty body without producing a broken document', () => {
    const html = plainTextToHtml('   ');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('round-trips back to the text it came from', () => {
    const text = 'Hello there.\n\nThis is the second paragraph.';
    const back = htmlToPlainText(plainTextToHtml(text));
    expect(back).toContain('Hello there.');
    expect(back).toContain('This is the second paragraph.');
  });

  it('normalises CRLF so Windows-authored text does not gain blank lines', () => {
    const crlf = plainTextToHtml('One' + String.fromCharCode(13) + '\nTwo');
    const lf = plainTextToHtml('One\nTwo');
    expect(crlf).toBe(lf);
  });
});
