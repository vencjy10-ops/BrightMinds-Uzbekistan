// Translates the Mongo-style filters the app already uses into a PostgREST logic expression.
// Supported: field equality, $eq $ne $gt $gte $lt $lte $in $nin $regex ($options i), $and $or $nor.
// Anything else throws, so a filter is never silently ignored.

const FIELD_RE = /^[a-z_][a-z0-9_]*$/;
// Array columns are searched through their text copy (maintained by a database trigger).
const REGEX_FIELD_ALIAS = { tags: 'tags_text' };

export function assertField(name) {
  if (!FIELD_RE.test(name)) throw new Error(`Unsupported field name: ${name}`);
  return name;
}

// PostgREST quoting: wrap in double quotes, escape backslash and double quote.
function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function scalar(value) {
  if (value instanceof Date) return quote(value.toISOString());
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return quote(value);
}

// JavaScript uses \b for a word boundary; PostgreSQL uses \y (and \b means backspace there).
export function toPgRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      out += next === 'b' ? '\\y' : `\\${next}`;
      i += 1;
    } else out += ch;
  }
  return out;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

function opTerm(field, op, value, options) {
  switch (op) {
    case '$eq': return value === null ? `${field}.is.null` : `${field}.eq.${scalar(value)}`;
    case '$ne':
      // Mongo $ne also matches missing values; SQL <> does not, so add the null case.
      return value === null ? `${field}.not.is.null` : `or(${field}.neq.${scalar(value)},${field}.is.null)`;
    case '$gt': return `${field}.gt.${scalar(value)}`;
    case '$gte': return `${field}.gte.${scalar(value)}`;
    case '$lt': return `${field}.lt.${scalar(value)}`;
    case '$lte': return `${field}.lte.${scalar(value)}`;
    case '$in':
      if (!Array.isArray(value)) throw new Error('$in needs an array');
      return value.length ? `${field}.in.(${value.map(scalar).join(',')})` : null;
    case '$nin':
      if (!Array.isArray(value)) throw new Error('$nin needs an array');
      return value.length ? `${field}.not.in.(${value.map(scalar).join(',')})` : '';
    case '$regex': {
      const target = REGEX_FIELD_ALIAS[field] || field;
      const flags = String(options || '');
      if (flags.replace(/i/g, '')) throw new Error(`Unsupported regex options: ${flags}`);
      return `${target}.${flags.includes('i') ? 'imatch' : 'match'}.${quote(toPgRegex(String(value)))}`;
    }
    default: throw new Error(`Unsupported operator: ${op}`);
  }
}

function fieldTerms(field, cond) {
  assertField(field);
  if (!isPlainObject(cond)) return [opTerm(field, '$eq', cond === undefined ? null : cond)];
  const ops = Object.keys(cond).filter((k) => k !== '$options');
  if (!ops.length) throw new Error(`Empty condition for ${field}`);
  return ops.map((op) => {
    if (!op.startsWith('$')) throw new Error(`Nested documents are not supported (${field}.${op})`);
    return opTerm(field, op, cond[op], cond.$options);
  });
}

function group(kind, parts) {
  return `${kind}(${parts.join(',')})`;
}

function termsOf(filter) {
  const out = [];
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === '$and' || key === '$or' || key === '$nor') {
      if (!Array.isArray(value)) throw new Error(`${key} needs an array`);
      const children = value.map(nodeOf).filter((c) => c);
      if (key === '$and') { if (children.length) out.push(group('and', children)); }
      else if (!children.length) throw new Error(`${key} with no conditions`);
      else out.push(key === '$or' ? group('or', children) : `not.${group('or', children)}`);
    } else if (key.startsWith('$')) {
      throw new Error(`Unsupported operator: ${key}`);
    } else {
      out.push(...fieldTerms(key, value));
    }
  }
  return out.filter((t) => t);
}

function nodeOf(filter) {
  const terms = termsOf(filter);
  if (!terms.length) return null;
  return terms.length === 1 ? terms[0] : group('and', terms);
}

// Returns null for an empty filter, otherwise one expression such as and(a.eq."x",b.lte.5).
export function toPostgrest(filter) {
  const node = nodeOf(filter);
  if (!node) return null;
  return node.startsWith('and(') || node.startsWith('or(') || node.startsWith('not.') ? node : `and(${node})`;
}

// Applies the filter to a supabase-js query builder.
export function applyFilter(builder, filter) {
  const expression = toPostgrest(filter);
  return expression ? builder.or(expression) : builder;
}
