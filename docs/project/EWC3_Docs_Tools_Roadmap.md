# ewc3-docs-tools — Development Roadmap

## Current Focus

The toolkit is in use by [excel-power-query-editor][epqe] and [ewc3-recall-tape][recall-tape], and
CI-enforced in both. Five checks are live: `format`, `links`, `values`, `series` and `tables`.

`series` is now being dogfooded against a second, much messier estate — eleven MedAR repositories
with three different register shapes, roadmaps nested one directory deeper than the default glob,
and backlogs that mint IDs as numbered lists. Most of `DOCS-018`..`DOCS-028` came from that, and
every one of them was a silent pass before it was a finding.

What is next is driven by the first Python consumer. The Music Forensics Workbench will be Python,
and `fromJson` cannot read `pyproject.toml` — so `DOCS-001` stops being theoretical the moment that
repo gets a README.

## ID Prefixes

**Read this before minting an ID.** It sits above the tables because it is an input to writing one,
not a summary of them.

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| DOCS | global | ewc3-docs-tools | <!--ewc3:lastDOCS-->DOCS-074<!--/ewc3:lastDOCS--> | toolkit features and fixes |
| FIX | repo-local | ewc3-docs-tools | <!--ewc3:lastFIX-->FIX-1<!--/ewc3:lastFIX--> | small corrections not worth a slice |

**Last Used is derived** from the tables below by `ewc3-docs values`, and CI fails if it is stale.
**Max, not a count** — counting rows agrees with the highest ID only while a series is contiguous.

**A global prefix belongs to exactly one roadmap.** Two layers enforce that, and only one of them is
mechanical: `series` sees only the roadmaps beneath the repository it runs in, so it catches two
roadmaps in *this* repo claiming the same prefix and cannot know another repository claimed it too.
Uniqueness across EWC3 Labs rests on the [prefix registry][prefix-registry], which is a convention,
not a check. **`FIX` is repo-local and that is canon** — every roadmap owns its own, because a fix
is never referenced from outside the repository it fixes.

## Delivery Index

