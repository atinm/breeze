import { z } from 'zod';

export type ToolResultContentBlock = {
  type: string;
  [key: string]: unknown;
};

export type ToolResult = {
  content: ToolResultContentBlock[];
  isError?: boolean;
};

export type ToolDefinition<TShape extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  inputSchema: TShape;
  inputSchemaObject: z.ZodObject<TShape>;
  inputJsonSchema: Record<string, unknown>;
  handler: (args: any) => Promise<ToolResult> | ToolResult;
};

export type ToolDefinitionOptions = {
  usageNotes?: string[];
};

export type ToolServerDefinition = {
  name: string;
  version?: string;
  tools: ToolDefinition[];
};

export function defineTool<TShape extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: TShape,
  handler: (args: z.infer<z.ZodObject<TShape>>) => Promise<ToolResult> | ToolResult,
  options?: ToolDefinitionOptions,
): ToolDefinition<TShape> {
  const inputSchemaObject = z.object(inputSchema);
  const enrichedDescription = buildToolDescription(description, inputSchemaObject, options);
  return {
    name,
    description: enrichedDescription,
    inputSchema,
    inputSchemaObject,
    inputJsonSchema: zodSchemaToJsonSchema(inputSchemaObject),
    handler,
  };
}

export function createToolServer(definition: ToolServerDefinition): ToolServerDefinition {
  return definition;
}

export function filterToolServerByAllowedNames(
  definition: ToolServerDefinition,
  allowedNames: string[],
): ToolServerDefinition {
  const allowed = new Set(allowedNames);
  return {
    ...definition,
    tools: definition.tools.filter((tool) => allowed.has(tool.name)),
  };
}

function zodSchemaToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const unwrapped = unwrapZod(schema);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodSchemaToJsonSchema(value as z.ZodTypeAny);
      if (!isOptionalSchema(value as z.ZodTypeAny)) required.push(key);
    }

    return {
      type: 'object',
      properties,
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (unwrapped instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (unwrapped instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (unwrapped instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodSchemaToJsonSchema(unwrapped.element),
    };
  }

  if (unwrapped instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: unwrapped.options,
    };
  }

  if (unwrapped instanceof z.ZodLiteral) {
    const value = unwrapped._def.value;
    return {
      const: value,
      type: typeof value,
    };
  }

  if (unwrapped instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodSchemaToJsonSchema(unwrapped.valueSchema),
    };
  }

  if (unwrapped instanceof z.ZodUnion) {
    return {
      anyOf: unwrapped._def.options.map((option: z.ZodTypeAny) => zodSchemaToJsonSchema(option)),
    };
  }

  if (unwrapped instanceof z.ZodNull) {
    return { type: 'null' };
  }

  if (unwrapped instanceof z.ZodAny || unwrapped instanceof z.ZodUnknown) {
    return {};
  }

  return {};
}

function buildToolDescription(
  description: string,
  inputSchemaObject: z.ZodObject<z.ZodRawShape>,
  options?: ToolDefinitionOptions,
): string {
  const sections: string[] = [description];
  const parameterGuide = buildParameterGuide(inputSchemaObject);
  if (parameterGuide) {
    sections.push(`Parameters:\n${parameterGuide}`);
  }

  const usageNotes = buildUsageNotes(inputSchemaObject, options);
  if (usageNotes.length > 0) {
    sections.push(`Usage notes:\n${usageNotes.map((note) => `- ${note}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

function buildParameterGuide(inputSchemaObject: z.ZodObject<z.ZodRawShape>): string {
  const lines: string[] = [];

  for (const [key, rawValue] of Object.entries(inputSchemaObject.shape)) {
    const schema = rawValue as z.ZodTypeAny;
    const unwrapped = unwrapZod(schema);
    const optional = isOptionalSchema(schema);
    const typeLabel = describeSchemaType(unwrapped);
    const enumHint = unwrapped instanceof z.ZodEnum ? ` one of: ${unwrapped.options.join(', ')}` : '';
    const identifierHint = buildIdentifierHint(key, unwrapped);
    lines.push(`- ${key} (${optional ? 'optional' : 'required'} ${typeLabel})${enumHint}${identifierHint}`);
  }

  return lines.join('\n');
}

function describeSchemaType(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return `array of ${describeSchemaType(unwrapZod(schema.element))}`;
  if (schema instanceof z.ZodEnum) return 'enum';
  if (schema instanceof z.ZodLiteral) return typeof schema._def.value;
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodRecord) return 'record';
  if (schema instanceof z.ZodUnion) return 'union';
  if (schema instanceof z.ZodNull) return 'null';
  return 'value';
}

function buildIdentifierHint(key: string, schema: z.ZodTypeAny): string {
  const looksLikeSingleId = key.endsWith('Id');
  const looksLikeIdList = key.endsWith('Ids');

  if (looksLikeSingleId && isUuidStringSchema(schema)) {
    return ' - must be a real Breeze UUID returned by another tool; do not invent placeholder values';
  }

  if (looksLikeIdList && schema instanceof z.ZodArray && isUuidStringSchema(unwrapZod(schema.element))) {
    return ' - each item must be a real Breeze UUID returned by another tool; do not invent placeholder values';
  }

  return '';
}

function isUuidStringSchema(schema: z.ZodTypeAny): boolean {
  const unwrapped = unwrapZod(schema);
  if (!(unwrapped instanceof z.ZodString)) return false;
  const checks = (unwrapped._def as { checks?: Array<{ kind?: string; check?: string }> }).checks ?? [];
  return checks.some((check) => check.kind === 'uuid' || check.check === 'string_format');
}

function buildUsageNotes(
  inputSchemaObject: z.ZodObject<z.ZodRawShape>,
  options?: ToolDefinitionOptions,
): string[] {
  const notes = [...(options?.usageNotes ?? [])];
  const shape = inputSchemaObject.shape;

  if ('deviceId' in shape || 'deviceIds' in shape) {
    notes.unshift(
      'If you do not already know the real Breeze device UUID, call query_devices first to resolve it.',
      'Do not use hostnames, labels, placeholder IDs, or words like "required" in deviceId/deviceIds fields.',
    );
  }

  return Array.from(new Set(notes));
}

function unwrapZod(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;

  while (
    current instanceof z.ZodOptional
    || current instanceof z.ZodNullable
    || current instanceof z.ZodDefault
    || current instanceof z.ZodEffects
    || current instanceof z.ZodBranded
    || current instanceof z.ZodCatch
    || current instanceof z.ZodPipeline
  ) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = current.removeDefault();
      continue;
    }
    if (current instanceof z.ZodCatch) {
      current = current._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }
    if (current instanceof z.ZodBranded) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodPipeline) {
      current = current._def.out;
      continue;
    }
  }

  return current;
}

function isOptionalSchema(schema: z.ZodTypeAny): boolean {
  return schema.isOptional() || schema instanceof z.ZodDefault || schema instanceof z.ZodCatch;
}
