import { MODULE_ID, SCHEMA_VERSION, SETTINGS, SCOPE_GROUPS, TRAIT_SCOPES, defaultScopes } from "../constants.mjs";
import { cloneTraits, createTrait, getReservedTraitIds, normalizeTraitId, normalizeTraits, syncCustomTraits, validateTraits } from "../traits.mjs";
import { countTraitReferences, migrateWorldTraitReferences, rewriteTraitRuleReferences } from "../migrations.mjs";
import { log } from "../logger.mjs";

function loc(key, data) {
  const full = `${MODULE_ID}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

function displayLabel(trait) {
  return String(trait?.label ?? "").trim() || loc("ui.unnamed");
}

function displayId(trait) {
  return String(trait?.id ?? "").trim() || loc("ui.unset");
}

function collator() {
  return new Intl.Collator(game.i18n.lang || "en", { usage: "sort", sensitivity: "base", numeric: true });
}

function rulesToEditorTexts(rules) {
  return (Array.isArray(rules) ? rules : []).map((rule) => JSON.stringify(rule, null, 2));
}

function parseRuleEditors(trait, row) {
  const texts = Array.isArray(trait?._ruleTexts) ? trait._ruleTexts : [];
  const rules = [];
  for (let index = 0; index < texts.length; index += 1) {
    const raw = String(texts[index] ?? "").trim();
    if (!raw) throw new Error(loc("errors.ruleEmpty", { row, rule: index + 1 }));
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(loc("errors.ruleJsonIndexed", { row, rule: index + 1, message: error.message }));
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(loc("errors.ruleObject", { row, rule: index + 1 }));
    }
    rules.push(parsed);
  }
  return rules;
}

function decorate(traits, selectedUid, persistedIds) {
  const sorter = collator();
  return traits.map((trait) => ({
    ...trait,
    isSelected: trait.uid === selectedUid,
    displayLabel: displayLabel(trait),
    displayId: displayId(trait),
    idLocked: persistedIds.has(trait.uid),
    searchText: `${trait.label} ${trait.id} ${trait.description}`.toLocaleLowerCase(game.i18n.lang),
  })).sort((a, b) => sorter.compare(a.displayLabel, b.displayLabel) || sorter.compare(a.displayId, b.displayId));
}

export class CustomTraitsManager extends foundry.appv1.api.FormApplication {
  constructor(...args) {
    super(...args);
    this.draft = null;
    this.selectedUid = null;
    this.persistedIds = new Map();
    this.pendingUiState = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-manager`,
      title: game.i18n.localize(`${MODULE_ID}.ui.title`),
      template: `modules/${MODULE_ID}/templates/custom-traits.hbs`,
      width: 940,
      height: 720,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      classes: [MODULE_ID, "custom-traits-manager"],
    });
  }

  #loadDraft() {
    const saved = cloneTraits(game.settings.get(MODULE_ID, SETTINGS.TRAITS));
    this.draft = saved.map((trait) => ({ ...trait, _ruleTexts: rulesToEditorTexts(trait.rules) }));
    this.persistedIds = new Map(saved.map((trait) => [trait.uid, trait.id]));
    this.selectedUid = this.draft[0]?.uid ?? null;
  }

  getData() {
    if (!this.draft) this.#loadDraft();
    if (this.selectedUid && !this.draft.some((trait) => trait.uid === this.selectedUid)) this.selectedUid = this.draft[0]?.uid ?? null;
    const items = decorate(this.draft, this.selectedUid, new Set(this.persistedIds.keys()));
    const selected = items.find((trait) => trait.isSelected) ?? null;
    if (selected) {
      selected.ruleEditors = (selected._ruleTexts ?? []).map((text, index) => ({ index, number: index + 1, text }));
    }
    const scopeGroups = SCOPE_GROUPS.map((group) => ({
      label: loc(`scopes.groups.${group.key}`),
      scopes: group.scopes.map((key) => ({ key, label: loc(`scopes.${key}`), checked: selected?.scopes?.[key] !== false })),
    }));
    return {
      traits: items,
      selectedTrait: selected,
      hasTraits: items.length > 0,
      scopeGroups,
      ruleElementsHelp: loc("ui.ruleElementsHelp"),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    const state = this.pendingUiState;
    this.pendingUiState = null;
    if (state) requestAnimationFrame(() => {
      const list = root.querySelector(".npf2ct-list");
      if (list && Number.isFinite(state.scrollTop)) list.scrollTop = state.scrollTop;
      const editor = root.querySelector(".npf2ct-editor");
      if (editor && Number.isFinite(state.editorScrollTop)) editor.scrollTop = state.editorScrollTop;
      if (state.focus) root.querySelector(state.focus)?.focus();
      if (state.ensureVisible) root.querySelector(".npf2ct-list-item.is-active")?.scrollIntoView({ block: "nearest" });
    });

    html.find("[data-action='select-trait']").on("click", (event) => {
      this.#syncEditor(root);
      this.selectedUid = event.currentTarget.dataset.uid;
      this.pendingUiState = { scrollTop: root.querySelector(".npf2ct-list")?.scrollTop ?? 0 };
      this.render(false);
    });

    html.find("[data-action='add-trait']").on("click", () => {
      this.#syncEditor(root);
      const trait = createTrait({ scopes: defaultScopes(), rules: [] });
      trait._ruleTexts = [];
      this.draft.push(trait);
      this.selectedUid = trait.uid;
      this.pendingUiState = { ensureVisible: true, focus: "[data-field='label']" };
      this.render(false);
    });

    html.find("[data-action='delete-trait']").on("click", async () => {
      const trait = this.#selected();
      if (!trait) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: loc("dialogs.delete.title") },
        content: `<p>${loc("dialogs.delete.content", { label: foundry.utils.escapeHTML(trait.label || trait.id) })}</p>`,
        yes: { label: loc("common.delete") },
        no: { label: loc("common.cancel") },
      });
      if (!confirmed) return;
      this.draft = this.draft.filter((entry) => entry.uid !== trait.uid);
      this.selectedUid = this.draft[0]?.uid ?? null;
      this.render(false);
    });

    html.find("[data-action='rename-id']").on("click", async () => {
      this.#syncEditor(root);
      const trait = this.#selected();
      if (!trait || !this.persistedIds.has(trait.uid)) return;
      const fd = await foundry.applications.api.DialogV2.input({
        window: { title: loc("dialogs.rename.title") },
        content: `<div class="form-group"><label>${loc("ui.ruleId")}</label><input name="id" type="text" value="${foundry.utils.escapeHTML(trait.id)}" autofocus></div><p class="hint">${loc("dialogs.rename.hint")}</p>`,
        ok: { label: loc("dialogs.rename.submit") },
      });
      if (!fd) return;
      const next = normalizeTraitId(fd.id ?? "");
      const error = this.#validateSingleId(next, trait.uid);
      if (error) return ui.notifications.error(error);
      trait.id = next;
      this.render(false);
    });

    html.find("[data-action='scope-all']").on("click", () => this.#setAllScopes(true, root));
    html.find("[data-action='scope-none']").on("click", () => this.#setAllScopes(false, root));
    html.find("[data-scope]").on("change", (event) => {
      const trait = this.#selected();
      if (trait) trait.scopes[event.currentTarget.dataset.scope] = event.currentTarget.checked;
    });

    html.find("[data-field]").on("input change", (event) => {
      const trait = this.#selected();
      if (!trait) return;
      const field = event.currentTarget.dataset.field;
      if (field === "id") trait.id = event.currentTarget.value;
      else trait[field] = event.currentTarget.value;
      this.#refreshLabels(root);
    });

    html.find("textarea[data-rule-index]").on("input change", (event) => {
      const trait = this.#selected();
      const index = Number(event.currentTarget.dataset.ruleIndex);
      if (!trait || !Number.isInteger(index)) return;
      trait._ruleTexts ??= [];
      trait._ruleTexts[index] = event.currentTarget.value;
    });

    html.find("[data-action='add-rule']").on("click", () => {
      this.#syncEditor(root);
      const trait = this.#selected();
      if (!trait) return;
      trait._ruleTexts ??= [];
      trait._ruleTexts.push(JSON.stringify({ key: "NewRuleElement" }, null, 2));
      this.pendingUiState = { focus: `[data-rule-index="${trait._ruleTexts.length - 1}"]` };
      this.render(false);
    });

    html.find("[data-action='remove-rule']").on("click", (event) => {
      this.#syncEditor(root);
      const trait = this.#selected();
      const index = Number(event.currentTarget.dataset.ruleIndex);
      if (!trait || !Number.isInteger(index)) return;
      trait._ruleTexts ??= [];
      trait._ruleTexts.splice(index, 1);
      this.pendingUiState = { editorScrollTop: root.querySelector(".npf2ct-editor")?.scrollTop ?? 0 };
      this.render(false);
    });

    html.find("[data-action='format-rule']").on("click", (event) => {
      this.#syncEditor(root);
      const trait = this.#selected();
      const index = Number(event.currentTarget.dataset.ruleIndex);
      if (!trait || !Number.isInteger(index)) return;
      try {
        const raw = String(trait._ruleTexts?.[index] ?? "").trim();
        if (!raw) throw new Error(loc("errors.ruleEmpty", { row: this.draft.indexOf(trait) + 1, rule: index + 1 }));
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(loc("errors.ruleObject", { row: this.draft.indexOf(trait) + 1, rule: index + 1 }));
        }
        trait._ruleTexts[index] = JSON.stringify(parsed, null, 2);
        this.render(false);
      } catch (error) {
        if (error instanceof SyntaxError) {
          ui.notifications.error(loc("errors.ruleJsonIndexed", { row: this.draft.indexOf(trait) + 1, rule: index + 1, message: error.message }));
        } else ui.notifications.error(error.message);
      }
    });

    html.find("[data-action='export']").on("click", () => this.#export());
    html.find("[data-action='import']").on("click", () => this.#import());

    html.find("[data-role='search']").on("input", (event) => {
      const query = event.currentTarget.value.trim().toLocaleLowerCase(game.i18n.lang);
      let visible = 0;
      for (const item of root.querySelectorAll(".npf2ct-list-item")) {
        const match = !query || String(item.dataset.search ?? "").includes(query);
        item.hidden = !match;
        if (match) visible += 1;
      }
      const empty = root.querySelector("[data-role='search-empty']");
      if (empty) empty.hidden = visible > 0;
    });
  }

  #selected() {
    return this.draft?.find((trait) => trait.uid === this.selectedUid) ?? null;
  }

  #syncEditor(root = this.form) {
    const trait = this.#selected();
    if (!trait || !root) return;
    const editor = root.querySelector(".npf2ct-editor");
    if (!editor) return;
    trait.label = editor.querySelector("[data-field='label']")?.value ?? trait.label;
    const idInput = editor.querySelector("[data-field='id']");
    if (idInput && !idInput.readOnly) trait.id = idInput.value;
    trait.description = editor.querySelector("[data-field='description']")?.value ?? trait.description;
    trait._ruleTexts = Array.from(editor.querySelectorAll("textarea[data-rule-index]"))
      .sort((a, b) => Number(a.dataset.ruleIndex) - Number(b.dataset.ruleIndex))
      .map((textarea) => textarea.value);
    for (const checkbox of editor.querySelectorAll("[data-scope]")) trait.scopes[checkbox.dataset.scope] = checkbox.checked;
  }

  #refreshLabels(root) {
    const trait = this.#selected();
    if (!trait || !root) return;
    for (const node of root.querySelectorAll(`[data-uid="${trait.uid}"]`)) {
      node.querySelector(".npf2ct-list-name")?.replaceChildren(displayLabel(trait));
      node.querySelector(".npf2ct-list-code")?.replaceChildren(displayId(trait));
    }
    root.querySelector("[data-role='detail-name']")?.replaceChildren(displayLabel(trait));
    root.querySelector("[data-role='detail-code']")?.replaceChildren(displayId(trait));
  }

  #setAllScopes(value, root) {
    const trait = this.#selected();
    if (!trait) return;
    for (const key of TRAIT_SCOPES) trait.scopes[key] = value;
    for (const checkbox of root.querySelectorAll("[data-scope]")) checkbox.checked = value;
  }

  #validateSingleId(id, ownUid) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return loc("errors.invalidIdShort", { id });
    if (this.draft.some((trait) => trait.uid !== ownUid && normalizeTraitId(trait.id) === id)) return loc("errors.duplicateId", { id });
    if (getReservedTraitIds().has(id)) return loc("errors.reservedId", { id });
    return null;
  }

  #prepareTraits() {
    this.#syncEditor();
    const traits = cloneTraits(this.draft);
    for (let index = 0; index < traits.length; index += 1) {
      const source = this.draft.find((entry) => entry.uid === traits[index].uid);
      traits[index].rules = parseRuleEditors(source, index + 1);
    }
    return traits;
  }

  async #export() {
    try {
      const traits = this.#prepareTraits();
      const payload = {
        module: MODULE_ID,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        traits,
      };
      foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", `${MODULE_ID}-traits.json`);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }

  async #import() {
    const readSelection = (action) => (_event, button) => ({
      action,
      file: button.form?.elements?.data?.files?.[0] ?? null,
    });
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: loc("dialogs.import.title") },
      content: `<div class="form-group"><label>${loc("dialogs.import.file")}</label><input type="file" name="data" accept="application/json,.json"></div><p class="hint">${loc("dialogs.import.hint")}</p>`,
      buttons: [
        { action: "merge", label: loc("dialogs.import.merge"), icon: "fa-solid fa-code-merge", callback: readSelection("merge") },
        { action: "replace", label: loc("dialogs.import.replace"), icon: "fa-solid fa-arrows-rotate", callback: readSelection("replace") },
        { action: "cancel", label: loc("common.cancel"), icon: "fa-solid fa-xmark", callback: () => null },
      ],
    });
    if (!action?.file) return;
    try {
      const text = await foundry.utils.readTextFromFile(action.file);
      const data = JSON.parse(text);
      const imported = normalizeTraits(Array.isArray(data) ? data : data?.traits);
      const error = validateTraits(imported);
      if (error) throw new Error(error);
      if (action.action === "replace") {
        this.draft = imported.map((trait) => ({ ...trait, _ruleTexts: rulesToEditorTexts(trait.rules) }));
      } else {
        const byId = new Map(this.draft.map((trait) => [normalizeTraitId(trait.id), trait]));
        for (const incoming of imported) {
          const existing = byId.get(incoming.id);
          if (existing) Object.assign(existing, incoming, { uid: existing.uid, _ruleTexts: rulesToEditorTexts(incoming.rules) });
          else {
            incoming._ruleTexts = rulesToEditorTexts(incoming.rules);
            this.draft.push(incoming);
          }
        }
      }
      this.selectedUid = this.draft[0]?.uid ?? null;
      this.render(false);
      ui.notifications.info(`${MODULE_ID}.notifications.imported`, { localize: true });
    } catch (error) {
      log.error("Import failed", error);
      ui.notifications.error(loc("errors.import", { message: error.message }));
    }
  }

  async _updateObject() {
    let traits;
    try {
      traits = this.#prepareTraits();
    } catch (error) {
      return ui.notifications.error(error.message);
    }
    const validation = validateTraits(traits);
    if (validation) return ui.notifications.error(validation);

    const oldTraits = cloneTraits(game.settings.get(MODULE_ID, SETTINGS.TRAITS));
    const oldByUid = new Map(oldTraits.map((trait) => [trait.uid, trait]));
    const newByUid = new Map(traits.map((trait) => [trait.uid, trait]));
    const renames = [];
    const deleted = [];
    for (const [uid, oldTrait] of oldByUid) {
      const next = newByUid.get(uid);
      if (!next) deleted.push(oldTrait);
      else if (oldTrait.id !== next.id) renames.push([oldTrait.id, next.id, oldTrait]);
    }

    const destructiveIds = [...renames.map(([oldId]) => oldId), ...deleted.map((trait) => trait.id)];
    if (destructiveIds.length) {
      const references = await countTraitReferences(destructiveIds);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: loc("dialogs.migrate.title") },
        content: `<p>${loc("dialogs.migrate.content", { changes: destructiveIds.length, references })}</p><p>${loc("dialogs.migrate.note")}</p>`,
        yes: { label: loc("dialogs.migrate.submit") },
        no: { label: loc("common.cancel") },
      });
      if (!confirmed) return;
    }

    const renamePairs = renames.map(([oldId, newId]) => [oldId, newId]);
    traits = rewriteTraitRuleReferences(traits, renamePairs);
    const aliases = {};
    for (const [oldId, newId, oldTrait] of renames) aliases[oldId] = { action: "rename", oldId, targetId: newId, trait: oldTrait };
    for (const oldTrait of deleted) aliases[oldTrait.id] = { action: "delete", oldId: oldTrait.id, targetId: null, trait: oldTrait };

    try {
      if (Object.keys(aliases).length) {
        await game.settings.set(MODULE_ID, SETTINGS.ALIASES, aliases);
        await game.settings.set(MODULE_ID, SETTINGS.TRAITS, traits);
        syncCustomTraits(traits, { aliases, rerender: false });
        await migrateWorldTraitReferences(renamePairs, deleted.map((trait) => trait.id));
        await game.settings.set(MODULE_ID, SETTINGS.ALIASES, {});
      } else {
        await game.settings.set(MODULE_ID, SETTINGS.TRAITS, traits);
      }
      syncCustomTraits(traits);
      this.#loadDraft();
      this.render(false);
      ui.notifications.info(`${MODULE_ID}.notifications.saved`, { localize: true });
    } catch (error) {
      log.error("Saving or migrating custom traits failed", error);
      ui.notifications.error(`${MODULE_ID}.errors.saveMigration`, { localize: true });
      this.#loadDraft();
      this.render(false);
    }
  }
}
