import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { installRuleElementBridge } from "./rule-elements.mjs";
import { runSchemaMigrations, resumePendingAliases } from "./migrations.mjs";
import { syncCustomTraits, getConfiguredTraits, getRuntimeTrait } from "./traits.mjs";
import { log } from "./logger.mjs";

Hooks.once("init", () => {
  if (game.system.id !== "pf2e") {
    log.error("This module requires the Pathfinder Second Edition system.");
    return;
  }
  registerSettings();
  installRuleElementBridge();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = Object.freeze({
      getTraits: () => getConfiguredTraits({ includeAliases: false }),
      getTrait: (id) => getRuntimeTrait(id),
      sync: () => syncCustomTraits(),
    });
  }
});

Hooks.once("setup", () => {
  if (game.system.id === "pf2e") installRuleElementBridge();
});

Hooks.once("i18nInit", () => {
  if (game.system.id === "pf2e") syncCustomTraits(null, { rerender: false });
});

Hooks.once("ready", async () => {
  if (game.system.id !== "pf2e" || !game.user.isGM) return;
  await runSchemaMigrations();
  syncCustomTraits(null, { rerender: false });
  await resumePendingAliases();
});
