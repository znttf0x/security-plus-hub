#!/usr/bin/env python3
"""Content linter for the Security+ Hub (standard library only).

Validates:
  - docs/questions/{1.0..5.0}.txt  — questions in JSONL
  - docs/acronyms/acronyms.txt     — acronyms in JSONL
  - docs/concepts/concepts.txt  — concepts in JSONL

ERRORS (non-zero exit) block: invalid JSON, missing required fields, answer out
of range, duplicate ids, domain != file name, duplicate options.
WARNINGS (non-blocking) flag quality issues: correct-index bias, a correct option
whose length is an outlier, absolute terms, and out-of-order acronyms.

Usage:  python3 validate.py            # validate everything
        python3 validate.py --strict   # treat warnings as errors
"""
import json
import os
import re
import sys
import collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAINS = ['1.0', '2.0', '3.0', '4.0', '5.0']
# Portuguese absolute words scanned inside the (Portuguese) options — the values stay PT on purpose.
ABSOLUTES = ('sempre', 'nunca', 'todos', 'todas', 'nenhum', 'nenhuma', 'jamais', 'qualquer')

errors = []
warnings = []


def err(msg):
    """Record a blocking error."""
    errors.append(msg)


def warn(msg):
    """Record a non-blocking warning."""
    warnings.append(msg)


def _norm_stem(s):
    """Normalize a question stem for duplicate detection (lowercase, keep only word chars)."""
    return re.sub(r'[^\wà-ú]', '', str(s or '').lower())


def validate_questions():
    """Validate the question bank; return the count of valid questions."""
    ids = {}
    stems = {}
    correct_by_index = collections.Counter()
    per_file = collections.Counter()
    existing = []
    total = 0
    for d in DOMAINS:
        path = os.path.join(BASE, 'docs', 'questions', f'{d}.txt')
        if not os.path.exists(path):
            err(f'docs/questions/{d}.txt: missing file')
            continue
        existing.append(d)
        with open(path, encoding='utf-8') as f:
            for ln, line in enumerate(f, 1):
                t = line.strip()
                if not t:
                    continue
                loc = f'docs/questions/{d}.txt:{ln}'
                try:
                    q = json.loads(t)
                except json.JSONDecodeError as e:
                    err(f'{loc}: invalid JSON ({e})')
                    continue

                for field in ('id', 'domain', 'stem', 'options', 'answer', 'explanation'):
                    if field not in q:
                        err(f'{loc}: missing required field: {field}')
                if any(c not in q for c in ('options', 'answer', 'domain', 'id')):
                    continue

                qid = q['id']
                if not isinstance(qid, int) or isinstance(qid, bool):
                    err(f'{loc}: id must be an integer')
                elif qid in ids:
                    err(f'{loc}: duplicate id {qid} (already at {ids[qid]})')
                else:
                    ids[qid] = loc

                if q['domain'] != d:
                    err(f'{loc}: domain "{q["domain"]}" != file {d}')

                opts = q['options']
                if not isinstance(opts, list) or len(opts) < 2:
                    err(f'{loc}: options must be a list with >= 2 items')
                    continue
                if not all(isinstance(a, str) and a.strip() for a in opts):
                    err(f'{loc}: every option must be a non-empty string')
                    continue
                _optkeys = [re.sub(r'\s+', ' ', a.strip().lower()) for a in opts]
                if len(set(_optkeys)) != len(_optkeys):
                    err(f'{loc}: duplicate options')

                r = q['answer']
                if not isinstance(r, int) or isinstance(r, bool) or not (0 <= r < len(opts)):
                    err(f'{loc}: answer {r} out of range 0..{len(opts)-1}')
                    continue

                for field in ('stem', 'explanation'):
                    if not isinstance(q.get(field), str) or not q[field].strip():
                        err(f'{loc}: {field} empty or not a string')

                if isinstance(q.get('stem'), str) and q['stem'].strip():
                    key = _norm_stem(q['stem'])
                    if key in stems:
                        err(f'{loc}: duplicate stem (same as {stems[key]})')
                    else:
                        stems[key] = loc

                total += 1
                per_file[d] += 1
                correct_by_index[r] += 1

                # quality heuristics (warnings)
                correct = opts[r]
                others = [a for i, a in enumerate(opts) if i != r]
                others_avg = sum(len(a) for a in others) / len(others)
                if others_avg and len(correct) > 1.8 * others_avg:
                    warn(f'{loc}: correct option far longer than the rest (may give the answer away)')
                for i, a in enumerate(opts):
                    low = a.lower()
                    if any(w in low.split() for w in ABSOLUTES):
                        warn(f'{loc}: option {chr(65+i)} uses an absolute term ({a!r}) — usually a tell')

    for d in existing:
        if per_file[d] == 0:
            err(f'docs/questions/{d}.txt: file exists but has no valid questions')
    if total == 0:
        err('docs/questions: the question bank is empty')

    if total:
        # correct-index position bias
        for idx, c in sorted(correct_by_index.items()):
            frac = c / total
            letter = chr(65 + idx)
            if frac > 0.40:
                warn(f'position bias: correct answer at {letter} in {c}/{total} ({frac*100:.0f}%) — shuffle the options at the source')
        missing = [chr(65 + i) for i in range(4) if correct_by_index.get(i, 0) == 0]
        if missing and total >= 8:
            warn(f'position bias: no correct answer at indexes {", ".join(missing)}')

    print(f'  questions: {total} valid across {len(ids)} unique ids | correct-index distribution: '
          + ', '.join(f'{chr(65+i)}={correct_by_index.get(i,0)}' for i in range(4)))
    return total


