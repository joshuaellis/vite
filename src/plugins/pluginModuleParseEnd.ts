/**
 * Dynamic shared modules, such as "react/" and "react-dom/", can only be parsed during the build process;
 * This plugin allows me to wait until all modules are built, and then expose them together.
 *
 * Completion detection uses a dependency-graph approach: moduleParsed() tracks both
 * parsed modules and their declared dependencies (importedIds + dynamicallyImportedIds)
 * in the same hook call. The size check can never match prematurely because child
 * modules are always registered before the check runs — no cross-hook race.
 */
import { Plugin } from 'vite';
import { VIRTUAL_EXPOSES } from '../virtualModules';

let _resolve: any, _reject: any, _parseTimeout: any;

const promise = new Promise((resolve, reject) => {
  _resolve = (v: any) => {
    clearTimeout(_parseTimeout);
    _parseTimeout = null;
    resolve(v);
  };
  _reject = (e: any) => {
    clearTimeout(_parseTimeout);
    _parseTimeout = null;
    reject(e);
  };
});

function setParseTimeout(timeout: number) {
  if (!_parseTimeout) {
    _parseTimeout = setTimeout(() => {
      console.warn(`Parse timeout (${timeout}s) - forcing resolve`);
      _resolve(1);
    }, timeout * 1000);
    if (typeof _parseTimeout === 'object' && 'unref' in _parseTimeout) {
      _parseTimeout.unref();
    }
  }
}

let parsePromise = promise;
let exposesParseEnd = false;
const allKnownIds = new Set<string>();
const parsedIds = new Set<string>();
export default function (excludeFn: Function, options: { moduleParseTimeout: number }): Plugin[] {
  setParseTimeout(options.moduleParseTimeout);
  return [
    {
      name: '_',
      apply: 'serve',
      config() {
        // No waiting in development mode
        _resolve(1);
      },
    },
    {
      enforce: 'post',
      name: 'parseEnd',
      apply: 'build',
      moduleParsed(module) {
        const id = module.id;
        // When the entry JS file is empty and only contains exposes export code, it's necessary to wait for the exposes modules to be resolved in order to collect the dependencies being used.
        if (id === VIRTUAL_EXPOSES) exposesParseEnd = true;
        if (excludeFn(id)) return;

        allKnownIds.add(id);
        parsedIds.add(id);

        // Register this module's dependencies as "known but not yet parsed"
        for (const depId of module.importedIds) {
          if (!excludeFn(depId)) allKnownIds.add(depId);
        }
        for (const depId of module.dynamicallyImportedIds) {
          if (!excludeFn(depId)) allKnownIds.add(depId);
        }

        if (exposesParseEnd && allKnownIds.size > 0 && allKnownIds.size === parsedIds.size) {
          _resolve(1);
        }
      },
    },
  ];
}
export { parsePromise };
