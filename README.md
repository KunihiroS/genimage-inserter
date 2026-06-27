# GenImage Inserter

An Obsidian plugin that generates images from your note text using Gemini AI and inserts them directly into your notes.

## Demo
- Easy to use! (Not so first as it is though, in case of gemini3pro image 😇)  
![Demo](genimage-inserter.gif)

## Features

- 🎨 Generate images from selected text or entire note content using Gemini AI
  - no text selection makes an entire note as context to generate.
- 📝 Multiple prompt templates with customizable aspect ratio and image quality
- 🖱️ Right-click context menu integration
- 📁 Images saved to configurable directory within your vault (organized by note name)
- 📋 Detailed logging for troubleshooting

## Supported Models

| Model | Speed | Quality | `aspect_ratio` | `image_size` |
|-------|-------|---------|----------------|--------------|
| `gemini-2.5-flash-image` | Fast | Good | ✅ Supported | ❌ Not supported (fixed 1024×1024) |
| `gemini-3-pro-image-preview` | Slower | High | ✅ Supported | ✅ Supported (1K/2K/4K) |

> Recommend: 3-pro

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `genimage-inserter` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Configuration

### Plugin Settings

| Setting | Description | Required |
|---------|-------------|:--------:|
| `.env` file path | Path to your `.env` file (must be **outside** your vault for security). Supports `~` for home directory (e.g., `~/.config/secrets/.env`) | ✓ |
| Prompt directory | Directory containing your prompt `.md` files (relative to vault root) | ✓ |
| Image output directory | Directory where generated images will be saved (relative to vault root, empty = vault root) | |
| Notification delay | Seconds before showing "Generating..." notification (0 = immediate) | |

### `.env` File Format

Create a `.env` file **outside your vault** with the following content:

```ini
LLM_PROVIDER=gemini #LLM Provider is currently fixed to GEMINI
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3-pro-image-preview

# Optional: OpenAI fallback (see "OpenAI fallback" section below)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-image-2
# OPENAI_BASE_URL=https://api.openai.com/v1

# Optional: Codex OAuth fallback (see "Codex OAuth fallback" section below)
# CODEX_ACCESS_TOKEN=...
# CODEX_ACCOUNT_ID=...
# CODEX_AUTH_FILE_PATH=~/.codex/auth.json
```

**Recommended path**: Use `~/.config/genimage-inserter/.env` to ensure cross-platform compatibility (Linux, macOS, Windows).

> ⚠️ **Security**: The `.env` file must be outside your vault to prevent accidental sync or exposure of your API key.

### OpenAI Fallback (optional)

If `OPENAI_API_KEY` is set in your `.env`, the plugin automatically retries via OpenAI's `/v1/images/generations` endpoint when the primary Gemini call fails (HTTP error, timeout, or no image returned). If OpenAI is unavailable or also fails, the plugin can then try Codex OAuth fallback when configured.

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Enables the fallback. Omit to disable. | — (disabled) |
| `OPENAI_MODEL` | OpenAI image model | `gpt-image-2` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL. Useful for proxies that expose the exact OpenAI API shape. | `https://api.openai.com/v1` |

**Aspect ratio → OpenAI `size` mapping** (gpt-image-2 only accepts these three values):

| prompt `aspect_ratio` | OpenAI `size` |
|---|---|
| `1:1` | `1024x1024` |
| `16:9`, `4:3`, `3:2`, `5:4`, `21:9` | `1536x1024` (landscape) |
| `9:16`, `2:3`, `3:4`, `4:5` | `1024x1536` (portrait) |
| any other value | `1024x1024` (with a warning in the log) |

The `image_size` prompt parameter (`1K`/`2K`/`4K`) is **ignored** when using the OpenAI fallback, because gpt-image models do not expose an equivalent control.

> Note: Azure OpenAI uses a different URL path and auth header, so it is **not supported** by this fallback even via `OPENAI_BASE_URL`. Only endpoints that mirror the official OpenAI API shape (`POST /images/generations` with bearer-token authorization) will work.

### Codex OAuth Fallback (optional)

