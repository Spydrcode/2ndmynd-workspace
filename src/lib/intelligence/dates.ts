/**
 * Robust date parser for various export formats
 * Handles common CSV/Excel date formats that cause parsing failures
 */

export function parseFlexibleTimestamp(value: unknown): Date | null {
  if (!value) return null;

  // Already a Date object
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  if (!str) return null;

  // If the timestamp already has an explicit timezone, trust the built-in parser.
  const hasExplicitTz = /([zZ]|[+-]\d{2}:\d{2})$/.test(str);

  // Try direct parse first (handles ISO 8601, etc.)
  if (hasExplicitTz) {
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Format: "YYYY-MM-DD HH:mm:ss" (space instead of 'T')
  // This is the most common export format that fails
  const spaceIsoMatch = str.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (spaceIsoMatch) {
    const isoString = `${spaceIsoMatch[1]}T${spaceIsoMatch[2]}Z`;
    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Format: "YYYY-MM-DDTHH:mm:ss" (missing timezone)
  const isoNoTzMatch = str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/);
  if (isoNoTzMatch) {
    const date = new Date(`${str}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Try direct parse last for any remaining odd cases without explicit timezone.
  {
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) return date;
  }

  // Format: "MM/DD/YYYY" or "MM/DD/YYYY HH:mm"
  const usDateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);
  if (usDateMatch) {
    const [, month, day, year, hour, minute, ampm] = usDateMatch;
    let hours = hour ? parseInt(hour, 10) : 0;
    const minutes = minute ? parseInt(minute, 10) : 0;

    // Handle AM/PM
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hours < 12) hours += 12;
      if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
    }

    const date = new Date(
      Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hours, minutes)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // All parsing strategies failed
  return null;
}

/**
 * Parse and return as ISO date string (for backward compatibility)
 */
export function parseFlexibleTimestampToISO(value: unknown): string | undefined {
  const date = parseFlexibleTimestamp(value);
  return date ? date.toISOString() : undefined;
}
