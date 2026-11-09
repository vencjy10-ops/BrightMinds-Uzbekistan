// Explainable eligibility rules for school students (pure functions, no network).
// Three states only:
//   eligible      - every checked criterion is confirmed by the record and matches the profile
//   potential     - nothing conflicts, but something is missing or unclear
//   not_eligible  - at least one criterion clearly conflicts with the profile
// A missing record field is never treated as a match.

export const STATUS = { ELIGIBLE: 'eligible', POTENTIAL: 'potential', NOT_ELIGIBLE: 'not_eligible' };

// An age range is not an exact age, so comparisons use the lowest and highest age in the range.
const AGE_RANGES = { under_13: [0, 12], '13_15': [13, 15], '16_17': [16, 17], '18_plus': [18, 120] };
const UNIVERSITY_HINT = /\b(master'?s?|msc|m\.sc|phd|ph\.d|doctoral|doctorate|postgraduate|graduate|undergraduate|bachelor'?s?)\b/i;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clean = (v) => String(v ?? '').trim().toLowerCase();

export function profileFrom(user) {
  if (!user) return null;
  return {
    age_range: user.age_range || '',
    grade: isNum(user.grade) ? user.grade : null,
    country: user.country || '',
  };
}

export function hasProfile(profile) {
  return Boolean(profile && (AGE_RANGES[profile.age_range] || isNum(profile.grade) || clean(profile.country)));
}

function gradeRange(min, max) {
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `${min}+`;
  return `<=${max}`;
}

export function evaluateEligibility(opportunity, profile, today = new Date()) {
  if (!opportunity) return { status: null, matched: [], unconfirmed: [], conflicts: [] };
  if (!hasProfile(profile)) {
    return { status: null, reason: 'profile_incomplete', matched: [], unconfirmed: [], conflicts: [] };
  }

  const o = opportunity;
  const matched = [];
  const unconfirmed = [];
  const conflicts = [];

  // ---- age -------------------------------------------------------------
  const range = AGE_RANGES[profile.age_range];
  const minAge = isNum(o.min_age) ? o.min_age : null;
  const maxAge = isNum(o.max_age) ? o.max_age : null;
  if (!range) {
    unconfirmed.push({ code: 'age_profile' });
  } else if (minAge == null && maxAge == null) {
    unconfirmed.push({ code: 'age_unstated' });
  } else {
    const [lo, hi] = range;
    let conflict = false;
    let unsure = false;
    if (minAge != null) {
      if (hi < minAge) { conflicts.push({ code: 'age_min', n: minAge }); conflict = true; }
      else if (lo < minAge) unsure = true;
    }
    if (maxAge != null) {
      if (lo > maxAge) { conflicts.push({ code: 'age_max', n: maxAge }); conflict = true; }
      else if (hi > maxAge) unsure = true;
    }
    if (!conflict) {
      if (unsure) unconfirmed.push({ code: 'age_range' });
      else matched.push({ code: 'age' });
    }
  }

  // ---- grade -----------------------------------------------------------
  const grade = isNum(profile.grade) ? profile.grade : null;
  const gMin = isNum(o.grade_min) ? o.grade_min : null;
  const gMax = isNum(o.grade_max) ? o.grade_max : null;
  if (gMin != null || gMax != null) {
    if (grade == null) unconfirmed.push({ code: 'grade_profile' });
    else if ((gMin != null && grade < gMin) || (gMax != null && grade > gMax)) {
      conflicts.push({ code: 'grade', range: gradeRange(gMin, gMax) });
    } else matched.push({ code: 'grade' });
  }

  // ---- education level (school students only) --------------------------
  // Grade 13 in the profile means "university or later"; grades 1-12 are school.
  const isSchool = grade != null && grade >= 1 && grade <= 12;
  if (isSchool) {
    const level = o.education_level;
    if (level === 'undergraduate' || level === 'graduate') conflicts.push({ code: 'level' });
    else if (level === 'school' || level === 'any') matched.push({ code: 'level' });
    else if (UNIVERSITY_HINT.test(`${o.title || ''} ${(o.description || '').slice(0, 300)}`)) {
      unconfirmed.push({ code: 'level_hint' });
    } else unconfirmed.push({ code: 'level_unstated' });
  }

  // ---- country ---------------------------------------------------------
  const country = clean(profile.country);
  const allowed = Array.isArray(o.eligible_countries) ? o.eligible_countries.map(clean).filter(Boolean) : [];
  if (!country) unconfirmed.push({ code: 'country_profile' });
  else if (!allowed.length) unconfirmed.push({ code: 'country_unstated' });
  else if (allowed.includes('global') || allowed.includes(country)) matched.push({ code: 'country' });
  else conflicts.push({ code: 'country' });

  // ---- deadline --------------------------------------------------------
  // The deadline date is read as the end of that day in UTC; the provider's own timezone is not stored.
  if (o.deadline) {
    const end = new Date(`${String(o.deadline).slice(0, 10)}T23:59:59Z`);
    if (Number.isNaN(end.getTime())) unconfirmed.push({ code: 'deadline_unstated' });
    else if (end < today) conflicts.push({ code: 'deadline_passed', date: String(o.deadline).slice(0, 10) });
    else matched.push({ code: 'deadline_open', date: String(o.deadline).slice(0, 10) });
  } else {
    unconfirmed.push({ code: 'deadline_unstated' });
  }

  let status;
  if (conflicts.length) status = STATUS.NOT_ELIGIBLE;
  else if (!unconfirmed.length && matched.length) status = STATUS.ELIGIBLE;
  else status = STATUS.POTENTIAL;

  return { status, matched, unconfirmed, conflicts };
}
