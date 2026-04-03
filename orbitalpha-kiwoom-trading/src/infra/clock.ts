/**
 * Injectable clock for tests (default: system time).
 */
export function clockNow(): Date {
  return new Date();
}