**Rows are one line.** Anything wanting a paragraph wants a slice document.

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DOCS-001 | ⬜ planned | Read values from TOML, for Python repos | S | [DOCS-001][docs-001] |  |
| DOCS-002 | ⬜ planned | `format --check` should say WHAT would change | S | [DOCS-002][docs-002] |  |
| DOCS-003 | ⬜ planned | Publish to npm rather than installing from git | M | [DOCS-003][docs-003] |  |
| DOCS-004 | ⬜ planned | Anchor checking for `[text](file.md#heading)` | M | [DOCS-004][docs-004] |  |
| DOCS-015 | ⬜ planned | `next <PREFIX>`: print the next free ID | S | [DOCS-015][docs-015] |  |
| DOCS-016 | ⬜ planned | Org-level series check across every roadmap | M | [DOCS-016][docs-016] |  |
| DOCS-021 | ⬜ planned | Widen the docs-surface test past `Reference.md` | S | [DOCS-021][docs-021] |  |
| DOCS-022 | ⬜ planned | A derived marker for what is built | M | [DOCS-022][docs-022] |  |
| DOCS-023 | ⬜ planned | Cross-repo collision check: a mention is not a mint | M | [DOCS-023][docs-023] |  |
| DOCS-030 | ⬜ planned | Report an ID declared TWICE inside one repository | S | [DOCS-030][docs-030] |  |
| DOCS-031 | ⬜ planned | Report a backlog that DECLARES an ID rather than citing one | S | [DOCS-031][docs-031] |  |
| DOCS-036 | 🟦 tested | `fold`: git trailers become frontmatter state, idempotently | L | [DOCS-036][docs-036] · [One thing to edit][one-thing-to-edit] | built: fold reads Slice:/State: trailers on the branch, newest first, and writes frontmatter state in the legend spelling; unit-tested, awaiting a downstream pilot |
| DOCS-037 | 🟩 proven | `index`: regenerate the Delivery Index from the slice documents | M | [DOCS-037][docs-037] · [One thing to edit][one-thing-to-edit] | ewc3-docs-tools: the live register has been generated from its slice documents since 2026-09-09, and it round-trips byte-for-byte on 4 of 6 estate registers |
| DOCS-038 | 🟦 tested | Refuse a Slice: trailer naming an ID with no slice document | S | [DOCS-038][docs-038] · [One thing to edit][one-thing-to-edit] | built into fold: a Slice: naming no slice document is an error for commits after --since and a warning in full history; unit-tested |
| DOCS-035 | ⬜ planned | Frontmatter is the ONLY declaring position in a slice or module doc | L | [DOCS-035][docs-035] · [Frontmatter is the declaration][frontmatter-is-the] |  |
| DOCS-034 | ⬜ planned | `migrate-project` ACCEPTS the shapes `series` refuses | M | [DOCS-034][docs-034] · [One template beats three parsers][one-template-beats] |  |
| DOCS-033 | ⬜ planned | Configurable template roots, with the builtin as the fallback | M | [DOCS-033][docs-033] · [One template beats three parsers][one-template-beats] |  |
| DOCS-039 | ⬜ planned | A derived `Last Used` must refuse to reconcile DOWNWARD | S | [DOCS-039][docs-039] · [One template beats three parsers][one-template-beats] |  |
| DOCS-040 | ⬜ planned | epo:slice qualified references, and a Registry column | M | [DOCS-040][docs-040] · [One template beats three parsers][one-template-beats] |  |
| DOCS-041 | 🟦 tested | `slice new <PREFIX> "<title>"` — mint by creating the document | M | [DOCS-041][docs-041] · [Frontmatter is the declaration][frontmatter-is-the] | built: slice new mints past rows, documents, archived documents and Last Used, into the table holding the prefix; unit-tested end to end, awaiting a downstream mint |
| DOCS-042 | 🟦 tested | Read the Delivery Index columns by HEADER NAME, not by position | S | [DOCS-042][docs-042] | unit-tested; not re-run against HDCTranslators, where the positional defect was found |
| DOCS-043 | 🟦 tested | A heading declares only its LEADING RUN of IDs | S | [DOCS-043][docs-043] | unit-tested; not re-run against HDCTranslators, where the cross-repo mint was found |
| DOCS-044 | 🟦 tested | ID padding is a convention of a PREFIX, not of a file | S | [DOCS-044][docs-044] | unit-tested; narrowed by DOCS-058 - shortest-id holds as a description of a register, not as a rewrite rule, and width is now declared in series.widths |
| DOCS-045 | 🟨 coded | `--repo` was silently ignored by every command except `migrate-project` | S | [DOCS-045][docs-045] | doubt: the fix is in targetFiles, but no test covers --repo and no re-run is recorded |
| DOCS-046 | 🟩 proven | A slice document must CARRY the reference definitions it uses | S | [DOCS-046][docs-046] | ewc3-docs-tools adoption 2026-09-09: carried reference definitions resolve, with no dead link originating in a slice document |
| DOCS-047 | 🟨 coded | `check` must refuse to report a PASS over zero files | S | [DOCS-047][docs-047] | doubt: the guard is built and seen firing for index only; format, values, links and tables still report a pass over zero files |
| DOCS-049 | ⬜ planned | Read the canonical Number Series table, and derive `Next` from it | M | [DOCS-049][docs-049] |  |
| DOCS-050 | 🟦 tested | STAGED slices must never write the LIVE roadmap, and three other findings that sat unread for six days | M | [DOCS-050][docs-050] | all four fixes unit-tested; staged-never-writes-live proven on ewc3-docs-tools 2026-09-09, but the duplicate-id guard has never met a real duplicate |
| DOCS-048 | ⬜ planned | A Delivery Index ROW has no ownership gate, so a MIRROR is indistinguishable from a mint | M | [DOCS-048][docs-048] |  |
| DOCS-032 | ⬜ planned | One canonical register template, and refuse anything else | M | [DOCS-032][docs-032] · [One template beats three parsers][one-template-beats] |  |
| DOCS-026 | 🟥 cancelled | `migrate-project` emits from ONE source, so extra planning surfaces are dropped | M | [DOCS-026][docs-026] | refuted - did not reproduce: every repo has one roadmap, and the 34-of-41 gap on AIR was a stale preview read against a live register. Kept so the next report of it finds this |
| DOCS-027 | 🟨 coded | Refuse an ID cell that ALMOST parses, instead of dropping it | S | [DOCS-027][docs-027] | doubt: the id grammar half is proven on SX_Coder, 566 of 566 parsed, but the title commitment - refuse an almost-parsing cell rather than drop it - is not built |
| DOCS-051 | 🟦 tested | Cross-repo relative links cannot resolve in a single-repo checkout | M | [DOCS-051][docs-051] | twin rule built: the 10 cross-repo links are counted not resolved, 9 twins pass, and the one twin-less link fails by name; identical verdict measured in a worktree, a sibling-present layout and an empty CI checkout, not yet run by CI itself |
| DOCS-052 | ⬜ planned | The document modules do not know frontmatter exists, and `format` destroys it | S | [DOCS-052][docs-052] | ⛔ blocks the slice-document model — `fix` destroys frontmatter, a five-line stub corrupts SILENTLY, and `links` reports frontmatter values as dead links |
| DOCS-053 | 🟩 proven | `migrate-project` output fed to `index` restores every row it just moved out | S | [DOCS-053][docs-053] | ewc3-docs-tools 2026-09-09: longest row 341 chars after migrate, and still 341 after index --write |
| DOCS-054 | 🟩 proven | `migrate-project` must never regenerate a slice document a human already authored | S | [DOCS-054][docs-054] | ewc3-docs-tools 2026-09-09: every authored document kept across two consecutive migrations, and re-import from 23d2937 blocked exactly as designed |
| DOCS-055 | ⬜ planned | `migrate-project` synthesises a SECOND prefix register, because it cannot read the one this repo has | M | [DOCS-055][docs-055] | BLOCKS adopting a migrated register: `migrate` cannot read the `Prefix`-first table `series` reads, so it bootstraps a duplicate that unclaims the owner and re-pads DT-54 to DT-00054 |
| DOCS-056 | 🟦 tested | After adoption, editing a Delivery Index row is silently discarded by the next `index --write` | M | [DOCS-056][docs-056] | L1 and L2 built: index --write refuses a hand-edited row, index --check fails a diverged one; 27 controls unit-tested, index --check green locally on all 43 rows here and added to CI; not yet run on an estate register |
| DOCS-057 | ⬜ planned | A register with no Doc column loses every pointer to its slices, and any warning its rows carried | M | [DOCS-057][docs-057] | BLOCKS DevTools adoption: their header has no Doc column, so after `index --write` every row renders with an empty Status and no link at all - including the row whose entire purpose is a DO-NOT-RE-SPELL warning |
| DOCS-058 | ⬜ planned | One narrow id re-spells every other id in the register, and `index --write` applies it | M | [DOCS-058][docs-058] | measured on the real DevTools shape: DT-090 and DT-092 become DT-90 and DT-92 because DT-01 sets the derived width to 2; migrate leaves the register clean and the documented next step applies the damage |
| DOCS-059 | ⬜ planned | `format` and `index --write` disagree about the register, stably and forever | S | [DOCS-059][docs-059] | each undoes the other on every run, so whether `check` passes depends on which command ran last - measured stable across three rounds |
| DOCS-060 | ⬜ planned | Both register readers are blind to the other shape, and one comment claims otherwise | M | [DOCS-060][docs-060] | found by Copilot on PR #2: `readSeries` documents accepting `Prefix` OR `Series` and matches only `Prefix`, which is why 4 of 6 estate registers read as declaring nothing |
| DOCS-061 | 🟦 tested | `format` lifts reference definitions out of fenced code and re-emits them as live links | S | [DOCS-061][docs-061] | unit-tested against the exact lines it destroyed, failing before and passing after; not yet re-run across another repo |
| DOCS-062 | 🟦 tested | `migrate-project` regenerates over slice documents that predate frontmatter, and adoption deletes the kept ones | M | [DOCS-062][docs-062] | every existing document is inventoried and staged byte-for-byte; ids match padding-insensitively; unit-tested, and a read-only census of a 57-repo downstream estate found 33 older documents, most in one repo migration cannot reach |
| DOCS-063 | ⬜ planned | Public docs, comments and tests still name a downstream estate | M | [DOCS-063][docs-063] |  |
| DOCS-064 | ⬜ planned | Review findings deferred when the index gate and legacy-document migration merged | M | [DOCS-064][docs-064] |  |
| DOCS-065 | 🟦 tested | `migrate-project` and `index` disagree about every row of the register migrate writes, and the moved prose breaks links | M | [DOCS-065][docs-065] | migrate renders its register with index's own renderer; every row's Status moves to its body; moved links are repointed and evidence is quoted; unit-tested end to end on both register shapes, awaiting a downstream re-run |
| DOCS-066 | 🟦 tested | Frontmatter is written in a form strict YAML rejects, so GitHub shows an error on every migrated document | S | [DOCS-066][docs-066] | plain only when strict YAML agrees; format re-quotes existing unsafe values without churning quoted ones; verified out-of-band with js-yaml, awaiting a downstream PyYAML gate |
| DOCS-067 | ⬜ planned | slice new: match a bare --state word to the register's own spelling | S | [DOCS-067][docs-067] |  |
| DOCS-068 | 🟦 tested | migrate-project: an off-canon register's links and an existing Prefix register | M | [DOCS-068][docs-068] |  |
| DOCS-069 | ⬜ planned | Anchors: migrate retargets moved headings, links checks fragments | M | [DOCS-069][docs-069] |  |
| DOCS-070 | ⬜ planned | fold: a dry run reports provenance updates, and --help prints usage | S | [DOCS-070][docs-070] |  |
| DOCS-071 | ⬜ planned | fold --check --since: say out-of-range trailers were not checked | S | [DOCS-071][docs-071] |  |
| DOCS-072 | ⬜ planned | One frontmatter shape: migrate writes doc only for a Doc column, and no source | S | [DOCS-072][docs-072] |  |
| DOCS-073 | ⬜ planned | fold --check-message: validate a commit message's trailers before it is committed | M | [DOCS-073][docs-073] |  |
| DOCS-074 | ⬜ planned | fold: a State Legend it cannot fully read does not run, rather than folding against a partial legend | S | [DOCS-074][docs-074] |  |

