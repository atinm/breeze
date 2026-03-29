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
): ToolDefinition<TShape> {
  const inputSchemaObject = z.object(inputSchema);
  return {
    name,
    description,
    inputSchema,
    inputSchemaObject,
    inputJsonSchema: zodSchemaToJsonSchema(inputSchemaObject),
    handler,
  };
}

export function createToolServer(definition: ToolServerDefinition): ToolServerDefinition {
  return definition;
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
