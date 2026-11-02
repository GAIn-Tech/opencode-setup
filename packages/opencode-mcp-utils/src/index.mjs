/**
 * @typedef {{ type: 'text', text: string }} McpTextContent
 */

/**
 * @template T
 * @typedef {{
 *   content: McpTextContent[],
 *   structuredContent: T,
 *   isError?: boolean
 * }} McpPayload
 */

/**
 * @typedef {{
 *   source?: string,
 *   logger?: { error?: (...args: unknown[]) => void },
 *   telemetry?: {
 *     onSuccess?: (event: { source: string, input: unknown, output: unknown }) => void | Promise<void>,
 *     onError?: (event: { source: string, input: unknown, error: unknown, message: string }) => void | Promise<void>
 *   },
 *   errorMessage?: string | ((error: unknown, input: unknown) => string),
 *   errorExtras?: Record<string, unknown> | ((error: unknown, input: unknown) => Record<string, unknown>),
 *   passThroughPayload?: boolean,
 *   jsonSpace?: number,
 *   replacer?: (this: unknown, key: string, value: unknown) => unknown,
 * }} WrapMcpHandlerOptions
 */

function stringifyPayload(payload, replacer, jsonSpace = 2) {
  try {
    return JSON.stringify(payload, replacer, jsonSpace);
  } catch {
    return JSON.stringify({ error: 'Unable to serialize payload' }, null, jsonSpace);
  }
}

/**
 * @template T
 * @param {T} payload
 * @param {{ jsonSpace?: number, replacer?: (this: unknown, key: string, value: unknown) => unknown }} [options]
 * @returns {McpPayload<T>}
 */
export function createTextPayload(payload, options = {}) {
  const { jsonSpace = 2, replacer } = options;
  return {
    content: [{ type: 'text', text: stringifyPayload(payload, replacer, jsonSpace) }],
    structuredContent: payload,
  };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 * @param {{ jsonSpace?: number, replacer?: (this: unknown, key: string, value: unknown) => unknown }} [options]
 * @returns {McpPayload<Record<string, unknown>>}
 */
export function createErrorPayload(message, extra = {}, options = {}) {
  const payload = { error: message, ...extra };
  const base = createTextPayload(payload, options);
  return {
    ...base,
    isError: true,
  };
}

/**
 * @param {unknown} value
 * @returns {value is McpPayload<unknown>}
 */
export function isMcpPayload(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray(value.content)
      && 'structuredContent' in value,
  );
}

/**
 * Wrap an MCP tool handler with consistent payload conversion and error handling.
 *
 * @template TInput
 * @template TOutput
 * @param {(input: TInput) => Promise<TOutput> | TOutput} handler
 * @param {WrapMcpHandlerOptions} [options]
 * @returns {(input: TInput) => Promise<McpPayload<unknown>>}
 */
export function wrapMcpHandler(handler, options = {}) {
  const {
    source = 'mcp-handler',
    logger = console,
    telemetry,
    errorMessage,
    errorExtras,
    passThroughPayload = true,
    jsonSpace = 2,
    replacer,
  } = options;

  return async (input) => {
    try {
      const result = await handler(input);

      if (telemetry?.onSuccess) {
        await telemetry.onSuccess({ source, input, output: result });
      }

      if (passThroughPayload && isMcpPayload(result)) {
        return result;
      }

      return createTextPayload(result, { jsonSpace, replacer });
    } catch (error) {
      const message = typeof errorMessage === 'function'
        ? errorMessage(error, input)
        : (errorMessage || toErrorMessage(error));
      const extra = typeof errorExtras === 'function'
        ? errorExtras(error, input)
        : (errorExtras || {});

      logger?.error?.(`[${source}] handler error:`, error);

      if (telemetry?.onError) {
        await telemetry.onError({ source, input, error, message });
      }

      return createErrorPayload(message, extra, { jsonSpace, replacer });
    }
  };
}
