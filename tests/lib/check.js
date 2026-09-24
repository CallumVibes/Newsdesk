/*
 * A test runner small enough to read in one sitting. No dependencies, so the
 * structural gate can use it on a machine with nothing installed.
 *
 *   const { suite, run } = require('./lib/check');
 *   suite('Breaking news', (t) => { t.is(important(story), true, 'a fire gets in'); });
 *   run();   // prints what failed, and exits non-zero if anything did
 */
'use strict';

const suites = [];
let passed = 0;
const failures = [];

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function makeT(name) {
  function record(ok, why) {
    if (ok) { passed++; return; }
    failures.push(name + ': ' + why);
  }
  return {
    /** Strict equality, the workhorse. */
    is(got, want, why) {
      record(Object.is(got, want), why + '\n      wanted ' + fmt(want) + '\n      got    ' + fmt(got));
    },
    /** Truthiness, for "did this happen at all". */
    ok(got, why) {
      record(!!got, why + '\n      got ' + fmt(got));
    },
    not(got, why) {
      record(!got, why + '\n      got ' + fmt(got));
    },
    /** Same members in the same order; kinder to read than deepEqual's output. */
    same(got, want, why) {
      const a = JSON.stringify(got), b = JSON.stringify(want);
      record(a === b, why + '\n      wanted ' + b + '\n      got    ' + a);
    },
    near(got, want, slack, why) {
      record(Math.abs(got - want) <= slack,
        why + '\n      wanted ' + fmt(want) + ' ±' + slack + '\n      got    ' + fmt(got));
    },
    fail(why) { record(false, why); }
  };
}

/** @param {(t: ReturnType<makeT>) => void|Promise<void>} body */
function suite(name, body) { suites.push({ name, body }); }

async function run(label) {
  for (const s of suites) {
    try {
      await s.body(makeT(s.name));
    } catch (e) {
      failures.push(s.name + ': threw before it finished\n      ' + (e && e.stack || e));
    }
  }
  const head = label ? label + ': ' : '';
  if (failures.length) {
    console.log('\n' + head + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f + '\n'));
    process.exitCode = 1;
  } else {
    console.log(head + passed + ' checks passed across ' + suites.length + ' areas');
  }
}

module.exports = { suite, run };
