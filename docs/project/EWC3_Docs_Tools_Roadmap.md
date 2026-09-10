# ewc3-docs-tools — Development Roadmap

## Current Focus

The toolkit is in use by [excel-power-query-editor][epqe] and [ewc3-recall-tape][recall-tape], and
CI-enforced in both. Five checks are live: `format`, `links`, `values`, `series` and `tables`.

`series` is now being dogfooded against a second, much messier estate — eleven MedAR repositories
with three different register shapes, roadmaps nested one directory deeper than the default glob,
and backlogs that mint IDs as numbered lists. Most of `DT-18`..`DT-28` came from that, and every one
of them was a silent pass before it was a finding.

What is next is driven by the first Python consumer. The Music Forensics Workbench will be Python,
and `fromJson` cannot read `pyproject.toml` — so `DT-1` stops being theoretical the moment that repo
gets a README.

## ID Prefixes

**Read this before minting an ID.** It sits above the tables because it is an input to writing one,
not a summary of them.

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| DT | global | ewc3-docs-tools | <!--ewc3:lastDT-->DT-59<!--/ewc3:lastDT--> | toolkit features and fixes |
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
| DT-1 | ⬜ planned | Read values from TOML, for Python repos | S | [DT-1][dt-1] |  |
| DT-2 | ⬜ planned | `format --check` should say WHAT would change | S | [DT-2][dt-2] |  |
| DT-3 | ⬜ planned | Publish to npm rather than installing from git | M | [DT-3][dt-3] |  |
| DT-4 | ⬜ planned | Anchor checking for `[text](file.md#heading)` | M | [DT-4][dt-4] |  |
| DT-15 | ⬜ planned | `next <PREFIX>`: print the next free ID | S | [DT-15][dt-15] |  |
| DT-16 | ⬜ planned | Org-level series check across every roadmap | M | [DT-16][dt-16] |  |
| DT-21 | ⬜ planned | Widen the docs-surface test past `Reference.md` | S | [DT-21][dt-21] |  |
| DT-22 | ⬜ planned | A derived marker for what is built | M | [DT-22][dt-22] |  |
| DT-23 | ⬜ planned | Cross-repo collision check: a mention is not a mint | M | [DT-23][dt-23] |  |
| DT-30 | ⬜ planned | Report an ID declared TWICE inside one repository | S | [DT-30][dt-30] |  |
| DT-31 | ⬜ planned | Report a backlog that DECLARES an ID rather than citing one | S | [DT-31][dt-31] |  |
| DT-36 | ⬜ planned | `fold`: git trailers become frontmatter state, idempotently | L | [DT-36][dt-36] |  |
| DT-37 | 🟦 coded | `index`: regenerate the Delivery Index from the slice documents | M | [DT-37][dt-37] |  |
| DT-38 | ⬜ planned | Refuse a Slice: trailer naming an ID with no slice document | S | [DT-38][dt-38] |  |
| DT-35 | ⬜ planned | Frontmatter is the ONLY declaring position in a slice or module doc | L | [DT-35][dt-35] |  |
| DT-34 | ⬜ planned | `migrate-project` ACCEPTS the shapes `series` refuses | M | [DT-34][dt-34] |  |
| DT-33 | ⬜ planned | Configurable template roots, with the builtin as the fallback | M | [DT-33][dt-33] |  |
| DT-39 | ⬜ planned | A derived `Last Used` must refuse to reconcile DOWNWARD | S | [DT-39][dt-39] |  |
| DT-40 | ⬜ planned | epo:slice qualified references, and a Registry column | M | [DT-40][dt-40] |  |
| DT-41 | ⬜ planned | `slice new <PREFIX> "<title>"` — mint by creating the document | M | [DT-41][dt-41] |  |
| DT-42 | 🟦 coded | Read the Delivery Index columns by HEADER NAME, not by position | S | [DT-42][dt-42] |  |
| DT-43 | 🟦 coded | A heading declares only its LEADING RUN of IDs | S | [DT-43][dt-43] |  |
| DT-44 | 🟦 coded | ID padding is a convention of a PREFIX, not of a file | S | [DT-44][dt-44] |  |
| DT-45 | 🟦 coded | `--repo` was silently ignored by every command except `migrate-project` | S | [DT-45][dt-45] |  |
| DT-46 | 🟦 coded | A slice document must CARRY the reference definitions it uses | S | [DT-46][dt-46] |  |
| DT-47 | 🟦 coded | `check` must refuse to report a PASS over zero files | S | [DT-47][dt-47] |  |
| DT-49 | ⬜ planned | Read the canonical Number Series table, and derive `Next` from it | M | [DT-49][dt-49] |  |
| DT-50 | 🟦 coded | STAGED slices must never write the LIVE roadmap, and three other findings that sat unread for six days | M | [DT-50][dt-50] |  |
| DT-48 | ⬜ planned | A Delivery Index ROW has no ownership gate, so a MIRROR is indistinguishable from a mint | M | [DT-48][dt-48] |  |
| DT-32 | ⬜ planned | One canonical register template, and refuse anything else | M | [DT-32][dt-32] |  |
| DT-26 | ↩️ refuted | `migrate-project` emits from ONE source, so extra planning surfaces are dropped | M | [DT-26][dt-26] |  |
| DT-27 | 🟦 coded | Refuse an ID cell that ALMOST parses, instead of dropping it | S | [DT-27][dt-27] |  |
| DT-51 | ⬜ planned | Cross-repo relative links cannot resolve in a single-repo checkout | M | [DT-51][dt-51] | CI red for 8 runs; 9 of the 10 failures are the relative half of a twin link, the 10th has no twin and is genuinely dead |
| DT-52 | ⬜ planned | The document modules do not know frontmatter exists, and `format` destroys it | S | [DT-52][dt-52] | ⛔ blocks the slice-document model — `fix` destroys frontmatter, a five-line stub corrupts SILENTLY, and `links` reports frontmatter values as dead links |
| DT-53 | 🟦 coded | `migrate-project` output fed to `index` restores every row it just moved out | S | [DT-53][dt-53] | CODED - migrated documents no longer declare the paragraph they moved to the body, so a register survives its own `index --write`; measured 341 to 341 |
| DT-54 | 🟦 coded | `migrate-project` must never regenerate a slice document a human already authored | S | [DT-54][dt-54] | CODED - authored documents are matched by frontmatter id, kept, and REPORTED; the register points at the existing filename rather than one derived from the row |
| DT-55 | ⬜ planned | `migrate-project` synthesises a SECOND prefix register, because it cannot read the one this repo has | M | [DT-55][dt-55] | BLOCKS adopting a migrated register: `migrate` cannot read the `Prefix`-first table `series` reads, so it bootstraps a duplicate that unclaims the owner and re-pads DT-54 to DT-00054 |
| DT-56 | ⬜ planned | After adoption, editing a Delivery Index row is silently discarded by the next `index --write` | M | [DT-56][dt-56] | the register becomes generated and nothing says so, so a row edited by hand is overwritten with no warning and exit 0; PMO had 9952 characters of live reasoning standing in exactly that position |
| DT-57 | ⬜ planned | A register with no Doc column loses every pointer to its slices, and any warning its rows carried | M | [DT-57][dt-57] | BLOCKS DevTools adoption: their header has no Doc column, so after `index --write` every row renders with an empty Status and no link at all - including the row whose entire purpose is a DO-NOT-RE-SPELL warning |
| DT-58 | ⬜ planned | One narrow id re-spells every other id in the register, and `index --write` applies it | M | [DT-58][dt-58] | measured on the real DevTools shape: DT-090 and DT-092 become DT-90 and DT-92 because DT-01 sets the derived width to 2; migrate leaves the register clean and the documented next step applies the damage |
| DT-59 | ⬜ planned | `format` and `index --write` disagree about the register, stably and forever | S | [DT-59][dt-59] | each undoes the other on every run, so whether `check` passes depends on which command ran last - measured stable across three rounds |

