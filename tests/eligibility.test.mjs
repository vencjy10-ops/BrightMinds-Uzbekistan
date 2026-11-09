// Run from the repository root:  node tests/eligibility.test.mjs
import assert from 'node:assert/strict';
import { evaluateEligibility, STATUS } from '../src/lib/eligibility.js';

const today = new Date('2026-11-09T12:00:00Z');
const kid = { age_range: '13_15', grade: 9, country: 'Uzbekistan' };
const run = (o, p = kid) => evaluateEligibility(o, p, today);
const codes = (list) => list.map((x) => x.code);
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

check('minimum age 18 conflicts with a 13-15 profile', () => {
  const r = run({ title: 'Course', min_age: 18 });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.ok(codes(r.conflicts).includes('age_min'));
});
check('minimum age 13 matches, rest unconfirmed -> potential', () => {
  const r = run({ title: 'Course', min_age: 13 });
  assert.equal(r.status, STATUS.POTENTIAL);
  assert.ok(codes(r.matched).includes('age'));
});
check('minimum age 14 is unclear for a 13-15 range -> potential', () => {
  const r = run({ title: 'Course', min_age: 14 });
  assert.equal(r.status, STATUS.POTENTIAL);
  assert.ok(codes(r.unconfirmed).includes('age_range'));
});
check('missing age is never a match', () => {
  const r = run({ title: 'Course' });
  assert.ok(codes(r.unconfirmed).includes('age_unstated'));
  assert.notEqual(r.status, STATUS.ELIGIBLE);
});
check('fully confirmed record -> eligible', () => {
  const r = run({ title: 'Science fair', min_age: 13, max_age: 17, grade_min: 8, grade_max: 11, eligible_countries: ['Uzbekistan'], education_level: 'school', deadline: '2027-02-01' });
  assert.equal(r.status, STATUS.ELIGIBLE);
  assert.equal(r.unconfirmed.length + r.conflicts.length, 0);
});
check('global eligibility counts as a country match', () => {
  const r = run({ title: 'X', min_age: 13, grade_min: 8, eligible_countries: ['Global'], education_level: 'any', deadline: '2027-02-01' });
  assert.equal(r.status, STATUS.ELIGIBLE);
});
check('same record with a passed deadline -> not eligible', () => {
  const r = run({ title: 'Science fair', min_age: 13, max_age: 17, grade_min: 8, grade_max: 11, eligible_countries: ['Uzbekistan'], education_level: 'school', deadline: '2026-10-01' });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.ok(codes(r.conflicts).includes('deadline_passed'));
});
check('deadline today is still open', () => {
  const r = run({ title: 'X', deadline: '2026-11-09' });
  assert.ok(codes(r.matched).includes('deadline_open'));
});
check('graduate-level program is a conflict for a school student', () => {
  const r = run({ title: 'Fully funded master scholarship', min_age: 13, education_level: 'graduate' });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.ok(codes(r.conflicts).includes('level'));
});
check('master in the title with unknown level -> hint only, potential', () => {
  const r = run({ title: "Erasmus Mundus Joint Master's" });
  assert.equal(r.status, STATUS.POTENTIAL);
  assert.ok(codes(r.unconfirmed).includes('level_hint'));
});
check('country not on the list -> not eligible', () => {
  const r = run({ title: 'X', eligible_countries: ['Kazakhstan'] });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
});
check('grade outside the range -> not eligible', () => {
  const r = run({ title: 'X', grade_min: 10, grade_max: 12 });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.ok(codes(r.conflicts).includes('grade'));
});
check('18_plus profile meets minimum age 18', () => {
  const r = run({ title: 'X', min_age: 18 }, { age_range: '18_plus', grade: 13, country: 'Uzbekistan' });
  assert.ok(codes(r.matched).includes('age'));
});
check('university student is not blocked by the school-level rule', () => {
  const r = run({ title: 'Bachelor course' }, { age_range: '18_plus', grade: 13, country: 'Uzbekistan' });
  assert.ok(!codes(r.conflicts).includes('level'));
});
check('empty profile -> no status', () => {
  assert.equal(run({ title: 'X', min_age: 18 }, { age_range: '', grade: null, country: '' }).status, null);
  assert.equal(run({ title: 'X' }, null).status, null);
});
console.log(`\n${n} checks passed`);
