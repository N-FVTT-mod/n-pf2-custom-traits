import { MODULE_ID, SETTINGS } from "./constants.mjs";

function debugEnabled() {
  try {
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.DEBUG));
  } catch {
    return false;
  }
}

export const log = Object.freeze({
  debug: (...args) => {
    if (debugEnabled()) console.debug(`${MODULE_ID} |`, ...args);
  },
  info: (...args) => console.info(`${MODULE_ID} |`, ...args),
  warn: (...args) => console.warn(`${MODULE_ID} |`, ...args),
  error: (...args) => console.error(`${MODULE_ID} |`, ...args),
});
