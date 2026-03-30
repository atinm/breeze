import { describe, expect, it } from 'vitest';
import { getOllamaAllowedMcpToolNames } from './ollamaToolFilter';

describe('getOllamaAllowedMcpToolNames', () => {
  it('includes disk tools for disk-related prompts and excludes playbooks by default', () => {
    const allowed = getOllamaAllowedMcpToolNames('Why is disk usage over 80% on this device?');

    expect(allowed).toContain('mcp__breeze__query_devices');
    expect(allowed).toContain('mcp__breeze__get_device_details');
    expect(allowed).toContain('mcp__breeze__analyze_disk_usage');
    expect(allowed).toContain('mcp__breeze__disk_cleanup');
    expect(allowed).not.toContain('mcp__breeze__execute_playbook');
  });

  it('includes playbook tools only when the query explicitly mentions playbooks', () => {
    const allowed = getOllamaAllowedMcpToolNames('Run the disk cleanup playbook on this device');

    expect(allowed).toContain('mcp__breeze__list_playbooks');
    expect(allowed).toContain('mcp__breeze__execute_playbook');
  });
});
