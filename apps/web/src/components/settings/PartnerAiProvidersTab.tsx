import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../stores/auth';
import { useAiStore } from '../../stores/aiStore';
import { showToast } from '../shared/Toast';

type ProviderId = 'claude' | 'openai' | 'gemini' | 'copilot' | 'local' | 'ollama';

type ProviderConfig = {
  provider: ProviderId;
  enabled: boolean;
  defaultModel: string;
  allowedModels: string[] | null;
  endpoint: string | null;
  apiKeyRef: string | null;
  apiKeySet?: boolean;
  localEstimatedInputCostPerMillionCents?: number | null;
  localEstimatedOutputCostPerMillionCents?: number | null;
  options?: Record<string, unknown> | null;
  updatedAt?: string;
};

type ProviderFormState = {
  enabled: boolean;
  defaultModel: string;
  allowedModelsText: string;
  endpoint: string;
  apiKeyRef: string;
  apiKey: string;
  apiKeySet: boolean;
  localEstimatedInputCostPerMillionCents: string;
  localEstimatedOutputCostPerMillionCents: string;
};

type Props = {
  partnerId: string;
};

const PROVIDERS: Array<{ id: ProviderId; label: string; modelPlaceholder: string }> = [
  { id: 'claude', label: 'Claude', modelPlaceholder: 'claude-sonnet-4-5-20250929' },
  { id: 'openai', label: 'OpenAI', modelPlaceholder: 'gpt-4.1' },
  { id: 'gemini', label: 'Gemini', modelPlaceholder: 'gemini-2.5-pro' },
  { id: 'copilot', label: 'Copilot', modelPlaceholder: 'gpt-4.1' },
  { id: 'local', label: 'Local LLM', modelPlaceholder: 'llama3.1' },
  { id: 'ollama', label: 'Ollama', modelPlaceholder: 'qwen3:8b' },
];

