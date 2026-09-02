#!/usr/bin/env node
'use strict';
// EWC3 Labs documentation tools.
//
//   ewc3-docs format [--check] [globs...]   wrap prose so source width matches rendered width
//   ewc3-docs links  [--root <dir>]         dead links, wrong case, undefined refs, orphans
//   ewc3-docs values [--check]              refresh computed numbers between <!--ewc3:name--> markers
//   ewc3-docs fix                           values + format in write mode - the pre-commit button
//   ewc3-docs check                         all of the above in --check mode, for CI
//
// Configuration is `.ewc3-docs.json` in the repository root, or `config/ewc3-docs.json` if the
// repository keeps its whole-repo configuration in one folder. Every field is optional.

const fs = require('fs');
const path = require('path');

const { formatFiles } = require('../lib/format');
const { checkLinks } = require('../lib/links');
const { resolveValues, syncFiles } = require('../lib/values');
const { expand } = require('../lib/glob');
const { migrateText } = require('../lib/migrate');
const { extractSlices } = require('../lib/slices');
const { checkTable } = require('../lib/tables');
const frontmatter = require('../lib/frontmatter');
const { renderIndex, detectWidths } = require('../lib/deliveryindex');
const {
	roadmapFiles, readSeries, undeclaredPrefixes, declaredOwnership, isLocalPrefix, DEFAULT_ROADMAPS,
	frozenViolations: frozenSeriesViolations, contestedPrefixes
} = require('../lib/series');

// Where the config may live. A repository that keeps whole-repo configuration in one folder should
// not have to make an exception for this tool, so `config/` is a first-class location rather than a
// fallback. Both are searched, and finding TWO is an error - a second config that is silently
// ignored is exactly the kind of quiet wrongness this toolkit exists to prevent.
const CONFIG_NAMES = ['.ewc3-docs.json', 'config/ewc3-docs.json'];

/**
 * Read `.ewc3-docs.json` if there is one.
 *
 * There usually should not be. Every field has a working default, so a repository only needs this
 * file to say what is genuinely different about it - which in practice means `values`, and an
 * `include` list if the documents are not where they normally are. Declaring a default back to the
 * tool is noise that later reads as deliberate divergence.
 */
function loadConfig(root, explicit) {
	let found;

	if (explicit) {
		found = [path.isAbsolute(explicit) ? explicit : path.join(root, explicit)];
		if (!fs.existsSync(found[0])) { fail(`no config at ${explicit}`); }
	} else {
		found = CONFIG_NAMES.map(n => path.join(root, n)).filter(f => fs.existsSync(f));
		if (!found.length) { return { __missing: true }; }
		if (found.length > 1) {
			const names = found.map(f => path.relative(root, f).split(path.sep).join('/'));
			fail(`two config files, and only one would be read: ${names.join(', ')}. Keep one.`);
		}
	}

	const file = found[0];
	const shown = path.relative(root, file).split(path.sep).join('/');
	try {
		const config = JSON.parse(fs.readFileSync(file, 'utf8'));
		// Paths inside the config are relative to the REPOSITORY, never to the config file. Moving the
		// file into `config/` must not silently reinterpret every glob in it.
		config.__source = shown;
		return config;
	} catch (err) {
		fail(`${shown} is not valid JSON: ${err.message}`);
	}
}

/** What to call the config in a message: where it actually is, or where it would go. */
function configLabel() {
	return (typeof config === 'object' && config && config.__source) || CONFIG_NAMES[0];
}

function fail(message) {
	console.error(`ewc3-docs: ${message}`);
	process.exit(2);
}

