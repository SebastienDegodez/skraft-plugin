# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Conventional Commits](https://www.conventionalcommits.org/) — versionnage [SemVer](https://semver.org/).

## [1.14.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.13.0...v1.14.0) (2026-10-09)

### ✨ Features

* **skills:** TypeScript stack adapters — Vitest gates, StrykerJS mutation, MSW and Microcks mocking ([#202](https://github.com/SebastienDegodez/skraft-plugin/issues/202)) ([700b6e2](https://github.com/SebastienDegodez/skraft-plugin/commit/700b6e22377fabd7be87c5f946cfc939bc614f6e)), closes [#201](https://github.com/SebastienDegodez/skraft-plugin/issues/201)

### 📝 Documentation

* **plugin:** rewrite the README for the people who install SKRAFT ([#203](https://github.com/SebastienDegodez/skraft-plugin/issues/203)) ([2e01aed](https://github.com/SebastienDegodez/skraft-plugin/commit/2e01aed7db06ec9266a44757c6b5aa0ca088d1b0))

## [1.13.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.12.0...v1.13.0) (2026-10-09)

### ✨ Features

* **skills:** clean-architecture-react, with its Vally spec and ESLint guard ([#201](https://github.com/SebastienDegodez/skraft-plugin/issues/201)) ([902d3e6](https://github.com/SebastienDegodez/skraft-plugin/commit/902d3e68b4a3d549b3eaff9b55dc6d929ddb61be))

## [1.12.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.11.0...v1.12.0) (2026-10-09)

### ✨ Features

* **skills:** group each layer by feature in the .NET, Java and Python skills ([#200](https://github.com/SebastienDegodez/skraft-plugin/issues/200)) ([6009e76](https://github.com/SebastienDegodez/skraft-plugin/commit/6009e769c017935c30d9f5ed634f1ec79bbe33ba))

## [1.11.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.10.2...v1.11.0) (2026-10-08)

### ✨ Features

* **skills:** clean-architecture-python, with its Vally spec ([#198](https://github.com/SebastienDegodez/skraft-plugin/issues/198)) ([193dd3e](https://github.com/SebastienDegodez/skraft-plugin/commit/193dd3e8dedac64ab2f9c4e63b63eee1f12172e5))

## [1.10.2](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.10.1...v1.10.2) (2026-10-08)

### 🐛 Bug Fixes

* **hooks:** resolve Copilot v1 hook copy through ${PLUGIN_ROOT} for VS Code ([#197](https://github.com/SebastienDegodez/skraft-plugin/issues/197)) ([5b879e2](https://github.com/SebastienDegodez/skraft-plugin/commit/5b879e2b17a2abfabc51f5583fe3cabe669c8ed0))

## [1.10.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.10.0...v1.10.1) (2026-10-08)

### 🐛 Bug Fixes

* hooks cost vscode ([#189](https://github.com/SebastienDegodez/skraft-plugin/issues/189)) ([5f34c52](https://github.com/SebastienDegodez/skraft-plugin/commit/5f34c52611b07fb3eb734d55c3214b21ebceab01))

## [1.10.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.9.0...v1.10.0) (2026-10-07)

### ✨ Features

* **agents:** load clean-architecture-dotnet in DESIGN and DELIVER ([8359880](https://github.com/SebastienDegodez/skraft-plugin/commit/835988095f09234828105bdae60d308827e7efaa))
* **agents:** load clean-architecture-java in DESIGN and DELIVER ([3ef52f1](https://github.com/SebastienDegodez/skraft-plugin/commit/3ef52f1366227b56c5f8dd52d22cbfb066c78cc7))
* **skills:** add a minimal clean-architecture-java skill ([009466c](https://github.com/SebastienDegodez/skraft-plugin/commit/009466c121a34d73deee804896275d21d8b234eb))
* **skills:** carry CQS, read models, aggregate creation and access rules in Java ([557c412](https://github.com/SebastienDegodez/skraft-plugin/commit/557c4125eff02992b3481eecfb8283a0f0acb6f3))
* **skills:** import clean-architecture-dotnet from copilot-instructions ([74021b1](https://github.com/SebastienDegodez/skraft-plugin/commit/74021b13560ed159d6e4ee8d239ddf96582c6b2e))

### 🐛 Bug Fixes

* **agents,skills:** read clean-architecture-testing at startup, make skills trigger on feature requests ([413caa5](https://github.com/SebastienDegodez/skraft-plugin/commit/413caa51d0b0ca87e5d276c98ac76b2bf690444e))
* **agents:** load only the Clean Architecture skill of the repo's stack ([385d4c9](https://github.com/SebastienDegodez/skraft-plugin/commit/385d4c923f413038e119b73aa7ab3d71f33d98a4))
* **evals:** keep braces out of the clean-architecture prompts ([3c4e576](https://github.com/SebastienDegodez/skraft-plugin/commit/3c4e5765c8227453855a22fe963f29edcc559a7a))
* **evals:** pass vally lint --strict and close the review gaps ([b633817](https://github.com/SebastienDegodez/skraft-plugin/commit/b633817093bf477666b15b122dbab4439a27a564))
* **evals:** stage the clean-architecture fixtures beside their specs ([1588051](https://github.com/SebastienDegodez/skraft-plugin/commit/158805140ebd8988b0a96a8f62e1a7eed7a51738))
* **skills:** make every .NET command return nothing, as the skill teaches ([d776934](https://github.com/SebastienDegodez/skraft-plugin/commit/d7769346e67dd905e458e044e2cad2a59a5a8d0b))
* **skills:** make the .NET scaffold build and follow the reference graph ([8acb0e3](https://github.com/SebastienDegodez/skraft-plugin/commit/8acb0e300fd905826094fc58ea0242aeef93dce8))
* **skills:** name cross-skill references instead of linking them ([0a2d8ff](https://github.com/SebastienDegodez/skraft-plugin/commit/0a2d8ffea37214951cc85c67b6de32ffa56669d6))
* **skills:** place repository interfaces by one rule across the guidance ([a7b018f](https://github.com/SebastienDegodez/skraft-plugin/commit/a7b018fff8083b4eeb744c25b42d2ea6656b10ee))
* **skills:** point the .NET NetArchTest links inside the plugin ([5c5ba91](https://github.com/SebastienDegodez/skraft-plugin/commit/5c5ba9134035870c00b7a40114e0f8884f4ef85d))

### ♻️ Refactoring

* **agents:** use Clean Architecture vocabulary instead of ports and adapters ([c95ab93](https://github.com/SebastienDegodez/skraft-plugin/commit/c95ab93dff469ea6fb080e7c05be89b0be368147))
* **skills:** drop .NET guidance the model already follows unaided ([b2df96a](https://github.com/SebastienDegodez/skraft-plugin/commit/b2df96a05c0ac5a404f660327ec7da0978760dc3))
* **skills:** drop the adapter wording from the .NET layer reference ([a7717a5](https://github.com/SebastienDegodez/skraft-plugin/commit/a7717a5a8385e631808646b0e9f681163fda8b15))
* **skills:** shape clean-architecture-dotnet like the Java skill, details in references ([db16271](https://github.com/SebastienDegodez/skraft-plugin/commit/db162718f104e069cd826b9024614e7c430fb130))

## [1.9.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.8.0...v1.9.0) (2026-10-04)

### ✨ Features

* **skills:** allow-list the business code in the architecture guard ([d745e45](https://github.com/SebastienDegodez/skraft-plugin/commit/d745e45f8810488e3f74db61db48de1f1fd0f14a))
* **skills:** trigger clean-architecture-testing on adapter coverage ([6c38cf9](https://github.com/SebastienDegodez/skraft-plugin/commit/6c38cf95ced251288e702afc9d10fb21fed347ac))

### 🐛 Bug Fixes

* **evals:** inline the Spring fixture list so a single-stimulus pilot resolves ([52bfbe7](https://github.com/SebastienDegodez/skraft-plugin/commit/52bfbe728b1c3de61f1517cc2f07524c3bcaa252))
* **evals:** keep Maven graders off Vally's output buffer ([13f6fa9](https://github.com/SebastienDegodez/skraft-plugin/commit/13f6fa9cbdc9e74db5d1814c63027e72259917c3))
* **evals:** store the Spring fixture under the Windows path budget ([6d3df94](https://github.com/SebastienDegodez/skraft-plugin/commit/6d3df94e4f10dfb048298232187faf9419c9594b))
* **skills:** make project references the layer dependency rule ([d13e0c3](https://github.com/SebastienDegodez/skraft-plugin/commit/d13e0c3319e17a299e27cf213ef0e5eaf99cba3f))
* **skills:** make the Java examples runnable and close the pom guard gap ([a2d052f](https://github.com/SebastienDegodez/skraft-plugin/commit/a2d052f74a1b7e7fd0ab59fc65dfd4bdf9c8f069))

### ♻️ Refactoring

* **skills:** condense the Java example into a module graph ([17cb8b4](https://github.com/SebastienDegodez/skraft-plugin/commit/17cb8b48527967466cb1e92f5848cfe64d16e516))

### 📝 Documentation

* **evals:** drop personal account names from the run notes ([5b61647](https://github.com/SebastienDegodez/skraft-plugin/commit/5b61647ae950395760c1344071f6026f466e6a9b))
* **evals:** record the full Stage C result and its three instrument defects ([8379b83](https://github.com/SebastienDegodez/skraft-plugin/commit/8379b83ff471fd831023c6fd8d3c8cf67675bd38))
* **evals:** record the Spring Boot block pilot and the framework-leak gap ([53ea8dd](https://github.com/SebastienDegodez/skraft-plugin/commit/53ea8ddb012a72ef5d95d81b01376fcbade3add0))
* **evals:** record the Spring Boot Stage B pilot and the reference rule ([043d427](https://github.com/SebastienDegodez/skraft-plugin/commit/043d42753e43f9d2d8dc194212c0f0531c203d68))
* **skills:** add self-contained Java examples for clean-architecture-testing ([c991619](https://github.com/SebastienDegodez/skraft-plugin/commit/c99161974bde8ff3905d9e701654d57e8e9b27a4))
* **skills:** state one project-reference graph across the guidance ([062ef0e](https://github.com/SebastienDegodez/skraft-plugin/commit/062ef0e566136ee35a4b076c4b8cf9a1b610937e))
* **skills:** trim redundant text and shrink decision-tree graphs ([4f6979e](https://github.com/SebastienDegodez/skraft-plugin/commit/4f6979e4e0cbb9113a68eb16fb3e9879ce6e62f0))

## [1.8.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.7.1...v1.8.0) (2026-10-02)

### ✨ Features

* **eng:** add flaky state for agent conformance verdicts ([9f01d53](https://github.com/SebastienDegodez/skraft-plugin/commit/9f01d53fe544d763d560cf24130a5d1c3c5a5598))
* **skills:** lead outside-in-tdd and quality-gates-javascript with triggers ([91db9c9](https://github.com/SebastienDegodez/skraft-plugin/commit/91db9c9fd467e70e42429e2ca566dc5b603fa894))

### 🐛 Bug Fixes

* **agents:** resolve review findings on SKRAFT agent chaining ([bcbc7df](https://github.com/SebastienDegodez/skraft-plugin/commit/bcbc7df6a9def1919c06899aa851884f5fc922c7))
* **skraft-framework:** normalize review verdict spelling in artifact CLI ([2faec32](https://github.com/SebastienDegodez/skraft-plugin/commit/2faec32c60d27d2f9b46dc71e9389bef0366eb05))
* **skraft-framework:** stop stray quotes from masking structural scan code ([258591e](https://github.com/SebastienDegodez/skraft-plugin/commit/258591e0b5ed44e67852519f10cbd99491332c06))

## [1.7.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.7.0...v1.7.1) (2026-09-29)

### 🐛 Bug Fixes

* **evals:** keep a command-shaped VALLY word-split ([577a4fe](https://github.com/SebastienDegodez/skraft-plugin/commit/577a4fe45d353b81ee04e86e07c5ac1904112fc6)), closes [#160](https://github.com/SebastienDegodez/skraft-plugin/issues/160)
* **evals:** move the fixtures' architecture tests out of the fast suite ([ae58cea](https://github.com/SebastienDegodez/skraft-plugin/commit/ae58ceab27ec8d94d7655b48b56c95634f324c64))
* **evals:** repair the two breaks that stop a run before it starts ([e3f8027](https://github.com/SebastienDegodez/skraft-plugin/commit/e3f8027cc490d4f50c831e73acdac30c64b696af))
* **evals:** shorten the clean-architecture-testing fixture path ([4f810a8](https://github.com/SebastienDegodez/skraft-plugin/commit/4f810a8a035dfc0f0119b2273e328ccf18ad1ce7)), closes [#176](https://github.com/SebastienDegodez/skraft-plugin/issues/176)

### 📝 Documentation

* **evals:** record why an instrument is shaped the way it is ([6ef9cd8](https://github.com/SebastienDegodez/skraft-plugin/commit/6ef9cd8d1c990c040e538479852f00f12f46e9a8))
* **evals:** record why the clean-architecture-testing measurement did not run ([839c12f](https://github.com/SebastienDegodez/skraft-plugin/commit/839c12ff1321744f11f14a3b448bed00c953edcf))

## [1.7.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.6.1...v1.7.0) (2026-09-28)

### ✨ Features

* **deliver:** make the software engineer consume the DISTILL test plan ([42f0204](https://github.com/SebastienDegodez/skraft-plugin/commit/42f020487133c045e3f3b522a51f87c12b5aabd8))

## [1.6.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.6.0...v1.6.1) (2026-09-25)

### 🐛 Bug Fixes

* **ci:** use supported Copilot model ([e982029](https://github.com/SebastienDegodez/skraft-plugin/commit/e9820299e286290d29e9ff9d5f3e73af9a4dd792))

### 📝 Documentation

* **mikado-method:** update LICENSE and provenance details for clarity ([ed6345f](https://github.com/SebastienDegodez/skraft-plugin/commit/ed6345fee13980da5af5858021cf59354fd9650b))
* **mikado-method:** update LICENSE link for clarity ([3412e5e](https://github.com/SebastienDegodez/skraft-plugin/commit/3412e5e9f481f8fb7c6f052ccce5a2ee97719778))

## [1.6.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.5.2...v1.6.0) (2026-09-25)

### ✨ Features

* **plugin:** adopt Agent Plugins 1.0 layout with per-client manifests ([3d16966](https://github.com/SebastienDegodez/skraft-plugin/commit/3d16966f4f88221e1829026f813f59dee248b079)), closes [#151](https://github.com/SebastienDegodez/skraft-plugin/issues/151)
* **plugin:** ship the Copilot hook manifest inside the plugin ([48e14c7](https://github.com/SebastienDegodez/skraft-plugin/commit/48e14c76e80a7aef26a55584424fc50dc8d77cb0)), closes [#151](https://github.com/SebastienDegodez/skraft-plugin/issues/151)

### 🐛 Bug Fixes

* **marketplace:** declare a description on every marketplace manifest ([ab52ffe](https://github.com/SebastienDegodez/skraft-plugin/commit/ab52ffe8d24c2c3db5dc361da6c36dcd90b23055))
* **marketplace:** point every harness at the plugin directory ([0f47c89](https://github.com/SebastienDegodez/skraft-plugin/commit/0f47c89c32b2d6217a0404251f32aaa3a43dfc6a)), closes [#151](https://github.com/SebastienDegodez/skraft-plugin/issues/151)
* **plugin:** move agent assets out of the agent discovery root ([3bb6f18](https://github.com/SebastienDegodez/skraft-plugin/commit/3bb6f189d20c21530766f9ec129792222f7f9815))
* **release:** stop versioning the deleted Cursor manifest ([9937f27](https://github.com/SebastienDegodez/skraft-plugin/commit/9937f2759e25a46810d9de2c5e18f52a910cbff2))
* **scan-drift:** resolve the chain by descriptor lookup, not string transform ([62bca18](https://github.com/SebastienDegodez/skraft-plugin/commit/62bca18ea147645ca46a84c6ff698af8c75b627a)), closes [#150](https://github.com/SebastienDegodez/skraft-plugin/issues/150)
* **scan-drift:** resolve the orchestrator chain to slugs ([e8f9b32](https://github.com/SebastienDegodez/skraft-plugin/commit/e8f9b3266fe969afc4978214bf919ee9c147b74a)), closes [#150](https://github.com/SebastienDegodez/skraft-plugin/issues/150)

### 📝 Documentation

* add anti-hallucination scope and ROI limits to 6 handbook pages (EN + FR) ([#144](https://github.com/SebastienDegodez/skraft-plugin/issues/144)) ([569e031](https://github.com/SebastienDegodez/skraft-plugin/commit/569e031073007e95cff9bb48faa575e1be3e2286))
* document the release contract ([52ae6e1](https://github.com/SebastienDegodez/skraft-plugin/commit/52ae6e1dbed1b48a9ca8643ea0b979175223d4e5))
* **evaluation:** reconcile the three statements about agent coverage ([#157](https://github.com/SebastienDegodez/skraft-plugin/issues/157)) ([f2a11d9](https://github.com/SebastienDegodez/skraft-plugin/commit/f2a11d9952bb8c4956326e1ea69e917b18648067))
* **evaluation:** state the discordant-pair floor where specs are budgeted ([#158](https://github.com/SebastienDegodez/skraft-plugin/issues/158)) ([f838f7c](https://github.com/SebastienDegodez/skraft-plugin/commit/f838f7ca2350af78c07cac0725533b14a22b24cf))
* **skill-evaluation:** describe the two instruments and the two tests ([#156](https://github.com/SebastienDegodez/skraft-plugin/issues/156)) ([e738505](https://github.com/SebastienDegodez/skraft-plugin/commit/e73850563ff9530a6490931ccf2d41c1835b8279))
* **specs:** align the config template AC with its own heading ([c264e1a](https://github.com/SebastienDegodez/skraft-plugin/commit/c264e1adb1b954aa6b6c9a8c2fa1ba64a010ec8d))
* **specs:** repoint template paths to the plugin assets directory ([3fc6714](https://github.com/SebastienDegodez/skraft-plugin/commit/3fc67142bacc9e770d4b0ac8cc11aa2ada57b1e0))
* **sync:** remove skraft-quality-bar from skraft-orchestrator skills index ([#148](https://github.com/SebastienDegodez/skraft-plugin/issues/148)) ([dbc97f5](https://github.com/SebastienDegodez/skraft-plugin/commit/dbc97f53211636302ab74789730d7d45d642086c))

## [1.5.2](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.5.1...v1.5.2) (2026-08-25)

### 📝 Documentation

* **gaps:** fix basename-exception scanner + declare lire-un-verdict exception ([#149](https://github.com/SebastienDegodez/skraft-plugin/issues/149)) ([709890c](https://github.com/SebastienDegodez/skraft-plugin/commit/709890c5ab47218ff395359de549b1751b876d08))

## [1.5.1](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.5.0...v1.5.1) (2026-08-06)

### ♻️ Refactoring

* **plugins:** move skraft framework into subdirectory ([08bf03c](https://github.com/SebastienDegodez/skraft-plugin/commit/08bf03c0e0bff4c6d6895786257e8eb8220a0915))

### 📝 Documentation

* **sync:** add solution-researcher derived pages and update indexes ([e838155](https://github.com/SebastienDegodez/skraft-plugin/commit/e838155f30ea475f0a242578cf04d84b8dbc911d))

## [1.5.0](https://github.com/SebastienDegodez/skraft-plugin/compare/v1.4.0...v1.5.0) (2026-07-31)

### ✨ Features

* add support for researcher role in model resolution and tests ([1823936](https://github.com/SebastienDegodez/skraft-plugin/commit/18239361f4056bcb12a61bd225fd1d77049a0217))

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
