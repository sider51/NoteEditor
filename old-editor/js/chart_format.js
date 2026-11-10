// Shared Re-Inverse MusicPackages chart-format helpers.
// This file intentionally has no DOM dependencies so the editor and the
// standalone converter cannot drift to different output schemas.
(function(global){
  'use strict';

  const DIFFICULTIES = Object.freeze({
    low:  { label: 'LOW',  fileName: 'low.json' },
    mid:  { label: 'MID',  fileName: 'mid.json' },
    high: { label: 'HIGH', fileName: 'high.json' },
    sp:   { label: 'SP',   fileName: 'sp.json' },
  });

  function cloneJson(value){
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isPackageKey(value){
    return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  function difficultyInfo(key){
    return DIFFICULTIES[key] || null;
  }

  function isFiniteInteger(value){
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
  }

  function normalizeGridOffset(value){
    return isFiniteInteger(value) ? value : 0;
  }

  function positiveModulo(value, divisor){
    return ((value % divisor) + divisor) % divisor;
  }

  function ticksPerDenominatorNote(resolution, denominator){
    return Math.round(resolution * 4 / denominator);
  }

  function firstBarTick(segmentStartTick, numerator, denominator, resolution, gridOffset){
    const ticksPerNote = ticksPerDenominatorNote(resolution, denominator);
    const phaseOffset = positiveModulo(normalizeGridOffset(gridOffset), numerator);
    return segmentStartTick + phaseOffset * ticksPerNote;
  }

  function normalizeTiming(timing){
    const normalized = timing && typeof timing === 'object' ? timing : {};
    ['bpms', 'scrolls', 'timeSignatures', 'stops'].forEach(key => {
      if(!Array.isArray(normalized[key])) normalized[key] = [];
      normalized[key].sort((a,b) => (a.tick || 0) - (b.tick || 0));
    });
    return normalized;
  }

  function legacyMetadataFields(metadata){
    const legacy = [];
    if(!metadata || typeof metadata !== 'object') return legacy;
    ['id', 'title', 'artist'].forEach(key => {
      if(Object.prototype.hasOwnProperty.call(metadata, key)) legacy.push(`metadata.${key}`);
    });
    if(metadata.difficulty && Object.prototype.hasOwnProperty.call(metadata.difficulty, 'name')) {
      legacy.push('metadata.difficulty.name');
    }
    return legacy;
  }

  function normalizeMetadata(metadata){
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const difficulty = source.difficulty && typeof source.difficulty === 'object' ? source.difficulty : {};
    const audio = source.audio && typeof source.audio === 'object' ? source.audio : {};
    const level = Number(difficulty.level);
    const offset = Number(audio.offset);
    const resolution = Number(source.resolution);
    const gridOffset = normalizeGridOffset(source.grid_offset);
    return {
      charter: typeof source.charter === 'string' ? source.charter : '',
      difficulty: { level: Number.isFinite(level) ? level : 1 },
      audio: { offset: Number.isFinite(offset) ? offset : 0 },
      grid_offset: gridOffset,
      laneCount: 7,
      resolution: Number.isInteger(resolution) && resolution > 0 ? resolution : 960,
    };
  }

  function createChartExport(chart){
    const source = chart && typeof chart === 'object' ? chart : {};
    const timing = normalizeTiming(cloneJson(source.timing) || {});
    const notes = Array.isArray(source.notes) ? cloneJson(source.notes) : [];
    const events = Array.isArray(source.events) ? cloneJson(source.events) : [];
    notes.sort((a,b) => (a.tick || 0) - (b.tick || 0) || (a.lane || 0) - (b.lane || 0) || (a.id || 0) - (b.id || 0));
    events.sort((a,b) => (a.tick || 0) - (b.tick || 0));
    return {
      version: 1,
      metadata: normalizeMetadata(source.metadata),
      timing,
      notes,
      events,
    };
  }

  global.ReInverseChartFormat = Object.freeze({
    DIFFICULTIES,
    createChartExport,
    difficultyInfo,
    firstBarTick,
    isFiniteInteger,
    isPackageKey,
    legacyMetadataFields,
    normalizeMetadata,
    normalizeGridOffset,
    normalizeTiming,
    positiveModulo,
    ticksPerDenominatorNote,
  });
})(window);
