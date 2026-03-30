import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useOrgStore } from '../../stores/orgStore';
import { useAuthStore } from '../../stores/auth';
import { getAuthScopeFromToken } from '../../lib/authScope';

export default function PartnerSettingsCard() {
  const { currentPartnerId, isLoading } = useOrgStore();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const authScope = getAuthScopeFromToken(accessToken);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until we know the scope
  const canOpenPartnerSettings = authScope === 'partner' || Boolean(currentPartnerId);

  if (!mounted || isLoading || !canOpenPartnerSettings) {
    return null;
  }

  return (
    <a
      href="/settings/partner"
      className="col-span-full rounded-lg border-2 border-primary/20 bg-primary/5 p-6 shadow-sm transition hover:border-primary hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-3">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Partner Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure MSP defaults, business hours, and contact information.
          </p>
        </div>
      </div>
    </a>
  );
}
