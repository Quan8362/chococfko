/**
 * Generate a short, consistent anonymous display ID from any UUID.
 * Uses the first 4 hex characters of the UUID (dashes removed), uppercased.
 * Example: "a12f39b8-..." → "Anonymous #A12F"
 */
export function generateAnonId(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `Anonymous #${hex}`
}
