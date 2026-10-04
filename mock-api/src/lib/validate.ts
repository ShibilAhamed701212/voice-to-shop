/**
 * Returns the names of fields that are present but not strings. Query strings like
 * `?pincode=a&pincode=b` arrive as arrays and JSON bodies can carry any type, and the
 * services call string methods on these values.
 */
export function nonStringFields(source: unknown, fields: readonly string[]): string[] {
  const obj = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  return fields.filter(f => obj[f] !== undefined && typeof obj[f] !== 'string');
}

export function invalidFieldsBody(fields: string[]) {
  return { success: false, error: 'INVALID_PARAMETERS', message: `Expected string values for: ${fields.join(', ')}` };
}
