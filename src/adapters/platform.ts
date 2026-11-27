import { threadsOrigin } from "./threads/selectors";
import { xOrigin } from "./x/selectors";

export type PlatformId = "x" | "threads";

export function platformForOrigin(origin: string): PlatformId | undefined {
  if (origin === xOrigin) return "x";
  if (origin === threadsOrigin) return "threads";
}
