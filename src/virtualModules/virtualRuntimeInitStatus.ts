import VirtualModule from '../utils/VirtualModule';
import { REMOTE_ENTRY_ID } from './virtualRemoteEntry';

export const virtualRuntimeInitStatus = new VirtualModule('runtimeInit');

export function writeRuntimeInitStatus(command: string) {
  const globalKey = `__mf_init__${virtualRuntimeInitStatus.getImportId()}__`;

  if (command === 'build') {
    // Build mode: self-initializing.
    // When this module evaluates, it triggers remoteEntry.init() via dynamic import.
    // This eliminates the implicit ordering dependency on hostInit evaluating first.
    // Circular dep analysis: runtimeInitStatus → (dynamic) remoteEntry → (static) runtimeInitStatus.
    // The cycle is broken by dynamic import() — remoteEntry gets the already-created
    // initResolve from globalThis when it statically imports this module.
    virtualRuntimeInitStatus.writeSync(`
const globalKey = ${JSON.stringify(globalKey)};
if (!globalThis[globalKey]) {
  let initResolve, initReject;
  const initPromise = new Promise((re, rj) => {
    initResolve = re;
    initReject = rj;
  });
  globalThis[globalKey] = { initPromise, initResolve, initReject };
}
// Self-initialize: trigger remoteEntry.init() on first evaluation
if (!globalThis[globalKey].initialized) {
  globalThis[globalKey].initialized = true;
  import("${REMOTE_ENTRY_ID}")
    .then(entry => Promise.resolve(entry.__tla).then(() => entry.init()).catch(() => entry.init()))
    .catch(err => globalThis[globalKey].initReject(err));
}
const { initPromise, initResolve, initReject } = globalThis[globalKey];
export { initPromise, initResolve, initReject };
`);
  } else {
    // Dev mode: keep existing CJS approach (resolved by hostInit via dev server)
    virtualRuntimeInitStatus.writeSync(`
const globalKey = ${JSON.stringify(globalKey)};
if (!globalThis[globalKey]) {
  let initResolve, initReject;
  const initPromise = new Promise((re, rj) => {
    initResolve = re;
    initReject = rj;
  });
  globalThis[globalKey] = { initPromise, initResolve, initReject };
}
module.exports = globalThis[globalKey];
`);
  }
}
