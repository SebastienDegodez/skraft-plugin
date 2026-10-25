#!/bin/sh
# validate-mikado.sh - deterministic gate for a Mikado graph file (Mermaid `graph TD`).
# Twin of validate-mikado.ps1: same passes, same messages, same exit codes; one contract
# suite (tests/skill-scripts/mikado-method/) runs both on Linux, macOS and Windows.
#
# Inspired by the 8-pass validator in chaabani-anis/mikado-method (MIT License,
# https://github.com/chaabani-anis/mikado-method) - same validation discipline
# (parse, traceability, requires-reference validation, cycle detection, tree-direction
# ancestry, orphan detection, golden-master gate, true-leaf enumeration), reimplemented
# to parse SKRAFT's Mermaid graph format. POSIX sh and awk only.
#
# Usage: sh validate-mikado.sh [--no-git] <path-to-mikado-graph.md>
# Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.
#
# --no-git skips the tree-direction ancestry check (Pass 5), which needs real, resolvable
# git commits: use it only on fixtures with fictional SHAs, never on a real graph.
# Pass 5 requires every graph-update commit to start with `refactor(mikado-graph): `.

usage() {
	echo 'Usage: sh validate-mikado.sh [--no-git] <path-to-mikado-graph.md>'
	echo '       sh validate-mikado.sh --help'
}

no_git=0
file=''
for arg in "$@"; do
	case "$arg" in
		--no-git) no_git=1 ;;
		--help|-h)
			echo 'validate-mikado.sh - deterministic gate for a Mikado graph file (Mermaid `graph TD`).'
			echo ''
			usage
			echo 'Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.'
			echo ''
			echo '--no-git: skip the tree-direction ancestry check (Pass 5), which needs real,'
			echo 'resolvable git commits. Use it for fixtures/samples with fictional SHAs.'
			echo 'Never use it on a real graph - the git check is the traceability guarantee.'
			exit 0
			;;
		*) file=$arg ;;
	esac
done

if [ -z "$file" ] || [ ! -f "$file" ]; then
	echo "ERROR: graph file not found: $file" >&2
	usage >&2
	exit 1
fi

