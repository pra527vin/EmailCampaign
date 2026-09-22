'use client';

import { useEditor } from '@craftjs/core';
import { Trash2 } from 'lucide-react';
import { createElement } from 'react';
import { BrandKitPanel } from '@/components/compose/brand-kit-panel';
import { BTN_ICON, HINT } from '@/components/compose/inputs';
import { SettingsBoundary } from '@/components/compose/settings-boundary';

/**
 * The right-hand rail.
 *
 * It shows the selected block's own settings, and the Brand Kit when nothing
 * is selected -- so the rail is never empty, and the defaults are reachable
 * exactly when someone is between blocks and thinking about the whole email.
 */
export function SettingsPanel() {
  const { selected, actions, isEnabled } = useEditor((state, query) => {
    const [currentNodeId] = state.events.selected;
    const node = currentNodeId ? state.nodes[currentNodeId] : undefined;

    return {
      isEnabled: state.options.enabled,
      selected:
        currentNodeId && node
          ? {
              id: currentNodeId,
              name: node.data.custom.displayName || node.data.displayName,
              settings: node.related?.settings,
              isDeletable: query.node(currentNodeId).isDeletable(),
            }
          : undefined,
    };
  });

  if (!isEnabled) {
    return (
      <div className="px-4 pt-5 text-xs leading-relaxed text-slate-500">
        Settings are hidden in preview mode. Turn off preview to keep editing.
      </div>
    );
  }

  if (!selected) {
    return (
      <div>
        <div className="flex flex-col gap-[5px] px-4 pb-4 pt-5">
          <h3 className="text-base font-bold text-slate-900">Brand Kit</h3>
          <p className="text-2xs leading-relaxed text-slate-500">
            Set the name, fonts and colors once &mdash; every block can reuse them.
          </p>
        </div>
        <div className="border-t border-slate-200 px-4 pb-[34px] pt-[18px]">
          <BrandKitPanel />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2 px-4 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-[5px]">
          <h3 className="truncate text-base font-bold text-slate-900">{selected.name}</h3>
          <p className="text-2xs leading-relaxed text-slate-500">Block settings</p>
        </div>
        {selected.isDeletable ? (
          <button
            type="button"
            title="Delete block"
            onClick={() => actions.delete(selected.id)}
            className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>

      <div className="border-t border-slate-200 px-4 pb-[34px] pt-[18px]">
        {/* Keyed on the block, so a failure clears when another is picked. */}
        <SettingsBoundary resetKey={selected.id}>
          {selected.settings ? createElement(selected.settings) : (
            <p className={HINT}>This block has no editable settings.</p>
          )}
        </SettingsBoundary>
      </div>
    </div>
  );
}
