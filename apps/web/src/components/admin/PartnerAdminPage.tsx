import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../stores/auth';
import SystemAdminGuard from '../auth/SystemAdminGuard';
import PartnerCombobox from '../shared/PartnerCombobox';

type PartnerType = 'msp' | 'enterprise' | 'internal';

type PartnerRecord = {
  id: string;
  name: string;
  slug: string;
  type: PartnerType;
  plan: string;
  status: string;
  billingEmail: string | null;
  maxOrganizations: number | null;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type PartnerPayload = {
  name: string;
  slug: string;
  type: PartnerType;
  billingEmail: string | null;
  maxOrganizations: number | null;
  settings?: Record<string, unknown>;
};

type FormState = {
  name: string;
  slug: string;
  type: PartnerType;
  billingEmail: string;
  maxOrganizations: string;
  settingsJson: string;
};

type ViewMode = 'empty' | 'create' | 'details';

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  type: 'msp',
  billingEmail: '',
  maxOrganizations: '',
  settingsJson: '{\n  \n}',
};

function toForm(partner: PartnerRecord): FormState {
  return {
    name: partner.name,
    slug: partner.slug,
    type: partner.type,
    billingEmail: partner.billingEmail ?? '',
    maxOrganizations: partner.maxOrganizations == null ? '' : String(partner.maxOrganizations),
    settingsJson: JSON.stringify(partner.settings ?? {}, null, 2),
  };
}

