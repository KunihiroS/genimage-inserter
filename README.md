# GenImage Inserter

An Obsidian plugin that generates images from your note text using Gemini AI and inserts them directly into your notes.

## Features

- Generate images from selected text or entire note content
- Multiple prompt templates with customizable aspect ratio and image quality
- Right-click context menu integration
- Images saved to configurable directory within your vault

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `genimage-inserter` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Configuration

### Required Settings

1. **`.env` file path**: Absolute path to your `.env` file (must be outside your vault for security)
2. **Prompt directory**: Directory containing your prompt `.md` files (relative to vault root)
3. **Image output directory**: Directory where generated images will be saved (relative to vault root)

### `.env` File Format

Create a `.env` file outside your vault with the following content:

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash-image
```

### Prompt Files

Create `.md` files in your prompt directory. Each file can optionally include YAML frontmatter to specify image generation parameters:

```markdown
---
aspect_ratio: "16:9"
image_size: "2K"
---
Your system prompt text here...
```

**Available options:**
- `aspect_ratio`: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` (default: `1:1`)
- `image_size`: `1K`, `2K`, `4K` (default: `1K`)

## Usage

1. Select text in your note (or leave unselected to use entire note)
2. Right-click and select **Generate image**
3. Choose a prompt template from the modal
4. Wait for the image to be generated and inserted

## Development

```bash
# Install dependencies
pnpm install

# Development build (watch mode)
pnpm run dev

# Production build
pnpm run build
```

## License

0-BSD
