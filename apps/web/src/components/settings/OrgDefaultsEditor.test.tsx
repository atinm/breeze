import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrgDefaultsEditor from './OrgDefaultsEditor';

describe('OrgDefaultsEditor', () => {
  it('masks the enrollment secret by default and generates a new one', () => {
    const onDirty = vi.fn();

    render(
      <OrgDefaultsEditor
        organizationName="Acme Systems"
        onDirty={onDirty}
        defaults={{ enrollmentSecret: 'existing-secret' }}
      />
    );

    const input = screen.getByPlaceholderText('Optional secret required during agent enrollment') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(input.value).toHaveLength(32);
    expect(onDirty).toHaveBeenCalled();
  });
});
