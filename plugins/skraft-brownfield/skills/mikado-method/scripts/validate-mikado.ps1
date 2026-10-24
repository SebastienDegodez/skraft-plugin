# validate-mikado.ps1 - deterministic gate for a Mikado graph file (Mermaid `graph TD`).
# Twin of validate-mikado.sh: same passes, same messages, same exit codes; one contract
# suite (tests/skill-scripts/mikado-method/) runs both on Linux, macOS and Windows.
# Runs under Windows PowerShell 5.1 and PowerShell 7.
#
# Inspired by the 8-pass validator in chaabani-anis/mikado-method (MIT License,
# https://github.com/chaabani-anis/mikado-method), reimplemented to parse SKRAFT's
# Mermaid graph format.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File validate-mikado.ps1 [--no-git] <path-to-mikado-graph.md>
# Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.
#
# --no-git skips the tree-direction ancestry check (Pass 5), which needs real, resolvable
# git commits: use it only on fixtures with fictional SHAs, never on a real graph.
# Pass 5 requires every graph-update commit to start with `refactor(mikado-graph): `.

$script:errors = 0
$script:warnings = 0

function Out-Line([string]$Message) { [Console]::Out.WriteLine($Message) }
function Err-Line([string]$Message) { [Console]::Error.WriteLine($Message) }
function Write-Ok([string]$Message) { Out-Line "  [OK]    $Message" }
function Write-Warn([string]$Message) { Out-Line "  [WARN]  $Message"; $script:warnings++ }
function Write-Fail([string]$Message) { Err-Line "  [ERROR] $Message"; $script:errors++ }
function Get-Short([string]$Sha) { if ($Sha.Length -gt 7) { return $Sha.Substring(0, 7) } return $Sha }

function Write-Usage {
	Err-Line 'Usage: powershell -NoProfile -ExecutionPolicy Bypass -File validate-mikado.ps1 [--no-git] <path-to-mikado-graph.md>'
	Err-Line '       powershell -NoProfile -ExecutionPolicy Bypass -File validate-mikado.ps1 --help'
}

$noGit = $false
$file = ''
foreach ($arg in $args) {
	if ($arg -ceq '--no-git') { $noGit = $true }
	elseif ($arg -ceq '--help' -or $arg -ceq '-h') {
		Out-Line 'validate-mikado.ps1 - deterministic gate for a Mikado graph file (Mermaid `graph TD`).'
		Out-Line ''
		Out-Line 'Usage: powershell -NoProfile -ExecutionPolicy Bypass -File validate-mikado.ps1 [--no-git] <path-to-mikado-graph.md>'
		Out-Line 'Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.'
		Out-Line ''
		Out-Line '--no-git: skip the tree-direction ancestry check (Pass 5), which needs real,'
		Out-Line 'resolvable git commits. Use it for fixtures/samples with fictional SHAs.'
		Out-Line 'Never use it on a real graph - the git check is the traceability guarantee.'
		exit 0
	}
	else { $file = [string]$arg }
}

if ($file -eq '' -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
	Err-Line "ERROR: graph file not found: $file"
	Write-Usage
	exit 1
}

$nodes = New-Object System.Collections.ArrayList   # @{ Id; Label } in file order
$edges = New-Object System.Collections.ArrayList   # @{ From; To; Kind } raw
# Node ids are case-sensitive: every id-keyed table compares ordinally.
function New-IdTable { return ,(New-Object System.Collections.Hashtable ([System.StringComparer]::Ordinal)) }
$classes = New-IdTable                             # id -> first class
$shas = New-IdTable                                # id -> first discovered sha
$seen = New-Object System.Collections.ArrayList    # unique ids in first-seen order
$goalId = ''
$rootFound = $false

function Add-Node([string]$Id, [string]$Label) {
	[void]$nodes.Add(@{ Id = $Id; Label = $Label })
	if (-not $seen.Contains($Id)) { [void]$seen.Add($Id) }
	$sha = [regex]::Match($Label, 'discovered:\s*([A-Za-z0-9]{6,40})')
	if ($sha.Success -and -not $shas.ContainsKey($Id)) { $shas[$Id] = $sha.Groups[1].Value }
}

$fullPath = (Resolve-Path -LiteralPath $file).ProviderPath
$text = [System.IO.File]::ReadAllText($fullPath)

