# @hyperneutrino/djs-lite

Opinionated and super lightweight DJS wrapper. To use this, you'll want to create a commands and/or interactions folder.

## Commands

The command loader will only check top-level files in your commands folder (i.e. it will not read recursively). The intention is for you to use subfolders for subcommands and route them manually and/or use subfolders for utility functions to keep your files clean.

Each file should export a `SlashCommand`, `UserCommand`, or `MessageCommand`. Each of these takes the command data object with an extra `handler` field. Builders aren't supported (like I said, this is opinionated, and I don't like builders).

## Interactions

The interaction loader will check all files in your interactions folder (i.e. it will read recursively). Pick a separator for your interaction custom IDs (I use `:`). Then, you can use the following format for custom IDs: `:[user ID]:<file path>:[argument]:[argument]:...`. Interactions received with this format will be routed to the appropriate handler based on the file path (if found).

## Initialization

To initialize, just use `loadCommands(client, "path/to/commands")` and/or `loadInteractions(client, "path/to/interactions")`. The only thing this wrapper does is make command and interaction loading/routing easy. Everything else is up to you to handle.
