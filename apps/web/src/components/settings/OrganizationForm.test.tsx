import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrganizationForm from './OrganizationForm';

describe('OrganizationForm', () => {
  it('shows a masked enrollment secret field and can generate a new secret', () => {
    render(
      <OrganizationForm
        defaultValues={{
          name: 'Acme Org',
          slug: 'acme-org',
          type: 'customer',
          status: 'active',
          maxDevices: 50,
          enrollmentSecret: 'existing-secret',
        }}
      />
    );

    const input = screen.getByPlaceholderText('Optional secret required during agent enrollment') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(screen.queryByText(/Changing the agent enrollment secret will invalidate/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(input.value).toHaveLength(32);
    expect(screen.getByText(/Changing the agent enrollment secret will invalidate/i)).not.toBeNull();
  });
});
