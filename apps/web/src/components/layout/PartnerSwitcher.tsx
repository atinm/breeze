import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { isSystemScopeToken } from '../../lib/authScope';
import { useOrgStore } from '../../stores/orgStore';
import PartnerCombobox from '../shared/PartnerCombobox';

export default function PartnerSwitcher() {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const isSystemAdmin = isSystemScopeToken(accessToken);
  const {
    currentPartnerId,
    partners,
    isLoading,
    setPartner,
    fetchPartners,
  } = useOrgStore();

  useEffect(() => {
    if (!isSystemAdmin) return;
    void fetchPartners();
  }, [fetchPartners, isSystemAdmin]);

  if (!isSystemAdmin) {
    return null;
  }

  if (isLoading && partners.length === 0) {
    return (
      <div className="flex h-9 min-w-[220px] items-center justify-center rounded-md border px-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PartnerCombobox
      partners={partners}
      selectedPartnerId={currentPartnerId}
      onSelect={setPartner}
      placeholder="Select Partner"
      title="Select Partner"
      compact
    />
  );
}
