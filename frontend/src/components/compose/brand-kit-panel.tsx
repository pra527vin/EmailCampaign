'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  BTN_GHOST,
  BTN_PRIMARY,
  ColorInput,
  Field,
  FIELD_LABEL,
  FontInput,
  HINT,
  TextInput,
} from '@/components/compose/inputs';
import { useBrandKit } from '@/lib/compose/brand-kit';
import { googleUrlFor, toStack } from '@/lib/compose/fonts';

function CustomFonts() {
  const { brand, updateBrand } = useBrandKit();
  const fonts = brand.customFonts;
  const [family, setFamily] = useState('');
  const [url, setUrl] = useState('');

  const add = (): void => {
    const name = family.trim();
    if (!name) return;
    updateBrand({
      customFonts: [
        ...fonts,
        { id: `font-${Date.now()}`, label: name, stack: toStack(name), url: url.trim() },
      ],
    });
    setFamily('');
    setUrl('');
  };

  return (
    <div className="mb-4">
      <span className={FIELD_LABEL}>Custom fonts</span>

      {fonts.length ? (
        <div className="mb-2 space-y-1.5">
          {fonts.map((font) => (
            <div
              key={font.id}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-2"
            >
              <span className="flex-1 truncate text-xs text-slate-900" style={{ fontFamily: font.stack }}>
                {font.label}
              </span>
              {!font.url ? (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  no stylesheet
                </span>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  updateBrand({ customFonts: fonts.filter((entry) => entry.id !== font.id) })
                }
                title="Remove font"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
        <TextInput
          value={family}
          placeholder="Font family, e.g. Cormorant Garamond"
          onChange={setFamily}
        />
        <TextInput value={url} placeholder="Stylesheet URL (optional)" onChange={setUrl} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={add} className={`flex items-center gap-1.5 ${BTN_PRIMARY}`}>
            <Plus size={12} /> Add font
          </button>
          <button type="button" onClick={() => setUrl(googleUrlFor(family))} className={BTN_GHOST}>
            Fill Google Fonts URL
          </button>
        </div>
      </div>

      <span className={`mt-1 block ${HINT}`}>
        Fonts added here appear in every block&rsquo;s font picker, and their stylesheets are loaded
        on the canvas and linked from the exported email.
      </span>
    </div>
  );
}

/**
 * Brand defaults, shown when no block is selected.
 *
 * The settings rail is otherwise dead space while nothing is picked, and these
 * are exactly the values someone wants before they start placing blocks.
 */
export function BrandKitPanel() {
  const { brand, updateBrand } = useBrandKit();

  return (
    <>
      <Field label="Brand name">
        <TextInput value={brand.brandName} onChange={(v) => updateBrand({ brandName: v })} />
      </Field>
      <Field label="Default font" hint="Used by every block set to 'Brand Kit font'.">
        <FontInput
          value={brand.fontFamily}
          allowInherit={false}
          onChange={(v) => updateBrand({ fontFamily: v })}
        />
      </Field>

      <CustomFonts />

      <Field label="Primary color" hint="The default for new buttons and accents.">
        <ColorInput value={brand.primaryColor} onChange={(v) => updateBrand({ primaryColor: v })} />
      </Field>
      <Field label="Text color">
        <ColorInput value={brand.textColor} onChange={(v) => updateBrand({ textColor: v })} />
      </Field>
      <Field label="Muted / secondary color">
        <ColorInput value={brand.mutedColor} onChange={(v) => updateBrand({ mutedColor: v })} />
      </Field>
      <Field label="Page background">
        <ColorInput
          value={brand.backgroundColor}
          onChange={(v) => updateBrand({ backgroundColor: v })}
        />
      </Field>

      <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2.5 text-2xs leading-relaxed text-slate-700">
        Logos live on the blocks themselves: add a Logo block, or open a Banner or Image and add a
        logo layer you can drag anywhere over it.
      </div>
    </>
  );
}
