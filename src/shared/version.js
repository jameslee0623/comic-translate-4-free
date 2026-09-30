// Single source of truth for the build stamp.
// Bumped on every shipped build. Shown in the popup/options footers, baked
// into the page-cache key (so a code change can never serve a stale cached
// page), and read by build.sh for the release zip filename.
export const BUILD = '20260930o';
