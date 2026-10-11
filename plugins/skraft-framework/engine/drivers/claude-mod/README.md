# drivers/claude-mod

Claude Code mod driver: `$.agent.spawn`, `$.ui.ask`, panel and status.
Only the registered module touches `$`, one line per call; everything it imports must be free of Node APIs.
Never imports another driver.
