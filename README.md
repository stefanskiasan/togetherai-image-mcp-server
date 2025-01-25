# Together AI Image Server

An MCP server for generating images using Together AI's image generation models.

<a href="https://glama.ai/mcp/servers/2cwphjnpgw"><img width="380" height="200" src="https://glama.ai/mcp/servers/2cwphjnpgw/badge" alt="Together AI Image Server MCP server" /></a>

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the server:
```bash
npm run build
```

## Configuration

### 1. Together AI API Key

The server requires a Together AI API key. You can get one from [Together AI's platform](https://api.together.xyz/).

### 2. Cline Configuration

Add the server to your Cline MCP settings file:

For macOS/Linux: `~/Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "togetherai-image": {
      "command": "node",
      "args": ["/path/to/togetherai-image-server/build/index.js"],
      "env": {
        "TOGETHER_API_KEY": "your-api-key-here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Usage in Cline

The server provides a `generate_image` tool with the following parameters:

```typescript
{
  prompt: string;           // Required: Text description of the image to generate
  model?: string;          // Optional: Model to use (default: 'black-forest-labs/FLUX.1.1-pro')
  width?: number;          // Optional: Image width in pixels (default: 1024)
  height?: number;         // Optional: Image height in pixels (default: 768)
  steps?: number;         // Optional: Number of inference steps (default: 28)
  n?: number;             // Optional: Number of images to generate (default: 1)
  outputDir?: string;     // Optional: Directory where images will be saved (default: './output')
}
```

### Example Usage

You can use the server in Cline like this:

```
Generate an image of a cat and save it to my desktop:

<use_mcp_tool>
<server_name>togeherai-image</server_name>
<tool_name>generate_image</tool_name>
<arguments>
{
  "prompt": "A cute cat sitting on a windowsill",
  "outputDir": "/Users/username/Desktop/generated-images"
}
</arguments>
</use_mcp_tool>
```

### Output

The tool returns a JSON response containing:
- `filepath`: Full path to the saved image
- `filename`: Name of the saved image file
- `dimensions`: Original and final dimensions of the image

## Features

- Supports Together AI's latest FLUX.1.1-pro model
- Automatically resizes images if dimensions are below 256 pixels
- Maintains aspect ratio during resizing
- High-quality JPEG output (90% quality)
- Creates output directories recursively
- Returns detailed metadata including image dimensions
