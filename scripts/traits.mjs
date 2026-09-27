import { MODULE_ID, SETTINGS, TRAIT_SCOPES } from "./constants.mjs";
import { log } from "./logger.mjs";

let originalTraitIds = null;
let originalDescriptionIds = null;
let injectedTraitIds = new Set();
let runtimeTraitMap = new Map();

export function normalizeTraitId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeScopes(scopes) {
  const source = scopes && typeof scopes === "object" ? scopes : {};
  return Object.fromEntries(TRAIT_SCOPES.map((key) => [key, source[key] !== false]));
}

export function normalizeRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((rule) => rule && typeof rule === "object" && !Array.isArray(rule)).map((rule) => foundry.utils.deepClone(rule));
}

export function createTrait(data = {}) {
  return {
    uid: typeof data.uid === "string" && data.uid ? data.uid : foundry.utils.randomID(),
    id: normalizeTraitId(data.id),
    label: String(data.label ?? "").trim(),
    description: String(data.description ?? "").trim(),
    scopes: normalizeScopes(data.scopes),
    rules: normalizeRules(data.rules),
  };
}

export function normalizeTraits(traits) {
  return Array.isArray(traits) ? traits.map(createTrait) : [];
}

export function cloneTraits(traits) {
  return normalizeTraits(foundry.utils.deepClone(Array.isArray(traits) ? traits : []));
}

export function captureOriginalTraitIds() {
  if (originalTraitIds || !CONFIG?.PF2E) return;
  originalTraitIds = new Map();
  for (const key of TRAIT_SCOPES) {
    const record = CONFIG.PF2E[key];
    originalTraitIds.set(key, new Set(record && typeof record === "object" ? Object.keys(record) : []));
  }
  originalDescriptionIds = new Set(Object.keys(CONFIG.PF2E.traitsDescriptions ?? {}));
}

export function getReservedTraitIds() {
  captureOriginalTraitIds();
  const ids = new Set();
  for (const values of originalTraitIds?.values() ?? []) {
    for (const id of values) ids.add(id);
  }
  return ids;
}

function removeInjectedTraits() {
  if (!CONFIG?.PF2E || !originalTraitIds) return;
  for (const id of injectedTraitIds) {
    for (const key of TRAIT_SCOPES) {
      const record = CONFIG.PF2E[key];
      if (!record || typeof record !== "object") continue;
      if (!originalTraitIds.get(key)?.has(id)) delete record[id];
    }
    if (CONFIG.PF2E.traitsDescriptions && !originalDescriptionIds?.has(id)) {
      delete CONFIG.PF2E.traitsDescriptions[id];
    }
  }
  injectedTraitIds = new Set();
}

function aliasToTrait(alias) {
  const trait = createTrait(alias?.trait ?? {});
  trait.id = normalizeTraitId(alias?.oldId ?? trait.id);
  return trait;
}

export function getConfiguredTraits({ includeAliases = true } = {}) {
  const traits = normalizeTraits(game.settings.get(MODULE_ID, SETTINGS.TRAITS));
  if (!includeAliases) return traits;
  const aliases = game.settings.get(MODULE_ID, SETTINGS.ALIASES) ?? {};
  return [...traits, ...Object.values(aliases).map(aliasToTrait).filter((trait) => trait.id && trait.label)];
}

export function getRuntimeTrait(id) {
  return runtimeTraitMap.get(normalizeTraitId(id)) ?? null;
}

export function syncCustomTraits(traits = null, { rerender = true, aliases = null } = {}) {
  if (game.system?.id !== "pf2e" || !CONFIG?.PF2E) return;
  captureOriginalTraitIds();
  removeInjectedTraits();

  const configured = traits ? normalizeTraits(traits) : normalizeTraits(game.settings.get(MODULE_ID, SETTINGS.TRAITS));
  const aliasData = aliases ?? game.settings.get(MODULE_ID, SETTINGS.ALIASES) ?? {};
  const all = [...configured, ...Object.values(aliasData).map(aliasToTrait)];
  runtimeTraitMap = new Map();

  for (const trait of all) {
    if (!trait.id || !trait.label) continue;
    runtimeTraitMap.set(trait.id, trait);
    for (const key of TRAIT_SCOPES) {
      if (trait.scopes[key] === false) continue;
      const record = CONFIG.PF2E[key];
      if (record && typeof record === "object") record[trait.id] = trait.label;
    }
    if (CONFIG.PF2E.traitsDescriptions && trait.description) {
      CONFIG.PF2E.traitsDescriptions[trait.id] = trait.description;
    }
    injectedTraitIds.add(trait.id);
  }

  log.debug("Synchronized custom traits", { traits: configured.length, aliases: Object.keys(aliasData).length });
  if (rerender) rerenderTraitSheets();
}

export function rerenderTraitSheets() {
  for (const app of Object.values(ui?.windows ?? {})) {
    const hasTraits = Boolean(app?.item?.system?.traits || app?.actor?.system?.traits);
    if (hasTraits && typeof app.render === "function") app.render(false);
  }
  ui?.chat?.render?.();
}

export function validateTraits(traits, { reserved = getReservedTraitIds() } = {}) {
  const ids = new Set();
  const uids = new Set();
  for (let index = 0; index < traits.length; index += 1) {
    const trait = traits[index];
    const row = index + 1;
    trait.id = normalizeTraitId(trait.id);
    trait.label = String(trait.label ?? "").trim();
    trait.description = String(trait.description ?? "").trim();
    trait.scopes = normalizeScopes(trait.scopes);
    trait.rules = normalizeRules(trait.rules);
    trait.uid ||= foundry.utils.randomID();

    if (!trait.id || !trait.label) {
      return game.i18n.format(`${MODULE_ID}.errors.required`, { row });
    }
    if (!/^[a-z][a-z0-9-]*$/.test(trait.id)) {
      return game.i18n.format(`${MODULE_ID}.errors.invalidId`, { row, id: trait.id });
    }
    if (ids.has(trait.id)) {
      return game.i18n.format(`${MODULE_ID}.errors.duplicateId`, { id: trait.id });
    }
    if (reserved.has(trait.id)) {
      return game.i18n.format(`${MODULE_ID}.errors.reservedId`, { id: trait.id });
    }
    if (uids.has(trait.uid)) trait.uid = foundry.utils.randomID();
    ids.add(trait.id);
    uids.add(trait.uid);

    for (let ruleIndex = 0; ruleIndex < trait.rules.length; ruleIndex += 1) {
      const rule = trait.rules[ruleIndex];
      if (typeof rule.key !== "string" || !rule.key.trim()) {
        return game.i18n.format(`${MODULE_ID}.errors.ruleKey`, { row, rule: ruleIndex + 1 });
      }
    }
  }
  return null;
}
