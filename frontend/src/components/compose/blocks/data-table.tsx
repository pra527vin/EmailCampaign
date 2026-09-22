'use client';

import { useNode } from '@craftjs/core';
import { Minus, Plus } from 'lucide-react';
import ContentEditable from 'react-contenteditable';
import type { ContentEditableEvent } from 'react-contenteditable';
import {
  BackgroundInput,
  BTN_GHOST,
  ColorInput,
  Field,
  NumberInput,
  ToggleInput,
} from '@/components/compose/inputs';
import type { DataTableProps } from '@/lib/compose/types';

/**
 * Resizes the grid without losing what has been typed.
 *
 * Rebuilding row by row, reading through to the old cell where one exists,
 * means shrinking then growing again is not destructive until the change is
 * committed -- and a ragged array from an older saved design is squared up on
 * the way through.
 */
function ensureShape(cells: string[][], rows: number, cols: number): string[][] {
  const next: string[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < cols; c += 1) {
      row.push(cells[r]?.[c] ?? '');
    }
    next.push(row);
  }
  return next;
}

/** See `section.tsx` for why each block keeps its defaults as a constant. */
const DEFAULTS: DataTableProps = {
  cells: [
    ['Plan', 'Price', 'Storage'],
    ['Starter', '$9/mo', '10GB'],
    ['Pro', '$29/mo', '100GB'],
  ],
  headerRow: true,
  headerBg: '#0B2436',
  headerColor: '#FFFFFF',
  cellColor: '#0F1B2A',
  cellBg: '#FFFFFF',
  striped: true,
  stripedBg: '#FAFBFC',
  borderColor: '#E3E8EE',
  borderWidth: 1,
  cellPadding: 10,
  fontSize: 14,
};

/** A simple grid -- a pricing comparison, a spec list, an order summary. */
export function DataTable(props: Partial<DataTableProps>) {
  const {
    cells,
    headerRow,
    headerBg,
    headerColor,
    cellColor,
    cellBg,
    stripedBg,
    striped,
    borderColor,
    borderWidth,
    cellPadding,
    fontSize,
  } = { ...DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();

  const updateCell = (rowIndex: number, colIndex: number, text: string): void =>
    setProp((p: DataTableProps) => {
      const row = p.cells[rowIndex];
      if (row) row[colIndex] = text;
    });

  return (
    <table
      ref={(el) => {
        if (el) connect(drag(el));
      }}
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: 'collapse' }}
    >
      <tbody>
        {cells.map((row, rowIndex) => {
          const isHeader = headerRow && rowIndex === 0;
          const isStriped = striped && !isHeader && rowIndex % 2 === 0;
          return (
            // The grid has no stable per-row identity -- rows are positions,
            // not records -- so the index is the honest key here.
            <tr key={rowIndex}>
              {row.map((text, colIndex) => (
                <td
                  key={colIndex}
                  style={{
                    border: `${borderWidth}px solid ${borderColor}`,
                    padding: cellPadding,
                    background: isHeader ? headerBg : isStriped ? stripedBg : cellBg,
                    color: isHeader ? headerColor : cellColor,
                    fontSize,
                    fontWeight: isHeader ? 700 : 400,
                    textAlign: 'left',
                    verticalAlign: 'top',
                  }}
                >
                  <ContentEditable
                    html={text}
                    tagName="span"
                    onChange={(event: ContentEditableEvent) =>
                      updateCell(rowIndex, colIndex, event.target.value)
                    }
                    style={{ display: 'inline-block', minWidth: 8 }}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The +/- pair used for both dimensions. */
function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const button = `${BTN_GHOST} flex h-9 w-9 items-center justify-center px-0`;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        onClick={() => onChange(value - 1)}
        className={button}
      >
        <Minus size={13} />
      </button>
      <span className="w-8 text-center text-xs font-semibold text-slate-900">{value}</span>
      <button
        type="button"
        aria-label={`One more ${label}`}
        onClick={() => onChange(value + 1)}
        className={button}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function DataTableSettings() {
  const {
    actions: { setProp },
    ...p
  } = useNode((node) => node.data.props as DataTableProps);

  const rows = p.cells.length;
  const cols = p.cells[0]?.length ?? 0;

  return (
    <>
      <Field label="Rows">
        <Stepper
          value={rows}
          label="row"
          onChange={(next) =>
            setProp((n: DataTableProps) => {
              n.cells = ensureShape(n.cells, Math.max(1, next), cols);
            })
          }
        />
      </Field>
      <Field label="Columns">
        <Stepper
          value={cols}
          label="column"
          onChange={(next) =>
            setProp((n: DataTableProps) => {
              n.cells = ensureShape(n.cells, rows, Math.max(1, next));
            })
          }
        />
      </Field>
      <Field label="Header row">
        <ToggleInput
          value={p.headerRow}
          onChange={(v) => setProp((n: DataTableProps) => (n.headerRow = v))}
        />
      </Field>
      {p.headerRow ? (
        <>
          <Field label="Header background">
            <BackgroundInput
              value={p.headerBg}
              onChange={(v) => setProp((n: DataTableProps) => (n.headerBg = v))}
            />
          </Field>
          <Field label="Header text color">
            <ColorInput
              value={p.headerColor}
              onChange={(v) => setProp((n: DataTableProps) => (n.headerColor = v))}
            />
          </Field>
        </>
      ) : null}
      <Field label="Striped rows">
        <ToggleInput
          value={p.striped}
          onChange={(v) => setProp((n: DataTableProps) => (n.striped = v))}
        />
      </Field>
      {p.striped ? (
        <Field label="Stripe color">
          <ColorInput
            value={p.stripedBg}
            onChange={(v) => setProp((n: DataTableProps) => (n.stripedBg = v))}
          />
        </Field>
      ) : null}
      <Field label="Cell background">
        <ColorInput
          value={p.cellBg}
          onChange={(v) => setProp((n: DataTableProps) => (n.cellBg = v))}
        />
      </Field>
      <Field label="Cell text color">
        <ColorInput
          value={p.cellColor}
          onChange={(v) => setProp((n: DataTableProps) => (n.cellColor = v))}
        />
      </Field>
      <Field label="Border color">
        <ColorInput
          value={p.borderColor}
          onChange={(v) => setProp((n: DataTableProps) => (n.borderColor = v))}
        />
      </Field>
      <Field label="Border width">
        <NumberInput
          value={p.borderWidth}
          max={6}
          suffix="px"
          onChange={(v) => setProp((n: DataTableProps) => (n.borderWidth = v))}
        />
      </Field>
      <Field label="Cell padding">
        <NumberInput
          value={p.cellPadding}
          max={32}
          suffix="px"
          onChange={(v) => setProp((n: DataTableProps) => (n.cellPadding = v))}
        />
      </Field>
      <Field label="Font size">
        <NumberInput
          value={p.fontSize}
          min={10}
          max={22}
          suffix="px"
          onChange={(v) => setProp((n: DataTableProps) => (n.fontSize = v))}
        />
      </Field>
    </>
  );
}

DataTable.craft = {
  displayName: 'Table',
  props: DEFAULTS,
  related: { settings: DataTableSettings },
};
