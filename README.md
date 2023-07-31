# Bulk Edit

Bulk Edit allows you to make edits across your entire vault:

- Regex replacements
- Run custom JavaScript code to process text and metadata
- Move files
- Edit properties
- Add, delete, and rename tags

The plugin uses Dataview to search pages, so install that before using it.

## Use
- Click the Bulk Edit button or use the `Bulk Edit: bulk edit files` command.

### Custom JavaScript
- If you code custom JS, supply the body of a function. Bulk Edit will wrap it in a processing function and `eval` your custom code.

```
function process(text: string, metadata: object) {
    <supply the body>
    return text;
}
```

## Installation

1. Download the latest release from GitHub
2. Move `main.js` and `manifest.json` to a folder in your Obsidian config directory (`.obsidian/plugins/bulk-edit`)
3. Reload plugins and enable Bulk Edit

## Credits

Thanks to Dataview for a useful plugin API.

If you appreciate this plugin, I would love your support for further development!

<a href="https://www.buymeacoffee.com/joshuatreinier" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>