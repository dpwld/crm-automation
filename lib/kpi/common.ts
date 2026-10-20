export function seoulDate(iso: string) {
  return new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
}
