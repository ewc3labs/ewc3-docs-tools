'use strict';
// Minimal glob. A literal path, `dir/*.md`, or `**` at any depth.
//
// This lives in lib/ rather than bin/ so it can be tested. It was in bin/ when it shipped a silent
// bug: `**` was detected by splitting on "/" and asking whether any element equalled "**", which is
// FALSE for `docs/**.md`, whose second element is `**.md`. That spec quietly degraded to
// `docs/*.md`, so nothing in a subdirectory was ever visited - and it is the DEFAULT include, so
// every repository using the default was checking only its top-level documents while being told
// everything passed. In this project's own consumer that was 15 of 39 files.
//
// A checker that silently checks less than you think is worse than no checker.

const fs = require('fs');
const path = require('path');

function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One glob segment (`*.md`) as an anchored regex. */
function segmentRe(pattern) {
	return new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
}

/**
 * Expand a spec relative to `root`. Returns absolute-ish paths, sorted.
 *
 * `docs/**.md` and `docs/**\/*.md` both mean "any .md at any depth".
 */
function expand(spec, root) {
	const starstar = spec.indexOf('**');

	if (starstar !== -1) {
		const base = path.join(root, spec.slice(0, starstar).replace(/\/+$/, ''));
		let tail = spec.slice(starstar + 2).replace(/^\/+/, '') || '*';
		if (tail.startsWith('.')) { tail = '*' + tail; }
		const nameRe = segmentRe(tail);

		const walk = (dir, out = []) => {
			if (!fs.existsSync(dir)) { return out; }
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				if (e.isDirectory()) {
					if (e.name !== 'node_modules' && !e.name.startsWith('.')) {
						walk(path.join(dir, e.name), out);
					}
				} else if (nameRe.test(e.name)) {
					out.push(path.join(dir, e.name));
				}
			}
			return out;
		};
		return walk(base).sort();
	}

	const full = path.join(root, spec);
	const dir = path.dirname(full);
	const base = path.basename(full);
	if (!base.includes('*')) { return fs.existsSync(full) ? [full] : []; }
	if (!fs.existsSync(dir)) { return []; }

	const re = segmentRe(base);
	return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)).sort();
}

module.exports = { expand, segmentRe, escapeRe };
