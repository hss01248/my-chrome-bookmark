# Folder Create / Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support creating and renaming real Tab/Group folders via popover; show empty named groups.

**Architecture:** Pure helpers in `lib/bookmark-edit.js`; model filter tweak in `bookmark-model.js`; UI popover + hover actions in `bookmarks.js`/`bookmarks.css`, calling `chrome.bookmarks.create`/`update`.

**Tech Stack:** Vanilla ES modules, `chrome.bookmarks`, `node:test`.

**Spec:** [docs/superpowers/specs/2026-08-11-folder-create-rename-design.md](../specs/2026-08-11-folder-create-rename-design.md)

---

## File map

| File | Role |
| --- | --- |
| Modify: `lib/bookmark-model.js` | Keep empty real folder groups |
| Modify: `tests/bookmark-model.test.js` | Empty folder cases |
| Modify: `lib/bookmark-edit.js` | Folder title + create index helpers |
| Modify: `tests/bookmark-edit.test.js` | Helper tests |
| Modify: `bookmarks.js` | +/✎/dblclick, folder popover, API |
| Modify: `bookmarks.css` | Folder action / add button styles |
| Modify: `README.md` | Mention create/rename |

---

### Task 1: Model — empty named groups

- [ ] Update `buildGroupsForFolder` filter
- [ ] Add test: empty subfolder still in `groups`
- [ ] Run `npm test`

### Task 2: Edit helpers

- [ ] Add `normalizeFolderTitle`, `DEFAULT_FOLDER_TITLE`, `resolveNewFolderIndex`
- [ ] Unit tests
- [ ] Run `npm test`

### Task 3: UI

- [ ] Folder popover (create/rename)
- [ ] Tab/Group ✎, +, dblclick wires
- [ ] Select new Tab after create; empty group empty-state
- [ ] CSS for actions / add buttons
- [ ] README + `npm test`
