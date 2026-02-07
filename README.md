# GenImage Inserter

An Obsidian plugin that generates images from your note text using Gemini AI and inserts them directly into your notes.

## Demo
- Easy to use! (Not so first as it is though😇)  
![Demo](genimage-inserter.gif)

## Features

- 🎨 Generate images from selected text or entire note content using Gemini AI
- 📝 Multiple prompt templates with customizable aspect ratio and image quality
- 🖱️ Right-click context menu integration
- 📁 Images saved to configurable directory within your vault (organized by note name)
- 📋 Detailed logging for troubleshooting

## Supported Models

| Model | Speed | Quality | `aspect_ratio` | `image_size` |
|-------|-------|---------|----------------|--------------|
| `gemini-2.5-flash-image` | Fast | Good | ✅ Supported | ❌ Not supported (fixed 1024×1024) |
| `gemini-3-pro-image-preview` | Slower | High | ✅ Supported | ✅ Supported (1K/2K/4K) |

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
| `.env` file path | Absolute path to your `.env` file (must be **outside** your vault for security) | ✓ |
| Prompt directory | Directory containing your prompt `.md` files (relative to vault root) | ✓ |
| Image output directory | Directory where generated images will be saved (relative to vault root, empty = vault root) | |
| Notification delay | Seconds before showing "Generating..." notification (0 = immediate) | |

### `.env` File Format

Create a `.env` file **outside your vault** with the following content:

```ini
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash-image
```

> ⚠️ **Security**: The `.env` file must be outside your vault to prevent accidental sync or exposure of your API key.

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

> ⚠️ API keys are never written to logs.

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
