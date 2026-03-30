const MCP_PREFIX = 'mcp__breeze__';

const CORE_TOOLS = [
  'query_devices',
  'get_device_details',
  'get_active_users',
];

const GENERAL_DIAGNOSTIC_TOOLS = [
  'analyze_metrics',
  'search_logs',
];

const DISK_TOOLS = [
  'analyze_disk_usage',
  'disk_cleanup',
  'search_logs',
];

const SERVICE_TOOLS = [
  'manage_services',
  'search_logs',
];

const PATCH_TOOLS = [
  'manage_patches',
];

const SECURITY_TOOLS = [
  'get_security_posture',
  'security_scan',
  'get_s1_status',
  'get_s1_threats',
  'get_huntress_status',
  'get_huntress_incidents',
];

const PLAYBOOK_TOOLS = [
  'list_playbooks',
  'execute_playbook',
  'get_playbook_history',
];

const REPORTING_TOOLS = [
  'generate_report',
  'get_fleet_health',
  'get_backup_health',
  'get_recovery_readiness',
];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function getOllamaAllowedMcpToolNames(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const allowed = new Set<string>([...CORE_TOOLS, ...GENERAL_DIAGNOSTIC_TOOLS]);

  if (includesAny(normalized, ['disk', 'storage', 'space', 'cleanup', 'clean up', 'full drive', 'full disk'])) {
    DISK_TOOLS.forEach((tool) => allowed.add(tool));
  }

  if (includesAny(normalized, ['service', 'daemon', 'restart', 'start', 'stop', 'spooler'])) {
    SERVICE_TOOLS.forEach((tool) => allowed.add(tool));
  }

  if (includesAny(normalized, ['patch', 'update', 'kb', 'hotfix'])) {
    PATCH_TOOLS.forEach((tool) => allowed.add(tool));
  }

  if (includesAny(normalized, ['security', 'threat', 'malware', 'virus', 'sentinelone', 'huntress', 'cis'])) {
    SECURITY_TOOLS.forEach((tool) => allowed.add(tool));
  }

  if (includesAny(normalized, ['report', 'summary', 'health', 'backup', 'recovery', 'readiness'])) {
    REPORTING_TOOLS.forEach((tool) => allowed.add(tool));
  }

  if (includesAny(normalized, ['playbook', 'workflow', 'runbook'])) {
    PLAYBOOK_TOOLS.forEach((tool) => allowed.add(tool));
  }

  return Array.from(allowed).map((tool) => `${MCP_PREFIX}${tool}`);
}
