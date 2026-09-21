import { escapeHtml } from './render.js';

/**
 * Builds the HTML alternative for a template authored as plain text.
 *
 * Every message this application sends is multipart/alternative with both a
 * text and an HTML part. A message carrying only one of the two is a
 * well-recognised spam signal, and the codebase already goes out of its way to
 * derive the text part from HTML for the same reason -- this is that rule in
 * the other direction, so choosing "plain text" in the editor costs nothing at
 * the receiver.
 *
 * Two things matter here:
 *
 *  - **The author's text is escaped.** A plain-text body is not markup, so a
 *    literal `<b>` or a stray `&` must arrive as those characters rather than
 *    becoming a tag or a broken entity.
 *  - **`{{variables}}` survive.** Escaping runs before the merge does, so the
 *    placeholders have to come through untouched -- they contain no escapable
 *    characters, which is why escaping the whole body first is safe.
 *
 * The markup is deliberately plain: a table wrapper and paragraphs, using the
 * inline styles and table layout that mail clients still need in 2026.
 */
export function plainTextToHtml(text: string): string {
  // Blank lines separate paragraphs; single newlines are line breaks within
  // one, which is how people actually write plain text.
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = escapeHtml(block).split('\n').join('<br />\n        ');
      return `      <p style="margin:0 0 16px;">\n        ${lines}\n      </p>`;
    });

  const body =
    paragraphs.length > 0
      ? paragraphs.join('\n')
      : '      <p style="margin:0 0 16px;">&nbsp;</p>';

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;">
      <tr>
        <td style="padding:28px;font-size:15px;line-height:24px;color:#374151;">
${body}
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
