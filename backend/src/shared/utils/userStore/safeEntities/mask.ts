import { maskFromLastFour } from "../helpers";

export function maskKey(lastFour: string): string {
  return maskFromLastFour(lastFour);
}
