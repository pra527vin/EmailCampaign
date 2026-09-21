'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { Glyph } from '@/components/icons';
import { Modal } from '@/components/modal';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  formatDate,
  IconButton,
  LinkButton,
  PageHeader,
  Pagination,
  Spinner,
  StatusBadge,
  Toggle,
} from '@/components/ui';
import type { EmailTemplate, Paginated, TemplateStatus } from '@/lib/types';

function TemplatesTable() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Paginated<EmailTemplate> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paginated<EmailTemplate>>(`/templates?page=${page}&pageSize=20`));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Confirm a creation that redirected here, then strip the query parameter so
  // the banner does not reappear on refresh or when the link is shared.
  const createdName = params.get('created');
  useEffect(() => {
    if (!createdName) return;
    setNotice(`Template "${createdName}" created.`);
    router.replace('/templates');
  }, [createdName, router]);

  async function withBusy(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  const toggleStatus = (template: EmailTemplate) => {
    const next: TemplateStatus = template.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return withBusy(template.id, () => api.patch(`/templates/${template.id}/status`, { status: next }));
  };

  const duplicate = (template: EmailTemplate) =>
    withBusy(template.id, () => api.post(`/templates/${template.id}/duplicate`));

  const remove = (template: EmailTemplate) =>
    withBusy(template.id, () => api.delete(`/templates/${template.id}`));

  return (
    <>
      <PageHeader
        title="Templates"
        description="HTML email templates with {{variable}} personalisation."
        actions={<LinkButton href="/templates/new" variant="primary">New template</LinkButton>}
      />

      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        </div>
      )}

      <Card>
        {!data ? (
          <Spinner label="Loading templates" />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="No templates yet"
            description="Create a template or paste in HTML you already have. Only active templates can be used for a campaign."
            action={<LinkButton href="/templates/new" variant="primary">New template</LinkButton>}
          />
        ) : (
          <>
            <DataTable
              items={data.items}
              getKey={(template) => template.id}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  primary: true,
                  cell: (template) => (
                    <>
                      <Link
                        href={`/templates/${template.id}`}
                        className="font-medium text-slate-900 transition-colors hover:text-brand-700"
                      >
                        {template.name}
                      </Link>
                      {template.description && (
                        <span className="block max-w-xs truncate text-xs text-slate-500">
                          {template.description}
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  key: 'subject',
                  header: 'Default subject',
                  hide: 'md',
                  cell: (template) => (
                    <span className="block max-w-xs truncate text-slate-600">{template.subject}</span>
                  ),
                },
                {
                  key: 'updated',
                  header: 'Updated',
                  hide: 'xl',
                  cell: (template) => (
                    <span className="whitespace-nowrap text-slate-500">
                      {formatDate(template.updatedAt)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (template) => (
                    <div className="flex items-center gap-2.5">
                      <Toggle
                        checked={template.status === 'ACTIVE'}
                        busy={busyId === template.id}
                        label={
                          template.status === 'ACTIVE'
                            ? `Deactivate ${template.name}`
                            : `Activate ${template.name}`
                        }
                        onChange={() => void toggleStatus(template)}
                      />
                      <StatusBadge status={template.status} />
                    </div>
                  ),
                },
              ]}
              actions={(template) => (
                <>
                  <IconButton
                    label={`Edit ${template.name}`}
                    disabled={busyId === template.id}
                    onClick={() => router.push(`/templates/${template.id}`)}
                  >
                    <Glyph name="edit" />
                  </IconButton>
                  <IconButton
                    label={`Duplicate ${template.name}`}
                    disabled={busyId === template.id}
                    onClick={() => void duplicate(template)}
                  >
                    <Glyph name="duplicate" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${template.name}`}
                    tone="danger"
                    disabled={busyId === template.id}
                    onClick={() => setDeleting(template)}
                  >
                    <Glyph name="trash" />
                  </IconButton>
                </>
              )}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(deleting)}
        title="Delete this template?"
        onClose={() => setDeleting(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busyId === deleting?.id}
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target) void remove(target);
              }}
            >
              Delete template
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{deleting?.name}</span> will be removed.
          This cannot be undone.
        </p>
      </Modal>
    </>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading templates" />}>
      <TemplatesTable />
    </Suspense>
  );
}