## Done

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DOCS-005 | ✅ done | `series`: prefix ownership and derived last-used numbers | M | [Adopting](../Adopting.md) | enforced in CI; `FIX` established as repo-local canon |
| DOCS-006 | ✅ done | Shell shortcuts for non-Node repositories | S | [Adopting](../Adopting.md) | `docsfix` / `docscheck` / `docsseries` / `docsready`, preferring an npm script when present |
| DOCS-007 | ✅ done | Fix the silent `**` glob bug | S | — | `docs/**.md` matched only the top level; a consumer was checking 15 of 39 files and passing |
| DOCS-008 | ✅ done | Config may also live at `config/ewc3-docs.json` | S | [Adopting](../Adopting.md) | plus `--config`; two config files is now an error rather than one being ignored |
| DOCS-009 | ✅ done | Wrapping never breaks an inline code span, nor starts a line with `<` | S | — | a split span defeats the line-based code-span stripping in all three scanners; a wrapped `<!--` becomes an HTML block the splitter then freezes forever (both verified against GitHub's renderer) |
| DOCS-010 | ✅ done | `values` ignores markers inside code spans and fences | S | [For agents](../For_Agents.md) | documenting the marker syntax used to fail the repo's own check |
| DOCS-011 | ✅ done | `fix`: the write-mode mirror of `check` | S | [Reference](../Reference.md) | every guide referenced it for a week before it existed; a fallback swallowed the exit code |
| DOCS-012 | ✅ done | Full command, config, and resolver reference | M | [Reference](../Reference.md) | complete published surface, now that other repositories are adopting the toolkit |
| DOCS-013 | ✅ done | Tests asserting the docs cover the code's surface | S | [Reference](../Reference.md) | commands, resolvers, config fields, format options, skipped dirs — all derived from source |
| DOCS-014 | ✅ done | `format` converges in one pass on a CRLF file | S | [Reference](../Reference.md) | it never converged: rewrapped prose lost its carriage returns while verbatim lines kept theirs, so `fix` was always followed by a failing `check` |
| DOCS-017 | ✅ done | `scratch/` skipped by default, like `archive/` | S | [Reference](../Reference.md) | a pasted review was reported as an orphan; working material is not part of the documentation graph |
| DOCS-018 | ✅ done | `tables`: report a row whose cell count disagrees with its header | — | [Reference](../Reference.md) | **backfilled** — shipped into the `check` pipeline without a row here; reports and never rewrites, because a bare pipe is ambiguous |
| DOCS-019 | ✅ done | `migrate-project`: emit a migrated planning surface beside the live one | — | [Reference](../Reference.md) | **backfilled** — writes only `docs/project_v2/`, dry-run without `--write`, and leaves a GLOBAL prefix unclaimed rather than self-awarding it |
| DOCS-020 | ✅ done | `slices`: one document per slice, extracted from the index | — | [Reference](../Reference.md) | **backfilled** — evidence is gathered and never asserted as completion, which a test enforces in the emitted prose |
| DOCS-024 | ✅ done | Declaring positions: see IDs outside the first table column | S | [Reference](../Reference.md) | a backlog written as a numbered list of backticked IDs was invisible to every extractor in the estate, hiding four real cross-repo collisions; the separator after the ID is what keeps a citing bullet from minting |
| DOCS-025 | 🟥 cancelled | `series` reads the MedAR register shape | S | [Reference](../Reference.md) | **reverted 2026-09-02** — the register is brought to the template, not the parser to the register. The backlog-inherits-its-roadmap half was kept |
| DOCS-028 | 🟥 cancelled | Read a legacy register instead of refusing it | S | [Reference](../Reference.md) | **reverted 2026-09-02.** I argued a checker must read the estate as it is; that assumed migrating was expensive, and it is a header row. Each shape a parser learns is one it will half-accept a fourth version of, silently |
| DOCS-029 | ✅ done | A declared `Scope` column, and a freeze that actually holds | M | [Reference](../Reference.md) | scope was guessed from the prefix string against a hardcoded set of one; a register saying a series is **retired** now records a ceiling and minting past it fails, instead of the retirement living in prose no parser reads |
| FIX-1 | ✅ done | `Overview.md` said "nothing built" of two partly-built proposals | — | [Overview](../Overview.md) | found while orienting; the sentence outlived the fact by several shipped commands, which is what `DOCS-022` is for |

## Notes

**Read the convention people already wrote.** `DOCS-025`, `DOCS-028` and `DOCS-029` all landed by
teaching the tool to read registers exactly as three different repositories had already written them
— `| Series |`, a `Last Num` column, `FROZEN at 08`. None of those repositories had to learn a
format. The counter-example from the same week is an invented rename annotation the parser could not
read at all. A checker that defines a shape needs the whole estate migrated before it is honest, and
**an auditor that presupposes the shape it audits for is blind exactly where compliance failed** —
which is the only place it was needed.

**Every check here exists because of a specific failure**, not a style preference. That is the bar
for adding another one: it has to have already gone wrong somewhere, quietly, in a way nobody
caught.

[docs-001]: slices/DOCS-001_Read_values_from_TOML_for_Python_repos.md
[docs-002]: slices/DOCS-002_format_check_should_say_WHAT_would_change.md
[docs-003]: slices/DOCS-003_Publish_to_npm_rather_than_installing_from_git.md
[docs-004]: slices/DOCS-004_Anchor_checking_for_text.md
[docs-015]: slices/DOCS-015_next_PREFIX_print_the_next_free_ID.md
[docs-016]: slices/DOCS-016_Org_level_series_check_across_every_roadmap.md
[docs-021]: slices/DOCS-021_Widen_the_docs_surface_test_past_Reference_md.md
[docs-022]: slices/DOCS-022_A_derived_marker_for_what_is_built.md
[docs-023]: slices/DOCS-023_Cross_repo_collision_check_a_mention_is_not_a_mint.md
[docs-026]: slices/DOCS-026_migrate_project_emits_from_ONE_source_so_extra_planning_su.md
[docs-027]: slices/DOCS-027_Refuse_an_ID_cell_that_ALMOST_parses_instead_of_dropping_i.md
[docs-030]: slices/DOCS-030_Report_an_ID_declared_TWICE_inside_one_repository.md
[docs-031]: slices/DOCS-031_Report_a_backlog_that_DECLARES_an_ID_rather_than_citing_on.md
[docs-032]: slices/DOCS-032_One_canonical_register_template_and_refuse_anything_else.md
[docs-033]: slices/DOCS-033_Configurable_template_roots_with_the_builtin_as_the_fallba.md
[docs-034]: slices/DOCS-034_migrate_project_ACCEPTS_the_shapes_series_refuses.md
[docs-035]: slices/DOCS-035_Frontmatter_is_the_ONLY_declaring_position_in_a_slice_or_m.md
[docs-036]: slices/DOCS-036_fold_git_trailers_become_frontmatter_state_idempotently.md
[docs-037]: slices/DOCS-037_index_regenerate_the_Delivery_Index_from_the_slice_documen.md
[docs-038]: slices/DOCS-038_Refuse_a_Slice_trailer_naming_an_ID_with_no_slice_document.md
[docs-039]: slices/DOCS-039_A_derived_Last_Used_must_refuse_to_reconcile_DOWNWARD.md
[docs-040]: slices/DOCS-040_epo_slice_qualified_references_and_a_Registry_column.md
[docs-041]: slices/DOCS-041_slice_new_PREFIX_title_mint_by_creating_the_document.md
[docs-042]: slices/DOCS-042_Read_the_Delivery_Index_columns_by_HEADER_NAME_not_by_posi.md
[docs-043]: slices/DOCS-043_A_heading_declares_only_its_LEADING_RUN_of_IDs.md
[docs-044]: slices/DOCS-044_ID_padding_is_a_convention_of_a_PREFIX_not_of_a_file.md
[docs-045]: slices/DOCS-045_repo_was_silently_ignored_by_every_command_except_migrate.md
[docs-046]: slices/DOCS-046_A_slice_document_must_CARRY_the_reference_definitions_it_u.md
[docs-047]: slices/DOCS-047_check_must_refuse_to_report_a_PASS_over_zero_files.md
[docs-048]: slices/DOCS-048_A_Delivery_Index_ROW_has_no_ownership_gate_so_a_MIRROR_is.md
[docs-049]: slices/DOCS-049_Read_the_canonical_Number_Series_table_and_derive_Next_fro.md
[docs-050]: slices/DOCS-050_STAGED_slices_must_never_write_the_LIVE_roadmap_and_three.md
[docs-051]: slices/DOCS-051_Cross_repo_links_do_not_resolve_in_a_single_repo_checkout.md
[docs-052]: slices/DOCS-052_Format_destroys_frontmatter.md
[docs-053]: slices/DOCS-053_Migration_output_fed_to_index_restores_every_row.md
[docs-054]: slices/DOCS-054_Migration_never_regenerates_an_authored_slice.md
[docs-055]: slices/DOCS-055_Migrate_bootstraps_a_second_register_it_cannot_read.md
[docs-056]: slices/DOCS-056_After_adoption_editing_the_register_is_silently_futile.md
[docs-057]: slices/DOCS-057_A_register_with_no_Doc_column_loses_every_pointer.md
[docs-058]: slices/DOCS-058_One_narrow_id_re_spells_the_whole_register.md
[docs-059]: slices/DOCS-059_Format_and_index_disagree_about_the_register_forever.md
[docs-060]: slices/DOCS-060_Both_register_readers_are_blind_to_the_other_shape.md
[docs-061]: slices/DOCS-061_Format_lifts_definitions_out_of_fenced_code.md
[docs-062]: slices/DOCS-062_Migration_regenerates_over_older_slice_documents.md
[docs-063]: slices/DOCS-063_Public_docs_and_tests_name_a_downstream_estate.md
[docs-064]: slices/DOCS-064_Review_findings_deferred_at_merge.md
[docs-065]: slices/DOCS-065_Migrate_and_index_disagree_about_the_register.md
[docs-066]: slices/DOCS-066_Frontmatter_written_that_strict_YAML_rejects.md
[docs-067]: slices/DOCS-067_slice_new_match_a_bare_state_word_to_the_register_s_own_sp.md
[docs-068]: slices/DOCS-068_migrate_project_an_off_canon_register_s_links_and_an_exist.md
[docs-069]: slices/DOCS-069_Anchors_migrate_retargets_moved_headings_links_checks_frag.md
[docs-070]: slices/DOCS-070_fold_a_dry_run_reports_provenance_updates_and_help_prints.md
[docs-071]: slices/DOCS-071_fold_check_since_say_out_of_range_trailers_were_not_checke.md
[docs-072]: slices/DOCS-072_One_frontmatter_shape_migrate_writes_doc_only_for_a_Doc_co.md
[docs-073]: slices/DOCS-073_fold_check_message_validate_a_commit_message_s_trailers_be.md
[docs-074]: slices/DOCS-074_fold_a_State_Legend_it_cannot_fully_read_does_not_run_rath.md
[epqe]: https://github.com/ewc3labs/excel-power-query-editor
[frontmatter-is-the]: ../design/frontmatter-is-the-declaration.md
[one-template-beats]: ../design/one-template-beats-three-parsers.md
[one-thing-to-edit]: ../design/one-thing-to-edit.md
[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
