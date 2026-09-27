import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { syncCustomTraits } from "./traits.mjs";
import { CustomTraitsManager } from "./apps/custom-traits-manager.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.TRAITS, {
    name: `${MODULE_ID}.settings.traits.name`,
    hint: `${MODULE_ID}.settings.traits.hint`,
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: (value) => syncCustomTraits(value),
  });

  game.settings.register(MODULE_ID, SETTINGS.ALIASES, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => syncCustomTraits(),
  });

  game.settings.register(MODULE_ID, SETTINGS.SCHEMA_VERSION, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: `${MODULE_ID}.settings.debug.name`,
    hint: `${MODULE_ID}.settings.debug.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: `${MODULE_ID}.settings.manager.name`,
    label: `${MODULE_ID}.settings.manager.label`,
    hint: `${MODULE_ID}.settings.manager.hint`,
    icon: "fa-solid fa-tags",
    type: CustomTraitsManager,
    restricted: true,
  });
}
