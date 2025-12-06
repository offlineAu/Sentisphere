export { default as api, setAuthToken } from './api';
export { parseApiError, handleNotFoundSilently, safeApiCall, batchApiCalls } from './error-handler';
export type { ApiError } from './error-handler';
