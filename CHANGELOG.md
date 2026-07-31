# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Conventional Commits](https://www.conventionalcommits.org/) — versionnage [SemVer](https://semver.org/).

## [1.4.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.3.1...v1.4.0) (2026-07-31)

### ✨ Features

* **agents:** separate product layer from engineering orchestrator (RPI-aligned) ([677bb13](https://github.com/SebastienDegodez/skraft-plugin/commit/677bb133740756c096bc4d0efdb1b486bdfe150f))
* **config:** add trackingLayout dial (namespaced|bare) to repo-wide config ([9b64bb5](https://github.com/SebastienDegodez/skraft-plugin/commit/9b64bb5c69263dc90ee54d0d70e11cc195d3d5a2))
* **g1:** scope dispatch-order guard to pipeline agents (active-pipeline-only) ([ffcbbf7](https://github.com/SebastienDegodez/skraft-plugin/commit/ffcbbf7cf1d91182e4391e1a62a4d2036e49b423))
* **hooks:** wire PreToolUse guards (G1 + G7/G8) into cli/hook.mjs ([776e03f](https://github.com/SebastienDegodez/skraft-plugin/commit/776e03ff59c757d87521195a78d0392a2a8401a1))
* **orchestrator:** drop the RESEARCH reviewer — evidence is citation-verifiable, not adversarially gated ([1224dd4](https://github.com/SebastienDegodez/skraft-plugin/commit/1224dd4718916ddf189d2a6a788520658ed667cb))
* **state:** resolve tracking layout (namespaced|bare) + add migrate command ([16fa8be](https://github.com/SebastienDegodez/skraft-plugin/commit/16fa8be9b83123aedce3681a368da12b459b9518))

### 🐛 Bug Fixes

* **gitignore:** ignore atomic-writer tmp/bak/corrupted files without requiring timestamp suffix ([6e3a532](https://github.com/SebastienDegodez/skraft-plugin/commit/6e3a532dd8efa1133c5384ed1b99083eb01d849a))

### ♻️ Refactoring

* **agents:** rename all agent identifiers to "Skraft - X" display convention ([a034ab5](https://github.com/SebastienDegodez/skraft-plugin/commit/a034ab58aea233149921cefa6cc7d0b979362bba))

### 📝 Documentation

* **agents:** drop "adapted from HVE-RPI" provenance framing, state equivalence only ([025ba3f](https://github.com/SebastienDegodez/skraft-plugin/commit/025ba3ff339196009f8bbfadf8b26a6b2c568988))
* **agents:** make HVE-RPI attribution concrete, not vague "counterpart" phrasing ([15c1d7d](https://github.com/SebastienDegodez/skraft-plugin/commit/15c1d7d5e3120302f7ada1837aab3b0c90ab8ec4))
* **instructions:** document namespaced|bare tracking layout + migrate ([a93213e](https://github.com/SebastienDegodez/skraft-plugin/commit/a93213e142f9d85eeef072d52c59ec59b448b5bf))
* record S3 layer separation (product/engineering, RPI-aligned) ([932ec6c](https://github.com/SebastienDegodez/skraft-plugin/commit/932ec6c888f2c5a52d28addb782e42ed12bb3611))

## [1.3.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.3.0...v1.3.1) (2026-07-20)

### ♻️ Refactoring

* **mikado-method:** 8-pass deterministic graph validator + scripts/references layout ([d68316f](https://github.com/SebastienDegodez/skraft-plugin/commit/d68316f8bdb59e9bbebe2dd4d92a8f398e342ab4))

## [1.3.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.2.0...v1.3.0) (2026-07-18)

### ✨ Features

* **brownfield:** brownfield workflows ([#129](https://github.com/SebastienDegodez/skraft-plugin/issues/129)) ([9bd0d36](https://github.com/SebastienDegodez/skraft-plugin/commit/9bd0d366fa2931212eb51c8f5c6baf87fa8beac0))

## [1.2.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.1.0...v1.2.0) (2026-07-12)

### ✨ Features

* **hooks:** US16 consumer plugin-root resolution with cache glob fallback ([#122](https://github.com/SebastienDegodez/skraft-plugin/issues/122)) ([9c1ac20](https://github.com/SebastienDegodez/skraft-plugin/commit/9c1ac20e83e66e5846e8e328ff7739699c64b746))

## [1.1.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.0.2...v1.1.0) (2026-07-12)

### ✨ Features

* **state-cli:** add scan-commits subcommand for commit-convention checks ([#113](https://github.com/SebastienDegodez/skraft-plugin/issues/113)) ([6305d91](https://github.com/SebastienDegodez/skraft-plugin/commit/6305d91c5472606524e24f8c6c172a258c1a30da))

## [1.0.2](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.0.1...v1.0.2) (2026-07-10)

### 🐛 Bug Fixes

* **aw:** pin copilot model in SKRAFT docs workflows to avoid retired-model engine failure ([#99](https://github.com/SebastienDegodez/skraft-plugin/issues/99)) ([f428843](https://github.com/SebastienDegodez/skraft-plugin/commit/f42884378c2a390da8053516b4d6f9e80d5bfc2d))

## [1.0.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.0.0...v1.0.1) (2026-07-09)

### 🐛 Bug Fixes

* update model names and tools formatting across agent definitions ([#97](https://github.com/SebastienDegodez/skraft-plugin/issues/97)) ([153acaf](https://github.com/SebastienDegodez/skraft-plugin/commit/153acaf54c5a1fdf0a1fee802d6f90b8cf7897e9))

## 1.0.0 (2026-07-09)

### ✨ Features

* **adr-eligibility-gate:** add pre-draft gate skill to evaluate ADR candidates ([c86b71c](https://github.com/SebastienDegodez/skraft-plugin/commit/c86b71c170931780da9a5768aa47154519bc0ca5))
* **agent:** add craft-orchestrator, make engineer/reviewer internal subagents ([4b1e020](https://github.com/SebastienDegodez/skraft-plugin/commit/4b1e020abcadd34de33836638e85f6fd29869b8a))
* **craft-discipline:** add self-discipline checkpoints skill ([d5fedd2](https://github.com/SebastienDegodez/skraft-plugin/commit/d5fedd2c14e4951532d88c07aa5950cdebd6ae4e))
* **cross-cutting:** add contract-testing + playwright-evidence skills (iter 5-6/7) ([0c934eb](https://github.com/SebastienDegodez/skraft-plugin/commit/0c934eb0ad45bdf680f14088bc26ecd5c68c4010))
* **deps:** add genesis skill via apm (danielmeppiel/genesis) ([a39f7ca](https://github.com/SebastienDegodez/skraft-plugin/commit/a39f7caa6c641d812b26034e21dddffd396313f3))
* **design:** add DESIGN phase — 2 agents + 3 skills (iter 2/7) ([65a4bbd](https://github.com/SebastienDegodez/skraft-plugin/commit/65a4bbd3a58efcedfbffc0c055c6ca237d714633))
* **discover:** working_branch construction and local artefact paths ([5ea03e7](https://github.com/SebastienDegodez/skraft-plugin/commit/5ea03e792bd5c5265e26283c644e5426abac95f2))
* **distill:** add DISTILL phase — 2 agents + 3 skills (iter 1/7) ([21791e5](https://github.com/SebastienDegodez/skraft-plugin/commit/21791e57bf0235cdf44d5330c78b8e6c049e045f))
* first SKRAFT plugin release — HVE-compatible pipeline + handbook ([cd114d1](https://github.com/SebastienDegodez/skraft-plugin/commit/cd114d118b8432c867e0bf9ac7c9e37205fa8bd2))
* **foundation:** Clean Architecture skeleton (US1 [#47](https://github.com/SebastienDegodez/skraft-plugin/issues/47)) ([#62](https://github.com/SebastienDegodez/skraft-plugin/issues/62)) ([4071e12](https://github.com/SebastienDegodez/skraft-plugin/commit/4071e1274034c171c3f1ffc1c8a273f8dda6c6d0)), closes [#72](https://github.com/SebastienDegodez/skraft-plugin/issues/72)
* **hooks:** add Bash matcher + complete Copilot manifest for [#51](https://github.com/SebastienDegodez/skraft-plugin/issues/51) ([#78](https://github.com/SebastienDegodez/skraft-plugin/issues/78)) ([3773aa9](https://github.com/SebastienDegodez/skraft-plugin/commit/3773aa9a66388a65941467e0b17b4040ab713d43))
* implement skip DISCOVER for HVE handoff ([23565dc](https://github.com/SebastienDegodez/skraft-plugin/commit/23565dc24e5646e4d0adce4d6941ccbad40186d1))
* **orchestrator:** replace skraft-orchestrator with unified SDLC pipeline (iter 7/7) ([a04ffa9](https://github.com/SebastienDegodez/skraft-plugin/commit/a04ffa9e97adc35d3286773ee4fa871d18fa169e))
* **release:** automated GitHub releases via semantic-release + professional README ([8b2c061](https://github.com/SebastienDegodez/skraft-plugin/commit/8b2c0611047cbd58073470ba52e3eaf10b9fa049))
* **reviewer:** add 4 lens sub-agents for A7 adversarial review ([3a2958a](https://github.com/SebastienDegodez/skraft-plugin/commit/3a2958a1eb13a5d9ba261b048937ff8f9489f492))
* **reviewer:** add software-engineer-reviewer facade agent ([2620352](https://github.com/SebastienDegodez/skraft-plugin/commit/2620352b32d98b6b3df8a30d618f87b251061204))
* **skills:** add mutation-testing and test-refactoring-catalog, wire S7 in craft-discipline ([b9e0c55](https://github.com/SebastienDegodez/skraft-plugin/commit/b9e0c555ba8da4f4e924c446fb8196bac280c6a5))
* **skraft-framework:** US2 — data-driven guardrail config generator ([#65](https://github.com/SebastienDegodez/skraft-plugin/issues/65)) ([4de80e1](https://github.com/SebastienDegodez/skraft-plugin/commit/4de80e1bacb182ab9cb90bbbbdaf1b20a6c91e11))
* state write-through + repo-wide config configurateur (token economy) ([#92](https://github.com/SebastienDegodez/skraft-plugin/issues/92)) ([65431f1](https://github.com/SebastienDegodez/skraft-plugin/commit/65431f1611f0246ad37061ff81a4d38ff6724573)), closes [#60](https://github.com/SebastienDegodez/skraft-plugin/issues/60)

### 🐛 Bug Fixes

* **clean-architecture-testing:** use Gateway instead of hexagonal Port ([1670874](https://github.com/SebastienDegodez/skraft-plugin/commit/16708744023fd40bc6dd93e4c0808a06f35e1b6f))
* **handbook:** remove pattern codes from book.yml; untrack local mcp.json ([efefe74](https://github.com/SebastienDegodez/skraft-plugin/commit/efefe7443942696920d4539f692aba062f25b57e))
* **models:** update model version from Claude Sonnet 4.6 to Claude So… ([#88](https://github.com/SebastienDegodez/skraft-plugin/issues/88)) ([35fe16b](https://github.com/SebastienDegodez/skraft-plugin/commit/35fe16b5864dc79f3738c13153b39384bf815edd))
* **playwright-evidence:** rewrite skill in TypeScript, CLI-first ([2896cae](https://github.com/SebastienDegodez/skraft-plugin/commit/2896caea1ceb09d831ed5b04674eaa164ad5c147))
* **playwright-evidence:** scope evidence under deliver/{story}/ for story traceability ([50b72e4](https://github.com/SebastienDegodez/skraft-plugin/commit/50b72e454f3c8fc4ac08f9a066940debce78e254))
* **playwright-evidence:** skill captures only — agents publish ([a379a25](https://github.com/SebastienDegodez/skraft-plugin/commit/a379a25a546839c00033e10268a14698eb2f1507))
* repair gh-aw-upgrade workflow syntax ([ab9e9bc](https://github.com/SebastienDegodez/skraft-plugin/commit/ab9e9bc40b169a2cd3cda114929a79af2cbb22e8))
* **skills:** close assert.fail() wishful-thinking gap in TDD skills ([#81](https://github.com/SebastienDegodez/skraft-plugin/issues/81)) ([f0b6a6a](https://github.com/SebastienDegodez/skraft-plugin/commit/f0b6a6a0268e48738e33fb991f3003d4abefcd8a)), closes [C#-leaning](https://github.com/SebastienDegodez/C/issues/-leaning)
* **skills:** gherkin compliance gate + test placement + concentric circle ordering ([#79](https://github.com/SebastienDegodez/skraft-plugin/issues/79)) ([e67d269](https://github.com/SebastienDegodez/skraft-plugin/commit/e67d269d867eb37c2982b7da5d474171fbf527f9))
* **software-engineer:** enumerate the 9 Object Calisthenics rules ([72c898d](https://github.com/SebastienDegodez/skraft-plugin/commit/72c898d3d09d368956556620a71a4c1db24217c7))
* **workflow:** enable cancel-in-progress for skraft-docs-gaps concurrency ([d782b39](https://github.com/SebastienDegodez/skraft-plugin/commit/d782b390bc475d359e22f6bc460cb70583c5efe6))
* **workflow:** enable cancel-in-progress for skraft-docs-sync concurrency ([e8049de](https://github.com/SebastienDegodez/skraft-plugin/commit/e8049de0c656424e6fe843966e860fa59f803671))
* **workflow:** enforce mandatory drift check before agent execution in skraft-docs-sync ([#76](https://github.com/SebastienDegodez/skraft-plugin/issues/76)) ([d075fc1](https://github.com/SebastienDegodez/skraft-plugin/commit/d075fc151d1e5a061e26471682be8b9f0c61ba31))
* **workflows:** recompile with gh-aw v0.82.3 to support Claude Sonnet 5 ([#94](https://github.com/SebastienDegodez/skraft-plugin/issues/94)) ([eb82401](https://github.com/SebastienDegodez/skraft-plugin/commit/eb82401ddcb814fcab691f26ea75d02b9ad566cf))

### ♻️ Refactoring

* **agent:** extract inline content from software-engineer, fix description ([7118493](https://github.com/SebastienDegodez/skraft-plugin/commit/7118493cea5b3e455b132a50f9bf9bdbb147bb14))
* **agent:** rename craft-orchestrator files to skraft-orchestrator ([3398f91](https://github.com/SebastienDegodez/skraft-plugin/commit/3398f91a9a440134d92111ed830ca7fbf87ec0d5))
* **agent:** rename to skraft-orchestrator, add user-invocable: false to subagents ([a468847](https://github.com/SebastienDegodez/skraft-plugin/commit/a4688475b61c828ca973fcc2447d5eefa2bc3995))
* **agents:** annotate B12 cost_role_class on all 19 primitives (Task 2) ([6dfc9a0](https://github.com/SebastienDegodez/skraft-plugin/commit/6dfc9a0358a3a941b2e51be6e50743b914aedefe))
* **discover:** agent Phase 6 is content-only, no branch context needed ([9803044](https://github.com/SebastienDegodez/skraft-plugin/commit/9803044f72bb48ad2acda17e698fef119de614e4))
* **discover:** simplify Phase 6, branch logic belongs to workflow ([d58051f](https://github.com/SebastienDegodez/skraft-plugin/commit/d58051f8a339499b8fa9660ad55e927fc3ace09d))
* **engineer:** rename quality-framework to craft-discipline ([cfb60ca](https://github.com/SebastienDegodez/skraft-plugin/commit/cfb60ca6ddb412ba2d6af98023096eee3d07340b))
* **instructions:** document depthTier as cost governor B16/B11 (Task 4) ([96a01d3](https://github.com/SebastienDegodez/skraft-plugin/commit/96a01d37fe657df083bc7ceac11970c0b8cabd6b))
* **instructions:** streamline language and formatting in CCE documentation ([84a52c9](https://github.com/SebastienDegodez/skraft-plugin/commit/84a52c9b0be5cb53a46a7eeaf949beed23367642))
* **specs:** correct output-tax interlock — verdict-schema/prefilter not yet implemented (Task 5) ([c888261](https://github.com/SebastienDegodez/skraft-plugin/commit/c8882618c0a76843f2f4efb361dda6dfe1ee230a))
* **specs:** freeze cost projection and validation checklist (Tasks 0,6,7) ([cd8b0c1](https://github.com/SebastienDegodez/skraft-plugin/commit/cd8b0c15077040b24302b1a14a878dca946da707))
* **specs:** record B13 cache-invalidator audit result (Task 1 PASS) ([2853f1b](https://github.com/SebastienDegodez/skraft-plugin/commit/2853f1bda205379ed5c28d8a3a34533c0d9d0255))
* **specs:** record B15 tool-surface audit result (Task 3 PASS) ([79e7d6e](https://github.com/SebastienDegodez/skraft-plugin/commit/79e7d6e58fb998f50f49952fc6e54c1aa838d63f))
* **token-economy:** annotate cost role classes, audit cache/tools, document depthTier, add handbook pages ([8249b59](https://github.com/SebastienDegodez/skraft-plugin/commit/8249b59d43c3762160492c7009f5d615a33a0525))

### 📝 Documentation

* Add gates criteria for backlog and acceptance reviewers in documentation ([2973542](https://github.com/SebastienDegodez/skraft-plugin/commit/2973542d2d90df666d791d68aee11d9679d9ec6d))
* **craft-discipline:** add canonical doc page for craft-discipline skill ([1112f0b](https://github.com/SebastienDegodez/skraft-plugin/commit/1112f0ba39939e07666c857005df315a4efde656))
* **handbook:** remove genesis pattern codes from token-economy pages — prose only ([abb08db](https://github.com/SebastienDegodez/skraft-plugin/commit/abb08dbf4d27de678c02ac935642de2fa55dc3b6))
* implement forced order rediscovery for agent and skills indexes ([0237fce](https://github.com/SebastienDegodez/skraft-plugin/commit/0237fceeb893a608e6059ac0db31134f03f4aaf4))
* Presentation basic ([929b71f](https://github.com/SebastienDegodez/skraft-plugin/commit/929b71fcc8973dbef52212d4f39d895fbabda51a))
* **presentation:** update for HVE compatibility + add orchestrator and workers slides ([76e87ce](https://github.com/SebastienDegodez/skraft-plugin/commit/76e87cecfa27044de6c38cb96e856275064f3fe0))
* **reviewer:** add canonical doc page for software-engineer-reviewer ([568b25c](https://github.com/SebastienDegodez/skraft-plugin/commit/568b25c08a427c2dd6327549ebcbedd15026c07b))
* **reviewer:** add Genesis A7 adversarial review design spec ([32e8b01](https://github.com/SebastienDegodez/skraft-plugin/commit/32e8b01aa0e9346b2041b95a51999b12d69c3f92))
* **skills:** add Repository vs ReadStore separation to architecture-patterns ([8e8c5c2](https://github.com/SebastienDegodez/skraft-plugin/commit/8e8c5c29a23875c5592380cef9ccb5adb66fa8e5))
* **specs:** add S7 tool bridge section for state.json — jq/rg/grep catalog ([8955199](https://github.com/SebastienDegodez/skraft-plugin/commit/89551993557dcf9902e3dd618cea3049f43541eb))
* **specs:** add SDLC pipeline specs with unified orchestrator ([ff01f89](https://github.com/SebastienDegodez/skraft-plugin/commit/ff01f8941b686baee4c6ec257e925555cfe41660))
* **specs:** add SKRAFT token-economy spec and plan (genesis cost-economics) ([4406905](https://github.com/SebastienDegodez/skraft-plugin/commit/4406905e5239c1e0cb5f207f3713182998a3dde8))
* **specs:** enrich DESIGN, DISTILL, DISCUSS with ES, port-to-port, DoR ([22b3782](https://github.com/SebastienDegodez/skraft-plugin/commit/22b378253e075dcc1bc29ac5509bfa9671dc0274))
* **specs:** replace hexagonal vocabulary with Clean Architecture terms ([ebf7b1a](https://github.com/SebastienDegodez/skraft-plugin/commit/ebf7b1a8642b56e7086666dbeacdef65d93c61e6))
* **sync:** add derived pages for skraft-config skill (FR + EN) ([#95](https://github.com/SebastienDegodez/skraft-plugin/issues/95)) ([9183dee](https://github.com/SebastienDegodez/skraft-plugin/commit/9183dee10373670523188eaaf0db090e2aaaa3ae))
* **sync:** add derived reference pages for adr-eligibility-gate skill ([1a5764d](https://github.com/SebastienDegodez/skraft-plugin/commit/1a5764dc425af893e7d0a118d19fe95e05048676))
* Update documentation and add presentation for SKRAFT agents ([8adef61](https://github.com/SebastienDegodez/skraft-plugin/commit/8adef6138fffb456c6c2816c771101a00c92ef6a))
* update existing docs for reviewer and craft-discipline ([b431ed7](https://github.com/SebastienDegodez/skraft-plugin/commit/b431ed7cbda5df4fc9ceb09ed68eb2c5aae54f11))
* update references from craft-orchestrator to skraft-orchestrator ([5dd4484](https://github.com/SebastienDegodez/skraft-plugin/commit/5dd4484ac3c0b8af5731c132e5515aebf454eeab))
* Update required background references in SKILL.md for clarity ([290afdc](https://github.com/SebastienDegodez/skraft-plugin/commit/290afdcea953b6c35dd76a56b3ec507230968274))
* **US7:** roadmap 13 US + README genesis anchoring, fail modes & guardrail guide ([#83](https://github.com/SebastienDegodez/skraft-plugin/issues/83)) ([2203fd8](https://github.com/SebastienDegodez/skraft-plugin/commit/2203fd80101c179dce57001b55a8f45a12550104))

<!-- Les entrées ci-dessous sont générées automatiquement par semantic-release. -->
