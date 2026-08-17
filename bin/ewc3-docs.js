#!/usr/bin/env node
'use strict';
// EWC3 Labs documentation tools.
//
//   ewc3-docs format [--check] [globs...]   wrap prose so source width matches rendered width
//   ewc3-docs links  [--root <dir>]         dead links, wrong case, undefined refs, orphans
//   ewc3-docs values [--check]              refresh computed numbers between <!--ewc3:name--> markers
//   ewc3-docs check                         all three in --check mode, for CI
//
// Configuration is `.ewc3-docs.json` in the repository root. Every field is optional.

const fs = require('fs');
const path = require('path');

const { formatFiles } = require('../lib/format');
const { checkLinks } = require('../lib/links');
const { resolveValues, syncFiles } = require('../lib/values');
const { expand } = require('../lib/glob');
const {
	roadmapFiles, readSeries, undeclaredPrefixes, declaredOwnership, isLocalPrefix, DEFAULT_ROADMAPS
} = require('../lib/series');

const CONFIG_NAME = '.ewc3-docs.json';

/**
 * Read `.ewc3-docs.json` if there is one.
 *
 * There usually should not be. Every field has a working default, so a repository only needs this
 * file to say what is genuinely different about it - which in practice means `values`, and an
 * `include` list if the documents are not where they normally are. Declaring a default back to the
 * tool is noise that later reads as deliberate divergence.
 */
function loadConfig(root) {
	const file = path.join(root, CONFIG_NAME);
	if (!fs.existsSync(file)) { return { __missing: true }; }
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		fail(`${CONFIG_NAME} is not valid JSON: ${err.message}`);
	}
}

function fail(message) {
	console.error(`ewc3-docs: ${message}`);
	process.exit(2);
}

/** Files the format and values commands act on: config `include`, minus `exclude`. */
function targetFiles(config, root, argv) {
	const explicit = argv.filter(a => !a.startsWith('-'));
	const specs = explicit.length ? explicit : (config.include || ['README.md', 'docs/**.md']);

	const excluded = new Set(
		(config.exclude || []).flatMap(spec => expand(spec, root).map(f => path.resolve(f)))
	);
	const seen = new Set();
	const files = [];

	for (const spec of specs) {
		for (const file of expand(spec, root)) {
			const abs = path.resolve(file);
			if (excluded.has(abs) || seen.has(abs)) { continue; }
			seen.add(abs);
			files.push(file);
		}
	}
	return files;
}

// --- commands --------------------------------------------------------------

function cmdFormat(root, config, argv) {
	const check = argv.includes('--check');
	const files = targetFiles(config, root, argv);
	if (!files.length) { fail('no files matched'); }

	const changed = formatFiles(files, { check, ...(config.format || {}) });

	if (check && changed.length) {
		console.error(`${changed.length} file(s) are not formatted:\n`);
		changed.forEach(f => console.error(`  ${f}`));
		console.error('\nRun: npx ewc3-docs format');
		return 1;
	}
	console.log(check
		? `All ${files.length} file(s) formatted correctly.`
		: `Formatted ${changed.length} of ${files.length} file(s).`);
	return 0;
}

function cmdLinks(root, config) {
	const { checked, problems, orphans } = checkLinks(root, config.links || {});
	console.log(`Checked ${checked} relative links across the docs.`);

	let code = 0;
	if (problems.length) {
		console.error(`\n${problems.length} link problem(s):\n`);
		problems.forEach(p => console.error(`  ${p.file}  ->  ${p.target}   (${p.why})`));
		code = 1;
	}
	if (orphans.length) {
		console.error(`\n${orphans.length} document(s) are not linked from anywhere:\n`);
		orphans.forEach(o => console.error(`  ${o}`));
		console.error('\nLink them from your documentation index, or delete them.');
		code = 1;
	}
	if (!code) { console.log('All of them resolve, and every document is reachable.'); }
	return code;
}

