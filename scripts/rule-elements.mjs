import { MODULE_ID } from "./constants.mjs";
import { getRuntimeTrait } from "./traits.mjs";
import { log } from "./logger.mjs";

const PATCH_MARK = Symbol.for(`${MODULE_ID}.prepareRuleElements`);

function getItemTraitIds(item) {
  const value = item?.system?.traits?.value;
  return Array.isArray(value) ? [...new Set(value.map(String))].sort() : [];
}

function collectTraitRules(item) {
  const rules = [];
  for (const id of getItemTraitIds(item)) {
    const trait = getRuntimeTrait(id);
    if (!trait?.rules?.length) continue;
    for (const source of trait.rules) rules.push(foundry.utils.deepClone(source));
  }
  return rules;
}

export function installRuleElementBridge() {
  const ItemClass = CONFIG?.Item?.documentClass;
  const prototype = ItemClass?.prototype;
  if (!prototype || typeof prototype.prepareRuleElements !== "function") {
    log.warn("PF2E Item.prepareRuleElements was not available; trait Rule Elements are disabled.");
    return;
  }
  if (prototype[PATCH_MARK]) return;

  const original = prototype.prepareRuleElements;
  Object.defineProperty(prototype, PATCH_MARK, { value: original, configurable: true });

  prototype.prepareRuleElements = function nPf2CustomTraitsPrepareRuleElements(options = {}) {
    const extraRules = collectTraitRules(this);
    const sources = this?.system?.rules;
    if (!extraRules.length || !Array.isArray(sources)) return original.call(this, options);

    const start = sources.length;
    sources.push(...extraRules);
    try {
      return original.call(this, options);
    } finally {
      sources.splice(start, extraRules.length);
    }
  };
  log.debug("Installed PF2E Rule Element bridge");
}