/** Files the format and values commands act on: config `include`, minus `exclude`. */
function targetFiles(config, root, argv) {
	// Drop flag VALUES as well as flags. `--repo C:/x` used to leave the path behind as a file
	// spec, which then matched nothing.
	const FLAGS_WITH_VALUES = new Set(['--repo', '--config', '--slices', '--owner']);
	const explicit = argv.filter((a, i) => !a.startsWith('-')
		&& !FLAGS_WITH_VALUES.has(argv[i - 1]));
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
			? `No ${configLabel()} - no computed values to check.`
			: `No values declared in ${configLabel()} - nothing to check.`);
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
		console.error(`\nUnknown value marker(s) - not declared in ${configLabel()}:\n`);
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
		// A repository with no planning surface at all is fine and common - most repositories have
		// nothing to check here. But a repository that HAS a docs/project folder and still matched
		// nothing is the dangerous case: the glob missed, and silence is indistinguishable from a
		// clean bill. Measured on MedAR_AI_Runtime, whose roadmap sits one directory deeper.
		const planningDir = path.join(root, 'docs', 'project');
		let stranded = [];
		try {
			stranded = fs.readdirSync(planningDir, { recursive: true, encoding: 'utf8' })
				.filter((p) => /\.md$/i.test(p) && /roadmap|backlog/i.test(p));
		} catch { /* no docs/project at all - genuinely nothing to check */ }

		if (stranded.length) {
			console.error('No roadmaps matched, but docs/project holds files that look like planning surfaces:\n');
			for (const p of stranded) { console.error('  docs/project/' + p.split('\\').join('/')); }
			console.error('\nLooked for: ' + (specs || DEFAULT_ROADMAPS).join(', '));
			console.error('Add a matching pattern to `series.roadmaps`, or move the file.');
			return 1;
		}

		console.log('No roadmaps found. Looked for: ' + (specs || DEFAULT_ROADMAPS).join(', '));
		return 0;
	}

	// A file the roadmap glob matched but which declares NOTHING is the dangerous case: `series` has
	// nothing to check, says so quietly, and exits 0. Silence and cleanliness look identical, which is
	// the same failure shape as a glob that matches no files and reports success.
	//
	// Measured on MedAR: `MedAR_PyPackages/docs/project/*Roadmap.md` is a package INVENTORY - column 1
	// is `Package`, so no ID is ever in ID_IN_TABLE position and no Prefix table exists. It is not a
	// malformed roadmap, it is a different document the glob picks up anyway. It reported success.
	//
	// A genuinely new roadmap declares its prefixes BEFORE it has any IDs, so `declared.size === 0` is
	// not "empty and fine" - it is "this has not been told what it owns, or it is not a roadmap".
	const undeclaredFiles = [];
	// Repo-scoped on both sides: the ceiling from whichever surface froze it, the highest ID from
	// every surface. See lib/series.js.
	const frozen = frozenSeriesViolations(root, specs);

	// Declaration is repository-scoped: a backlog inherits the ownership table of the roadmap
	// beside it. Only a repository that declares NOWHERE has told us nothing.
	const declaresAnywhere = files.some((f) => readSeries(f).declared.size > 0);

	for (const file of files) {
		const { declared, used } = readSeries(file);
		console.log(rel(file));
		if (!declared.size && !declaresAnywhere) {
			undeclaredFiles.push({ file, usesIds: used.size > 0 });
			console.log(used.size
				? '  (no ownership table, but IDs are in use - declare what this roadmap owns)'
				: '  (no ownership table and no IDs - is this a roadmap? the glob may be too wide)');
		} else if (!declared.size && used.size) {
			console.log('  (inherits the ownership table declared elsewhere in this repository)');
		}

		const scopes = readSeries(file).scopes;
		for (const prefix of [...declared].sort()) {
			const highest = used.get(prefix);
			const written = scopes.get(prefix);
			// A DECLARED scope beats a guess from the prefix string. `isLocalPrefix` is the fallback
			// for a register that has not said, never an override of one that has.
			// Print the scope the register WROTE, not the nearest of two words this tool knows.
			// `repo-owned` is a real and useful third answer - one repository owns a globally
			// unique prefix - and flattening it to `global` discards the ownership the registry
			// exists to record.
			const spoken = written ? written.declared.replace(/[*`]/g, '').trim() : null;
			// Print the scope the register WROTE, verbatim. Upper-casing a multi-word cell turned
			// "global, frozen at 8" into shouting, and the freeze is already visible in the words.
			const scope = written ? spoken : (isLocalPrefix(prefix) ? 'repo-local' : 'global');
			// padEnd, not printf width specifiers - console.log supports %s but not %-11s, and prints
			// the modifier literally.
			const last = highest === undefined ? 'none yet' : `${prefix}-${highest}`;
			console.log(`  ${prefix.padEnd(8)} ${scope.padEnd(11)} last used: ${last}`);

			// A freeze that nothing enforces is a note, not a control - which is the failure mode
			// this whole check exists to end. If a register says a series is retired, minting past
			// its ceiling has to FAIL, or the freeze is worth exactly as much as the convention it
			// replaced.
		}
	}

	let code = 0;

	if (frozen.length) {
		console.error('\nA RETIRED series has been minted into:\n');
		for (const v of frozen) {
			console.error(`  ${v.prefix} is frozen at ${v.prefix}-${v.ceiling}, but ${v.prefix}-${v.highest} exists in ${rel(v.file)}`);
		}
		console.error('\nMint this work under the series the register points to, or un-freeze it deliberately.');
		code = 1;
	}

	if (undeclaredFiles.length) {
		console.error('\nRoadmap(s) that declare no prefixes, so nothing was checked:\n');
		for (const u of undeclaredFiles) {
			console.error(`  ${rel(u.file)}${u.usesIds ? '  (IDs in use)' : '  (no IDs found either)'}`);
		}
		console.error('\nAdd a Prefix table, or narrow `series.roadmaps` so this file is not read as one.');
		code = 1;
	}

	// Two global roadmaps claiming the same prefix is a collision waiting to be discovered by
	// somebody following a reference to the wrong document.
	const contested = contestedPrefixes(root, specs);

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

/**
 * Emit a migrated planning surface into a SHADOW folder, leaving the live one untouched.
 *
 *   ewc3-docs migrate-project [--repo <dir>] [--owner <name>] [--write]
 *
 * Wilson's shape, and the reason it is right: the live `docs/project/` stays authoritative while
 * `docs/project_v2/` accumulates, so the two can be diffed and the swap is one commit at the end.
 * Nothing under `project_v2/` matches the roadmap glob, so the tooling never sees two registers.
 * A bad emit is `rm -rf docs/project_v2`, not a revert.
 *
 * This is deliberately re-runnable and idempotent. The cleanup is a long WIP that gets chipped at
 * during normal feature work, so a repo will sit half-migrated for weeks: running this again must
 * always be safe, and the report must be readable when the answer is still "not yet".
 */
function cmdMigrateProject(root, config, argv) {
	const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null; };
	const repo = path.resolve(flag('--repo') || root);
	const write = argv.includes('--write');
	const owner = flag('--owner') || path.basename(repo);

	// Canonical first, then the known off-canon location. Finding it in the second place is itself a
	// finding: it is reported, never silently accepted, because "insist on the structure" is the
	// whole point and a tool that quietly copes removes the pressure to converge.
	const CANON = 'docs/project';
	const OFF = 'docs/project/roadmap';
	let from = null, offCanon = false;
	for (const sub of [CANON, OFF]) {
		const dir = path.join(repo, sub);
		if (!fs.existsSync(dir)) { continue; }
		const hit = fs.readdirSync(dir).find((f) => /Roadmap\.md$/i.test(f));
		if (hit) { from = path.join(dir, hit); offCanon = sub === OFF; break; }
	}

	console.log(`${owner}`);
	if (!from) {
		console.log('  no roadmap under docs/project/ - nothing to migrate');
		return 0;
	}
	console.log(`  source: ${path.relative(repo, from).split(path.sep).join('/')}`);
	if (offCanon) {
		console.log(`  NOTE:   off-canon path. The canonical home is ${CANON}/, one level up.`);
	}

	const result = migrateText(fs.readFileSync(from, 'utf8'), { owner });
	if (!result.ok) {
		console.log('  no ID register table found, so there is nothing to reshape yet.');
		for (const r of result.rows) {
			console.log(`    uses ${r.prefix} up to ${r.prefix}-${r.highestUsed}, declared nowhere`);
		}
		return result.rows.length ? 1 : 0;
	}

	for (const r of result.rows) {
		const owned = r.owner === null ? 'UNCLAIMED' : r.owner;
		console.log(`    ${r.prefix.padEnd(6)} ${r.scope.padEnd(11)} ${String(r.lastUsed).padStart(6)}  ${owned}`
			+ (r.stale ? `  STALE: register said ${r.registered}` : ''));
	}

	const problems = result.rows.filter((r) => r.owner === null || r.stale);

	if (!write) {
		console.log('  (dry run - pass --write to emit docs/project_v2/)');
		return problems.length ? 1 : 0;
	}

	const outDir = path.join(repo, 'docs', 'project_v2');
	fs.mkdirSync(outDir, { recursive: true });

	// Pull the narrative out into slices/ before writing the roadmap, so the roadmap that lands is
	// the thin one with its rows already pinned.
	const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
	// Padding is per PREFIX and is read off the register itself, so a migration does not renumber
	// every id in the file on its first run. A fixed width of five did exactly that.
	const extracted = extractSlices(result.text, {
		width: detectWidths(result.text),
		statusText: read(path.join(repo, 'config', 'STATUS.yaml')),
		pullupText: read(path.join(repo, 'config', 'STATUS-pullup.yaml')),
		sourceName: path.basename(from),
	});

	const outFile = path.join(outDir, path.basename(from));
	fs.writeFileSync(outFile, extracted.text);
	console.log(`  wrote:  docs/project_v2/${path.basename(from)}`);

	// Silently extracting nothing looks exactly like a roadmap with no narrative to extract. Say
	// which section names were looked for and what the document has instead, so a fourth structural
	// divergence surfaces as a finding rather than as a quiet no-op.
	if (!extracted.docs.length) {
		const heads = extracted.text.split('\n').filter((l) => /^##\s/.test(l))
			.map((l) => l.replace(/^##\s+/, '').trim());
		console.log('  no slices extracted - looked for `## Delivery Index` and `## Slice Notes`.');
		if (heads.length) { console.log(`          this roadmap has: ${heads.slice(0, 6).join(' · ')}`); }
	}

	if (extracted.docs.length) {
		const sliceDir = path.join(outDir, 'slices');
		// Regenerating must not leave last run's files behind: a slice document whose group was
		// renamed would otherwise persist forever, and a stale orphan reads exactly like a current one.
		if (fs.existsSync(sliceDir)) {
			for (const f of fs.readdirSync(sliceDir)) {
				if (f.endsWith('.md')) { fs.unlinkSync(path.join(sliceDir, f)); }
			}
		}
		fs.mkdirSync(sliceDir, { recursive: true });
		for (const d of extracted.docs) { fs.writeFileSync(path.join(sliceDir, d.file), d.content); }
		console.log(`  wrote:  docs/project_v2/slices/  (${extracted.docs.length} documents from `
			+ `${extracted.rowCount} rows and ${extracted.noteCount} narrative sections)`);
	}

	// A migration nobody can undo in one move is not a safe migration.
	const readme = path.join(outDir, 'README.md');
	if (!fs.existsSync(readme)) {
		fs.writeFileSync(readme, [
			'# docs/project_v2 — generated, not authoritative',
			'',
			'`docs/project/` is still the live planning surface. This folder is a **generated preview**',
			'of the migrated shape, emitted by `ewc3-docs migrate-project --write`.',
			'',
			'- Nothing here matches the roadmap glob, so tooling never sees two registers.',
			'- Regenerate freely; the command is idempotent.',
			'- To abandon it: `rm -rf docs/project_v2`. No revert needed.',
			'- Add `docs/project_v2/` to .gitignore: it is regenerated, and a committed preview goes stale',
			'  silently while still reading like a plan.',
			'- To adopt it: replace `docs/project/` in one commit, once it reads right.',
			'',
			'Do not hand-edit anything in this folder — edits are overwritten on the next run.',
			'',
		].join('\n'));
		console.log('  wrote:  docs/project_v2/README.md');
	}
	return problems.length ? 1 : 0;
}

/**
 * Regenerate a Delivery Index from the slice documents that declare its rows.
 *
 *   ewc3-docs index [--repo <dir>] [--slices <dir>] [--write]
 *
 * The return leg of the migration: slice documents are the authority and the table is a
 * projection. Dry by default, because a command that rewrites a planning surface on a bare
 * invocation is one typo away from a bad afternoon.
 *
 * It renders rows and it refuses everything else. A document claiming an id the roadmap never
 * minted is reported, not added - minting is a human act in a planning surface. A row nothing
 * claims is left exactly as it was. A row with more cells than its header has columns is left
 * alone too, because given one pipe too many no tool can tell a literal from a missing column.
 */
function cmdIndex(root, config, argv) {
	const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null; };
	const repo = path.resolve(flag('--repo') || root);
	const write = argv.includes('--write');

	const roadmaps = roadmapFiles(repo, (config.series || {}).roadmaps);
	if (!roadmaps.length) {
		console.error('index: no roadmap found under docs/project/.');
		console.error(`  looked in: ${repo}`);
		return 2;
	}

	// Where the slice documents live. project_v2 is the migration staging area; project/slices is
	// where they land once a repo has adopted the shape.
	const given = flag('--slices');
	const candidates = given ? [path.resolve(repo, given)]
		: [path.join(repo, 'docs/project/slices'), path.join(repo, 'docs/project_v2/slices')];
	const sliceDir = candidates.find((d) => fs.existsSync(d));
	if (!sliceDir) {
		console.error('index: no slice documents found.');
		candidates.forEach((d) => console.error(`  looked in: ${d}`));
		return 2;
	}

	const records = [];
	const undeclared = [];
	for (const name of fs.readdirSync(sliceDir).filter((n) => n.endsWith('.md'))) {
		const { data } = frontmatter.read(fs.readFileSync(path.join(sliceDir, name), 'utf8'));
		// A slice document with no `id:` declares nothing. Guessing one from the filename is exactly
		// the kind of help that writes a wrong row and looks deliberate doing it.
		if (!data || !data.id) { undeclared.push(name); continue; }
		records.push(data);
	}

	console.log(`  reading: ${path.relative(repo, sliceDir).split(path.sep).join('/')}`
		+ ` (${records.length} declaring, ${undeclared.length} without an id:)`);

	// Nothing declared anything. Rendering zero rows over a live register and calling it
	// "already current" is a pass about the wrong question - the table was never consulted.
	if (!records.length) {
		console.error('index: no slice document in that directory declares an id.');
		if (!given && candidates.length > 1) {
			console.error('  other candidates, in preference order:');
			candidates.forEach((d) => console.error(`    ${d}${fs.existsSync(d) ? '' : '  (absent)'}`));
			console.error('  pass --slices <dir> to choose one.');
		}
		return 2;
	}

	let code = 0;
	for (const file of roadmaps) {
		const rel = path.relative(repo, file).split(path.sep).join('/');
		const text = fs.readFileSync(file, 'utf8');
		const res = renderIndex(text, records);
		if (!res.ok) {
			console.log(`${rel}: no Delivery Index table to render into.`);
			continue;
		}

		const changed = res.text !== text;
		console.log(`${rel}`);
		console.log(`  ${res.rendered} row(s) rendered from ${records.length} slice document(s)`
			+ `${res.rendered && !changed ? ' - already current' : ''}`);

		if (res.malformed.length) {
			code = 1;
			console.log(`  REFUSED ${res.malformed.length} row(s) with more cells than the header has `
				+ 'columns - escape the stray pipe as \\| first:');
			console.log(`    ${res.malformed.join(' ')}`);
		}
		if (res.unknown.length) {
			code = 1;
			console.log(`  ${res.unknown.length} document(s) claim an id this register never minted:`);
			console.log(`    ${res.unknown.join(' ')}`);
		}
		if (res.missing.length) {
			console.log(`  ${res.missing.length} row(s) no document claims, left untouched:`);
			console.log(`    ${res.missing.slice(0, 20).join(' ')}`);
		}

		if (write && changed) {
			fs.writeFileSync(file, res.text);
			console.log('  written');
		} else if (changed) {
			console.log('  (dry run - pass --write to update the table)');
		}
	}

	if (undeclared.length) {
		console.log(`  skipped ${undeclared.length} document(s) with no id: in frontmatter: `
			+ undeclared.slice(0, 10).join(' '));
	}
	return code;
}

/**
 * Table rows whose cell count disagrees with their header - almost always an unescaped pipe.
 *
 * Runs inside `check`, so it is a control rather than a habit. The repair stays human: given one
 * pipe too many, no tool can tell a literal pipe from a forgotten column.
 */
function cmdTables(root, config, argv) {
	const files = targetFiles(config, root, argv);
	const problems = [];
	for (const file of files) {
		problems.push(...checkTable(fs.readFileSync(file, 'utf8'),
			path.relative(root, file).split(path.sep).join('/')));
	}
	if (!problems.length) {
		console.log(`Every table row matches its header across ${files.length} file(s).`);
		return 0;
	}
	console.error(`\n${problems.length} table row(s) do not match their header - `
		+ 'usually a pipe inside a cell that needs escaping as \\|:\n');
	for (const p of problems) {
		console.error(`  ${p.file}:${p.line}  (${p.extra > 0 ? '+' : ''}${p.extra} cell`
			+ `${Math.abs(p.extra) === 1 ? '' : 's'} vs the header on line ${p.headerLine})`);
		console.error(`      …${p.near}…`);
	}
	return 1;
}

// --- entry -----------------------------------------------------------------

const [, , command, ...argv] = process.argv;
const repoFlag = process.argv.indexOf('--repo');
// --repo used to be read by migrate-project alone. Every other command ignored it and
// scanned the current directory instead, which meant `tables --repo <elsewhere>` examined
// this repo and printed a pass. A flag that is quietly dropped is worse than one that errors.
const root = repoFlag > -1 && process.argv[repoFlag + 1]
	? path.resolve(process.argv[repoFlag + 1])
	: process.cwd();
const configFlag = process.argv.indexOf('--config');
const config = loadConfig(root, configFlag > -1 ? process.argv[configFlag + 1] : null);

let code;
switch (command) {
	case 'format': code = cmdFormat(root, config, argv); break;
	case 'links': code = cmdLinks(root, config); break;
	case 'values': code = cmdValues(root, config, argv); break;
	case 'series': code = cmdSeries(root, config); break;
	case 'migrate-project': code = cmdMigrateProject(root, config, argv); break;
	case 'tables': code = cmdTables(root, config, argv); break;
	case 'index': code = cmdIndex(root, config, argv); break;
	// The write-mode mirror of `check`. Values first, then format: substituting a number changes the
	// line, and the wrap has to see the result. Links and series never write, so they are not here.
	case 'fix':
		code = Math.max(
			cmdValues(root, config, argv),
			cmdFormat(root, config, argv)
		);
		break;
	case 'check':
		code = Math.max(
			cmdValues(root, config, ['--check']),
			cmdFormat(root, config, ['--check']),
			cmdLinks(root, config),
			cmdSeries(root, config),
			cmdTables(root, config, [])
		);
		break;
	default:
		console.log(fs.readFileSync(path.join(__dirname, '..', 'USAGE.txt'), 'utf8'));
		code = command ? 2 : 0;
}
process.exit(code);