## Done

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DT-5 | ✅ done | `series`: prefix ownership and derived last-used numbers | M | [Adopting](../Adopting.md) | enforced in CI; `FIX` established as repo-local canon |
| DT-6 | ✅ done | Shell shortcuts for non-Node repositories | S | [Adopting](../Adopting.md) | `docsfix` / `docscheck` / `docsseries` / `docsready`, preferring an npm script when present |
| DT-7 | ✅ done | Fix the silent `**` glob bug | S | — | `docs/**.md` matched only the top level; a consumer was checking 15 of 39 files and passing |
| DT-8 | ✅ done | Config may also live at `config/ewc3-docs.json` | S | [Adopting](../Adopting.md) | plus `--config`; two config files is now an error rather than one being ignored |
| DT-9 | ✅ done | Wrapping never breaks an inline code span, nor starts a line with `<` | S | — | a split span defeats the line-based code-span stripping in all three scanners; a wrapped `<!--` becomes an HTML block the splitter then freezes forever (both verified against GitHub's renderer) |
| DT-10 | ✅ done | `values` ignores markers inside code spans and fences | S | [For agents](../For_Agents.md) | documenting the marker syntax used to fail the repo's own check |
| DT-11 | ✅ done | `fix`: the write-mode mirror of `check` | S | [Reference](../Reference.md) | every guide referenced it for a week before it existed; a fallback swallowed the exit code |
| DT-12 | ✅ done | Full command, config, and resolver reference | M | [Reference](../Reference.md) | complete published surface, now that other repositories are adopting the toolkit |
| DT-13 | ✅ done | Tests asserting the docs cover the code's surface | S | [Reference](../Reference.md) | commands, resolvers, config fields, format options, skipped dirs — all derived from source |
| DT-14 | ✅ done | `format` converges in one pass on a CRLF file | S | [Reference](../Reference.md) | it never converged: rewrapped prose lost its carriage returns while verbatim lines kept theirs, so `fix` was always followed by a failing `check` |
| DT-17 | ✅ done | `scratch/` skipped by default, like `archive/` | S | [Reference](../Reference.md) | a pasted review was reported as an orphan; working material is not part of the documentation graph |
| DT-18 | ✅ done | `tables`: report a row whose cell count disagrees with its header | — | [Reference](../Reference.md) | **backfilled** — shipped into the `check` pipeline without a row here; reports and never rewrites, because a bare pipe is ambiguous |
| DT-19 | ✅ done | `migrate-project`: emit a migrated planning surface beside the live one | — | [Reference](../Reference.md) | **backfilled** — writes only `docs/project_v2/`, dry-run without `--write`, and leaves a GLOBAL prefix unclaimed rather than self-awarding it |
| DT-20 | ✅ done | `slices`: one document per slice, extracted from the index | — | [Reference](../Reference.md) | **backfilled** — evidence is gathered and never asserted as completion, which a test enforces in the emitted prose |
| DT-24 | ✅ done | Declaring positions: see IDs outside the first table column | S | [Reference](../Reference.md) | a backlog written as a numbered list of backticked IDs was invisible to every extractor in the estate, hiding four real cross-repo collisions; the separator after the ID is what keeps a citing bullet from minting |
| DT-25 | ↩️ reverted | `series` reads the MedAR register shape | S | [Reference](../Reference.md) | **reverted 2026-09-02** — the register is brought to the template, not the parser to the register. The backlog-inherits-its-roadmap half was kept |
| DT-28 | ↩️ reverted | Read a legacy register instead of refusing it | S | [Reference](../Reference.md) | **reverted 2026-09-02.** I argued a checker must read the estate as it is; that assumed migrating was expensive, and it is a header row. Each shape a parser learns is one it will half-accept a fourth version of, silently |
| DT-29 | ✅ done | A declared `Scope` column, and a freeze that actually holds | M | [Reference](../Reference.md) | scope was guessed from the prefix string against a hardcoded set of one; a register saying a series is **retired** now records a ceiling and minting past it fails, instead of the retirement living in prose no parser reads |
| FIX-1 | ✅ done | `Overview.md` said "nothing built" of two partly-built proposals | — | [Overview](../Overview.md) | found while orienting; the sentence outlived the fact by several shipped commands, which is what `DT-22` is for |

## Notes

**Read the convention people already wrote.** `DT-25`, `DT-28` and `DT-29` all landed by teaching
the tool to read registers exactly as three different repositories had already written them —
`| Series |`, a `Last Num` column, `FROZEN at 08`. None of those repositories had to learn a format.
The counter-example from the same week is an invented rename annotation the parser could not read at
all. A checker that defines a shape needs the whole estate migrated before it is honest, and **an
auditor that presupposes the shape it audits for is blind exactly where compliance failed** — which
is the only place it was needed.

**Every check here exists because of a specific failure**, not a style preference. That is the bar
for adding another one: it has to have already gone wrong somewhere, quietly, in a way nobody
caught.

[dt-1]: slices/DT-1_Read_values_from_TOML_for_Python_repos.md
[dt-15]: slices/DT-15_next_PREFIX_print_the_next_free_ID.md
[dt-16]: slices/DT-16_Org_level_series_check_across_every_roadmap.md
[dt-2]: slices/DT-2_format_check_should_say_WHAT_would_change.md
[dt-21]: slices/DT-21_Widen_the_docs_surface_test_past_Reference_md.md
[dt-22]: slices/DT-22_A_derived_marker_for_what_is_built.md
[dt-23]: slices/DT-23_Cross_repo_collision_check_a_mention_is_not_a_mint.md
[dt-26]: slices/DT-26_migrate_project_emits_from_ONE_source_so_extra_planning_su.md
[dt-27]: slices/DT-27_Refuse_an_ID_cell_that_ALMOST_parses_instead_of_dropping_i.md
[dt-3]: slices/DT-3_Publish_to_npm_rather_than_installing_from_git.md
[dt-30]: slices/DT-30_Report_an_ID_declared_TWICE_inside_one_repository.md
[dt-31]: slices/DT-31_Report_a_backlog_that_DECLARES_an_ID_rather_than_citing_on.md
[dt-32]: slices/DT-32_One_canonical_register_template_and_refuse_anything_else.md
[dt-33]: slices/DT-33_Configurable_template_roots_with_the_builtin_as_the_fallba.md
[dt-34]: slices/DT-34_migrate_project_ACCEPTS_the_shapes_series_refuses.md
[dt-35]: slices/DT-35_Frontmatter_is_the_ONLY_declaring_position_in_a_slice_or_m.md
[dt-36]: slices/DT-36_fold_git_trailers_become_frontmatter_state_idempotently.md
[dt-37]: slices/DT-37_index_regenerate_the_Delivery_Index_from_the_slice_documen.md
[dt-38]: slices/DT-38_Refuse_a_Slice_trailer_naming_an_ID_with_no_slice_document.md
[dt-39]: slices/DT-39_A_derived_Last_Used_must_refuse_to_reconcile_DOWNWARD.md
[dt-4]: slices/DT-4_Anchor_checking_for_text.md
[dt-40]: slices/DT-40_epo_slice_qualified_references_and_a_Registry_column.md
[dt-41]: slices/DT-41_slice_new_PREFIX_title_mint_by_creating_the_document.md
[dt-42]: slices/DT-42_Read_the_Delivery_Index_columns_by_HEADER_NAME_not_by_posi.md
[dt-43]: slices/DT-43_A_heading_declares_only_its_LEADING_RUN_of_IDs.md
[dt-44]: slices/DT-44_ID_padding_is_a_convention_of_a_PREFIX_not_of_a_file.md
[dt-45]: slices/DT-45_repo_was_silently_ignored_by_every_command_except_migrate.md
[dt-46]: slices/DT-46_A_slice_document_must_CARRY_the_reference_definitions_it_u.md
[dt-47]: slices/DT-47_check_must_refuse_to_report_a_PASS_over_zero_files.md
[dt-48]: slices/DT-48_A_Delivery_Index_ROW_has_no_ownership_gate_so_a_MIRROR_is.md
[dt-49]: slices/DT-49_Read_the_canonical_Number_Series_table_and_derive_Next_fro.md
[dt-50]: slices/DT-50_STAGED_slices_must_never_write_the_LIVE_roadmap_and_three.md
[dt-51]: slices/DT-51_Cross_repo_links_do_not_resolve_in_a_single_repo_checkout.md
[dt-52]: slices/DT-52_Format_destroys_frontmatter.md
[dt-53]: slices/DT-53_Migration_output_fed_to_index_restores_every_row.md
[dt-54]: slices/DT-54_Migration_never_regenerates_an_authored_slice.md
[dt-55]: slices/DT-55_Migrate_bootstraps_a_second_register_it_cannot_read.md
[dt-56]: slices/DT-56_After_adoption_editing_the_register_is_silently_futile.md
[dt-57]: slices/DT-57_A_register_with_no_Doc_column_loses_every_pointer.md
[dt-58]: slices/DT-58_One_narrow_id_re_spells_the_whole_register.md
[dt-59]: slices/DT-59_Format_and_index_disagree_about_the_register_forever.md
[epqe]: https://github.com/ewc3labs/excel-power-query-editor
[frontmatter-is-the]: ../design/frontmatter-is-the-declaration.md
[one-template-beats]: ../design/one-template-beats-three-parsers.md
[one-thing-to-edit]: ../design/one-thing-to-edit.md
[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
