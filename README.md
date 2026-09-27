# N PF2E Custom Traits

A standalone Foundry VTT module for Pathfinder Second Edition that creates reusable world-level custom traits.

## Features

- Stable user-defined trait slugs for PF2E roll options and predicates.
- Per-trait applicability across Actions, Effects, Feats, Spells, equipment categories, Creatures, Hazards, Vehicles, Ancestries, Classes, and Kingmaker Campaign Features.
- All supported categories are enabled by default for new traits.
- Optional trait descriptions integrated with PF2E trait descriptions.
- Searchable trait manager.
- JSON import/export.
- Optional PF2E Rule Elements stored as standard `system.rules` JSON.
- Safe slug rename and deletion migrations for world Actors, Items, embedded Items, and unlinked Token synthetic Actors.

## Rule Element behavior

Rule Elements attached to a custom trait are appended temporarily to the native `system.rules` array of an **embedded Item carrying that trait** while PF2E runs `ItemPF2e.prepareRuleElements()`. PF2E itself constructs and executes the Rule Elements. The module does not reimplement PF2E's Rule Element engine.

Actor-level identity traits (for example a trait placed directly on an NPC, Hazard, or Vehicle) provide the normal PF2E `self:trait:<slug>` roll option, but they do not have an Item parent and therefore do not independently execute the trait's Rule Element JSON.

## Compatibility

- Foundry VTT: minimum v14; verified against the v14 source baseline used for this release.
- Pathfinder Second Edition: minimum 8.0.0; verified against PF2E 8.5.1.

## Installation

Install the module directory as `n-pf2-custom-traits`, enable it in a PF2E world, then open **Game Settings → Configure Settings → Module Settings → Manage Custom Traits** as a GM.

## Data and migration

World data is stored under the `n-pf2-custom-traits` settings namespace. The module starts with schema version 1. Existing saved slugs are edited through the Rename action so references can be migrated. Deletion removes direct trait assignments from world documents. Compendium source documents are not rewritten.

## Debugging

Enable **Debug Mode** in module settings to print additional diagnostics. Normal operation does not emit development logs.
