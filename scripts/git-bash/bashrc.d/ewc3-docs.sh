# ewc3-docs shell shortcuts (EWC3 Labs)
#
# Source from ~/.bashrc:
#   source /c/DEV/ewc3labs/ewc3-docs-tools/scripts/git-bash/bashrc.d/ewc3-docs.sh
#
# WHY THESE EXIST. The toolkit runs two ways depending on the repo:
#
#   Node repos      npm run docs:fix   - which may do MORE than the toolkit alone, e.g. EPQE
#                                        regenerates Config_Reference.md from package.json first
#   everything else npx --yes github:ewc3labs/ewc3-docs-tools ...
#
# RecallTape is a .NET add-in with no package.json at all, so the second form is not an edge case.
# Typing it twice is enough to stop doing it, which is how a check quietly falls out of use.
#
# These prefer the repo's own npm script when it exists, because that script is allowed to know
# things the generic tool does not.

_ewc3_docs_repo_root() {
	git rev-parse --show-toplevel 2>/dev/null
}

# Does this repo define the given npm script?
_ewc3_docs_has_script() {
	local root script
	root="$(_ewc3_docs_repo_root)" || return 1
	[ -f "$root/package.json" ] || return 1
	script="$1"
	node -e "process.exit(require('$root/package.json').scripts?.['$script'] ? 0 : 1)" 2>/dev/null
}

# Run a toolkit verb, preferring the repo's npm script.
_ewc3_docs_run() {
	local verb="$1"; shift
	local root
	root="$(_ewc3_docs_repo_root)" || { echo "Not a git repo."; return 1; }

	if _ewc3_docs_has_script "docs:$verb"; then
		( cd "$root" && npm run --silent "docs:$verb" -- "$@" )
	else
		( cd "$root" && npx --yes github:ewc3labs/ewc3-docs-tools "$verb" "$@" )
	fi
}

# Make the docs correct. Mutates, and is idempotent - run it as often as you like.
docsfix()    { _ewc3_docs_run fix "$@"; }

# Ask whether they are correct. Writes nothing. This is what CI runs.
docscheck()  { _ewc3_docs_run check "$@"; }

# Who owns which ID prefix, and the last number used.
docsseries() { _ewc3_docs_run series "$@"; }

# The raw tool, for anything the shortcuts do not cover.
ewc3docs() {
	local root
	root="$(_ewc3_docs_repo_root)" || { echo "Not a git repo."; return 1; }
	( cd "$root" && npx --yes github:ewc3labs/ewc3-docs-tools "$@" )
}

# Fix, then verify, then show what is left to commit. The pre-commit habit in one word.
docsready() {
	docsfix "$@" || return 1
	echo
	docscheck "$@" || return 1
	echo
	git status --short
}
