# ewc3-docs-tools — Development Roadmap

## Current Focus

The toolkit is in use by [excel-power-query-editor][epqe] and [ewc3-recall-tape][recall-tape], and
CI-enforced in both. Five checks are live: `format`, `links`, `values`, `series` and `tables`.

`series` is now being dogfooded against a second, much messier estate — eleven MedAR repositories
with three different register shapes, roadmaps nested one directory deeper than the default glob,
and backlogs that mint IDs as numbered lists. Most of `DOCS-18`..`DOCS-28` came from that, and every
one of them was a silent pass before it was a finding.

What is next is driven by the first Python consumer. The Music Forensics Workbench will be Python,
and `fromJson` cannot read `pyproject.toml` — so `DOCS-1` stops being theoretical the moment that
repo gets a README.

## ID Prefixes

**Read this before minting an ID.** It sits above the tables because it is an input to writing one,
not a summary of them.

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| DOCS | global | ewc3-docs-tools | <!--ewc3:lastDOCS-->DOCS-60<!--/ewc3:lastDOCS--> | toolkit features and fixes |
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
| DOCS-1 | ⬜ planned | Read values from TOML, for Python repos | S | [DOCS-1][docs-1] |  |
| DOCS-2 | ⬜ planned | `format --check` should say WHAT would change | S | [DOCS-2][docs-2] |  |
| DOCS-3 | ⬜ planned | Publish to npm rather than installing from git | M | [DOCS-3][docs-3] |  |
| DOCS-4 | ⬜ planned | Anchor checking for `[text](file.md#heading)` | M | [DOCS-4][docs-4] |  |
| DOCS-15 | ⬜ planned | `next <PREFIX>`: print the next free ID | S | [DOCS-15][docs-15] |  |
| DOCS-16 | ⬜ planned | Org-level series check across every roadmap | M | [DOCS-16][docs-16] |  |
| DOCS-21 | ⬜ planned | Widen the docs-surface test past `Reference.md` | S | [DOCS-21][docs-21] |  |
| DOCS-22 | ⬜ planned | A derived marker for what is built | M | [DOCS-22][docs-22] |  |
| DOCS-23 | ⬜ planned | Cross-repo collision check: a mention is not a mint | M | [DOCS-23][docs-23] |  |
| DOCS-30 | ⬜ planned | Report an ID declared TWICE inside one repository | S | [DOCS-30][docs-30] |  |
| DOCS-31 | ⬜ planned | Report a backlog that DECLARES an ID rather than citing one | S | [DOCS-31][docs-31] |  |
| DOCS-36 | ⬜ planned | `fold`: git trailers become frontmatter state, idempotently | L | [DOCS-36][docs-36] |  |
| DOCS-37 | 🟦 coded | `index`: regenerate the Delivery Index from the slice documents | M | [DOCS-37][docs-37] |  |
| DOCS-38 | ⬜ planned | Refuse a Slice: trailer naming an ID with no slice document | S | [DOCS-38][docs-38] |  |
| DOCS-35 | ⬜ planned | Frontmatter is the ONLY declaring position in a slice or module doc | L | [DOCS-35][docs-35] |  |
| DOCS-34 | ⬜ planned | `migrate-project` ACCEPTS the shapes `series` refuses | M | [DOCS-34][docs-34] |  |
| DOCS-33 | ⬜ planned | Configurable template roots, with the builtin as the fallback | M | [DOCS-33][docs-33] |  |
| DOCS-39 | ⬜ planned | A derived `Last Used` must refuse to reconcile DOWNWARD | S | [DOCS-39][docs-39] |  |
| DOCS-40 | ⬜ planned | epo:slice qualified references, and a Registry column | M | [DOCS-40][docs-40] |  |
| DOCS-41 | ⬜ planned | `slice new <PREFIX> "<title>"` — mint by creating the document | M | [DOCS-41][docs-41] |  |
| DOCS-42 | 🟦 coded | Read the Delivery Index columns by HEADER NAME, not by position | S | [DOCS-42][docs-42] |  |
| DOCS-43 | 🟦 coded | A heading declares only its LEADING RUN of IDs | S | [DOCS-43][docs-43] |  |
| DOCS-44 | 🟦 coded | ID padding is a convention of a PREFIX, not of a file | S | [DOCS-44][docs-44] |  |
| DOCS-45 | 🟦 coded | `--repo` was silently ignored by every command except `migrate-project` | S | [DOCS-45][docs-45] |  |
| DOCS-46 | 🟦 coded | A slice document must CARRY the reference definitions it uses | S | [DOCS-46][docs-46] |  |
| DOCS-47 | 🟦 coded | `check` must refuse to report a PASS over zero files | S | [DOCS-47][docs-47] |  |
| DOCS-49 | ⬜ planned | Read the canonical Number Series table, and derive `Next` from it | M | [DOCS-49][docs-49] |  |
| DOCS-50 | 🟦 coded | STAGED slices must never write the LIVE roadmap, and three other findings that sat unread for six days | M | [DOCS-50][docs-50] |  |
| DOCS-48 | ⬜ planned | A Delivery Index ROW has no ownership gate, so a MIRROR is indistinguishable from a mint | M | [DOCS-48][docs-48] |  |
| DOCS-32 | ⬜ planned | One canonical register template, and refuse anything else | M | [DOCS-32][docs-32] |  |
| DOCS-26 | ↩️ refuted | `migrate-project` emits from ONE source, so extra planning surfaces are dropped | M | [DOCS-26][docs-26] |  |
| DOCS-27 | 🟦 coded | Refuse an ID cell that ALMOST parses, instead of dropping it | S | [DOCS-27][docs-27] |  |
| DOCS-51 | ⬜ planned | Cross-repo relative links cannot resolve in a single-repo checkout | M | [DOCS-51][docs-51] | CI red for 8 runs; 9 of the 10 failures are the relative half of a twin link, the 10th has no twin and is genuinely dead |
| DOCS-52 | ⬜ planned | The document modules do not know frontmatter exists, and `format` destroys it | S | [DOCS-52][docs-52] | ⛔ blocks the slice-document model — `fix` destroys frontmatter, a five-line stub corrupts SILENTLY, and `links` reports frontmatter values as dead links |
| DOCS-53 | 🟦 coded | `migrate-project` output fed to `index` restores every row it just moved out | S | [DOCS-53][docs-53] | CODED - migrated documents no longer declare the paragraph they moved to the body, so a register survives its own `index --write`; measured 341 to 341 |
| DOCS-54 | 🟦 coded | `migrate-project` must never regenerate a slice document a human already authored | S | [DOCS-54][docs-54] | CODED - authored documents are matched by frontmatter id, kept, and REPORTED; the register points at the existing filename rather than one derived from the row |
| DOCS-55 | ⬜ planned | `migrate-project` synthesises a SECOND prefix register, because it cannot read the one this repo has | M | [DOCS-55][docs-55] | BLOCKS adopting a migrated register: `migrate` cannot read the `Prefix`-first table `series` reads, so it bootstraps a duplicate that unclaims the owner and re-pads DOCS-54 to DT-00054 |
| DOCS-56 | ⬜ planned | After adoption, editing a Delivery Index row is silently discarded by the next `index --write` | M | [DOCS-56][docs-56] | the register becomes generated and nothing says so, so a row edited by hand is overwritten with no warning and exit 0; PMO had 9952 characters of live reasoning standing in exactly that position |
| DOCS-57 | ⬜ planned | A register with no Doc column loses every pointer to its slices, and any warning its rows carried | M | [DOCS-57][docs-57] | BLOCKS DevTools adoption: their header has no Doc column, so after `index --write` every row renders with an empty Status and no link at all - including the row whose entire purpose is a DO-NOT-RE-SPELL warning |
| DOCS-58 | ⬜ planned | One narrow id re-spells every other id in the register, and `index --write` applies it | M | [DOCS-58][docs-58] | measured on the real DevTools shape: DT-090 and DT-092 become DT-90 and DT-92 because DT-01 sets the derived width to 2; migrate leaves the register clean and the documented next step applies the damage |
| DOCS-59 | ⬜ planned | `format` and `index --write` disagree about the register, stably and forever | S | [DOCS-59][docs-59] | each undoes the other on every run, so whether `check` passes depends on which command ran last - measured stable across three rounds |
| DOCS-60 | ⬜ planned | Both register readers are blind to the other shape, and one comment claims otherwise | M | [DOCS-60][docs-60] | found by Copilot on PR #2: `readSeries` documents accepting `Prefix` OR `Series` and matches only `Prefix`, which is why 4 of 6 estate registers read as declaring nothing |

