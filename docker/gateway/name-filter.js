'use strict';

const MAX_NAME_LENGTH = 20;
const MIN_NAME_LENGTH = 2;
const ALLOWED_NAME = /^[A-Za-z0-9]+(?:[ A-Za-z0-9.'\-]*[A-Za-z0-9.])?$/;

const LEET = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i'
};

const BLOCKED_SUBSTRINGS = [
  'fuck', 'fck', 'fuk', 'fvck',
  'shit', 'sht',
  'asshole', 'aishole',
  'bitch', 'btch',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'slut',
  'whore',
  'bastard',
  'nigger', 'nigga',
  'faggot',
  'retard',
  'rape',
  'porn',
  'anal',
  'piss',
  'kim',
  'jongun', 'jongil', 'ilsung', 'kimsung',
  'kimjong', 'kimilsung',
  'suryong',
  'supremeleader', 'dearleader', 'greatleader', 'respectedleader',
  'kju', 'kji'
];

const BLOCKED_TOKENS = new Set([
  'ass', 'asses',
  'sex', 'sexy',
  'cum',
  'tit', 'tits',
  'fag',
  'cock',
  'dick',
  'cunt',
  'porn',
  'rape'
]);

function collapse(value) {
  return String(value)
    .toLowerCase()
    .split('')
    .map((char) => LEET[char] || char)
    .join('')
    .replace(/[^a-z]/g, '');
}

function tokens(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => collapse(token))
    .filter(Boolean);
}

function containsKim(value) {
  const collapsed = collapse(value);
  if (collapsed.includes('kim')) return true;
  return /김|정은|정일|일성/.test(String(value));
}

function containsBlocked(value) {
  if (containsKim(value)) return true;
  const collapsed = collapse(value);
  if (BLOCKED_SUBSTRINGS.some((word) => collapsed.includes(word))) return true;
  return tokens(value).some((token) => BLOCKED_TOKENS.has(token));
}

function normalizeRacerName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validateRacerName(value) {
  const name = normalizeRacerName(value);
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return { ok: false, name, error: 'bad_name' };
  }
  if (!ALLOWED_NAME.test(name)) {
    return { ok: false, name, error: 'bad_name' };
  }
  if (/(.)\1{4,}/.test(name)) {
    return { ok: false, name, error: 'bad_name' };
  }
  if (containsBlocked(name)) {
    return { ok: false, name, error: 'bad_name' };
  }
  return { ok: true, name };
}

module.exports = {
  MAX_NAME_LENGTH,
  normalizeRacerName,
  validateRacerName
};
