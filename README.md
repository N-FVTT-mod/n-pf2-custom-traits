# N PF2E Custom Traits

A Foundry VTT module for Pathfinder Second Edition that lets GMs create reusable custom traits for their worlds.

## Features

- Create reusable custom traits with custom names and stable identifiers.
- Choose where each trait can be used, including Actions, Effects, Feats, Spells, equipment categories, Creatures, Hazards, Vehicles, Ancestries, Classes, and Kingmaker Campaign Features.
- New traits support all available categories by default and can be limited to specific categories when needed.
- Add optional descriptions that appear alongside the trait in PF2E interfaces.
- Search and manage custom traits from a dedicated configuration interface.
- Import and export custom trait definitions as JSON.
- Attach optional PF2E Rule Elements to custom traits for rules automation.
- Safely rename or delete custom traits while keeping existing world data consistent.

## Rule Elements

Custom traits can include optional PF2E Rule Elements. When a supported Item carrying that trait is used by a character, the attached rules are applied through PF2E's normal rules system.

Traits placed directly on Actors such as NPCs, Hazards, or Vehicles still work as normal traits, but Item-based Rule Elements require the trait to be present on an Item.

## Compatibility

- Foundry VTT: minimum v14; verified against v14.
- Pathfinder Second Edition: minimum 8.0.0; verified against PF2E 8.5.1.

## Installation

Install the module directory as `n-pf2-custom-traits`, enable it in a PF2E world, then open **Game Settings → Configure Settings → Module Settings → Manage Custom Traits** as a GM.

## Data Management

Renaming a saved trait updates its existing references in the world. Deleting a trait removes its direct assignments from world documents.

Compendium source documents are not modified automatically.

## Debugging

Enable **Debug Mode** in module settings if additional diagnostic information is needed. Normal use does not produce development logs.
---

<div align="center">

## More PF2E-Focused Modules on Patreon

N-FVTT-MOD is dedicated to building practical enhancements specifically for the **Pathfinder Second Edition system on Foundry VTT**.

Our Patreon includes additional premium modules focused on improving PF2E gameplay, GM workflows, interface usability, automation, and system-specific features.

<br>

<a href="YOUR_PATREON_URL">
  <img src="https://img.shields.io/badge/Patreon-Explore%20Premium%20PF2E%20Modules-FF424D?style=for-the-badge&logo=patreon&logoColor=white" alt="N-FVTT-MOD on Patreon">
</a>

<br><br>

**Built for PF2E. Designed for Foundry VTT.**

</div>
