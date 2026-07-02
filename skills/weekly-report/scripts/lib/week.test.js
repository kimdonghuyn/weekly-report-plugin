'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getWeekStart, isoWeekLabel, getWeekRange } = require('./week');

test('getWeekStart returns a Monday for any day of the week', () => {
  const samples = [
    new Date(2026, 6, 2),  // Thursday
    new Date(2026, 6, 5),  // Sunday
    new Date(2026, 0, 1),  // Thursday
  ];
  for (const s of samples) {
    assert.equal(getWeekStart(s).getDay(), 1, `expected Monday for ${s}`);
  }
});

test('isoWeekLabel matches the YYYY-Www format', () => {
  assert.match(isoWeekLabel(new Date(2026, 6, 2)), /^\d{4}-W\d{2}$/);
});

test('January 4th is always in ISO week 01 (ISO 8601 invariant)', () => {
  assert.equal(isoWeekLabel(new Date(2027, 0, 4)), '2027-W01');
});

test('2026-07-02 is 2026-W27', () => {
  assert.equal(isoWeekLabel(new Date(2026, 6, 2)), '2026-W27');
});

test('getWeekRange spans exactly 7 days with an exclusive end', () => {
  const { start, end } = getWeekRange(new Date(2026, 6, 2));
  assert.equal((end - start) / (24 * 3600 * 1000), 7);
});

test('Monday and Sunday of the same week share the same isoLabel', () => {
  const mon = getWeekRange(new Date(2026, 6, 6)).isoLabel;  // Monday
  const sun = getWeekRange(new Date(2026, 6, 12)).isoLabel; // Sunday, same week
  assert.equal(mon, sun);
  assert.equal(mon, '2026-W28');
});
