import type { BulletMarkerType } from './types';

/**
 * The marker drawn beside one list item.
 *
 * Real `<ul>`/`<ol>` markers are styled inconsistently across mail clients, so
 * a bullet list is a two-column table and the marker is just text in the first
 * cell. That makes the glyph our choice rather than the client's.
 */
export function markerFor(type: BulletMarkerType, index: number, custom: string): string {
  switch (type) {
    case 'number':
      return `${index + 1}.`;
    case 'check':
      return '✓';
    case 'arrow':
      return '→';
    case 'custom':
      return custom || '•';
    case 'bullet':
    default:
      return '•';
  }
}
