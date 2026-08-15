'use strict';
// Programmatic entry point, for callers that want the pieces rather than the CLI.

module.exports = {
	...require('./format'),
	...require('./links'),
	...require('./values')
};
