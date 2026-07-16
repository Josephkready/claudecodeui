// Policy for the in-app self-update action (`POST /api/system/update`).
//
// Why this is a module rather than branching inline in the route handler:
//
//   - The command and its working directory depend on three independent inputs
//     (platform mode, whether the app root is a git checkout, and whether self-update
//     is permitted at all). That is more decision than belongs in a request handler,
//     and none of it was reachable from a test while it lived there.
//
//   - `installMode` is inferred from the presence of `.git` in the app root, which is a
//     proxy for "a human cloned this and can update it by pulling". That inference is
//     wrong for any deployment whose checkout is owned by a config-management system:
//     the dante host deploy has ansible-pull reset ~/prod/cloudcli to origin/main every
//     minute, so a `git pull` from this endpoint fights the reconciler, and `npm install`
//     wouldn't rebuild dist/ anyway — leaving the served client stale against the server.
//     SELF_UPDATE_DISABLED lets such a deployment decline the whole action instead of
//     performing a broken one.
//
// Pure functions, so the routing decisions are testable with `node:test`.

export type SelfUpdateEnv = {
  SELF_UPDATE_DISABLED?: string;
};

/** How the running copy was installed, which determines how it can update itself. */
export type InstallMode = 'git' | 'npm';

export type UpdatePlan = {
  /** Shell command to run. */
  command: string;
  /** Working directory to run it in. */
  cwd: string;
};

/**
 * Whether this deployment has opted out of in-app self-update.
 *
 * Deployments whose code is managed externally — config management, image rebuilds, a
 * system package manager — must set `SELF_UPDATE_DISABLED=true`: their app root is not
 * theirs to mutate, and racing the owner produces a half-updated tree rather than an
 * update. Defaults to enabled so the plain `npm install -g @cloudcli-ai/cloudcli` and
 * git-clone installs keep their update button.
 */
export function isSelfUpdateDisabled(env: SelfUpdateEnv): boolean {
  return env.SELF_UPDATE_DISABLED === 'true';
}

/**
 * Classify the install from whether the app root is a git checkout.
 *
 * A checkout can pull; an npm-installed copy must reinstall the published package.
 */
export function resolveInstallMode(appRootIsGitCheckout: boolean): InstallMode {
  return appRootIsGitCheckout ? 'git' : 'npm';
}

/**
 * Build the command and working directory for an in-app self-update.
 *
 * Platform deployments own their update workflow, so they win over `installMode`. A git
 * checkout updates in place from the app root. An npm install re-installs the published
 * package globally, which is not tied to the app root — hence the home directory, since
 * a global install must not depend on the cwd being writable or even present.
 *
 * Callers must consult {@link isSelfUpdateDisabled} first; this function describes what
 * an update *would* do and does not itself decide whether one is allowed.
 */
export function resolveUpdatePlan(options: {
  isPlatform: boolean;
  installMode: InstallMode;
  appRoot: string;
  homeDir: string;
}): UpdatePlan {
  const { isPlatform, installMode, appRoot, homeDir } = options;

  if (isPlatform) {
    // Platform images ship without husky/devDependencies, so they run their own script.
    return { command: 'npm run update:platform', cwd: appRoot };
  }

  if (installMode === 'git') {
    return { command: 'git checkout main && git pull && npm install', cwd: appRoot };
  }

  return { command: 'npm install -g @cloudcli-ai/cloudcli@latest', cwd: homeDir };
}
