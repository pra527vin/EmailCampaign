/**
 * `navigator.platform` is deprecated but still the most reliable way to tell a
 * Mac keyboard from a PC one, and `userAgent` covers the browsers that have
 * dropped it. Getting this wrong only mislabels a key in a tooltip, so a best
 * guess is enough.
 */
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** How the modifier is written wherever a shortcut is named to the reader. */
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