Out-Line "=== Mikado Graph Validation: $file ==="
Out-Line ''
Out-Line '--- Pass 1: Parsing nodes, edges, classes ---'
foreach ($line in ($text -split "\r?\n")) {
	$trimmed = $line.Trim()
	$match = [regex]::Match($trimmed, '^([A-Za-z0-9_]+)\(\((.*)\)\)$')
	if ($match.Success) {
		$id = $match.Groups[1].Value
		$label = $match.Groups[2].Value
		if ($label -match '^goal:' -or $label -cmatch '[Gg]oal:') {
			$rootFound = $true
			$goalId = $id
			Add-Node $id $label
			Write-Ok "Goal node found: {$id}"
		}
		continue
	}
	$match = [regex]::Match($trimmed, '^([A-Za-z0-9_]+)\["(.*)"\]$')
	if ($match.Success) {
		$id = $match.Groups[1].Value
		if ($seen.Contains($id)) { Write-Fail "Duplicate node id: {$id}" }
		Add-Node $id $match.Groups[2].Value
		continue
	}
	$match = [regex]::Match($trimmed, '^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$')
	if ($match.Success) {
		[void]$edges.Add(@{ From = $match.Groups[1].Value; To = $match.Groups[2].Value; Kind = 'tree' })
		continue
	}
	$match = [regex]::Match($trimmed, '^([A-Za-z0-9_]+)\s*-\.requires\.->\s*([A-Za-z0-9_]+)$')
	if ($match.Success) {
		[void]$edges.Add(@{ From = $match.Groups[1].Value; To = $match.Groups[2].Value; Kind = 'requires' })
		continue
	}
	$match = [regex]::Match($trimmed, '^class\s+([A-Za-z0-9_,]+)\s+([A-Za-z0-9_]+)$')
	if ($match.Success) {
		$cls = $match.Groups[2].Value
		if ($cls -ceq 'new') { continue }
		foreach ($classId in $match.Groups[1].Value.Split(',')) {
			if (-not $classes.ContainsKey($classId)) { $classes[$classId] = $cls }
		}
	}
}
if (-not $rootFound) { Write-Fail 'No goal node found. Expected a node shaped G((Goal: <sentence>)).' }
Out-Line ''

Out-Line '--- Pass 2: Traceability (discovered + error, unless anticipated) ---'
foreach ($node in $nodes) {
	if ($node.Id -ceq $goalId) { continue }
	if ($classes[$node.Id] -ceq 'anticipated') {
		Write-Ok "{$($node.Id)} anticipated - traceability not required until confirmed by experiment"
		continue
	}
	if ($node.Label -match 'discovered:' -and $node.Label -match 'error:') { Write-Ok "{$($node.Id)} has discovered + error citation" }
	else { Write-Fail "{$($node.Id)} missing 'discovered:' and/or 'error:' in its label (or mark it anticipated)" }
}
Out-Line ''

Out-Line '--- Pass 3: Requires-reference validation ---'
$filtered = New-Object System.Collections.ArrayList
$broken = $false
foreach ($edge in $edges) {
	if ($seen.Contains($edge.From) -and $seen.Contains($edge.To)) { [void]$filtered.Add($edge) }
	else {
		Write-Fail "$($edge.Kind) edge {$($edge.From)} -> {$($edge.To)}: unknown node id (not defined in this graph)"
		$broken = $true
	}
}
if (-not $broken) { Write-Ok 'All edge references resolve to defined nodes' }
Out-Line ''

Out-Line '--- Pass 4: Cycle detection (tree + requires edges) ---'
# Kahn over the FILTERED edges: an unresolved reference never masquerades as a cycle.
$indegree = New-IdTable
foreach ($id in $seen) { $indegree[$id] = 0 }
foreach ($edge in $filtered) { $indegree[$edge.To]++ }
$queue = New-Object System.Collections.Queue
foreach ($id in $seen) { if ($indegree[$id] -eq 0) { $queue.Enqueue($id) } }
while ($queue.Count -gt 0) {
	$current = $queue.Dequeue()
	foreach ($edge in $filtered) {
		if ($edge.From -cne $current) { continue }
		$indegree[$edge.To]--
		if ($indegree[$edge.To] -eq 0) { $queue.Enqueue($edge.To) }
	}
}
$cyclic = $false
foreach ($id in $seen) {
	if ($indegree[$id] -gt 0) { Write-Fail "Cycle detected involving {$id}"; $cyclic = $true }
}
if (-not $cyclic) { Write-Ok 'No cycles detected' }
Out-Line ''

