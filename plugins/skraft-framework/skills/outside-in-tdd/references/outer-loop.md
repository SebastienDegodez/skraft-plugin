# Outer loop — what the acceptance-designer needs from outside-in TDD

The acceptance tests are the outer loop of double-loop TDD. The rest of `outside-in-tdd` (inner
cycles, green, commits, mutation) belongs to the software-engineer.

- **Enter through the use case.** Every acceptance test calls the use case (application handler)
  and asserts on its return value or on an output gateway. Never instantiate an entity, value
  object or domain service in it.
- **Application first.** The acceptance tests live in the Application-layer unit-test place. An
  HTTP, API or infrastructure test never stands for one; the walking skeleton is the one test
  that crosses the real entry point.
- **Let the domain emerge.** Create no domain class, value object, policy or enum for the
  engineer. A stub is a production signature the tests call — a use case, its query and result
  records, a new enum member — and it holds no behaviour: return the empty value of its type.
- **No placeholder.** A test or stub that asserts nothing fails on nothing: no `[Skip]`,
  `[Ignore]`, `.skip`, `#if false`, `Assert.Fail()`, `assert.fail()`, `Assert.True(false, …)`,
  `throw new NotImplementedException()` or `throw new Error('not implemented')`.
- **All acceptance tests first.** Write the walking skeleton and the test of every scenario, each
  name starting with its scenario's number and an underscore (`S4_…`, `test_s4_…`), run them once,
  and read that each fails on a business assertion — never a build or setup error. One that
  already passes on the stubs adds no behaviour: make it an `Examples` row of the scenario whose
  code makes it pass. Commit them all in one `test` commit: the red of every scenario.
- **Iron rule.** The values are the `.feature`'s, verbatim. Once committed, the engineer never
  edits an acceptance test; a wrong one comes back to you.
