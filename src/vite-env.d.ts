/// <reference types="vite/client" />

// Set by `npm run build:local` (scripts/build-local.mjs); absent in dev and CI builds.
interface ImportMetaEnv {
  readonly VITE_BUILD_VERSION?: string;
  readonly VITE_BUILD_COMMIT?: string;
  readonly VITE_BUILD_MODIFIED?: string;
}
