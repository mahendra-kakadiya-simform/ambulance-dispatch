const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export interface ApiErrorInfo {
  code: string | null;
  message: string;
  // Field name -> first validation message, from a ValidationError's { details: { field: [msg] } }.
  fieldErrors: Record<string, string>;
}

export function extractApiError(error: unknown): ApiErrorInfo {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const inner = (data as { error?: unknown }).error as
        | { code?: unknown; message?: unknown; details?: unknown }
        | undefined;

      const code = typeof inner?.code === 'string' ? inner.code : null;
      const message = typeof inner?.message === 'string' ? inner.message : DEFAULT_ERROR_MESSAGE;
      const fieldErrors: Record<string, string> = {};

      if (inner?.details && typeof inner.details === 'object') {
        for (const [field, messages] of Object.entries(inner.details as Record<string, unknown>)) {
          if (Array.isArray(messages) && typeof messages[0] === 'string') {
            fieldErrors[field] = messages[0];
          }
        }
      }

      return { code, message, fieldErrors };
    }
  }
  return { code: null, message: DEFAULT_ERROR_MESSAGE, fieldErrors: {} };
}