## Done

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DOCS-5 | ✅ done | `series`: prefix ownership and derived last-used numbers | M | [Adopting](../Adopting.md) | enforced in CI; `FIX` established as repo-local canon |
| DOCS-6 | ✅ done | Shell shortcuts for non-Node repositories | S | [Adopting](../Adopting.md) | `docsfix` / `docscheck` / `docsseries` / `docsready`, preferring an npm script when present |
| DOCS-7 | ✅ done | Fix the silent `**` glob bug | S | — | `docs/**.md` matched only the top level; a consumer was checking 15 of 39 files and passing |
| DOCS-8 | ✅ done | Config may also live at `config/ewc3-docs.json` | S | [Adopting](../Adopting.md) | plus `--config`; two config files is now an error rather than one being ignored |
| DOCS-9 | ✅ done | Wrapping never breaks an inline code span, nor starts a line with `<` | S | — | a split span defeats the line-based code-span stripping in all three scanners; a wrapped `<!--` becomes an HTML block the splitter then freezes forever (both verified against GitHub's renderer) |
| DOCS-10 | ✅ done | `values` ignores markers inside code spans and fences | S | [For agents](../For_Agents.md) | documenting the marker syntax used to fail the repo's own check |
| DOCS-11 | ✅ done | `fix`: the write-mode mirror of `check` | S | [Reference](../Reference.md) | every guide referenced it for a week before it existed; a fallback swallowed the exit code |
| DOCS-12 | ✅ done | Full command, config, and resolver reference | M | [Reference](../Reference.md) | complete published surface, now that other repositories are adopting the toolkit |
| DOCS-13 | ✅ done | Tests asserting the docs cover the code's surface | S | [Reference](../Reference.md) | commands, resolvers, config fields, format options, skipped dirs — all derived from source |
| DOCS-14 | ✅ done | `format` converges in one pass on a CRLF file | S | [Reference](../Reference.md) | it never converged: rewrapped prose lost its carriage returns while verbatim lines kept theirs, so `fix` was always followed by a failing `check` |
| DOCS-17 | ✅ done | `scratch/` skipped by default, like `archive/` | S | [Reference](../Reference.md) | a pasted review was reported as an orphan; working material is not part of the documentation graph |
| DOCS-18 | ✅ done | `tables`: report a row whose cell count disagrees with its header | — | [Reference](../Reference.md) | **backfilled** — shipped into the `check` pipeline without a row here; reports and never rewrites, because a bare pipe is ambiguous |
| DOCS-19 | ✅ done | `migrate-project`: emit a migrated planning surface beside the live one | — | [Reference](../Reference.md) | **backfilled** — writes only `docs/project_v2/`, dry-run without `--write`, and leaves a GLOBAL prefix unclaimed rather than self-awarding it |
| DOCS-20 | ✅ done | `slices`: one document per slice, extracted from the index | — | [Reference](../Reference.md) | **backfilled** — evidence is gathered and never asserted as completion, which a test enforces in the emitted prose |
| DOCS-24 | ✅ done | Declaring positions: see IDs outside the first table column | S | [Reference](../Reference.md) | a backlog written as a numbered list of backticked IDs was invisible to every extractor in the estate, hiding four real cross-repo collisions; the separator after the ID is what keeps a citing bullet from minting |
| DOCS-25 | ↩️ reverted | `series` reads the MedAR register shape | S | [Reference](../Reference.md) | **reverted 2026-09-02** — the register is brought to the template, not the parser to the register. The backlog-inherits-its-roadmap half was kept |
| DOCS-28 | ↩️ reverted | Read a legacy register instead of refusing it | S | [Reference](../Reference.md) | **reverted 2026-09-02.** I argued a checker must read the estate as it is; that assumed migrating was expensive, and it is a header row. Each shape a parser learns is one it will half-accept a fourth version of, silently |
| DOCS-29 | ✅ done | A declared `Scope` column, and a freeze that actually holds | M | [Reference](../Reference.md) | scope was guessed from the prefix string against a hardcoded set of one; a register saying a series is **retired** now records a ceiling and minting past it fails, instead of the retirement living in prose no parser reads |
| FIX-1 | ✅ done | `Overview.md` said "nothing built" of two partly-built proposals | — | [Overview](../Overview.md) | found while orienting; the sentence outlived the fact by several shipped commands, which is what `DOCS-22` is for |

## Notes

**Read the convention people already wrote.** `DOCS-25`, `DOCS-28` and `DOCS-29` all landed by
teaching the tool to read registers exactly as three different repositories had already written them
— `| Series |`, a `Last Num` column, `FROZEN at 08`. None of those repositories had to learn a
format. The counter-example from the same week is an invented rename annotation the parser could not
read at all. A checker that defines a shape needs the whole estate migrated before it is honest, and
**an auditor that presupposes the shape it audits for is blind exactly where compliance failed** —
which is the only place it was needed.

**Every check here exists because of a specific failure**, not a style preference. That is the bar
for adding another one: it has to have already gone wrong somewhere, quietly, in a way nobody
caught.

[docs-1]: slices/DOCS-1_Read_values_from_TOML_for_Python_repos.md
[docs-15]: slices/DOCS-15_next_PREFIX_print_the_next_free_ID.md
[docs-16]: slices/DOCS-16_Org_level_series_check_across_every_roadmap.md
[docs-2]: slices/DOCS-2_format_check_should_say_WHAT_would_change.md
[docs-21]: slices/DOCS-21_Widen_the_docs_surface_test_past_Reference_md.md
[docs-22]: slices/DOCS-22_A_derived_marker_for_what_is_built.md
[docs-23]: slices/DOCS-23_Cross_repo_collision_check_a_mention_is_not_a_mint.md
[docs-26]: slices/DOCS-26_migrate_project_emits_from_ONE_source_so_extra_planning_su.md
[docs-27]: slices/DOCS-27_Refuse_an_ID_cell_that_ALMOST_parses_instead_of_dropping_i.md
[docs-3]: slices/DOCS-3_Publish_to_npm_rather_than_installing_from_git.md
[docs-30]: slices/DOCS-30_Report_an_ID_declared_TWICE_inside_one_repository.md
[docs-31]: slices/DOCS-31_Report_a_backlog_that_DECLARES_an_ID_rather_than_citing_on.md
[docs-32]: slices/DOCS-32_One_canonical_register_template_and_refuse_anything_else.md
[docs-33]: slices/DOCS-33_Configurable_template_roots_with_the_builtin_as_the_fallba.md
[docs-34]: slices/DOCS-34_migrate_project_ACCEPTS_the_shapes_series_refuses.md
[docs-35]: slices/DOCS-35_Frontmatter_is_the_ONLY_declaring_position_in_a_slice_or_m.md
[docs-36]: slices/DOCS-36_fold_git_trailers_become_frontmatter_state_idempotently.md
[docs-37]: slices/DOCS-37_index_regenerate_the_Delivery_Index_from_the_slice_documen.md
[docs-38]: slices/DOCS-38_Refuse_a_Slice_trailer_naming_an_ID_with_no_slice_document.md
[docs-39]: slices/DOCS-39_A_derived_Last_Used_must_refuse_to_reconcile_DOWNWARD.md
[docs-4]: slices/DOCS-4_Anchor_checking_for_text.md
[docs-40]: slices/DOCS-40_epo_slice_qualified_references_and_a_Registry_column.md
[docs-41]: slices/DOCS-41_slice_new_PREFIX_title_mint_by_creating_the_document.md
[docs-42]: slices/DOCS-42_Read_the_Delivery_Index_columns_by_HEADER_NAME_not_by_posi.md
[docs-43]: slices/DOCS-43_A_heading_declares_only_its_LEADING_RUN_of_IDs.md
[docs-44]: slices/DOCS-44_ID_padding_is_a_convention_of_a_PREFIX_not_of_a_file.md
[docs-45]: slices/DOCS-45_repo_was_silently_ignored_by_every_command_except_migrate.md
[docs-46]: slices/DOCS-46_A_slice_document_must_CARRY_the_reference_definitions_it_u.md
[docs-47]: slices/DOCS-47_check_must_refuse_to_report_a_PASS_over_zero_files.md
[docs-48]: slices/DOCS-48_A_Delivery_Index_ROW_has_no_ownership_gate_so_a_MIRROR_is.md
[docs-49]: slices/DOCS-49_Read_the_canonical_Number_Series_table_and_derive_Next_fro.md
[docs-50]: slices/DOCS-50_STAGED_slices_must_never_write_the_LIVE_roadmap_and_three.md
[docs-51]: slices/DOCS-51_Cross_repo_links_do_not_resolve_in_a_single_repo_checkout.md
[docs-52]: slices/DOCS-52_Format_destroys_frontmatter.md
[docs-53]: slices/DOCS-53_Migration_output_fed_to_index_restores_every_row.md
[docs-54]: slices/DOCS-54_Migration_never_regenerates_an_authored_slice.md
[docs-55]: slices/DOCS-55_Migrate_bootstraps_a_second_register_it_cannot_read.md
[docs-56]: slices/DOCS-56_After_adoption_editing_the_register_is_silently_futile.md
[docs-57]: slices/DOCS-57_A_register_with_no_Doc_column_loses_every_pointer.md
[docs-58]: slices/DOCS-58_One_narrow_id_re_spells_the_whole_register.md
[docs-59]: slices/DOCS-59_Format_and_index_disagree_about_the_register_forever.md
[docs-60]: slices/DOCS-60_Both_register_readers_are_blind_to_the_other_shape.md
[epqe]: https://github.com/ewc3labs/excel-power-query-editor
[frontmatter-is-the]: ../design/frontmatter-is-the-declaration.md
[one-template-beats]: ../design/one-template-beats-three-parsers.md
[one-thing-to-edit]: ../design/one-thing-to-edit.md
[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
