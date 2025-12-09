/**
 * Global error handler utility for API requests
 */

export interface ApiError {
  status: number;
  message: string;
  isNotFound: boolean;
  isUnauthorized: boolean;
  isServerError: boolean;
  isNetworkError: boolean;
}

interface AxiosLikeError {
  response?: {
    status?: number;
    data?: { detail?: string; message?: string };
  };
  message?: string;
  code?: string;
  isAxiosError?: boolean;
}

function isAxiosLikeError(error: unknown): error is AxiosLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('response' in error || 'isAxiosError' in error)
  );
}

/**
 * Parse an error into a standardized ApiError object
 */
export function parseApiError(error: unknown): ApiError {
  if (isAxiosLikeError(error)) {
    const status = error.response?.status || 0;
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || 'An error occurred';
    
    return {
      status,
      message,
      isNotFound: status === 404,
      isUnauthorized: status === 401 || status === 403,
      isServerError: status >= 500,
      isNetworkError: !error.response && error.code === 'ERR_NETWORK',
    };
  }
  
  if (error instanceof Error) {
    return {
      status: 0,
      message: error.message,
      isNotFound: false,
      isUnauthorized: false,
      isServerError: false,
      isNetworkError: false,
    };
  }
  
  return {
    status: 0,
    message: 'An unknown error occurred',
    isNotFound: false,
    isUnauthorized: false,
    isServerError: false,
    isNetworkError: false,
  };
}

/**
 * Silently handle 404 errors (for deleted resources)
 * Returns true if error was handled (404), false otherwise
 */
export function handleNotFoundSilently(error: unknown): boolean {
  const apiError = parseApiError(error);
  if (apiError.isNotFound) {
    console.log('[API] Resource not found (404) - likely deleted:', apiError.message);
    return true;
  }
  return false;
}

/**
 * Safe API call wrapper that handles errors gracefully
 * Returns [data, error] tuple
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  options?: {
    silent404?: boolean;
    onError?: (error: ApiError) => void;
  }
): Promise<[T | null, ApiError | null]> {
  try {
    const result = await apiCall();
    return [result, null];
  } catch (error) {
    const apiError = parseApiError(error);
    
    // Silently handle 404s if requested
    if (options?.silent404 && apiError.isNotFound) {
      return [null, apiError];
    }
    
    // Call error handler if provided
    if (options?.onError) {
      options.onError(apiError);
    }
    
    return [null, apiError];
  }
}

/**
 * Batch API calls with individual error handling
 * Continues processing even if some calls fail
 */
export async function batchApiCalls<T>(
  calls: Array<() => Promise<T>>,
  options?: {
    silent404?: boolean;
    continueOnError?: boolean;
  }
): Promise<Array<{ result: T | null; error: ApiError | null }>> {
  const results: Array<{ result: T | null; error: ApiError | null }> = [];
  
  for (const call of calls) {
    try {
      const result = await call();
      results.push({ result, error: null });
    } catch (error) {
      const apiError = parseApiError(error);
      
      // Log but don't throw for 404s
      if (apiError.isNotFound && options?.silent404) {
        console.log('[API] Skipping deleted resource (404)');
      }
      
      results.push({ result: null, error: apiError });
      
      // Stop if continueOnError is false and it's not a 404
      if (!options?.continueOnError && !apiError.isNotFound) {
        break;
      }
    }
  }
  
  return results;
}