function parseAllowedModels(text: string): string[] | null {
  const values = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

function normalizeForm(config?: ProviderConfig): ProviderFormState {
  return {
    enabled: config?.enabled ?? false,
    defaultModel: config?.defaultModel ?? '',
    allowedModelsText: (config?.allowedModels ?? []).join(', '),
    endpoint: config?.endpoint ?? '',
    apiKeyRef: config?.apiKeyRef ?? '',
    apiKey: '',
    apiKeySet: config?.apiKeySet ?? false,
    localEstimatedInputCostPerMillionCents:
      typeof config?.localEstimatedInputCostPerMillionCents === 'number'
        ? String(config.localEstimatedInputCostPerMillionCents)
        : '',
    localEstimatedOutputCostPerMillionCents:
      typeof config?.localEstimatedOutputCostPerMillionCents === 'number'
        ? String(config.localEstimatedOutputCostPerMillionCents)
        : '',
  };
}

function parseOptionalNonNegativeNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export default function PartnerAiProvidersTab({ partnerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<ProviderId | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<ProviderId, ProviderFormState>>(() => ({
    claude: normalizeForm(),
    openai: normalizeForm(),
    gemini: normalizeForm(),
    copilot: normalizeForm(),
    local: normalizeForm(),
    ollama: normalizeForm(),
  }));

  const hasPartnerId = useMemo(() => Boolean(partnerId), [partnerId]);

  const restartAiConversation = async (): Promise<boolean> => {
    const state = useAiStore.getState();
    const hadSession = Boolean(state.sessionId);
    if (!hadSession) return false;

    await state.closeSession();

    if (state.isOpen) {
      await useAiStore.getState().createSession();
    }

    return true;
  };

  useEffect(() => {
    if (!hasPartnerId) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(`/ai/provider-configs?partnerId=${partnerId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || 'Failed to load provider settings');
        }
        const body = await res.json() as { data?: ProviderConfig[] };
        const rows = body.data ?? [];
        const next: Record<ProviderId, ProviderFormState> = {
          claude: normalizeForm(rows.find((r) => r.provider === 'claude')),
          openai: normalizeForm(rows.find((r) => r.provider === 'openai')),
          gemini: normalizeForm(rows.find((r) => r.provider === 'gemini')),
          copilot: normalizeForm(rows.find((r) => r.provider === 'copilot')),
          local: normalizeForm(rows.find((r) => r.provider === 'local')),
          ollama: normalizeForm(rows.find((r) => r.provider === 'ollama')),
        };
        setForms(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load provider settings');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [hasPartnerId, partnerId]);

  const updateProvider = (provider: ProviderId, patch: Partial<ProviderFormState>) => {
    setForms((prev) => {
      const next = { ...prev, [provider]: { ...prev[provider], ...patch } };
      if (patch.enabled) {
        for (const providerId of Object.keys(next) as ProviderId[]) {
          if (providerId !== provider) {
            next[providerId] = { ...next[providerId], enabled: false };
          }
        }
      }
      return next;
    });
  };

  const saveProvider = async (provider: ProviderId) => {
    const form = forms[provider];
    if (!form.defaultModel.trim()) {
      setError(`Default model is required for ${provider}`);
      return;
    }

    const localInputCost = parseOptionalNonNegativeNumber(form.localEstimatedInputCostPerMillionCents);
    const localOutputCost = parseOptionalNonNegativeNumber(form.localEstimatedOutputCostPerMillionCents);
    if (localInputCost === null || localOutputCost === null) {
      setError('Estimated cost fields must be non-negative numbers');
      return;
    }

    try {
      setSavingProvider(provider);
      setError(null);
      const res = await fetchWithAuth(`/ai/provider-configs/${provider}?partnerId=${partnerId}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: form.enabled,
          defaultModel: form.defaultModel.trim(),
          allowedModels: parseAllowedModels(form.allowedModelsText),
          endpoint: form.endpoint.trim() || null,
          apiKeyRef: form.apiKeyRef.trim() || null,
          apiKey: form.apiKey.trim() || undefined,
          localEstimatedInputCostPerMillionCents: localInputCost,
          localEstimatedOutputCostPerMillionCents: localOutputCost,
          options: null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to save ${provider} provider config`);
      }
      const restarted = await restartAiConversation();
      showToast({
        type: 'success',
        message: restarted
          ? `${provider} provider settings saved. Started a new AI conversation for the updated provider settings.`
          : `${provider} provider settings saved`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${provider} provider config`);
    } finally {
      setSavingProvider(null);
    }
  };

  const deleteProvider = async (provider: ProviderId) => {
    try {
      setDeletingProvider(provider);
      setError(null);
      const res = await fetchWithAuth(`/ai/provider-configs/${provider}?partnerId=${partnerId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to delete ${provider} provider config`);
      }
      setForms((prev) => ({ ...prev, [provider]: normalizeForm({ provider, enabled: false, defaultModel: '', allowedModels: null, endpoint: null, apiKeyRef: null, apiKeySet: false }) }));
      const restarted = await restartAiConversation();
      showToast({
        type: 'success',
        message: restarted
          ? `${provider} provider settings cleared. Started a new AI conversation for the updated provider settings.`
          : `${provider} provider settings cleared`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${provider} provider config`);
    } finally {
      setDeletingProvider(null);
    }
  };

  if (!hasPartnerId) {
    return <p className="text-sm text-muted-foreground">Partner context is required to configure AI providers.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading provider settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Configure provider defaults at the partner level. Organizations inherit these provider settings.
      </p>
      <p className="text-sm text-muted-foreground">
        Changing the enabled provider affects new AI conversations. Existing conversations continue using the provider they started with.
      </p>

      {PROVIDERS.map((provider) => {
        const form = forms[provider.id];
        const isSaving = savingProvider === provider.id;
        const isDeleting = deletingProvider === provider.id;
        return (
          <section key={provider.id} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{provider.label}</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => updateProvider(provider.id, { enabled: e.target.checked })}
                  className="h-4 w-4 rounded border"
                />
                Enabled
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default Model</label>
                <input
                  value={form.defaultModel}
                  onChange={(e) => updateProvider(provider.id, { defaultModel: e.target.value })}
                  placeholder={provider.modelPlaceholder}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Allowed Models (comma-separated)</label>
                <input
                  value={form.allowedModelsText}
                  onChange={(e) => updateProvider(provider.id, { allowedModelsText: e.target.value })}
                  placeholder={provider.modelPlaceholder}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Endpoint (optional)</label>
                <input
                  value={form.endpoint}
                  onChange={(e) => updateProvider(provider.id, { endpoint: e.target.value })}
                  placeholder="https://..."
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">API Key Reference (optional)</label>
                <input
                  value={form.apiKeyRef}
                  onChange={(e) => updateProvider(provider.id, { apiKeyRef: e.target.value })}
                  placeholder="vault://partner/ai/provider-key"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  API Key (optional)
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                  placeholder={form.apiKeySet ? 'Leave blank to keep existing key' : 'sk-...'}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
                {form.apiKeySet && !form.apiKey && (
                  <p className="text-xs text-muted-foreground">A key is already stored. Leave blank to keep it.</p>
                )}
              </div>
              {(provider.id === 'local' || provider.id === 'ollama') && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Estimated Input Cost / 1M Tokens (cents)</label>
                    <input
                      value={form.localEstimatedInputCostPerMillionCents}
                      onChange={(e) => updateProvider(provider.id, { localEstimatedInputCostPerMillionCents: e.target.value })}
                      placeholder="0"
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Estimated Output Cost / 1M Tokens (cents)</label>
                    <input
                      value={form.localEstimatedOutputCostPerMillionCents}
                      onChange={(e) => updateProvider(provider.id, { localEstimatedOutputCostPerMillionCents: e.target.value })}
                      placeholder="0"
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveProvider(provider.id)}
                disabled={isSaving || isDeleting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => void deleteProvider(provider.id)}
                disabled={isSaving || isDeleting}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
