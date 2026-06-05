#!/usr/bin/env python3
"""
Analyze GM entries in THEMODS_DATA for missing spelling variants,
by cross-referencing ODS synonym markers in SEQODS_DATA definitions.
"""

import re
import json
import unicodedata

# ── helpers ──────────────────────────────────────────────────────────────────

def strip_accents(s):
    """Remove diacritics and upper-case."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s.upper())
        if unicodedata.category(c) != 'Mn'
    )

def canonical(word):
    """Canonical lookup key: strip accents, upper-case, trim."""
    return strip_accents(word.strip())

# ── load SEQODS_DATA ─────────────────────────────────────────────────────────

print("Loading SEQODS_DATA …")
with open('/home/user/METHODS/data.js') as f:
    raw = f.read()

# Extract the JSON object assigned to window.SEQODS_DATA
m = re.search(r'window\.SEQODS_DATA\s*=\s*(\{.*\})\s*;?\s*$', raw, re.DOTALL)
if not m:
    raise ValueError("Could not find window.SEQODS_DATA")
seqods = json.loads(m.group(1))

e_arr = seqods['e']   # entry strings  e.g. "PANTENNE" or "PANTÈNE,ÈNE" or "WORD/variant"
f_arr = seqods['f']   # definition strings (parallel)

print(f"  {len(e_arr)} ODS entries loaded")

# ── parse ODS entries ────────────────────────────────────────────────────────
# For each entry, derive the canonical base word (first part before comma or slash)
# and store original display form + definition.

# ods_by_canon: canon → (display_word, definition)
ods_by_canon = {}

for raw_e, defi in zip(e_arr, f_arr):
    # First part before comma or slash is the canonical word
    base = re.split(r'[,/]', raw_e)[0].strip()
    c = canonical(base)
    ods_by_canon[c] = (base, defi)

print(f"  {len(ods_by_canon)} unique canonical ODS words")

# ── build synonym graph from (= X) markers ───────────────────────────────────
# Edges: any two canonical words that reference each other, or one references other.
# We also handle (= word1, word2) comma-separated inside one (= …) block.

print("Building synonym graph …")

# adjacency: canon → set of canons
adj = {}

def add_edge(a, b):
    adj.setdefault(a, set()).add(b)
    adj.setdefault(b, set()).add(a)

for raw_e, defi in zip(e_arr, f_arr):
    base = re.split(r'[,/]', raw_e)[0].strip()
    c_src = canonical(base)

    # Find all (= …) references in the definition
    refs = re.findall(r'\(=\s*([^)]+)\)', defi)
    for ref_group in refs:
        # May be comma-separated e.g. "word1, word2"
        parts = [p.strip() for p in ref_group.split(',')]
        for p in parts:
            if p:
                c_ref = canonical(p)
                add_edge(c_src, c_ref)

print(f"  Synonym graph: {len(adj)} nodes with at least one edge")

# ── connected components ──────────────────────────────────────────────────────

def connected_components(adjacency):
    visited = set()
    components = []
    for node in adjacency:
        if node not in visited:
            # BFS
            component = set()
            queue = [node]
            while queue:
                cur = queue.pop()
                if cur in visited:
                    continue
                visited.add(cur)
                component.add(cur)
                for nb in adjacency.get(cur, []):
                    if nb not in visited:
                        queue.append(nb)
            components.append(component)
    return components

components = connected_components(adj)
print(f"  {len(components)} synonym components")

# canon → component id
canon_to_comp = {}
for i, comp in enumerate(components):
    for node in comp:
        canon_to_comp[node] = i

# ── load THEMODS_DATA ─────────────────────────────────────────────────────────

print("Loading THEMODS_DATA …")
with open('/home/user/METHODS/themods_data.js') as f:
    raw_tm = f.read()

m2 = re.search(r'window\.THEMODS_DATA\s*=\s*(\{.*\})\s*;?\s*$', raw_tm, re.DOTALL)
if not m2:
    raise ValueError("Could not find window.THEMODS_DATA")
themods = json.loads(m2.group(1))

# Collect all GM entries
gm_sessions = themods.get('gm', [])
gm_entries = []
for session in gm_sessions:
    for entry in session.get('entries', []):
        gm_entries.append(entry)

print(f"  {len(gm_entries)} GM entries loaded")

# Build a set of ALL canonical forms currently present in ANY GM entry
all_gm_canons = set()
for entry in gm_entries:
    for form in entry.get('forms', []):
        all_gm_canons.add(canonical(form))

print(f"  {len(all_gm_canons)} distinct canonical forms across all GM entries")

# ── find missing forms ────────────────────────────────────────────────────────

print("\n" + "="*72)
print("GM ENTRIES WITH POTENTIALLY MISSING SPELLING VARIANTS")
print("="*72)
print()

findings = []

for entry in gm_entries:
    forms = entry.get('forms', [])
    gm_def = entry.get('def', '')
    if not forms:
        continue

    # Canonical forms of this entry
    entry_canons = {canonical(f) for f in forms}

    # Find the synonym component(s) for these forms
    comp_ids = set()
    for c in entry_canons:
        if c in canon_to_comp:
            comp_ids.add(canon_to_comp[c])

    if not comp_ids:
        continue

    # All synonym group members
    synonym_canons = set()
    for cid in comp_ids:
        synonym_canons |= components[cid]

    # Missing: in synonym group, not in this entry's forms,
    # AND is a valid ODS word, AND absent from ALL other GM entries
    missing = []
    for sc in synonym_canons:
        if sc in entry_canons:
            continue        # already in this entry
        if sc not in ods_by_canon:
            continue        # not a valid ODS word
        if sc in all_gm_canons:
            continue        # already covered in another GM entry

        # Extra filter: check that the ODS definition is compatible
        # (same noun/verb type, not just a thematic synonym)
        # We check that the (= src) reference exists in the ODS def of sc,
        # or vice versa — i.e. the link is mutual/direct, not just transitive noise
        ods_word, ods_def = ods_by_canon[sc]

        # Accept if: the missing word references one of the entry's forms,
        # OR one of the entry's forms references the missing word
        directly_linked = False
        for c_entry in entry_canons:
            if c_entry in adj.get(sc, set()):
                directly_linked = True
                break
            if sc in adj.get(c_entry, set()):
                directly_linked = True
                break

        if directly_linked:
            missing.append((ods_word, ods_def))

    if missing:
        findings.append((forms, gm_def, missing))

print(f"Found {len(findings)} GM entries with potentially missing forms.\n")

for forms, gm_def, missing in sorted(findings, key=lambda x: x[0][0]):
    print(f"GM forms  : {' / '.join(forms)}")
    print(f"GM def    : {gm_def[:100]}{'…' if len(gm_def)>100 else ''}")
    for ods_word, ods_def in missing:
        short_def = ods_def[:120] + ('…' if len(ods_def) > 120 else '')
        print(f"  MISSING : {ods_word}  →  {short_def}")
    print()
