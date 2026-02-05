/**
 * Centralized Internal Route Guard
 * 
 * Provides consistent gating for all internal routes:
 * - Dev: requires ?internal=1 query param
 * - Prod: requires ALLOW_INTERNAL_TESTING=true + x-2ndmynd-internal header
 * 
 * Returns standardized error responses (404 for hidden, 401 for unauthorized).
 */

import type { NextRequest } from "next/server";

export interface InternalGuardResult {
  allowed: boolean;
  status: 404 | 401;
  errorMessage: string;
}

/**
 * Check if internal access is allowed for this request.
 * 
 * Rules:
 * - Development: Must have ?internal=1 query param
 * - Production: Must have ALLOW_INTERNAL_TESTING=true AND valid x-2ndmynd-internal token
 * 
 * @param request - NextRequest object
 * @returns Guard result with allowed status and error details
 */
export function checkInternalGuard(request: NextRequest): InternalGuardResult {
  const isDev = process.env.NODE_ENV === "development";
  const allowInternalTesting = process.env.ALLOW_INTERNAL_TESTING === "true";
  const internalToken = process.env.INTERNAL_TESTING_TOKEN;
  const providedToken = request.headers.get("x-2ndmynd-internal");
  const searchParams = request.nextUrl.searchParams;
  const internalParam = searchParams.get("internal");
  
  // Development mode: require internal=1 query param
  if (isDev) {
    if (internalParam !== "1") {
      return {
        allowed: false,
        status: 404,
        errorMessage: "Not found",
      };
    }
    return {
      allowed: true,
      status: 404,
      errorMessage: "",
    };
  }
  
  // Production mode: require ALLOW_INTERNAL_TESTING and valid token
  if (!allowInternalTesting) {
    return {
      allowed: false,
      status: 404,
      errorMessage: "Not found",
    };
  }
  
  if (!internalToken || providedToken !== internalToken) {
    return {
      allowed: false,
      status: 401,
      errorMessage: "Unauthorized",
    };
  }
  
  return {
    allowed: true,
    status: 404,
    errorMessage: "",
  };
}

/**
 * Simpler version for routes that don't need the full result object.
 * Returns true if access is allowed, false otherwise.
 */
export function isInternalAllowed(request: NextRequest): boolean {
  return checkInternalGuard(request).allowed;
}
