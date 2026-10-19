# tronhooks.com plugins

The public [tronhooks MCP repository](https://github.com/LuganBI/tronhooks-mcp) contains separate Claude and Cursor plugin folders. They share the published MCP and portable Skill, while keeping each client's manifest, configuration syntax and MCP discovery filename separate. These files are submission candidates; a repository release or local validation does not mean a platform has accepted or listed the plugin.

## Runtime and data

Both plugins require Node.js 22 or newer and npm on PATH. They launch `npx --prefix <plugin-root> --yes @tronhooks/mcp@0.1.0`; the host supplies its absolute plugin root as one argument, including when the path contains spaces. The explicit prefix prevents npm from mistaking a same-named package in the current project or an ancestor directory for the published MCP. npm may download that version and its dependencies on first use; the top-level version is pinned, but its published dependency ranges are not an immutable dependency lock. Review the package and your npm registry configuration before running it. No API key, production account data or receiver secret is bundled.

With the default empty key, `get_capabilities`, `validate_watch_config` and `prepare_create_watch` work without an account request. Account reads (`list_watches`, `list_events`, and the ownership check for `prepare_delete_watch`) require an explicitly configured owner API key. A missing or malformed key fails before HTTP. The key is sent only as an authorization header to `https://tronhooks.com` for those reads. Do not put keys in chat, URLs, command arguments, committed configuration or the submission form. Use a separate revocable API key.

Claude prompts for the optional key using sensitive `userConfig` storage. Cursor declares an optional variable for its Plugins → Configure interface; use the client's private configuration and leave the field empty unless you want account reads. Do not replace placeholders in tracked files. On a client version that cannot configure the optional variable, leave this plugin without account access and use the separately documented manual MCP installation with a local secret manager.

The MCP does not create or delete watches, transfer funds, enable billing, or send tests/notifications. Prepared changes are drafts: the owner opens the official console, checks the signed-in account and complete configuration, confirms that individual operation, and verifies read-back. Installing a plugin or preparing a draft is not execution. Billing remains closed. Supported monitoring is confirmed TRON mainnet USDT/TRX transfer notifications, not balance snapshots or threshold alerts.

## Claude

The plugin root is `plugins/claude`, containing `.claude-plugin/plugin.json`, `.mcp.json`, the Skill, README and license. The repository's `.claude-plugin/marketplace.json` also supports installing directly from the project marketplace:

```text
claude plugin marketplace add LuganBI/tronhooks-mcp
claude plugin install tronhooks@tronhooks
```

These are owner-run installation commands, not part of validation. To validate an exported checkout without installing or starting MCP:

```text
claude plugin validate ./plugins/claude
claude plugin validate .
```

Use a current Claude Code version: full MCP validation requires at least 2.1.281. Older validators do not establish current directory compliance. The [manifest reference](https://code.claude.com/docs/en/plugins-reference) defines `userConfig` and `.mcp.json`; the [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces) defines the local source entry.

For official listing, open [Claude developer portal](https://claude.ai/directory/manage), choose **Plugin bundle**, repository `LuganBI/tronhooks-mcp`, plugin path `plugins/claude`, and the intended release branch/tag. [Submission requirements](https://claude.com/docs/plugins/submit) include a paid Claude account and a connected GitHub account with push permission. Team/Enterprise submissions require the applicable organization role. The owner must verify data-handling answers, contact details, directory terms and submission authority. Portal validation examines the selected commit; rerun it after changes.

The [directory checklist](https://claude.com/docs/plugins/pre-submission-checklist) permits an exact-version package launcher but holds it for human review because dependencies resolve at installation. This is expected, not approval. The local server is not a standalone remote connector and needs no new remote OAuth service for the plugin route. Do not claim the deprecated standalone MCPB submission path is available.

## Cursor

The plugin root is `plugins/cursor`, containing `.cursor-plugin/plugin.json`, `mcp.json`, the Skill, README and license. The root `.cursor-plugin/marketplace.json` identifies that folder for Cursor's multi-plugin repository format. Cursor uses `variables` and `${TRONHOOKS_API_KEY}`; it must not load Claude's `${user_config.api_key}` syntax.

The [official reference](https://cursor.com/docs/reference/plugins) documents stdio, variable defaults, the marketplace source path and submission checks. Test this plugin locally in a supported Cursor installation, using an empty key and pure tools first. Client UI verification is separate from offline manifest/export tests. Submit the public repository at [Cursor publishing](https://cursor.com/marketplace/publish) from the owner's Cursor account; review the [publisher terms](https://cursor.com/marketplace-publisher-terms) before submitting. Cursor reviews submissions manually; neither these artifacts nor a passing test proves acceptance or search priority.