function tryParseSettings(raw: string): { value?: Record<string, unknown>; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Settings JSON must be an object.' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: 'Settings JSON is invalid.' };
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export default function PartnerAdminPage() {
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('empty');
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );

  const filteredPartners = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) =>
      partner.name.toLowerCase().includes(query)
      || partner.slug.toLowerCase().includes(query)
      || partner.type.toLowerCase().includes(query),
    );
  }, [partners, searchQuery]);

  const loadPartners = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetchWithAuth('/partners?limit=200');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to load partners');
      }

      const body = (await response.json()) as { data?: PartnerRecord[] };
      const data = body.data ?? [];
      setPartners(data);

      if (selectedPartnerId && !data.some((partner) => partner.id === selectedPartnerId)) {
        setSelectedPartnerId(null);
        setEditForm(EMPTY_FORM);
        setViewMode('empty');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPartnerId]);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (!selectedPartner) return;
    setEditForm(toForm(selectedPartner));
    setViewMode('details');
  }, [selectedPartner]);

  const handleSelectPartner = (partnerId: string | null) => {
    if (!partnerId) {
      setSelectedPartnerId(null);
      setNotice(null);
      setError(null);
      setViewMode('empty');
      return;
    }

    setSelectedPartnerId(partnerId);
    setNotice(null);
    setError(null);
    setViewMode('details');
  };

  const handleStartCreate = () => {
    setSelectedPartnerId(null);
    setCreateForm(EMPTY_FORM);
    setNotice(null);
    setError(null);
    setViewMode('create');
  };

  const handleCreate = async () => {
    setError(null);
    setNotice(null);

    if (!createForm.name.trim()) {
      setError('Partner name is required.');
      return;
    }

    const slug = createForm.slug.trim() ? createForm.slug.trim() : slugify(createForm.name);
    if (!slug) {
      setError('Slug is required.');
      return;
    }

    const parsedSettings = tryParseSettings(createForm.settingsJson);
    if (parsedSettings.error) {
      setError(parsedSettings.error);
      return;
    }

    const payload: PartnerPayload = {
      name: createForm.name.trim(),
      slug,
      type: createForm.type,
      billingEmail: createForm.billingEmail.trim() ? createForm.billingEmail.trim() : null,
      maxOrganizations: createForm.maxOrganizations.trim() ? Number(createForm.maxOrganizations) : null,
    };

    if (parsedSettings.value) payload.settings = parsedSettings.value;

    try {
      setIsCreating(true);
      const response = await fetchWithAuth('/partners', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to create partner');
      }

      const created = (await response.json()) as PartnerRecord;
      setCreateForm(EMPTY_FORM);
      setSelectedPartnerId(created.id);
      setNotice(`Partner "${created.name}" created.`);
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create partner');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPartner) return;

    setError(null);
    setNotice(null);

    if (!editForm.name.trim()) {
      setError('Partner name is required.');
      return;
    }

    if (!editForm.slug.trim()) {
      setError('Slug is required.');
      return;
    }

    const parsedSettings = tryParseSettings(editForm.settingsJson);
    if (parsedSettings.error) {
      setError(parsedSettings.error);
      return;
    }

    const payload: PartnerPayload = {
      name: editForm.name.trim(),
      slug: editForm.slug.trim(),
      type: editForm.type,
      billingEmail: editForm.billingEmail.trim() ? editForm.billingEmail.trim() : null,
      maxOrganizations: editForm.maxOrganizations.trim() ? Number(editForm.maxOrganizations) : null,
    };

    if (parsedSettings.value) payload.settings = parsedSettings.value;

    try {
      setIsSaving(true);
      const response = await fetchWithAuth(`/partners/${selectedPartner.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save partner');
      }

      const updated = (await response.json()) as PartnerRecord;
      setNotice(`Partner "${updated.name}" updated.`);
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save partner');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPartner) return;

    setError(null);
    setNotice(null);

    const confirmed = window.confirm(
      `Delete partner "${selectedPartner.name}"? This performs a soft delete and removes it from active lists.`,
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await fetchWithAuth(`/partners/${selectedPartner.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to delete partner');
      }

      setNotice(`Partner "${selectedPartner.name}" deleted.`);
      setSelectedPartnerId(null);
      setEditForm(EMPTY_FORM);
      setViewMode('empty');
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete partner');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SystemAdminGuard>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Partners</h1>
            <p className="text-sm text-muted-foreground">
              Create, inspect, update, and delete partner records.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Selected Partner
              <PartnerCombobox
                partners={partners}
                selectedPartnerId={selectedPartnerId}
                onSelect={handleSelectPartner}
                placeholder="Type to find a partner"
                title="Selected Partner"
                className="sm:min-w-[280px]"
              />
            </label>

            <div className="flex items-center gap-2 self-start sm:self-end">
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Create Partner
              </button>
              <button
                type="button"
                onClick={() => void loadPartners()}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search partners by name, slug, or type"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
              />
            </div>

            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredPartners.map((partner) => {
                const active = partner.id === selectedPartnerId && viewMode === 'details';
                return (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => handleSelectPartner(partner.id)}
                    className={`w-full rounded-md border px-3 py-3 text-left text-sm transition ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="font-medium">{partner.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {partner.slug} · {partner.type} · {partner.status}
                    </div>
                  </button>
                );
              })}

              {!isLoading && filteredPartners.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  {partners.length === 0 ? 'No partners found.' : 'No partners match your search.'}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            {viewMode === 'create' ? (
              <>
                <h2 className="text-sm font-semibold">Create Partner</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fill out the new partner record. The form starts empty by design.
                </p>
                <PartnerForm
                  form={createForm}
                  onChange={setCreateForm}
                  onSubmit={() => void handleCreate()}
                  submitLabel={isCreating ? 'Creating...' : 'Create Partner'}
                  disabled={isCreating}
                />
              </>
            ) : null}

            {viewMode === 'details' && selectedPartner ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{selectedPartner.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedPartner.slug} · {selectedPartner.type} · {selectedPartner.status}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Plan: {selectedPartner.plan}
                  </div>
                </div>

                <PartnerForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={() => void handleSave()}
                  submitLabel={isSaving ? 'Saving...' : 'Save Partner'}
                  disabled={isSaving || isDeleting}
                />

                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">Delete Partner</h3>
                  <p className="mt-1 text-xs text-destructive/90">
                    Soft delete only. This hides the partner from active lists and can be reversed later.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isSaving || isDeleting}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? 'Deleting...' : 'Delete Partner'}
                  </button>
                </div>
              </>
            ) : null}

            {viewMode === 'empty' ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">Select a partner</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Choose a partner from the list to view details and update or delete it, or use Create Partner to start a new record.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </SystemAdminGuard>
  );
}

type PartnerFormProps = {
  form: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
};

function PartnerForm({ form, onChange, onSubmit, submitLabel, disabled }: PartnerFormProps) {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Name
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Slug
          <input
            value={form.slug}
            onChange={(event) => onChange({ ...form, slug: event.target.value })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Type
          <select
            value={form.type}
            onChange={(event) => onChange({ ...form, type: event.target.value as PartnerType })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
          >
            <option value="msp">MSP</option>
            <option value="enterprise">Enterprise</option>
            <option value="internal">Internal</option>
          </select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Billing Email
          <input
            value={form.billingEmail}
            onChange={(event) => onChange({ ...form, billingEmail: event.target.value })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            placeholder="billing@example.com"
          />
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground md:col-span-2">
          Max Organizations
          <input
            value={form.maxOrganizations}
            onChange={(event) => onChange({ ...form, maxOrganizations: event.target.value })}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            inputMode="numeric"
            placeholder="Optional"
          />
        </label>
      </div>

      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Settings JSON
        <textarea
          value={form.settingsJson}
          onChange={(event) => onChange({ ...form, settingsJson: event.target.value })}
          className="min-h-[160px] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground"
          spellCheck={false}
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </div>
  );
}
