export const MODULE_ID = "n-pf2-custom-traits";
export const SCHEMA_VERSION = 1;

export const SETTINGS = Object.freeze({
  TRAITS: "traits",
  ALIASES: "migrationAliases",
  SCHEMA_VERSION: "schemaVersion",
  DEBUG: "debugMode",
});

export const TRAIT_SCOPES = Object.freeze([
  "actionTraits",
  "effectTraits",
  "featTraits",
  "spellTraits",
  "weaponTraits",
  "npcAttackTraits",
  "shieldTraits",
  "equipmentTraits",
  "armorTraits",
  "consumableTraits",
  "creatureTraits",
  "hazardTraits",
  "vehicleTraits",
  "ancestryTraits",
  "classTraits",
  "kingmakerTraits",
]);

export const SCOPE_GROUPS = Object.freeze([
  { key: "items", scopes: ["actionTraits", "effectTraits", "featTraits", "spellTraits"] },
  { key: "equipment", scopes: ["weaponTraits", "npcAttackTraits", "shieldTraits", "equipmentTraits", "armorTraits", "consumableTraits"] },
  { key: "actors", scopes: ["creatureTraits", "hazardTraits", "vehicleTraits", "ancestryTraits", "classTraits"] },
  { key: "campaign", scopes: ["kingmakerTraits"] },
]);

export function defaultScopes() {
  return Object.fromEntries(TRAIT_SCOPES.map((key) => [key, true]));
}
