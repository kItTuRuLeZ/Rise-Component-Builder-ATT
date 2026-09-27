// @vitest-environment node
//
// 27 September 2026 functional audit, section 3: "AT&T and PMI run under different paths on
// the same kittu-rulz.github.io origin. Projects and IndexedDB media are shared across the
// editions." This file proves, against the real storage module (not a mock), that:
//   - going forward, this edition reads/writes its own namespaced localStorage keys;
//   - a legacy project or draft this edition can confidently attribute to itself (by
//     clientLabel) is claimed automatically, once, without duplicating or losing anything;
//   - a legacy project it can't confidently attribute to itself is left alone — visible via
//     getUnclaimedLegacyProjects, importable only by an explicit importLegacyProjectById call;
//   - nothing under a legacy key is ever deleted, so the migration is safe to re-run and the
//     other edition (or a human) can still recover anything this edition didn't claim.
import { beforeEach, describe, expect, test } from 'vitest';
import {
  KEYS, loadProjects, saveProject, getProject, loadDraft, saveDraft,
  getUnclaimedLegacyProjects, importLegacyProjectById
} from '../../js/storage.js';
import { EDITION, ownedByThisEdition } from '../../js/client-isolation.js';
import { buildProjectSchemaV3, createComponentInstance, createSection } from '../../js/project-schema.js';
import { memoryLocalStorage } from '../fixtures/index.js';

const LEGACY_PROJECTS_KEY = 'rise-builder-projects-v1';
const LEGACY_DRAFT_KEY = 'rise-builder-draft-v1';
const OTHER_EDITION = EDITION === 'ATT' ? 'PMI' : 'AT&T';

function legacyProject(overrides = {}) {
  const comp = createComponentInstance({ id: 'c1', name: 'Lesson', type: 'accordion', config: { items: [{ title: 'One', content: 'Body' }] } });
  return {
    ...buildProjectSchemaV3({
      id: overrides.id || 'legacy-1', name: overrides.name || 'Legacy Course',
      sectionOrder: ['s1'], sections: { s1: createSection({ id: 's1', name: 'Module', componentOrder: ['c1'] }) },
      components: { c1: comp }
    }),
    ...overrides
  };
}

beforeEach(() => {
  globalThis.localStorage = memoryLocalStorage();
});

describe('this edition reads and writes its own namespaced keys', () => {
  test(`KEYS.projects is namespaced for ${EDITION}, not the old shared key`, () => {
    expect(KEYS.projects).not.toBe(LEGACY_PROJECTS_KEY);
    expect(KEYS.projects.toLowerCase()).toContain(EDITION.toLowerCase());
  });

  test('a project saved by this edition is invisible under the legacy shared key', () => {
    const project = saveProject(buildProjectSchemaV3({ name: 'New Course' }));
    expect(globalThis.localStorage.getItem(LEGACY_PROJECTS_KEY)).toBeNull();
    expect(JSON.parse(globalThis.localStorage.getItem(KEYS.projects)).some(p => p.id === project.id)).toBe(true);
  });
});

describe('legacy projects this edition confidently owns are claimed automatically', () => {
  test(`a project labelled for ${EDITION} is claimed on first read, without duplicating`, () => {
    const owned = legacyProject({ id: 'legacy-owned', name: 'Owned Legacy Course', clientLabel: EDITION === 'ATT' ? 'AT&T' : 'PMI' });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([owned]));

    const projects = loadProjects();
    expect(projects.some(p => p.id === 'legacy-owned')).toBe(true);

    // Re-reading doesn't duplicate it, and the legacy record is still there, untouched.
    const again = loadProjects();
    expect(again.filter(p => p.id === 'legacy-owned').length).toBe(1);
    const legacyStillThere = JSON.parse(globalThis.localStorage.getItem(LEGACY_PROJECTS_KEY));
    expect(legacyStillThere.some(p => p.id === 'legacy-owned')).toBe(true);
  });

  test('claiming never deletes or mutates the legacy record', () => {
    const owned = legacyProject({ id: 'legacy-owned-2', clientLabel: EDITION === 'ATT' ? 'AT&T' : 'PMI' });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([owned]));
    loadProjects();
    const legacyAfter = JSON.parse(globalThis.localStorage.getItem(LEGACY_PROJECTS_KEY));
    expect(legacyAfter).toEqual([owned]);
  });
});