# The path reaches awk through the environment and the content through stdin, so a path
# holding `=` or backslashes is never read as an awk assignment or an escape sequence.
MIKADO_GRAPH_FILE=$file MIKADO_NO_GIT=$no_git awk '
function trim(s) { gsub(/^[ \t\r]+/, "", s); gsub(/[ \t\r]+$/, "", s); return s }
function ok(m) { print "  [OK]    " m }
function warn(m) { print "  [WARN]  " m; warnings++ }
function fail(m) { print "  [ERROR] " m > "/dev/stderr"; errors++ }
function known(id) { return (id in seen) }
function done(id,   k) { for (k = 1; k <= n; k++) if (nid[k] == id && index(nlabel[k], "[x]")) return 1; return 0 }
function short(s) { return substr(s, 1, 7) }
function shaIn(label,   at, rest, run) {
	at = index(label, "discovered:")
	if (!at) return ""
	rest = substr(label, at + 11)
	sub(/^[ \t]+/, "", rest)
	if (!match(rest, /^[A-Za-z0-9]+/)) return ""
	run = substr(rest, 1, RLENGTH)
	if (length(run) < 6) return ""
	return substr(run, 1, 40)
}
function addNode(id, label,   sha) {
	n++; nid[n] = id; nlabel[n] = label
	if (!(id in seen)) { seen[id] = 1; uorder[++u] = id }
	sha = shaIn(label)
	if (sha != "" && !(id in shaOf)) shaOf[id] = sha
}
function addEdge(from, to, kind) { e++; efrom[e] = trim(from); eto[e] = trim(to); ekind[e] = kind }
function parse(line,   at, id, label, f, ids, c, k) {
	if (line ~ /^[A-Za-z0-9_]+\(\(.*\)\)$/) {
		at = index(line, "((")
		id = substr(line, 1, at - 1)
		label = substr(line, at + 2, length(line) - at - 3)
		if (tolower(substr(label, 1, 5)) == "goal:" || label ~ /[Gg]oal:/) {
			rootFound = 1; goalId = id; addNode(id, label)
			ok("Goal node found: {" id "}")
		}
		return
	}
	if (line ~ /^[A-Za-z0-9_]+\[".*"\]$/) {
		at = index(line, "[\"")
		id = substr(line, 1, at - 1)
		label = substr(line, at + 2, length(line) - at - 3)
		if (known(id)) fail("Duplicate node id: {" id "}")
		addNode(id, label)
		return
	}
	if (line ~ /^[A-Za-z0-9_]+[ \t]*-->[ \t]*[A-Za-z0-9_]+$/) {
		at = index(line, "-->")
		addEdge(substr(line, 1, at - 1), substr(line, at + 3), "tree")
		return
	}
	if (line ~ /^[A-Za-z0-9_]+[ \t]*-\.requires\.->[ \t]*[A-Za-z0-9_]+$/) {
		at = index(line, "-.requires.->")
		addEdge(substr(line, 1, at - 1), substr(line, at + 13), "requires")
		return
	}
	if (line ~ /^class[ \t]+[A-Za-z0-9_,]+[ \t]+[A-Za-z0-9_]+$/) {
		split(line, f, /[ \t]+/)
		if (f[3] == "new") return
		c = split(f[2], ids, ",")
		for (k = 1; k <= c; k++) if (!(ids[k] in cls)) cls[ids[k]] = f[3]
	}
}
BEGIN {
	file = ENVIRON["MIKADO_GRAPH_FILE"]; nogit = ENVIRON["MIKADO_NO_GIT"] == "1"
	print "=== Mikado Graph Validation: " file " ==="
	print ""
	print "--- Pass 1: Parsing nodes, edges, classes ---"
}
{
	if (index(tolower($0), "golden master") || index($0, "%% no-golden-master:")) golden = 1
	parse(trim($0))
}
END {
	if (!rootFound) fail("No goal node found. Expected a node shaped G((Goal: <sentence>)).")
	print ""

	print "--- Pass 2: Traceability (discovered + error, unless anticipated) ---"
	for (k = 1; k <= n; k++) {
		if (nid[k] == goalId) continue
		if (cls[nid[k]] == "anticipated") { ok("{" nid[k] "} anticipated - traceability not required until confirmed by experiment"); continue }
		low = tolower(nlabel[k])
		if (index(low, "discovered:") && index(low, "error:")) ok("{" nid[k] "} has discovered + error citation")
		else fail("{" nid[k] "} missing '\''discovered:'\'' and/or '\''error:'\'' in its label (or mark it anticipated)")
	}
	print ""

	print "--- Pass 3: Requires-reference validation ---"
	broken = 0; m = 0
	for (k = 1; k <= e; k++) {
		if (known(efrom[k]) && known(eto[k])) { m++; ffrom[m] = efrom[k]; fto[m] = eto[k]; fkind[m] = ekind[k]; referenced[eto[k]] = 1 }
		else { fail(ekind[k] " edge {" efrom[k] "} -> {" eto[k] "}: unknown node id (not defined in this graph)"); broken = 1 }
	}
	if (!broken) ok("All edge references resolve to defined nodes")
	print ""

	print "--- Pass 4: Cycle detection (tree + requires edges) ---"
	# Kahn over the FILTERED edges: an unresolved reference never masquerades as a cycle.
	for (k = 1; k <= u; k++) indegree[uorder[k]] = 0
	for (k = 1; k <= m; k++) indegree[fto[k]]++
	head = 1; tail = 0
	for (k = 1; k <= u; k++) if (indegree[uorder[k]] == 0) queue[++tail] = uorder[k]
	while (head <= tail) {
		node = queue[head++]
		for (k = 1; k <= m; k++) {
			if (ffrom[k] != node) continue
			indegree[fto[k]]--
			if (indegree[fto[k]] == 0) queue[++tail] = fto[k]
		}
	}
	cyclic = 0
	for (k = 1; k <= u; k++) if (indegree[uorder[k]] > 0) { fail("Cycle detected involving {" uorder[k] "}"); cyclic = 1 }
	if (!cyclic) ok("No cycles detected")
	print ""

	print "--- Pass 5: Tree direction (child discovered during/after parent) ---"
	if (nogit) ok("Skipped (--no-git): ancestry checks require resolvable git commits")
	else {
		checked = 0
		for (k = 1; k <= m; k++) {
			if (fkind[k] != "tree") continue
			parent = shaOf[ffrom[k]]; child = shaOf[fto[k]]
			if (parent == "" || child == "") continue
			checked = 1
			if (system("git cat-file -e " child " 2>/dev/null") != 0) {
				fail("{" fto[k] "} discovered-by " short(child) ": commit not found in git history")
				continue
			}
			subject = ""
			cmd = "git log -1 --format=%s " child " 2>/dev/null"
			cmd | getline subject
			close(cmd)
			subject = trim(subject)
			if (subject !~ /^refactor\(mikado-graph\):/) fail("{" fto[k] "} discovered-by " short(child) ": commit message must start with '\''refactor(mikado-graph): '\'' (got: \"" subject "\")")
			if (parent == child) ok("{" fto[k] "} (" short(child) ") same cycle as {" ffrom[k] "} - direction OK")
			else if (system("git merge-base --is-ancestor " parent " " child " 2>/dev/null") == 0) ok("{" fto[k] "} (" short(child) ") discovered after {" ffrom[k] "} (" short(parent) ") - direction OK")
			else fail("{" fto[k] "} (discovered-by: " short(child) ") appears to have been discovered BEFORE its parent {" ffrom[k] "} (" short(parent) "). Children are prerequisites: they must be discovered during or after the parent'\''s naive attempt.")
		}
		if (!checked) ok("No tree edges with resolvable SHAs to check")
	}
	print ""

	print "--- Pass 6: Orphan detection (warning only) ---"
	orphans = 0
	for (k = 1; k <= n; k++) {
		if (nid[k] == goalId || (nid[k] in referenced)) continue
		warn("{" nid[k] "} appears unreferenced (not a target of any tree or requires edge)")
		orphans = 1
	}
	if (!orphans) ok("No orphan nodes")
	print ""

	print "--- Pass 7: Golden master gate ---"
	if (golden) ok("Golden master addressed (node present or '\''%% no-golden-master: <reason>'\'' declared)")
	else fail("No golden master node and no '\''%% no-golden-master: <reason>'\'' comment. Measure coverage on touched modules: add a Golden Master node if coverage is thin, or declare '\''%% no-golden-master: coverage X% on <module>'\'' if it is already sufficient.")
	print ""

	print "--- Pass 8: True leaf enumeration ---"
	leaves = 0
	for (k = 1; k <= n; k++) {
		if (nid[k] == goalId || done(nid[k])) continue
		pending = 0
		for (j = 1; j <= m; j++) if (ffrom[j] == nid[k] && !done(fto[j])) { pending = 1; break }
		if (pending) continue
		leaves++
		ok("Leaf ready: {" nid[k] "} " substr(nlabel[k], 1, 60))
	}
	if (leaves == 0) warn("No true leaves ready (either the graph is done, or all remaining nodes still have pending children)")
	print ""

	print "=== Summary ==="
	print "  Nodes parsed : " n
	print "  Warnings     : " warnings + 0
	if (errors == 0) { print "  Result       : VALID - graph is ready for the next leaf"; exit 0 }
	print "  Result       : INVALID - " errors " error(s) found. Fix before continuing."
	exit 1
}
' < "$file"
