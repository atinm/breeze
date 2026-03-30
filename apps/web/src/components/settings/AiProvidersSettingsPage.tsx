import { Bot, Building2, Shield } from 'lucide-react';
import { useOrgStore } from '../../stores/orgStore';
import { useAuthStore } from '../../stores/auth';
import { getAuthScopeFromToken } from '../../lib/authScope';
import PartnerAiProvidersTab from './PartnerAiProvidersTab';

export default function AiProvidersSettingsPage() {
  const { currentPartnerId, partners, isLoading } = useOrgStore();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const authScope = getAuthScopeFromToken(accessToken);
  const currentPartner = partners.find((partner) => partner.id === currentPartnerId) ?? null;

  if (authScope !== 'partner' && !currentPartnerId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950">
        <Building2 className="mx-auto h-12 w-12 text-amber-500" />
        <h2 className="mt-4 text-lg font-semibold">No Partner Selected</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a partner from the header to view and edit AI provider settings.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading AI provider settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {authScope === 'system' && currentPartner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <p className="font-medium">System admin editing partner AI provider settings</p>
              <p className="text-amber-800/90 dark:text-amber-200/90">
                Partner: {currentPartner.name}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Partner AI Providers</h1>
        <p className="text-sm text-muted-foreground">
          Configure model providers, defaults, API endpoints, and credentials for the selected partner.
        </p>
        <p className="text-sm text-muted-foreground">
          These settings apply across the whole partner. Existing AI conversations keep the provider they were created with; changes apply to new conversations.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <PartnerAiProvidersTab partnerId={currentPartnerId as string} />
      </section>
    </div>
  );
}
