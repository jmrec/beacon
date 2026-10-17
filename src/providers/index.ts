import { benecoProvider } from "./beneco/provider.ts";
import type { OutageProvider } from "./types.ts";

export const enabledProviders: readonly OutageProvider[] = [benecoProvider];

export { benecoProvider } from "./beneco/provider.ts";
