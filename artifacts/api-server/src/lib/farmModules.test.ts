import { describe, expect, it } from 'vitest';

import { FARM_MODULES, canUseModule, cleanFarmModules, moduleOfRequest } from './farmModules';

describe('Modul-Freigaben', () => {
  it('knows the module of each farm route', () => {
    expect(moduleOfRequest('GET', '/farms/3/tasks')).toBe('farm-tasks');
    expect(moduleOfRequest('POST', '/farms/3/feed-stock/12/use')).toBe('feed');
    expect(moduleOfRequest('GET', '/farms/3/camera-events')).toBe('wildlife');
    expect(moduleOfRequest('GET', '/farms/3/beds/4/plantings')).toBe('garden');
    expect(moduleOfRequest('GET', '/farms/3/members')).toBe('members');
    // Basics and the emergency numbers stay open, leaving too.
    expect(moduleOfRequest('GET', '/farms/3/animals')).toBeNull();
    expect(moduleOfRequest('GET', '/farms/3')).toBeNull();
    expect(moduleOfRequest('GET', '/farms/3/contacts')).toBeNull();
    expect(moduleOfRequest('DELETE', '/farms/3/members/u1')).toBeNull();
  });

  it('lets admins and members without a list use everything', () => {
    expect(canUseModule('admin', ['feed'], 'farm-tasks')).toBe(true);
    expect(canUseModule('caretaker', null, 'farm-tasks')).toBe(true);
    expect(canUseModule('caretaker', ['feed'], 'farm-tasks')).toBe(false);
    expect(canUseModule('guest', ['feed'], 'feed')).toBe(true);
  });

  it('keeps only known farm modules, in order', () => {
    expect(cleanFarmModules(null)).toBeNull();
    expect(cleanFarmModules(['garden', 'grow', 'feed', 'feed'])).toEqual(['feed', 'garden']);
    expect(FARM_MODULES).toContain('members');
  });
});
