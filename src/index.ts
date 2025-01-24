#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import Together from 'together-ai';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const API_KEY = process.env.TOGETHER_API_KEY;
if (!API_KEY) {
  throw new Error('TOGETHER_API_KEY environment variable is required');
}

interface GenerateImageArgs {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  n?: number;
  outputDir?: string;
  format?: 'png' | 'jpg' | 'svg';
}

const isValidGenerateImageArgs = (args: any): args is GenerateImageArgs => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.prompt === 'string' &&
    (args.model === undefined || typeof args.model === 'string') &&
    (args.width === undefined || typeof args.width === 'number') &&
    (args.height === undefined || typeof args.height === 'number') &&
    (args.steps === undefined || typeof args.steps === 'number') &&
    (args.n === undefined || typeof args.n === 'number') &&
    (args.outputDir === undefined || typeof args.outputDir === 'string') &&
    (args.format === undefined || ['png', 'jpg', 'svg'].includes(args.format))
  );
};

class TogetherAIImageServer {
  private server: Server;
  private together: Together;

  constructor() {
    this.server = new Server(
      {
        name: 'togetherai-image-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.together = new Together({ apiKey: API_KEY });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_image',
          description: 'Generate an image using Together AI',
          uiSchema: {
            format: {
              "ui:widget": "select",
              "ui:options": {
                label: "Image Format",
                position: "above-chat"
              }
            }
          },
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Text description of the image to generate',
              },
              model: {
                type: 'string',
                description: 'Model to use for generation',
                default: 'black-forest-labs/FLUX.1.1-pro',
              },
              width: {
                type: 'number',
                description: 'Image width in pixels',
                default: 1024,
              },
              height: {
                type: 'number',
                description: 'Image height in pixels',
                default: 768,
              },
              steps: {
                type: 'number',
                description: 'Number of inference steps',
                default: 28,
              },
              n: {
                type: 'number',
                description: 'Number of images to generate',
                default: 1,
              },
              outputDir: {
                type: 'string',
                description: 'Full absolute path where images will be saved (e.g., /Users/username/Projects/myapp/src/assets)',
                pattern: '^/',
                examples: ['/Users/asanstefanski/Private Projekte/democline/src/assets'],
              },
              format: {
                type: 'string',
                enum: ['png', 'jpg', 'svg'],
                description: 'Output format for the generated images',
                default: 'png',
              },
            },
            required: ['prompt'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'generate_image') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      if (!request.params.arguments || !isValidGenerateImageArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid generate_image arguments'
        );
      }

      try {
        const args = request.params.arguments as GenerateImageArgs;
        // Get requested dimensions
        const requestWidth = args.width || 1024;
        const requestHeight = args.height || 768;

        // Ensure dimensions are at least 256 pixels for the API request
        const apiWidth = Math.max(256, requestWidth);
        const apiHeight = Math.max(256, requestHeight);

        const response = await this.together.images.create({
          model: args.model || 'black-forest-labs/FLUX.1.1-pro',
          prompt: args.prompt,
          width: apiWidth,
          height: apiHeight,
          steps: args.steps || 28,
          n: args.n || 1,
          response_format: 'base64',
        });

        // Use provided output directory or default to 'output'
        const outputDir = args.outputDir 
          ? path.resolve(args.outputDir)
          : path.join(process.cwd(), 'output');

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Process each generated image
        const results = await Promise.all(response.data.map(async (result: any, index: number) => {
          const imageData = result.b64_json;
          let buffer = Buffer.from(imageData, 'base64');
          
          // Only resize if we need to scale down to match requested dimensions
          if (requestWidth < 256 || requestHeight < 256) {
            const metadata = await sharp(buffer).metadata();
            const originalWidth = metadata.width || 0;
            const originalHeight = metadata.height || 0;

            // Calculate target dimensions maintaining aspect ratio
            const aspectRatio = originalWidth / originalHeight;
            let targetWidth = requestWidth;
            let targetHeight = requestHeight;

            if (requestWidth < 256) {
              targetWidth = requestWidth;
              targetHeight = Math.round(requestWidth / aspectRatio);
            }
            if (requestHeight < 256) {
              targetHeight = requestHeight;
              targetWidth = Math.round(requestHeight * aspectRatio);
            }

            // Resize to match requested dimensions
            buffer = await sharp(buffer)
              .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
              })
              .toBuffer();
          }
          
          // Save image with timestamp and index
          const timestamp = new Date().getTime();
          const format = args.format || 'png';
          const filename = `image_${timestamp}_${index}.${format}`;
          const filepath = path.join(outputDir, filename);
          
          let sharpInstance = sharp(buffer);
          
          switch (format) {
            case 'png':
              await sharpInstance.png().toFile(filepath);
              break;
            case 'jpg':
              await sharpInstance.jpeg({ quality: 90 }).toFile(filepath);
              break;
            case 'svg':
              // For SVG, we'll need to trace the bitmap to create a vector
              await sharpInstance
                .png()
                .toFile(filepath.replace('.svg', '.png'));
              // Note: Actual SVG conversion would require additional processing
              // Consider using potrace or similar library for proper SVG conversion
              console.warn('SVG output is not fully supported yet');
              break;
          }
          
          return {
            ...result,
            filepath,
            filename,
            dimensions: {
              original: { width: apiWidth, height: apiHeight },
              final: await sharp(filepath).metadata().then(m => ({ 
                width: m.width, 
                height: m.height 
              }))
            }
          };
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error('Together AI API error:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Image generation failed: ${error?.message || 'Unknown error'}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Together AI Image MCP server running on stdio');
  }
}

const server = new TogetherAIImageServer();
server.run().catch(console.error);