function cmdValues(root, config, argv) {
	const check = argv.includes('--check');
	if (!config.values) {
		console.log(config.__missing
			? `No ${CONFIG_NAME} - no computed values to check.`
			: `No values declared in ${CONFIG_NAME} - nothing to check.`);
		return 0;
	}

	let values;
	try {
		values = resolveValues(config, root);
	} catch (err) {
		fail(err.message);
	}

	const files = targetFiles(config, root, argv);
	const { changed, unknown } = syncFiles(files, values, { check });

	if (unknown.length) {
		console.error(`\nUnknown value marker(s) - not declared in ${CONFIG_NAME}:\n`);
		unknown.forEach(n => console.error(`  <!--ewc3:${n}-->`));
		return 1;
	}
	if (check && changed.length) {
		console.error(`\n${changed.length} file(s) have stale values:\n`);
		changed.forEach(f => console.error(`  ${f}`));
		console.error('\nRun: npx ewc3-docs values');
		return 1;
	}

	// A template's value can be a whole line of HTML. Collapse it so the summary stays one line.
	const summary = Object.entries(values)
		.map(([k, v]) => {
			const flat = v.replace(/\s+/g, ' ').trim();
			return `${k}=${flat.length > 24 ? flat.slice(0, 21) + '...' : flat}`;
		})
		.join('  ');
	console.log(check
		? `All values current.  ${summary}`
		: `Updated ${changed.length} file(s).  ${summary}`);
	return 0;
}

/**
 * Report ID series, and refuse a prefix the roadmap has not declared it owns.
 *
 * A GLOBAL prefix belongs to exactly one roadmap, across every repository. That is the cross-repo
 * discipline: `DT` is owned by ewc3-docs-tools, so nothing else mints a DT number and anyone reading
 * a DT reference knows which document to open.
 *
 * A LOCAL prefix - `FIX` above all - is deliberately per-repository. `FIX-3` in one repo is a
 * different thing from `FIX-3` in another, and that is fine, because a fix never needs to be
 * referenced from outside the repository it fixes. Local prefixes are exempt from the
 * claimed-twice check; everything else is not.
 */
function cmdSeries(root, config) {
	const specs = (config.series || {}).roadmaps;
	const files = roadmapFiles(root, specs);
	const rel = f => path.relative(root, f).split(path.sep).join('/');

	if (!files.length) {
		console.log('No roadmaps found. Looked for: ' + (specs || DEFAULT_ROADMAPS).join(', '));
		return 0;
	}

	for (const file of files) {
		const { declared, used } = readSeries(file);
		console.log(rel(file));
		if (!declared.size) {
			console.log('  (no Prefix table - declare the series this roadmap owns)');
		}
		for (const prefix of [...declared].sort()) {
			const highest = used.get(prefix);
			const scope = isLocalPrefix(prefix) ? 'repo-local' : 'global';
			// padEnd, not printf width specifiers - console.log supports %s but not %-11s, and prints
			// the modifier literally.
			const last = highest === undefined ? 'none yet' : `${prefix}-${highest}`;
			console.log(`  ${prefix.padEnd(8)} ${scope.padEnd(11)} last used: ${last}`);
		}
	}

	let code = 0;

	// Two global roadmaps claiming the same prefix is a collision waiting to be discovered by
	// somebody following a reference to the wrong document.
	const contested = [...declaredOwnership(root, specs).entries()]
		.filter(([prefix, claims]) => claims.length > 1 && !isLocalPrefix(prefix));

	if (contested.length) {
		console.error('\nA global prefix is claimed by more than one roadmap:\n');
		for (const [prefix, claims] of contested) {
			console.error(`  ${prefix}  claimed by ${claims.map(rel).join(', ')}`);
		}
		code = 1;
	}

	const undeclared = undeclaredPrefixes(root, specs);
	if (undeclared.length) {
		console.error('\nIDs used under a prefix the roadmap does not declare it owns:\n');
		for (const u of undeclared) {
			console.error(`  ${u.prefix.padEnd(8)} up to ${u.prefix}-${u.highest}   in ${rel(u.file)}`);
		}
		console.error('\nAdd it to the Prefix table, or move those IDs to the roadmap that owns it.');
		code = 1;
	}

	if (!code) { console.log('\nEvery prefix in use is declared, and no global prefix is claimed twice.'); }
	return code;
}

// --- entry -----------------------------------------------------------------

const [, , command, ...argv] = process.argv;
const root = process.cwd();
const config = loadConfig(root);

let code;
switch (command) {
	case 'format': code = cmdFormat(root, config, argv); break;
	case 'links': code = cmdLinks(root, config); break;
	case 'values': code = cmdValues(root, config, argv); break;
	case 'series': code = cmdSeries(root, config); break;
	case 'check':
		code = Math.max(
			cmdValues(root, config, ['--check']),
			cmdFormat(root, config, ['--check']),
			cmdLinks(root, config),
			cmdSeries(root, config)
		);
		break;
	default:
		console.log(fs.readFileSync(path.join(__dirname, '..', 'USAGE.txt'), 'utf8'));
		code = command ? 2 : 0;
}
process.exit(code);
