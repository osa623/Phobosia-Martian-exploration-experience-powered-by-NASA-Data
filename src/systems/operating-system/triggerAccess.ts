/** Return only records assigned by the active trigger's existing screen list. */
export function resolveTriggerScreens<T extends { id: string; mesh: string }>(
  records: readonly T[],
  authorizedNames: readonly string[]
): T[] {
  const authorized = new Set(authorizedNames);
  return records.filter(record => authorized.has(record.mesh) || authorized.has(record.id));
}
