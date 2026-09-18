'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateRacerName } = require('./name-filter');

const TOP_LIMIT = 10;
const MIN_TIME_SECONDS = 5 * 60;
const MAX_TIME_SECONDS = 15 * 60;
const MAX_SITES = 10;
const MAX_WARNINGS = 3;

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${minutes}min ${rest}s`;
}

function publicEntry(entry, rank) {
  return {
    rank,
    name: entry.name,
    timeSeconds: entry.timeSeconds,
    timeLabel: formatTime(entry.timeSeconds),
    sites: entry.sites,
    warnings: entry.warnings
  };
}

function compareEntries(a, b) {
  if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds;
  if (a.sites !== b.sites) return b.sites - a.sites;
  if (a.warnings !== b.warnings) return a.warnings - b.warnings;
  return a.submittedAt - b.submittedAt;
}

function parseScore(body = {}) {
  const minutes = Number.parseInt(body.minutes, 10);
  const seconds = Number.parseInt(body.seconds, 10);
  const sites = Number.parseInt(body.sites, 10);
  const warnings = Number.parseInt(body.warnings, 10);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 15) {
    return { ok: false, error: 'bad_score', message: 'Enter a racing time in minutes and seconds.' };
  }
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
    return { ok: false, error: 'bad_score', message: 'Enter a racing time in minutes and seconds.' };
  }
  const timeSeconds = minutes * 60 + seconds;
  if (timeSeconds < MIN_TIME_SECONDS || timeSeconds > MAX_TIME_SECONDS) {
    return {
      ok: false,
      error: 'bad_score',
      message: 'Racing time must be between 5 and 15 minutes.'
    };
  }
  if (!Number.isInteger(sites) || sites < 0 || sites > MAX_SITES) {
    return { ok: false, error: 'bad_score', message: 'Sites collected must be between 0 and 10.' };
  }
  if (!Number.isInteger(warnings) || warnings < 0 || warnings > MAX_WARNINGS) {
    return { ok: false, error: 'bad_score', message: 'Warnings must be between 0 and 3.' };
  }
  return { ok: true, timeSeconds, sites, warnings };
}

class Leaderboard {
  constructor(options = {}) {
    this.filePath = options.path || '';
    this.now = options.now || Date.now;
    this.limit = options.limit || TOP_LIMIT;
    this.entries = [];
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries)) this.entries = parsed.entries;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('failed to load top 10', error);
      }
    }
  }

  save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify({ entries: this.entries }, null, 2)}\n`);
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('failed to save top 10', error);
    }
  }

  list() {
    return this.ranked().slice(0, this.limit).map((entry, index) => publicEntry(entry, index + 1));
  }

  ranked() {
    return [...this.entries].sort(compareEntries);
  }

  submit(identity, body) {
    const named = validateRacerName(body?.name);
    if (!named.ok) {
      return { ok: false, error: 'bad_name', message: 'Please choose a different racer name.' };
    }
    const score = parseScore(body);
    if (!score.ok) return score;

    const next = {
      identity,
      name: named.name,
      nameKey: named.name.toLowerCase(),
      timeSeconds: score.timeSeconds,
      sites: score.sites,
      warnings: score.warnings,
      submittedAt: this.now()
    };

    const withoutIdentity = this.entries.filter((entry) => entry.identity !== identity);
    const nameOwner = withoutIdentity.find((entry) => entry.nameKey === next.nameKey);
    if (nameOwner && compareEntries(nameOwner, next) <= 0) {
      return {
        ok: false,
        error: 'name_taken',
        message: 'That name is already on the list with a better or equal time.'
      };
    }

    const previous = this.entries.find((entry) => entry.identity === identity);
    if (previous && compareEntries(previous, next) <= 0) {
      return {
        ok: false,
        error: 'not_improved',
        message: 'Your better time is already on the list.',
        entries: this.list()
      };
    }

    const merged = withoutIdentity.filter((entry) => entry.nameKey !== next.nameKey);
    merged.push(next);
    merged.sort(compareEntries);
    const kept = merged.slice(0, this.limit);
    const rank = kept.findIndex((entry) => entry.identity === identity) + 1;
    if (rank === 0) {
      return {
        ok: false,
        error: 'not_ranked',
        message: 'That time is outside the current Top 10.',
        entries: this.list()
      };
    }

    this.entries = kept;
    this.save();
    return { ok: true, rank, entries: this.list() };
  }
}

module.exports = {
  Leaderboard,
  formatTime,
  parseScore,
  MIN_TIME_SECONDS,
  MAX_TIME_SECONDS
};
