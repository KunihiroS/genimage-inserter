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
# CODEX_FALLBACK_ENABLED=true
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
| `OPENAI_MODEL` | OpenAI image model. Only `gpt-image-2` is supported by this fallback. | `gpt-image-2` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL. Useful for proxies that expose the exact OpenAI API shape. | `https://api.openai.com/v1` |

Only `gpt-image-2` is supported by the OpenAI fallback. Do not set `OPENAI_MODEL` to `gpt-image-1`, `gpt-image-1.5`, `gpt-image-1-mini`, `dall-e-2`, or `dall-e-3`; those models have different size or response contracts.

**Aspect ratio → OpenAI `size` mapping** (gpt-image-2 supports custom dimensions; sizes preserve the requested ratio using dimensions divisible by 16):

| prompt `aspect_ratio` | OpenAI `size` |
|---|---|
| `1:1` | `1024x1024` |
| `16:9` | `1536x864` |
| `4:3` | `1408x1056` |
| `3:2` | `1536x1024` |
| `5:4` | `1280x1024` |
| `21:9` | `2016x864` |
| `9:16` | `864x1536` |
| `2:3` | `1024x1536` |
| `3:4` | `1056x1408` |
| `4:5` | `1024x1280` |
| any other value | `1024x1024` (with a warning in the log) |

The `image_size` prompt parameter (`1K`/`2K`/`4K`) is currently **ignored** when using the OpenAI fallback; the fallback chooses a conservative size from `aspect_ratio` only.

> Note: Azure OpenAI uses a different URL path and auth header, so it is **not supported** by this fallback even via `OPENAI_BASE_URL`. Only endpoints that mirror the official OpenAI API shape (`POST /images/generations` with bearer-token authorization) will work.

### Codex OAuth Fallback (optional)

If Gemini fails and OpenAI direct fallback is unavailable or fails, the plugin can make a final local fallback attempt using Codex/ChatGPT OAuth credentials. This path is intended as a last-resort local fallback when API-key based image generation is blocked.

Codex fallback uses the ChatGPT/Codex backend `responses` endpoint with the `image_generation` tool. It does **not** call the `codex` CLI for each generation, but it can reuse credentials created by `codex login`.

| Variable | Description | Default |
|---|---|---|
| `CODEX_FALLBACK_ENABLED` | Explicitly enables Codex auth-file fallback. Required when relying on the default `~/.codex/auth.json` path. | `false` |
| `CODEX_ACCESS_TOKEN` | Optional Codex/ChatGPT OAuth access token. Setting this also explicitly enables Codex fallback. | — |
| `CODEX_ACCOUNT_ID` | Optional account ID header when your Codex auth has one. | — |
| `CODEX_AUTH_FILE_PATH` | Optional auth JSON path to read when `CODEX_ACCESS_TOKEN` is omitted. Setting this also explicitly enables Codex fallback. | `~/.codex/auth.json` |

The default `~/.codex/auth.json` file is **not** auto-discovered unless `CODEX_FALLBACK_ENABLED=true` is set. This explicit opt-in prevents selected vault text from being sent to ChatGPT/Codex merely because the user happens to be logged in with Codex.

If auth-file fallback returns HTTP 401, refresh the local Codex session with `codex login` or set `CODEX_ACCESS_TOKEN` to a fresh token. The plugin does not refresh Codex OAuth tokens itself.

Codex fallback request settings are fixed:

| Setting | Value |
|---|---|
| responses model | `gpt-5.5` |
| image model | `gpt-image-2` |
| size | `2048x1152` |
| quality | `low` |
| output format | `png` |

The `size` value is a request setting sent to the private ChatGPT/Codex backend, not a guaranteed output dimension. The backend usually returns the requested shape, but it may return a different actual PNG size such as `864x1821`. The plugin reads the generated PNG dimensions and writes both the requested size and actual size to the debug log. A size mismatch is logged as a warning and does not fail generation.

Prompt frontmatter `image_size` is ignored on the Codex fallback path. Prompt frontmatter `aspect_ratio` is not used to change the fixed request `size`, but it is added to the user prompt as a natural-language orientation hint such as `16:9 landscape / horizontal` or `4:5 portrait / vertical`. This keeps Codex fallback simple while still steering the model toward the selected prompt orientation.

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