Out-Line '--- Pass 5: Tree direction (child discovered during/after parent) ---'
if ($noGit) { Write-Ok 'Skipped (--no-git): ancestry checks require resolvable git commits' }
else {
	$checked = $false
	foreach ($edge in $filtered) {
		if ($edge.Kind -cne 'tree') { continue }
		$parent = $shas[$edge.From]
		$child = $shas[$edge.To]
		if (-not $parent -or -not $child) { continue }
		$checked = $true
		& git cat-file -e $child 2>$null
		if ($LASTEXITCODE -ne 0) {
			Write-Fail "{$($edge.To)} discovered-by $(Get-Short $child): commit not found in git history"
			continue
		}
		$subject = (& git log -1 --format=%s $child 2>$null | Out-String).Trim()
		if ($subject -cnotmatch '^refactor\(mikado-graph\):') {
			Write-Fail "{$($edge.To)} discovered-by $(Get-Short $child): commit message must start with 'refactor(mikado-graph): ' (got: `"$subject`")"
		}
		if ($parent -ceq $child) { Write-Ok "{$($edge.To)} ($(Get-Short $child)) same cycle as {$($edge.From)} - direction OK" }
		else {
			& git merge-base --is-ancestor $parent $child 2>$null
			if ($LASTEXITCODE -eq 0) { Write-Ok "{$($edge.To)} ($(Get-Short $child)) discovered after {$($edge.From)} ($(Get-Short $parent)) - direction OK" }
			else { Write-Fail "{$($edge.To)} (discovered-by: $(Get-Short $child)) appears to have been discovered BEFORE its parent {$($edge.From)} ($(Get-Short $parent)). Children are prerequisites: they must be discovered during or after the parent's naive attempt." }
		}
	}
	if (-not $checked) { Write-Ok 'No tree edges with resolvable SHAs to check' }
}
Out-Line ''

Out-Line '--- Pass 6: Orphan detection (warning only) ---'
$referenced = New-IdTable
foreach ($edge in $filtered) { $referenced[$edge.To] = $true }
$orphans = $false
foreach ($node in $nodes) {
	if ($node.Id -ceq $goalId -or $referenced.ContainsKey($node.Id)) { continue }
	Write-Warn "{$($node.Id)} appears unreferenced (not a target of any tree or requires edge)"
	$orphans = $true
}
if (-not $orphans) { Write-Ok 'No orphan nodes' }
Out-Line ''

Out-Line '--- Pass 7: Golden master gate ---'
if ($text -match 'golden master' -or $text.Contains('%% no-golden-master:')) {
	Write-Ok "Golden master addressed (node present or '%% no-golden-master: <reason>' declared)"
}
else {
	Write-Fail "No golden master node and no '%% no-golden-master: <reason>' comment. Measure coverage on touched modules: add a Golden Master node if coverage is thin, or declare '%% no-golden-master: coverage X% on <module>' if it is already sufficient."
}
Out-Line ''

Out-Line '--- Pass 8: True leaf enumeration ---'
$doneIds = New-IdTable
foreach ($node in $nodes) { if ($node.Label.Contains('[x]')) { $doneIds[$node.Id] = $true } }
$leaves = 0
foreach ($node in $nodes) {
	if ($node.Id -ceq $goalId -or $doneIds.ContainsKey($node.Id)) { continue }
	$pending = $false
	foreach ($edge in $filtered) {
		if ($edge.From -ceq $node.Id -and -not $doneIds.ContainsKey($edge.To)) { $pending = $true; break }
	}
	if ($pending) { continue }
	$leaves++
	$label = $node.Label
	if ($label.Length -gt 60) { $label = $label.Substring(0, 60) }
	Write-Ok "Leaf ready: {$($node.Id)} $label"
}
if ($leaves -eq 0) { Write-Warn 'No true leaves ready (either the graph is done, or all remaining nodes still have pending children)' }
Out-Line ''

Out-Line '=== Summary ==='
Out-Line "  Nodes parsed : $($nodes.Count)"
Out-Line "  Warnings     : $script:warnings"
if ($script:errors -eq 0) {
	Out-Line '  Result       : VALID - graph is ready for the next leaf'
	exit 0
}
Out-Line "  Result       : INVALID - $script:errors error(s) found. Fix before continuing."
exit 1