describe(`a legacy project labelled for ${OTHER_EDITION} is never auto-claimed`, () => {
  test('it does not appear in this edition’s project list', () => {
    const theirs = legacyProject({ id: 'legacy-other', clientLabel: OTHER_EDITION });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([theirs]));
    const projects = loadProjects();
    expect(projects.some(p => p.id === 'legacy-other')).toBe(false);
  });

  test('ownedByThisEdition correctly rejects the other edition’s label', () => {
    expect(ownedByThisEdition(OTHER_EDITION)).toBe(false);
  });
});

describe('ambiguous legacy projects (blank/unrecognised clientLabel) stay unclaimed and visible', () => {
  test('an unlabelled legacy project is listed by getUnclaimedLegacyProjects, not auto-claimed', () => {
    const ambiguous = legacyProject({ id: 'legacy-ambiguous', name: 'Mystery Course', clientLabel: '' });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([ambiguous]));

    expect(loadProjects().some(p => p.id === 'legacy-ambiguous')).toBe(false);
    const unclaimed = getUnclaimedLegacyProjects();
    expect(unclaimed.some(p => p.id === 'legacy-ambiguous' && p.name === 'Mystery Course')).toBe(true);
  });

  test('a legacy project with a third-party clientLabel is also treated as ambiguous, not silently dropped', () => {
    const thirdParty = legacyProject({ id: 'legacy-third-party', clientLabel: 'Acme Internal Training' });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([thirdParty]));
    expect(getUnclaimedLegacyProjects().some(p => p.id === 'legacy-third-party')).toBe(true);
  });

  test('importLegacyProjectById copies an unclaimed project in without touching the legacy record', () => {
    const ambiguous = legacyProject({ id: 'legacy-to-import', name: 'Import Me', clientLabel: '' });
    globalThis.localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify([ambiguous]));

    const imported = importLegacyProjectById('legacy-to-import');
    expect(imported.id).toBe('legacy-to-import');
    expect(getProject('legacy-to-import')).not.toBeNull();

    const legacyAfter = JSON.parse(globalThis.localStorage.getItem(LEGACY_PROJECTS_KEY));
    expect(legacyAfter.some(p => p.id === 'legacy-to-import')).toBe(true);
    // Imported, so no longer offered again as unclaimed.
    expect(getUnclaimedLegacyProjects().some(p => p.id === 'legacy-to-import')).toBe(false);
  });

  test('importLegacyProjectById throws a clear error for an id that does not exist', () => {
    expect(() => importLegacyProjectById('does-not-exist')).toThrow(/could not be found/);
  });
});

describe('the legacy draft is claimed only when it confidently belongs to this edition', () => {
  test(`a draft whose embedded project is labelled for ${EDITION} is claimed`, () => {
    const draft = legacyProject({ id: 'draft-1', clientLabel: EDITION === 'ATT' ? 'AT&T' : 'PMI' });
    globalThis.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(draft));
    expect(loadDraft()?.id).toBe('draft-1');
  });

  test(`a draft labelled for ${OTHER_EDITION} is left alone, not exposed as this edition's draft`, () => {
    const draft = legacyProject({ id: 'draft-2', clientLabel: OTHER_EDITION });
    globalThis.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(draft));
    expect(loadDraft()).toBeNull();
    // Still recoverable under the legacy key — never deleted.
    expect(JSON.parse(globalThis.localStorage.getItem(LEGACY_DRAFT_KEY)).id).toBe('draft-2');
  });

  test('this edition’s own already-saved draft is never overwritten by a legacy one', () => {
    const mine = legacyProject({ id: 'my-own-draft', clientLabel: EDITION === 'ATT' ? 'AT&T' : 'PMI' });
    saveDraft(mine);
    const legacyDraft = legacyProject({ id: 'legacy-draft-should-not-win', clientLabel: EDITION === 'ATT' ? 'AT&T' : 'PMI' });
    globalThis.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacyDraft));
    expect(loadDraft()?.id).toBe('my-own-draft');
  });
});
