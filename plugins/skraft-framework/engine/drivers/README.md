# drivers

One folder per host that drives the engine: `copilot-workflow/`, `claude-mod/`, `copilot-sdk/`, `cli/`.
A driver composes use cases with adapters and calls them; it never imports another driver.
`claude-mod/` keeps each `$` call a one-line function in the registered module and passes it to adapters.
