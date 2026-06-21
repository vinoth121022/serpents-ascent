/** Narrow away null/undefined with a hard failure — used where state invariants guarantee presence. */
export function must<T>(value: T | null | undefined, message = 'unexpected nullish value'): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
