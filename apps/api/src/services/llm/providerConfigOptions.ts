export type ProviderConfigOptions = {
  apiKey?: string;
  localEstimatedInputCostPerMillionCents?: number;
  localEstimatedOutputCostPerMillionCents?: number;
} & Record<string, unknown>;

function asNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function parseProviderConfigOptions(raw: unknown): ProviderConfigOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const src = raw as Record<string, unknown>;
  const parsed: ProviderConfigOptions = { ...src };

  if (typeof src.apiKey !== 'string' || !src.apiKey.trim()) {
    delete parsed.apiKey;
  } else {
    parsed.apiKey = src.apiKey;
  }

  const inputCost = asNonNegativeNumber(src.localEstimatedInputCostPerMillionCents);
  if (inputCost === undefined) {
    delete parsed.localEstimatedInputCostPerMillionCents;
  } else {
    parsed.localEstimatedInputCostPerMillionCents = inputCost;
  }

  const outputCost = asNonNegativeNumber(src.localEstimatedOutputCostPerMillionCents);
  if (outputCost === undefined) {
    delete parsed.localEstimatedOutputCostPerMillionCents;
  } else {
    parsed.localEstimatedOutputCostPerMillionCents = outputCost;
  }

  return parsed;
}

export function mergeProviderConfigOptions(
  existingRaw: unknown,
  updates: {
    apiKey?: string | null;
    localEstimatedInputCostPerMillionCents?: number | null;
    localEstimatedOutputCostPerMillionCents?: number | null;
  },
): ProviderConfigOptions | null {
  const merged = parseProviderConfigOptions(existingRaw);

  if (updates.apiKey !== undefined) {
    if (typeof updates.apiKey === 'string' && updates.apiKey.trim()) {
      merged.apiKey = updates.apiKey.trim();
    } else {
      delete merged.apiKey;
    }
  }

  if (updates.localEstimatedInputCostPerMillionCents !== undefined) {
    const value = updates.localEstimatedInputCostPerMillionCents;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      merged.localEstimatedInputCostPerMillionCents = value;
    } else {
      delete merged.localEstimatedInputCostPerMillionCents;
    }
  }

  if (updates.localEstimatedOutputCostPerMillionCents !== undefined) {
    const value = updates.localEstimatedOutputCostPerMillionCents;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      merged.localEstimatedOutputCostPerMillionCents = value;
    } else {
      delete merged.localEstimatedOutputCostPerMillionCents;
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export function toProviderConfigResponse(optionsRaw: unknown): {
  options: Record<string, unknown> | null;
  apiKeySet: boolean;
  localEstimatedInputCostPerMillionCents: number | null;
  localEstimatedOutputCostPerMillionCents: number | null;
} {
  const parsed = parseProviderConfigOptions(optionsRaw);
  const {
    apiKey,
    localEstimatedInputCostPerMillionCents,
    localEstimatedOutputCostPerMillionCents,
    ...rest
  } = parsed;

  return {
    options: Object.keys(rest).length > 0 ? rest : null,
    apiKeySet: typeof apiKey === 'string' && apiKey.length > 0,
    localEstimatedInputCostPerMillionCents: typeof localEstimatedInputCostPerMillionCents === 'number'
      ? localEstimatedInputCostPerMillionCents
      : null,
    localEstimatedOutputCostPerMillionCents: typeof localEstimatedOutputCostPerMillionCents === 'number'
      ? localEstimatedOutputCostPerMillionCents
      : null,
  };
}
