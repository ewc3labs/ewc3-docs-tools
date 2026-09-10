'use strict';
// Table rows whose cell count does not match their header.
//
// THE PROBLEM. A markdown table cell may contain a pipe only if it is escaped as `\|`. An unescaped
// one silently starts a new column, so the row renders with an extra cell and every tool that reads
// the table gets a fragment where it expected a paragraph. Nothing complains: the table still
// renders, just wrongly, and the damage is at the END of the row where nobody looks.
//
// WHY IT KEEPS HAPPENING. It is not carelessness, it is a generator: assistants writing table rows
// emit prose containing `|` without escaping it. Wilson has been repairing these by hand for months,
// which is precisely the arrangement this toolkit exists to end - the repair is clerical, it is
// perfectly detectable, and doing it by eye means it is done only when someone happens to notice.
//
// WHY A CHECK RATHER THAN A FIXER. Measured across four MedAR roadmaps, 460 table rows contain
// exactly TWO offenders. The hand-fixing has already worked; what is missing is the thing that stops
// it coming back. And the repair is not mechanical enough to automate safely - given a row with one
// pipe too many, no tool can tell whether the author meant a literal pipe or genuinely forgot a
// column. Reporting the row is certain; rewriting it is a guess.

const HEADER = /^\|\s*(ID|Series|Prefix|Package|Slice|Name|Field|Command|Setting)\b/i;
const SEPARATOR = /^\|[\s:|-]+\|?\s*$/;
const BARE_PIPE = /(?<!\\)\|/g;

function countPipes(line) {
	return (line.match(BARE_PIPE) || []).length;
}

/**
 * Find rows whose unescaped-pipe count disagrees with the header above them.
 *
 * The header is the reference because it is well-formed by construction - it has to be, or the table
 * would not render as a table at all.
 */
function checkTable(text, file) {
	const lines = text.split('\n');
	const problems = [];
	let cols = 0;
	let headerLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim().startsWith('|')) { cols = 0; continue; }
		if (SEPARATOR.test(line)) { continue; }

		const n = countPipes(line);
		if (HEADER.test(line.trim())) { cols = n; headerLine = i + 1; continue; }
		if (!cols) { continue; }
		if (n === cols) { continue; }

		// Point at the offending pipe rather than the row, because the row may be 14,000 characters
		// long and "this row is wrong" is not actionable at that size.
		const cells = line.split(BARE_PIPE);
		let at = 0, col = 0;
		for (let c = 0; c < cells.length; c++) {
			if (c > cols - 1) { break; }
			at += cells[c].length + 1;
			col = c;
		}
		problems.push({
			file,
			line: i + 1,
			extra: n - cols,
			headerLine,
			near: line.slice(Math.max(0, at - 30), at + 40).trim(),
		});
	}
	return problems;
}

module.exports = { checkTable, countPipes };
