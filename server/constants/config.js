import { isSelfUpdateDisabled } from '../shared/self-update.js';

/**
 * Environment Flag: Is Platform
 * Indicates if the app is running in Platform mode (hosted) or OSS mode (self-hosted)
 */
export const IS_PLATFORM = process.env.VITE_IS_PLATFORM === 'true';

/**
 * Environment Flag: Auth Disabled
 * When 'true', the app skips all login/JWT checks and resolves every request to
 * the single default user (see initializeDatabase seeding). Intended for
 * self-hosted single-user installs where a login screen adds no security.
 * Unlike IS_PLATFORM this flag ONLY disables auth — it does not change the
 * workspace path, WebSocket URL, or any other platform behavior.
 */
export const AUTH_DISABLED = process.env.VITE_AUTH_DISABLED === 'true';

/**
 * Environment Flag: Self-Update Disabled
 * When 'true', POST /api/system/update refuses to run instead of updating in place.
 * Set this whenever something other than this app owns the code on disk — config
 * management, an image rebuild, a system package manager — because a self-update then
 * races the real owner and yields a half-updated tree. See server/shared/self-update.ts.
 */
export const SELF_UPDATE_DISABLED = isSelfUpdateDisabled(process.env);