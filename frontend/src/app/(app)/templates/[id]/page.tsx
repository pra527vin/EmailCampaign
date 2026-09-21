'use client';

import { use, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { TemplateEditor } from '@/components/template-editor';
import { Alert, Spinner } from '@/components/ui';
import type { EmailTemplate } from '@/lib/types';

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EmailTemplate>(`/templates/${id}`)
      .then(setTemplate)
      .catch((caught) => setError(errorMessage(caught)));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!template) return <Spinner label="Loading template" />;

  // Keyed so switching templates remounts the editor with fresh state rather
  // than leaving the previous body in the textarea.
  return <TemplateEditor key={template.id} template={template} />;
}
