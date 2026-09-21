import { htmlToPlainText } from './render.js';

/**
 * Static analysis of template HTML.
 *
 * Email is not the web: no JavaScript, no external stylesheets, no forms. HTML
 * copied from a web page or exported from a site builder looks fine in a
 * browser and arrives blank or broken in a mailbox. The preview already shows
 * that outcome honestly -- a JS-driven page renders as nothing but its
 * `<noscript>` fallback -- but without an explanation the operator just sees a
 * confusing sentence and no reason for it. These checks supply the reason
 * before anyone sends to a real list.
 */

export type EmailHtmlWarningLevel = 'error' | 'warning';

export interface EmailHtmlWarning {
  code: string;
  level: EmailHtmlWarningLevel;
  message: string;
}

/** Below this, a message body is effectively empty for a reader. */
const MINIMUM_TEXT_LENGTH = 120;

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

export function analyzeEmailHtml(html: string): EmailHtmlWarning[] {
  const warnings: EmailHtmlWarning[] = [];

  const scriptCount = countMatches(html, /<script\b/gi);
  const hasNoscript = /<noscript\b/i.test(html);
  const visibleText = htmlToPlainText(html).trim();

  // The decisive case: nothing to read once scripting is off.
  if (visibleText.length < MINIMUM_TEXT_LENGTH && (scriptCount > 0 || hasNoscript)) {
    warnings.push({
      code: 'JS_RENDERED_CONTENT',
      level: 'error',
      message:
        'This looks like a web page rather than an email template: its content is drawn by ' +
        'JavaScript, and there is almost no static text. Email clients never run JavaScript, so ' +
        'recipients would receive a blank message. Start from an email template built with ' +
        'tables and inline styles.',
    });
  } else if (scriptCount > 0) {
    warnings.push({
      code: 'CONTAINS_SCRIPT',
      level: 'error',
      message:
        `Contains ${scriptCount} <script> tag${scriptCount === 1 ? '' : 's'}. Email clients strip ` +
        'or block scripts, and their presence is a strong spam signal that harms deliverability. ' +
        'Remove them.',
    });
  }

  if (hasNoscript) {
    warnings.push({
      code: 'CONTAINS_NOSCRIPT',
      level: 'warning',
      message:
        'Contains a <noscript> block. Because email clients have scripting disabled, its ' +
        'contents are exactly what recipients will see.',
    });
  }

  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) {
    warnings.push({
      code: 'EXTERNAL_STYLESHEET',
      level: 'error',
      message:
        'Links to an external stylesheet. Most email clients discard these, so the message will ' +
        'arrive unstyled. Use inline style attributes instead.',
    });
  }

  if (/<form\b/i.test(html)) {
    warnings.push({
      code: 'CONTAINS_FORM',
      level: 'warning',
      message:
        'Contains a <form>. Forms do not work in most email clients. Link to a page on your site ' +
        'instead.',
    });
  }

  if (visibleText.length === 0) {
    warnings.push({
      code: 'NO_TEXT_CONTENT',
      level: 'error',
      message:
        'No readable text was found. A message with no text part is very likely to be filtered as ' +
        'spam, and screen readers would announce nothing.',
    });
  }

  if (/<img\b(?![^>]*\balt\s*=)/i.test(html)) {
    warnings.push({
      code: 'IMAGE_WITHOUT_ALT',
      level: 'warning',
      message:
        'An image has no alt attribute. Most clients block images by default, so the alt text is ' +
        'often all a recipient sees.',
    });
  }

  warnings.push(...analyzePlacementSignals(html, visibleText));

  return warnings;
}

/**
 * Content signals that decide *which* folder a legitimate message lands in.
 *
 * Gmail sorts mail it already trusts into Primary or Promotions, and it reads
 * the message the way a person would: a wall of images with a big call to
 * action and twenty links is a marketing email, whatever the headers say. These
 * checks describe what the content looks like so the trade-off is a choice.
 *
 * Note what is *not* here. Nothing suggests removing List-Unsubscribe, hiding
 * the unsubscribe link, or dressing a bulk message up as a personal one --
 * those are filter evasion, they breach Google's bulk sender requirements and
 * anti-spam law, and they damage the sender reputation that actually decides
 * placement. Tab placement is earned with relevance and engagement, not tricks.
 */

/** Links past this count read as a newsletter rather than a message. */
const MANY_LINKS = 12;
/** Below this ratio of text to images, a message reads as an image campaign. */
const MIN_TEXT_PER_IMAGE = 80;

function analyzePlacementSignals(html: string, visibleText: string): EmailHtmlWarning[] {
  const warnings: EmailHtmlWarning[] = [];

  const imageCount = countMatches(html, /<img\b/gi);
  const linkCount = countMatches(html, /<a\b[^>]*href/gi);

  if (imageCount > 0 && visibleText.length / imageCount < MIN_TEXT_PER_IMAGE) {
    warnings.push({
      code: 'IMAGE_HEAVY',
      level: 'warning',
      message:
        `${imageCount} image${imageCount === 1 ? '' : 's'} against ${visibleText.length} ` +
        'characters of text. Image-dominated messages are routinely sorted into Promotions, and ' +
        'because most clients block images by default many recipients would see almost nothing. ' +
        'Lead with text and use images to support it.',
    });
  }

  if (linkCount > MANY_LINKS) {
    warnings.push({
      code: 'MANY_LINKS',
      level: 'warning',
      message:
        `${linkCount} links. A long list of destinations is a strong newsletter signal. One clear ` +
        'action, repeated at most twice, keeps a message closer to ordinary correspondence.',
    });
  }

  // A 1x1 image is a tracking pixel: a well-known promotional marker, and in
  // several jurisdictions it needs consent of its own.
  if (/<img\b[^>]*\b(?:width|height)\s*=\s*["']?1["']?[\s>]/i.test(html)) {
    warnings.push({
      code: 'TRACKING_PIXEL',
      level: 'warning',
      message:
        'Contains what looks like a 1x1 tracking pixel. Open tracking is a classic promotional ' +
        'marker, and privacy rules in some jurisdictions require consent for it.',
    });
  }

  if (/https?:\/\/(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|buff\.ly|is\.gd)\//i.test(html)) {
    warnings.push({
      code: 'URL_SHORTENER',
      level: 'error',
      message:
        'Uses a URL shortener. Shorteners hide the destination, are heavily abused in phishing, ' +
        'and carry the reputation of everyone else using them. Link to your own domain instead.',
    });
  }

  return warnings;
}
