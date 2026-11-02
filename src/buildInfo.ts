export interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
}
declare const __LINGUS_BUILD__: BuildInfo | undefined;
export const BUILD_INFO: BuildInfo =
  typeof __LINGUS_BUILD__ !== 'undefined' && __LINGUS_BUILD__
    ? __LINGUS_BUILD__
    : { version: 'development', commit: 'development', builtAt: '' };

export function buildLabel(info = BUILD_INFO) {
  return `${info.version} · ${info.commit === 'development' ? 'sviluppo' : info.commit.slice(0, 7)}`;
}
