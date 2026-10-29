import type { EngineCapabilities, EngineSpec } from './engine-catalog.ts';

function capabilities(partial: Partial<EngineCapabilities>): EngineCapabilities {
  return {
    screenshots: false,
    pdf: false,
    stealth: false,
    ssrfGuard: false,
    markdown: false,
    oneShotFetch: false,
    headed: false,
    ...partial,
  };
}

const BRAVE_RELEASES = 'https://github.com/brave/brave-browser/releases/download';
const BRAVE_VERSION = '1.98.60';
const CHROMIUM_SYSTEM_MAC = ['Chromium.app'];
const CHROMIUM_SYSTEM_LINUX = ['chromium', 'chromium-browser', '/snap/bin/chromium'];

export const ENGINE_DEFINITIONS: readonly EngineSpec[] = [
  {
    id: 'obscura',
    label: 'Obscura',
    version: '0.2.4',
    license: 'Apache-2.0',
    capabilities: capabilities({
      screenshots: true,
      pdf: true,
      stealth: true,
      ssrfGuard: true,
      markdown: true,
      oneShotFetch: true,
    }),
    resources: { ramMb: 30, diskMb: 250, coldStartMs: 500 },
    stealthBuild: true,
    install: {
      format: 'tar.gz',
      urlTemplate:
        'https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.4/obscura-{arch}-{os}.tar.gz',
      versionedUrlTemplate:
        'https://github.com/h4ckf0r0day/obscura/releases/download/{tag}/obscura-{arch}-{os}.tar.gz',
      versions: { source: 'github-releases', repo: 'h4ckf0r0day/obscura', tagPrefix: 'v' },
      sha256: {
        'macos-x86_64': '91b1b5e1f581e7572bdffd289195ad112cd5cf33069019e892b251c099bef015',
        'macos-aarch64': '456210fe48e77324a064477fe450452a58709940a50e71678ae6638a3e5095ec',
        'linux-x86_64': '757e7b597ba5cdd53af9fc701e0a9b80f0a8d788f545d4f82ec9ad32db77f000',
        'linux-aarch64': 'd9ba3719c2442a227567d7664b5505b38ab68236f3f5388884eee2e27f55db28',
      },
      stealthSha256: {
        'macos-x86_64': '0fff3953a0484f505bc4445e8fab3d718084c7d0bd704dc05d2958e49b1ad4c7',
        'macos-aarch64': '183ce21fc9caf421c4e027cd8043970224a24d9921d8bf27105153ca74f0e3ae',
        'linux-x86_64': '49b53f74a509764c42a35c8e73a37301399e1500d43564fad4cb641721efc753',
        'linux-aarch64': '56eacea66e4a5b0ab0f39343183c308816b426f604259b9cc41402488bf998f7',
      },
    },
  },
  {
    id: 'chromium',
    label: 'Chromium',
    version: '156.0.8078.47',
    license: 'BSD-3-Clause',
    capabilities: capabilities({
      screenshots: true,
      pdf: true,
      markdown: true,
      headed: true,
    }),
    resources: { ramMb: 300, diskMb: 670, coldStartMs: 1000 },
    install: {
      format: 'zip',
      urlTemplate:
        'https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.47/{subdir}/chrome-{subdir}.zip',
      versionedUrlTemplate:
        'https://storage.googleapis.com/chrome-for-testing-public/{version}/{subdir}/chrome-{subdir}.zip',
      versions: { source: 'chrome-for-testing' },
      sha256: {
        'macos-x86_64': '5a38b8e3d621514fff0775dcae678a152ce378890188c88eef79fc97aa59fccd',
        'macos-aarch64': 'ad7f2b49a4dc679af286b1b1b386670d93ca7868079f69012d21ba0ac8293df3',
        'linux-x86_64': 'e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50',
        'linux-aarch64': '',
      },
      supportedTargets: ['macos-aarch64', 'macos-x86_64', 'linux-x86_64'],
      binaryPath: {
        'macos-aarch64':
          'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'macos-x86_64':
          'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'linux-x86_64': 'chrome-linux64/chrome',
      },
    },
    system: { macosApps: CHROMIUM_SYSTEM_MAC, linuxBins: CHROMIUM_SYSTEM_LINUX },
  },
  {
    id: 'lightpanda',
    label: 'Lightpanda',
    version: '1.0.1',
    license: 'AGPL-3.0',
    capabilities: capabilities({ markdown: true, oneShotFetch: true }),
    resources: { ramMb: 36, diskMb: 150, coldStartMs: 500 },
    install: {
      format: 'binary',
      urlTemplate:
        'https://github.com/lightpanda-io/browser/releases/download/1.0.1/lightpanda-{arch}-{os}',
      versionedUrlTemplate:
        'https://github.com/lightpanda-io/browser/releases/download/{tag}/lightpanda-{arch}-{os}',
      versions: { source: 'github-releases', repo: 'lightpanda-io/browser', tagPrefix: '' },
      sha256: {
        'macos-x86_64': '1fcca0ae7684f470780de611a56e9a8ea612d5ff21e37dbb48905ebac5b918a7',
        'macos-aarch64': 'd4b66ac8484f49d7a49e05b6f9342716c747129527fcbe8ffe36679ffa18dd60',
        'linux-x86_64': '551747e35c51ba107b5d5277eca4b48e077b2a3b40f09a047bf6670448bc35fd',
        'linux-aarch64': '392ba370c12d9f045c36c1477db8b3e2985942c89532732ef8d1610057db7d5c',
      },
    },
  },
  {
    id: 'brave',
    label: 'Brave',
    version: BRAVE_VERSION,
    license: 'MPL-2.0',
    capabilities: capabilities({ screenshots: true, pdf: true, headed: true }),
    resources: { ramMb: 320, diskMb: 650, coldStartMs: 1200 },
    install: {
      format: 'zip',
      formatByTarget: { 'macos-x86_64': 'dmg', 'macos-aarch64': 'dmg' },
      urlByTarget: {
        'macos-x86_64': `${BRAVE_RELEASES}/v${BRAVE_VERSION}/Brave-Browser-universal.dmg`,
        'macos-aarch64': `${BRAVE_RELEASES}/v${BRAVE_VERSION}/Brave-Browser-universal.dmg`,
        'linux-x86_64': `${BRAVE_RELEASES}/v${BRAVE_VERSION}/brave-browser-${BRAVE_VERSION}-linux-amd64.zip`,
        'linux-aarch64': `${BRAVE_RELEASES}/v${BRAVE_VERSION}/brave-browser-${BRAVE_VERSION}-linux-arm64.zip`,
      },
      versionedUrlByTarget: {
        'macos-x86_64': `${BRAVE_RELEASES}/{tag}/Brave-Browser-universal.dmg`,
        'macos-aarch64': `${BRAVE_RELEASES}/{tag}/Brave-Browser-universal.dmg`,
        'linux-x86_64': `${BRAVE_RELEASES}/{tag}/brave-browser-{version}-linux-amd64.zip`,
        'linux-aarch64': `${BRAVE_RELEASES}/{tag}/brave-browser-{version}-linux-arm64.zip`,
      },
      versions: { source: 'github-releases', repo: 'brave/brave-browser', tagPrefix: 'v' },
      sha256: {
        'macos-x86_64': 'e2316e1f169ae29caf54b010af6cd5598c40258fe249b574121acff934672973',
        'macos-aarch64': 'e2316e1f169ae29caf54b010af6cd5598c40258fe249b574121acff934672973',
        'linux-x86_64': '0e49b5f84597fbbefdc8d791900d170d4f3792dc5d38056f6a3e35100706cdc7',
        'linux-aarch64': 'f93bd3513ff0aae174edb5523002a9cb5e4923633d66a766c10db4dc30eab7df',
      },
      binaryPath: {
        'macos-x86_64': 'Brave Browser.app/Contents/MacOS/Brave Browser',
        'macos-aarch64': 'Brave Browser.app/Contents/MacOS/Brave Browser',
      },
    },
    system: {
      macosApps: ['Brave Browser.app'],
      linuxBins: ['brave-browser', '/opt/brave.com/brave/brave'],
    },
  },
  {
    id: 'chrome',
    label: 'Chrome',
    version: 'system',
    license: 'Proprietary',
    capabilities: capabilities({ screenshots: true, pdf: true, headed: true }),
    resources: { ramMb: 300, diskMb: 700, coldStartMs: 1000 },
    system: {
      macosApps: ['Google Chrome.app'],
      linuxBins: ['google-chrome-stable', 'google-chrome', '/opt/google/chrome/chrome'],
    },
  },
  {
    id: 'edge',
    label: 'Edge',
    version: 'system',
    license: 'Proprietary',
    capabilities: capabilities({ screenshots: true, pdf: true, headed: true }),
    resources: { ramMb: 320, diskMb: 700, coldStartMs: 1100 },
    system: {
      macosApps: ['Microsoft Edge.app'],
      linuxBins: ['microsoft-edge-stable', 'microsoft-edge', '/opt/microsoft/msedge/msedge'],
    },
  },
  {
    id: 'vivaldi',
    label: 'Vivaldi',
    version: 'system',
    license: 'Freeware',
    capabilities: capabilities({ screenshots: true, pdf: true, headed: true }),
    resources: { ramMb: 320, diskMb: 700, coldStartMs: 1100 },
    system: {
      macosApps: ['Vivaldi.app'],
      linuxBins: ['vivaldi-stable', '/opt/vivaldi/vivaldi'],
    },
  },
  {
    id: 'opera',
    label: 'Opera',
    version: 'system',
    license: 'Freeware',
    capabilities: capabilities({ screenshots: true, pdf: true, headed: true }),
    resources: { ramMb: 320, diskMb: 650, coldStartMs: 1100 },
    system: {
      macosApps: ['Opera.app'],
      linuxBins: ['opera', '/usr/lib/opera/opera'],
    },
  },
];
