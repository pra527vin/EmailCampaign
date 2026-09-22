'use client';

import { useEditor } from '@craftjs/core';
import { Check, Copy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';
import { useBrandKit } from '@/lib/compose/brand-kit';
import { exportToEmailHtml } from '@/lib/compose/export-html';

/**
 * The generated markup, for taking the design somewhere else.
 *
 * Saving as a template is the normal path -- this is for the times the email
 * has to leave MailStrive: a hand-off to another team, a paste into a
 * different system, or simply reading what was produced.
 */
export function ExportModal({
  open,
  subject,
  preheader,
  onClose,
}: {
  open: boolean;
  subject: string;
  preheader: string;
  onClose: () => void;
}) {
  const { query } = useEditor();
  const { brand } = useBrandKit();
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!open) return '';
    try {
      return exportToEmailHtml({ json: query.getSerializedNodes(), brand, subject, preheader });
    } catch (error) {
      // Shown rather than thrown: a broken design should not take the editor
      // down, and the comment is visible in the same place the markup would be.
      return `<!-- Could not export: ${error instanceof Error ? error.message : String(error)} -->`;
    }
  }, [open, query, brand, subject, preheader]);

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (): void => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(subject || 'email-template')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Export HTML"
      description="Table-based markup with inline styles, ready to paste into another system."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          <Button type="button" onClick={download}>
            <Download size={14} />
            Download .html
          </Button>
        </>
      }
    >
      <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-[#E7EEF4]">
        {html}
      </pre>
    </Modal>
  );
}
