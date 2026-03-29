import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '../../stores/auth';
import { RefreshCw } from 'lucide-react';
import SystemAdminGuard from '../auth/SystemAdminGuard';

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

      if (data.length === 0) {
        setSelectedPartnerId(null);
        setEditForm(EMPTY_FORM);
        return;
      }

      const current = selectedPartnerId && data.find((partner) => partner.id === selectedPartnerId);
      const nextSelected = current ?? data[0];
      if (nextSelected) {
        setSelectedPartnerId(nextSelected.id);
        setEditForm(toForm(nextSelected));
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
  }, [selectedPartner]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Partner Administration</h1>
          <p className="text-sm text-muted-foreground">
            System-admin controls for creating partners and editing partner-level settings.
          </p>
        </div>
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

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Partners</h2>
          <p className="mt-1 text-xs text-muted-foreground">Select a partner to edit settings.</p>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {partners.map((partner) => {
              const active = partner.id === selectedPartnerId;
              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => setSelectedPartnerId(partner.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="font-medium">{partner.name}</div>
                  <div className="text-xs text-muted-foreground">{partner.slug} · {partner.type}</div>
                </button>
              );
            })}

            {!isLoading && partners.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No partners found.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Create Partner</h2>
            <p className="mt-1 text-xs text-muted-foreground">Creates a new partner record via `/partners`.</p>
            <PartnerForm
              form={createForm}
              onChange={setCreateForm}
              onSubmit={() => void handleCreate()}
              submitLabel={isCreating ? 'Creating...' : 'Create Partner'}
              disabled={isCreating}
            />
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Partner Settings</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Updates and deletes the selected partner via `/partners/:id`.
            </p>

            {selectedPartner ? (
              <>
                <PartnerForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={() => void handleSave()}
                  submitLabel={isSaving ? 'Saving...' : 'Save Partner Settings'}
                  disabled={isSaving || isDeleting}
                />
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                  <p className="mt-1 text-xs text-destructive/90">
                    Soft delete only. This hides the partner from active lists and can be reversed by a system admin.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isSaving || isDeleting}
                    className="mt-3 inline-flex h-9 items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Partner'}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Select a partner from the left list.
              </p>
            )}
          </section>
        </div>
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
    <div className="mt-3 space-y-3">
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
