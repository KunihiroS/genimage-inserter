# GenImage Inserter

An Obsidian plugin that generates images from your note text and inserts them directly into your notes. With explicit opt-in, it tries Codex/ChatGPT OAuth subscription generation first, then Gemini, then optional OpenAI API fallback.

## Demo
- Easy to use! (Not so first as it is though, in case of gemini3pro image 😇)  
![Demo](genimage-inserter.gif)

## Features

- 🎨 Generate images from selected text or entire note content using Codex/ChatGPT OAuth, Gemini, or OpenAI
  - no text selection makes an entire note as context to generate.
- 📝 Multiple prompt templates with customizable aspect ratio and image quality
- 🖱️ Right-click context menu integration
- 📁 Images saved to configurable directory within your vault (organized by note name)
- 📋 Detailed logging for troubleshooting

## Models

Set any Gemini image-generation model name in `GEMINI_MODEL`. Gemini models are added and retired over time, so check the [official Gemini model list](https://ai.google.dev/gemini-api/docs/models) for currently available names.

> ⚠️ **Limitation**: The plugin decides whether to send prompt `aspect_ratio` / `image_size` from a fixed list of model names built into the code. Only the names below are recognized; newer models are not added automatically.

| `GEMINI_MODEL` contains | `aspect_ratio` | `image_size` |
|-------|----------------|--------------|
| `gemini-3-pro-image` | ✅ Applied | ✅ Applied (1K/2K/4K) |
| `gemini-2.5-flash-image` | ✅ Applied | ❌ Not applied |
| any other model | ❌ Not applied | ❌ Not applied |

For any other model, generation still works, but `aspect_ratio` and `image_size` are not sent to the API, so the model's default size and shape are used (the log shows `N/A (not supported)`). For example, newer models such as `gemini-3.1-flash-image` or `gemini-nano-banana-2.1` (as of October 2026) fall into this case. Use a `gemini-3-pro-image` model if you need `aspect_ratio` / `image_size` to take effect.

> Note: Model names elsewhere in this README (for example in `.env` samples) are examples and may be outdated.

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
LLM_PROVIDER=gemini # Retained Gemini setting; see generation order below
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3-pro-image # example; see the "Models" section

# Optional: Codex OAuth subscription first (see section below)
# Reuse an existing `codex login` session with explicit opt-in:
# CODEX_FALLBACK_ENABLED=true
# Optional: override the Codex Responses model (unset = built-in default)
# CODEX_RESPONSES_MODEL=<model-name>

# Optional: paid OpenAI API fallback after Gemini fails
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-image-2.6-sunburst
# OPENAI_BASE_URL=https://api.openai.com/v1
```

**Recommended path**: Use `~/.config/genimage-inserter/.env` to ensure cross-platform compatibility (Linux, macOS, Windows).

> ⚠️ **Security**: The `.env` file must be outside your vault to prevent accidental sync or exposure of your API key.

### Generation order and costs

Each user-initiated generation uses this order:

1. Try Codex/ChatGPT OAuth subscription generation if explicitly enabled or configured with the existing Codex auth options.
2. If Codex is disabled, has no usable auth file/token, or fails, use Gemini.
3. If Gemini fails, try OpenAI only when `OPENAI_API_KEY` is set.

Without Codex opt-in, generation starts with Gemini. A missing Codex auth file does not block Gemini. An explicit unsupported-model error stops generation for operator review; the plugin does not guess another model or use a paid fallback for that error. The log records why Codex was skipped or failed and which fallback was used, without exposing credentials or raw provider error bodies. Gemini and direct OpenAI calls may incur paid API charges even when the first attempt uses a subscription.

Generation sends your selected text (or the whole note when nothing is selected) and prompt template to the service used. A fallback can send the same text to the next configured service. This happens only when you select **Generate image** and a prompt template, not at startup or in the background. Enable only the routes you consent to use.

### Codex OAuth subscription first (optional)

Codex uses the ChatGPT/Codex backend `responses` endpoint with the `image_generation` tool. It does **not** call the `codex` CLI for each generation, but it can reuse existing credentials created by `codex login`.

**Setup**: with an existing Codex login, add `CODEX_FALLBACK_ENABLED=true` to your `.env`. The plugin then reads credentials from the default `~/.codex/auth.json`. The legacy variable name is retained for compatibility, but Codex is now attempted **before** Gemini, not as a final fallback. Existing explicit `CODEX_AUTH_FILE_PATH` or `CODEX_ACCESS_TOKEN` options also opt in; `CODEX_ACCOUNT_ID` remains available for custom credentials.

The default `~/.codex/auth.json` file is **not** auto-discovered without explicit Codex opt-in. Merely being logged in with Codex does not send vault text to ChatGPT/Codex. If the file is missing, the plugin logs the reason and continues with Gemini.

If Codex returns HTTP 401, refresh the local Codex session yourself with `codex login`. The plugin does not refresh tokens itself. No new credentials or settings are required for an existing working configuration.

`CODEX_RESPONSES_MODEL` optionally overrides the model that drives the Codex request, **not** the image model. Leave it unset to keep the built-in default. It does not enable Codex on its own.

Codex request settings (only the Responses model is configurable; `OPENAI_MODEL` affects only the direct OpenAI fallback):

| Setting | Requested value |
|---|---|
| Responses model | `CODEX_RESPONSES_MODEL` (unchanged default: `gpt-6.1-sol`) |
| image tool model (fixed request) | `gpt-image-2.6-sunburst` |
| size (fixed request) | `2048x1152` |
| quality (fixed request) | `low` |
| output format (fixed request) | `png` |

**The requested image model is not a guarantee of the model used by the subscription backend.** In the 2026-11-08 VVC observation, response tool metadata reported `model: gpt-image-2-codex`, `size: auto`, and `quality: auto`; the image output reported quality `low`. This does not prove that an internal 2.6 model generated the image. The plugin requests `gpt-image-2.6-sunburst` but does not claim that subscription generation actually uses it.

Size and quality are also requests, not guaranteed output properties. The plugin reads the generated PNG dimensions and logs both the requested and actual size. A size mismatch is a warning and does not fail generation.

Prompt frontmatter `image_size` is ignored on the Codex path. Prompt frontmatter `aspect_ratio` does not change the fixed request `size`, but is added to the user prompt as a natural-language orientation hint such as `16:9 landscape / horizontal` or `4:5 portrait / vertical`.

> ⚠️ **Security**: Keep Codex OAuth tokens and auth JSON files outside your vault and synced directories. Reuse your existing credentials; do not copy them into notes or logs. The plugin logs non-secret failure classifications for routing decisions.

### OpenAI fallback (optional)

If `OPENAI_API_KEY` is set in your `.env`, the plugin retries via OpenAI's `/v1/images/generations` endpoint after Gemini fails (HTTP error, timeout, or no image returned). OpenAI is the final fallback; it is skipped when no key is configured. This API route may incur separate charges.

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Enables the fallback. Omit to disable. | — (disabled) |
| `OPENAI_MODEL` | OpenAI image model. Supports `gpt-image-2.6-sunburst` and an explicit `gpt-image-2` override. | `gpt-image-2.6-sunburst` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL. Useful for proxies that expose the exact OpenAI API shape. | `https://api.openai.com/v1` |

The OpenAI fallback defaults to `gpt-image-2.6-sunburst`. An explicit `OPENAI_MODEL=gpt-image-2` remains unchanged; it is not automatically migrated. To use Sunburst, change only that setting to `OPENAI_MODEL=gpt-image-2.6-sunburst` or remove the `OPENAI_MODEL` line to use the new default. Keep credentials unchanged and do not share your `.env` contents. The plugin reloads the file on the next generation.

Do not set `OPENAI_MODEL` to `gpt-image-1`, `gpt-image-1.5`, `gpt-image-1-mini`, `dall-e-2`, or `dall-e-3`; those models have different size or response contracts.

**Aspect ratio → OpenAI `size` mapping** (unchanged for Sunburst and an explicit `gpt-image-2` override; sizes preserve the requested ratio using dimensions divisible by 16):

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
| `aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1:1` | Applied only to some models; see the "Models" section |
| `image_size` | `1K`, `2K`, `4K` | `1K` | Applied only to some models; see the "Models" section |

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
