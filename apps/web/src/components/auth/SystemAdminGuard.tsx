import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { isSystemScopeToken } from '../../lib/authScope';

type Props = {
  children: ReactNode;
};

export default function SystemAdminGuard({ children }: Props) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const isSystemAdmin = isSystemScopeToken(accessToken);

  if (!isSystemAdmin) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <h2 className="text-base font-semibold text-destructive">System admin access required</h2>
            <p className="mt-1 text-sm text-destructive/90">
              This admin page is restricted to system-scope users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
