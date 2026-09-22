import { Banner } from './banner';
import { BulletList } from './bullet-list';
import { ButtonLink } from './button-link';
import { DataTable } from './data-table';
import { Divider, Spacer } from './divider';
import { IconRow } from './icon-row';
import { ImageBlock } from './image-block';
import { LinkText } from './link-text';
import { Logo } from './logo';
import { Section } from './section';
import { Text } from './text';

export {
  Banner,
  BulletList,
  ButtonLink,
  DataTable,
  Divider,
  IconRow,
  ImageBlock,
  LinkText,
  Logo,
  Section,
  Spacer,
  Text,
};

/**
 * The block registry.
 *
 * craft.js stores a node's type as the *key* used here, so these names are
 * part of the saved format: renaming one silently breaks every design already
 * stored, and `isRestorable` will discard those designs rather than crash.
 * The exporter switches on the same names.
 */
export const resolver = {
  Section,
  Banner,
  Logo,
  Text,
  ButtonLink,
  LinkText,
  ImageBlock,
  IconRow,
  Divider,
  Spacer,
  BulletList,
  DataTable,
};