If Gemini fails and OpenAI direct fallback is unavailable or fails, the plugin can make a final local fallback attempt using Codex/ChatGPT OAuth credentials. This path is intended as a last-resort local fallback when API-key based image generation is blocked.

Codex fallback uses the ChatGPT/Codex backend `responses` endpoint with the `image_generation` tool. It does **not** call the `codex` CLI for each generation, but it can reuse credentials created by `codex login`.

| Variable | Description | Default |
|---|---|---|
| `CODEX_ACCESS_TOKEN` | Optional Codex/ChatGPT OAuth access token. If omitted, the plugin reads `CODEX_AUTH_FILE_PATH`. | — |
| `CODEX_ACCOUNT_ID` | Optional account ID header when your Codex auth has one. | — |
| `CODEX_AUTH_FILE_PATH` | Optional auth JSON path to read when `CODEX_ACCESS_TOKEN` is omitted. | `~/.codex/auth.json` |

Codex fallback image settings are fixed:

| Setting | Value |
|---|---|
| responses model | `gpt-5.5` |
| image model | `gpt-image-2` |
| size | `2048x1152` |
| quality | `low` |
| output format | `png` |

Prompt frontmatter `aspect_ratio` and `image_size` are ignored on the Codex fallback path. This is intentional: Codex fallback is a simple rescue path, not a fully configurable provider.

> ⚠️ **Security**: Do not put Codex OAuth tokens or auth JSON files inside your vault. Prefer the default `~/.codex/auth.json` created by `codex login`, or keep any custom auth file outside synced directories. The plugin logs only non-secret failure information.

### Prompt Files

Create `.md` files in your prompt directory. Each file can optionally include YAML frontmatter to specify image generation parameters:

```markdown
---
aspect_ratio: "16:9"
image_size: "2K"
---
Your system prompt text here...

Describe what kind of images you want the AI to generate.
```

#### Available Parameters

| Parameter | Values | Default | Notes |
|-----------|--------|---------|-------|
| `aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1:1` | Works with all models |
| `image_size` | `1K`, `2K`, `4K` | `1K` | Only works with `gemini-3-pro-image-preview` |

#### Example Prompt Files

**Illustration style (`illustration.md`):**
```markdown
---
aspect_ratio: "16:9"
image_size: "2K"
---
You are an illustrator. Create a beautiful illustration based on the following text.
Use vibrant colors and warm, inviting style.
```

**Photorealistic (`realistic.md`):**
```markdown
---
aspect_ratio: "1:1"
---
Generate a photorealistic image based on the following text.
Focus on natural lighting and composition.
```

**Simple (no frontmatter, uses defaults):**
```markdown
Create an image based on the following text.
```

## Usage

1. Open a note in Obsidian
2. Right-click and select **Generate image**
3. Choose a prompt template from the modal
4. Wait for the image to be generated
5. The image is automatically saved and inserted into your note

### With Selected Text

If you select text before right-clicking:
- The selected text is sent to the AI as context
- The generated image is inserted **at the end of the selection**

### Without Selection (Entire Note)

If no text is selected:
- The entire note content is sent to the AI as context
- The generated image is inserted **at the end of the note**

> ⚠️ **Note**: The image link is inserted at the last line of the note with a single line break. If your note ends within a code block (` ``` `), fenced block, or other Markdown structure, the image link may be inserted inside that structure and displayed as plain text. In such cases, manually move the image link outside the structure.

### Output Structure

Generated images are saved in a folder named after your note:

```
{image output directory}/{note name}/{timestamp}_{note_name}.{ext}
```

Example: If your note is "My Travels" and output directory is `assets/generated`:
```
assets/generated/My Travels/20260207143052_My_Travels.png
```

### Image Link Format

Images are inserted using standard Markdown syntax for maximum compatibility:

```markdown
![](assets/generated/My%20Travels/20260207143052_My_Travels.png)
```

## Logging

Logs are saved to `.obsidian/plugins/genimage-inserter/genimage-inserter.log` for debugging purposes.

## Development

```bash
# Install dependencies
pnpm install

# Development build (watch mode)
pnpm run dev

# Production build
pnpm run build

# Run tests
pnpm run test
```

## License

0-BSD
