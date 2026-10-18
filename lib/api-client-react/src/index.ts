export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, setRequestTimeout } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export { scanAuto, isInsectScanResult } from "./scan-auto";
export type { ScanAutoResult } from "./scan-auto";
