import path from 'node:path';
import { sync as spawnSync } from 'cross-spawn';
import { sync as findUpSync } from 'find-up';

import { NPMProxy } from './NPMProxy';
import { PNPMProxy } from './PNPMProxy';

import type { JsPackageManager, PackageManagerName } from './JsPackageManager';

import { Yarn2Proxy } from './Yarn2Proxy';
import { Yarn1Proxy } from './Yarn1Proxy';

const NPM_LOCKFILE = 'package-lock.json';
const PNPM_LOCKFILE = 'pnpm-lock.yaml';
const YARN_LOCKFILE = 'yarn.lock';

type PackageManagerProxy =
  | typeof NPMProxy
  | typeof PNPMProxy
  | typeof Yarn1Proxy
  | typeof Yarn2Proxy;

export class JsPackageManagerFactory {
  public static getPackageManager(
    { force }: { force?: PackageManagerName } = {},
    cwd?: string
  ): JsPackageManager {
    // Option 1: If the user has provided a forcing flag, we use it
    if (force && force in this.PROXY_MAP) {
      return new this.PROXY_MAP[force]({ cwd });
    }

    // Option 2: If the user is running a command via npx/pnpx/yarn create/etc, we infer the package manager from the command
    const inferredPackageManager = this.inferPackageManagerFromUserAgent();
    if (inferredPackageManager && inferredPackageManager in this.PROXY_MAP) {
      return new this.PROXY_MAP[inferredPackageManager]({ cwd });
    }

    // Option 3: We try to infer the package manager from the closest lockfile
    const yarnVersion = getYarnVersion(cwd);

    const closestLockfilePath = findUpSync([YARN_LOCKFILE, PNPM_LOCKFILE, NPM_LOCKFILE], {
      cwd,
    });
    const closestLockfile = closestLockfilePath && path.basename(closestLockfilePath);

    const hasNPMCommand = hasNPM(cwd);
    const hasPNPMCommand = hasPNPM(cwd);

    if (yarnVersion && (closestLockfile === YARN_LOCKFILE || (!hasNPMCommand && !hasPNPMCommand))) {
      return yarnVersion === 1 ? new Yarn1Proxy({ cwd }) : new Yarn2Proxy({ cwd });
    }

    if (hasPNPMCommand && closestLockfile === PNPM_LOCKFILE) {
      return new PNPMProxy({ cwd });
    }

    if (hasNPMCommand) {
      return new NPMProxy({ cwd });
    }

    throw new Error('Unable to find a usable package manager within NPM, PNPM, Yarn and Yarn 2');
  }

  /**
   * Look up map of package manager proxies by name
   */
  private static PROXY_MAP: Record<PackageManagerName, PackageManagerProxy> = {
    npm: NPMProxy,
    pnpm: PNPMProxy,
    yarn1: Yarn1Proxy,
    yarn2: Yarn2Proxy,
  };

  /**
   * Infer the package manager based on the command the user is running.
   * Each package manager sets the `npm_config_user_agent` environment variable with its name and version e.g. "npm/7.24.0"
   * Which is really useful when invoking commands via npx/pnpx/yarn create/etc.
   */
  private static inferPackageManagerFromUserAgent(): PackageManagerName | undefined {
    const userAgent = process.env.npm_config_user_agent;
    if (userAgent) {
      const packageSpec = userAgent.split(' ')[0];
      const [pkgMgrName, pkgMgrVersion] = packageSpec.split('/');

      if (pkgMgrName === 'pnpm') {
        return 'pnpm';
      }

      if (pkgMgrName === 'npm') {
        return 'npm';
      }

      if (pkgMgrName === 'yarn') {
        return `yarn${pkgMgrVersion?.startsWith('1.') ? '1' : '2'}`;
      }
    }

    return undefined;
  }
}

function hasNPM(cwd?: string) {
  const npmVersionCommand = spawnSync('npm', ['--version'], { cwd, shell: true });
  return npmVersionCommand.status === 0;
}

function hasPNPM(cwd?: string) {
  const pnpmVersionCommand = spawnSync('pnpm', ['--version'], { cwd, shell: true });
  return pnpmVersionCommand.status === 0;
}

function getYarnVersion(cwd?: string): 1 | 2 | undefined {
  const yarnVersionCommand = spawnSync('yarn', ['--version'], { cwd, shell: true });

  if (yarnVersionCommand.status !== 0) {
    return undefined;
  }

  const yarnVersion = yarnVersionCommand.output.toString().replace(/,/g, '').replace(/"/g, '');

  return /^1\.+/.test(yarnVersion) ? 1 : 2;
}
