// Install-mode classification for the `/health` endpoint.
//
// `installMode` is inferred from the presence of `.git` in the app root, which is a proxy
// for "a human cloned this and can update it by pulling" versus an npm-installed copy. The
// frontend reads it from `/health` purely for display; this fork has no in-app self-update
// action (the deploy is reconciled by ansible-pull, not by the app updating itself).
//
// Pure function, so the classification is testable with `node:test`.

/** How the running copy was installed. */
export type InstallMode = 'git' | 'npm';

/**
 * Classify the install from whether the app root is a git checkout.
 *
 * A checkout was cloned; an npm-installed copy was not.
 */
export function resolveInstallMode(appRootIsGitCheckout: boolean): InstallMode {
  return appRootIsGitCheckout ? 'git' : 'npm';
}
