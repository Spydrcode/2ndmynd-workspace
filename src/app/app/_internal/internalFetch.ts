/**
 * Internal Fetch Helper
 * 
 * Handles fetching from internal endpoints with proper guard detection.
 * Distinguishes between blocked-by-guard (404/401) and actual errors.
 */

export interface InternalFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  blockedByGuard: boolean;
}

export interface InternalFetchOptions {
  internalToken?: string | null;
  method?: string;
  body?: unknown;
}

/**
 * Fetch from an internal endpoint with guard detection.
 * 
 * @param url - The URL to fetch (should include ?internal=1 if needed)
 * @param options - Fetch options including internal token
 * @returns Result object with ok, status, data, error, and blockedByGuard
 */
export async function internalFetch<T = unknown>(
  url: string,
  options: InternalFetchOptions = {}
): Promise<InternalFetchResult<T>> {
  const { internalToken, method = "GET", body } = options;
  
  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...(internalToken ? { "x-2ndmynd-internal": internalToken } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    
    const response = await fetch(url, fetchOptions);
    
    // Check for guard blocks
    const blockedByGuard = isBlockedByGuard(response.status, await response.clone().text());
    
    if (!response.ok) {
      // Try to parse error message
      let errorMessage: string;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
      } catch {
        errorMessage = await response.text() || `HTTP ${response.status}`;
      }
      
      return {
        ok: false,
        status: response.status,
        error: errorMessage,
        blockedByGuard,
      };
    }
    
    // Parse successful response
    const data = await response.json() as T;
    
    return {
      ok: true,
      status: response.status,
      data,
      blockedByGuard: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
      blockedByGuard: false,
    };
  }
}

/**
 * Detect if a response indicates guard blocking.
 * 
 * Guards typically return:
 * - 404 with "Not found" (dev without internal=1)
 * - 401 with "Unauthorized" (prod without token)
 */
function isBlockedByGuard(status: number, body: string): boolean {
  if (status === 404) {
    // Check for plain "Not found" or JSON with error:"Not found"
    if (body.includes("Not found")) {
      return true;
    }
    try {
      const json = JSON.parse(body);
      if (json.error === "Not found") {
        return true;
      }
    } catch {
      // Not JSON
    }
  }
  
  if (status === 401) {
    // Check for "Unauthorized"
    if (body.includes("Unauthorized")) {
      return true;
    }
    try {
      const json = JSON.parse(body);
      if (json.error === "Unauthorized") {
        return true;
      }
    } catch {
      // Not JSON
    }
  }
  
  return false;
}

/**
 * Get a human-readable error message for display in UI.
 */
export function getDisplayErrorMessage(result: InternalFetchResult): string {
  if (result.blockedByGuard) {
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      return "Internal evidence is hidden. Add ?internal=1 to the URL to view.";
    } else {
      return "Internal evidence is hidden. Valid authentication token required in production.";
    }
  }
  
  return result.error || "An error occurred";
}

/**
 * React hook for internal fetch with loading state.
 */
export function useInternalFetch<T = unknown>(
  url: string | null,
  options: InternalFetchOptions = {}
) {
  const [result, setResult] = React.useState<InternalFetchResult<T> | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  
  React.useEffect(() => {
    if (!url) {
      setResult(null);
      return;
    }
    
    setIsLoading(true);
    internalFetch<T>(url, options)
      .then(setResult)
      .finally(() => setIsLoading(false));
  }, [url, options]);
  
  return { result, isLoading };
}

// For use in React components
import * as React from "react";