def validate_acronyms():
    """Validate the acronym deck; return the record count."""
    path = os.path.join(BASE, 'docs', 'acronyms', 'acronyms.txt')
    if not os.path.exists(path):
        warn('docs/acronyms/acronyms.txt: missing (acronym module not populated yet)')
        return 0
    seen = {}
    seen_ids = {}
    order = []
    total = 0
    with open(path, encoding='utf-8') as f:
        for ln, line in enumerate(f, 1):
            t = line.strip()
            if not t:
                continue
            loc = f'docs/acronyms/acronyms.txt:{ln}'
            try:
                o = json.loads(t)
            except json.JSONDecodeError as e:
                err(f'{loc}: invalid JSON ({e})')
                continue
            for field in ('id', 'acronym', 'expansions', 'explanation'):
                if field not in o:
                    err(f'{loc}: missing required field: {field}')
            sid = o.get('id')
            if not isinstance(sid, int) or isinstance(sid, bool):
                err(f'{loc}: id must be an integer')
            elif sid in seen_ids:
                err(f'{loc}: duplicate id {sid} (already at {seen_ids[sid]})')
            else:
                seen_ids[sid] = loc
            acronym = o.get('acronym')
            exps = o.get('expansions')
            if not isinstance(o.get('explanation'), str) or not o.get('explanation', '').strip():
                err(f'{loc}: explanation empty or not a string')
            if not isinstance(acronym, str) or not acronym.strip():
                err(f'{loc}: acronym empty/not a string')
                continue
            if not isinstance(exps, list) or not exps or not all(isinstance(e, str) and e.strip() for e in exps):
                err(f'{loc}: expansions must be a non-empty list of strings')
            elif len(set(exps)) != len(exps):
                err(f'{loc}: duplicate expansions in {acronym!r}')
            # An acronym may repeat with DIFFERENT senses (e.g. MAC, PAM); the forbidden
            # collision is (acronym + same expansion). Each card covers a single sense.
            exp0 = exps[0] if isinstance(exps, list) and exps else ''
            key = f'{acronym}|{exp0}'
            if key in seen:
                err(f'{loc}: acronym {acronym!r} with expansion {exp0!r} duplicated (already at {seen[key]})')
            else:
                seen[key] = loc
            order.append(acronym)
            total += 1
    # alphabetical A-Z order (the official list is alphabetical)
    ordered = sorted(order, key=str.lower)
    if order != ordered:
        for a, b in zip(order, ordered):
            if a != b:
                warn(f'docs/acronyms/acronyms.txt: out of alphabetical order near {a!r} (expected {b!r})')
                break
    print(f'  acronyms: {total} records | {len(seen)} distinct acronyms')
    return total


def validate_concepts():
    """Validate the concept deck; return the record count."""
    path = os.path.join(BASE, 'docs', 'concepts', 'concepts.txt')
    if not os.path.exists(path):
        warn('docs/concepts/concepts.txt: missing (concept module not populated yet)')
        return 0
    ids = {}
    fronts = {}
    total = 0
    with open(path, encoding='utf-8') as f:
        for ln, line in enumerate(f, 1):
            t = line.strip()
            if not t:
                continue
            loc = f'docs/concepts/concepts.txt:{ln}'
            try:
                o = json.loads(t)
            except json.JSONDecodeError as e:
                err(f'{loc}: invalid JSON ({e})')
                continue
            for field in ('id', 'domain', 'front', 'back'):
                if field not in o:
                    err(f'{loc}: missing required field: {field}')
            cid = o.get('id')
            if not isinstance(cid, int) or isinstance(cid, bool):
                err(f'{loc}: id must be an integer')
            elif cid in ids:
                err(f'{loc}: duplicate id {cid} (already at {ids[cid]})')
            else:
                ids[cid] = loc
            if o.get('domain') not in DOMAINS:
                err(f'{loc}: domain "{o.get("domain")}" invalid')
            for field in ('front', 'back'):
                if not isinstance(o.get(field), str) or not o.get(field, '').strip():
                    err(f'{loc}: {field} empty or not a string')
            if isinstance(o.get('front'), str) and o['front'].strip():
                fkey = _norm_stem(o['front'])
                if fkey in fronts:
                    err(f'{loc}: duplicate front (same as {fronts[fkey]})')
                else:
                    fronts[fkey] = loc
            total += 1
    print(f'  concepts: {total} records across {len(ids)} unique ids')
    return total


def main():
    """Run every validator, print a report, and sync counts.js when clean."""
    strict = '--strict' in sys.argv
    print('Validating the Security+ Hub bank…')
    validate_questions()
    validate_acronyms()
    validate_concepts()

    if warnings:
        print(f'\n{len(warnings)} WARNING(S):')
        for w in warnings:
            print(f'  ⚠ {w}')
    if errors:
        print(f'\n{len(errors)} ERROR(S):')
        for e in errors:
            print(f'  ✗ {e}')
        print('\nFAILED.')
        return 1
    if strict and warnings:
        print('\nFAILED (--strict: warnings treated as errors).')
        return 1
    # Bank is valid -> regenerate the SINGLE SOURCE of counts (assets/js/counts.js) to keep the app in sync.
    try:
        import gen_counts
        gen_counts.write(gen_counts.compute())
        print('Counts synced in assets/js/counts.js.')
    except Exception as ex:  # never fail the linter over this
        print(f'Warning: could not regenerate counts.js: {ex}')
    print('\nOK — no errors.' + (f' ({len(warnings)} warning(s))' if warnings else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
