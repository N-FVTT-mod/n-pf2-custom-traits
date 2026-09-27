import { MODULE_ID, SCHEMA_VERSION, SETTINGS } from "./constants.mjs";
import { normalizeTraits, syncCustomTraits } from "./traits.mjs";
import { log } from "./logger.mjs";

function replaceTraitTokenInValue(value, renameMap) {
  if (typeof value === "string") {
    let next = value;
    for (const [oldId, newId] of renameMap) {
      const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      next = next.replace(new RegExp(`(trait:)${escaped}(?=$|[^a-z0-9-])`, "g"), `$1${newId}`);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceTraitTokenInValue(entry, renameMap));
  if (value && typeof value === "object") {
    const clone = foundry.utils.deepClone(value);
    for (const [key, entry] of Object.entries(clone)) clone[key] = replaceTraitTokenInValue(entry, renameMap);
    return clone;
  }
  return value;
}

function migrateTraitArray(values, renameMap, deleted) {
  if (!Array.isArray(values)) return null;
  let changed = false;
  const next = [];
  for (const value of values) {
    const id = String(value);
    if (deleted.has(id)) {
      changed = true;
      continue;
    }
    const renamed = renameMap.get(id) ?? id;
    if (renamed !== id) changed = true;
    if (!next.includes(renamed)) next.push(renamed);
  }
  return changed ? next : null;
}

function buildDocumentUpdate(document, renameMap, deleted) {
  const update = { _id: document.id };
  let changed = false;
  const traits = document?.system?.traits?.value;
  const nextTraits = migrateTraitArray(traits, renameMap, deleted);
  if (nextTraits) {
    update["system.traits.value"] = nextTraits;
    changed = true;
  }

  const rules = document?.system?.rules;
  if (Array.isArray(rules) && renameMap.size) {
    const nextRules = replaceTraitTokenInValue(rules, renameMap);
    if (!foundry.utils.equals(nextRules, rules)) {
      update["system.rules"] = nextRules;
      changed = true;
    }
  }
  return changed ? update : null;
}

async function updateEmbeddedItems(actor, renameMap, deleted) {
  const updates = actor.items.map((item) => buildDocumentUpdate(item, renameMap, deleted)).filter(Boolean);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  return updates.length;
}

async function migrateActor(actor, renameMap, deleted) {
  let changed = 0;
  const update = buildDocumentUpdate(actor, renameMap, deleted);
  if (update) {
    delete update._id;
    await actor.update(update, { render: false });
    changed += 1;
  }
  changed += await updateEmbeddedItems(actor, renameMap, deleted);
  return changed;
}

export async function migrateWorldTraitReferences(renameEntries = [], deletedIds = []) {
  const renameMap = new Map(renameEntries.filter(([oldId, newId]) => oldId && newId && oldId !== newId));
  const deleted = new Set(deletedIds.filter(Boolean));
  let changed = 0;

  for (const actor of game.actors ?? []) changed += await migrateActor(actor, renameMap, deleted);

  const worldItemUpdates = (game.items ?? []).map((item) => buildDocumentUpdate(item, renameMap, deleted)).filter(Boolean);
  if (worldItemUpdates.length) {
    await Item.updateDocuments(worldItemUpdates, { render: false });
    changed += worldItemUpdates.length;
  }

  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || !token.actor) continue;
      changed += await migrateActor(token.actor, renameMap, deleted);
    }
  }

  log.info(`Migrated ${changed} world document references.`);
  return changed;
}

export async function countTraitReferences(ids) {
  const wanted = new Set(ids.filter(Boolean));
  if (!wanted.size) return 0;
  let count = 0;
  const countDoc = (doc) => {
    const traits = doc?.system?.traits?.value;
    if (Array.isArray(traits) && traits.some((id) => wanted.has(id))) count += 1;
  };
  for (const actor of game.actors ?? []) {
    countDoc(actor);
    for (const item of actor.items ?? []) countDoc(item);
  }
  for (const item of game.items ?? []) countDoc(item);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || !token.actor) continue;
      countDoc(token.actor);
      for (const item of token.actor.items ?? []) countDoc(item);
    }
  }
  return count;
}

export async function runSchemaMigrations() {
  if (!game.user.isGM) return;
  let version = Number(game.settings.get(MODULE_ID, SETTINGS.SCHEMA_VERSION) ?? 0);

  if (version < 1) {
    const traits = normalizeTraits(game.settings.get(MODULE_ID, SETTINGS.TRAITS));
    await game.settings.set(MODULE_ID, SETTINGS.TRAITS, traits);
    version = 1;
    await game.settings.set(MODULE_ID, SETTINGS.SCHEMA_VERSION, version);
  }

  if (version !== SCHEMA_VERSION) log.warn(`Unexpected schema version ${version}; expected ${SCHEMA_VERSION}.`);
}

export async function resumePendingAliases() {
  if (!game.user.isGM) return;
  const aliases = game.settings.get(MODULE_ID, SETTINGS.ALIASES) ?? {};
  const entries = Object.values(aliases);
  if (!entries.length) return;

  const renames = entries.filter((entry) => entry.action === "rename" && entry.targetId).map((entry) => [entry.oldId, entry.targetId]);
  const deletions = entries.filter((entry) => entry.action === "delete").map((entry) => entry.oldId);
  try {
    await migrateWorldTraitReferences(renames, deletions);
    await game.settings.set(MODULE_ID, SETTINGS.ALIASES, {});
    syncCustomTraits();
    ui.notifications.info(`${MODULE_ID}.notifications.pendingMigrationFinished`, { localize: true });
  } catch (error) {
    log.error("Failed to resume pending trait migration", error);
    ui.notifications.error(`${MODULE_ID}.errors.pendingMigration`, { localize: true });
  }
}

export function rewriteTraitRuleReferences(traits, renameEntries) {
  const renameMap = new Map(renameEntries);
  if (!renameMap.size) return traits;
  return traits.map((trait) => ({
    ...trait,
    rules: replaceTraitTokenInValue(trait.rules, renameMap),
  }));
}
