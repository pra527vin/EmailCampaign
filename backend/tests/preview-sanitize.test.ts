import { describe, expect, it } from 'vitest';
import { sanitizeForPreview } from '../src/services/template.service.js';

/**
 * The preview is only worth looking at if it agrees with the message that gets
 * sent. Everything below is markup the composer actually emits, so a tag or
 * attribute quietly falling off the allowlist would make the dashboard show
 * one email and the recipient receive another.
 */
describe('sanitizeForPreview', () => {
  it('keeps the social icons the composer draws as inline SVG', () => {
    const html = sanitizeForPreview(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
        'xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v16H4z" fill="#FFFFFF"/></svg>',
    );

    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain('d="M4 4h16v16H4z"');
    expect(html).toContain('fill="#FFFFFF"');
    // Without it the icon renders as a crop of itself rather than the glyph.
    expect(html.toLowerCase()).toContain('viewbox="0 0 24 24"');
  });

  it('keeps referrerpolicy, which is what makes some hosts serve the image', () => {
    const html = sanitizeForPreview(
      '<img src="https://cdn.example.com/logo.png" alt="" width="120" ' +
        'referrerpolicy="no-referrer" style="display:block;" />',
    );

    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('style="display:block"');
  });

  it('keeps the web font links, so the preview is in the delivered typeface', () => {
    const html = sanitizeForPreview(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />' +
        "<style>@import url('https://fonts.googleapis.com/css2?family=Inter');</style>",
    );

    expect(html).toContain('<link');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('@import');
  });

  it('keeps the inline styles email layout is built from', () => {
    const html = sanitizeForPreview(
      '<table role="presentation" width="100%" bgcolor="#0B2436" ' +
        'style="background:#0B2436;"><tr><td style="padding:32px 24px;text-align:center;">' +
        '<div style="position:relative;min-height:60px;">Hi</div></td></tr></table>',
    );

    expect(html).toContain('bgcolor="#0B2436"');
    expect(html).toContain('padding:32px 24px');
    expect(html).toContain('position:relative');
  });

  it('still drops anything that could run in the operator session', () => {
    const html = sanitizeForPreview(
      '<svg onload="alert(1)"><script>alert(2)</script>' +
        '<use href="javascript:alert(3)"></use>' +
        '<animate attributeName="href" to="javascript:alert(4)"></animate></svg>' +
        '<a href="javascript:alert(5)">bad</a>' +
        '<img src="javascript:alert(6)" />',
    );

    expect(html).not.toContain('onload');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<use');
    expect(html).not.toContain('<animate');
    expect(html).not.toContain('javascript:');
  });
});
