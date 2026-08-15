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

const CONFIG_NAME = '.ewc3-docs.json';

function loadConfig(root) {
	const file = path.join(root, CONFIG_NAME);
	if (!fs.existsSync(file)) { return {}; }
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

/** Minimal glob expansion: `dir/*.md`, `dir/**` + `.md`, or a literal path. */
function expand(spec, root) {
	const parts = spec.split('/');
	const deep = parts.includes('**');

	if (deep) {
		const base = path.join(root, parts.slice(0, parts.indexOf('**')).join('/'));
		const ext = path.extname(parts[parts.length - 1]) || '.md';
		const walk = (dir, out = []) => {
			if (!fs.existsSync(dir)) { return out; }
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				if (e.isDirectory()) {
					if (e.name !== 'node_modules' && !e.name.startsWith('.')) { walk(path.join(dir, e.name), out); }
				} else if (e.name.endsWith(ext)) {
					out.push(path.join(dir, e.name));
				}
			}
			return out;
		};
		return walk(base);
	}

	const full = path.join(root, spec);
	const dir = path.dirname(full);
	const base = path.basename(full);
	if (!base.includes('*')) { return fs.existsSync(full) ? [full] : []; }
	if (!fs.existsSync(dir)) { return []; }

	const re = new RegExp('^' + base.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
	return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)).sort();
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
		console.log('No values declared in .ewc3-docs.json - nothing to do.');
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

// --- entry -----------------------------------------------------------------

const [, , command, ...argv] = process.argv;
const root = process.cwd();
const config = loadConfig(root);

let code;
switch (command) {
	case 'format': code = cmdFormat(root, config, argv); break;
	case 'links': code = cmdLinks(root, config); break;
	case 'values': code = cmdValues(root, config, argv); break;
	case 'check':
		code = Math.max(
			cmdValues(root, config, ['--check']),
			cmdFormat(root, config, ['--check']),
			cmdLinks(root, config)
		);
		break;
	default:
		console.log(fs.readFileSync(path.join(__dirname, '..', 'USAGE.txt'), 'utf8'));
		code = command ? 2 : 0;
}
process.exit(code);
