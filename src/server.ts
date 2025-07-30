import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import { WhatsAppService } from './services/whatsappService';
import fs from 'fs';
import axios from 'axios';

import { generateImage } from './generateImage';

dotenv.config({ path: '.env' });

const log = (message: string) => {
  fs.appendFileSync('app.log', `${new Date().toISOString()} - ${message}\n`);
  console.log(message);
};

let availableShopIds: string[] = [];

const app: Application = express();
let whatsappService: WhatsAppService;
try {
  whatsappService = new WhatsAppService();
} catch (error) {
  log(`Failed to initialize WhatsAppService: ${(error as Error).message}`);
  process.exit(1);
}
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const dillyApiBaseUrl = 'https://query-processor-937194857721.europe-west1.run.app';

const fetchShopIds = async () => {
  try {
    const response = await axios.get(`${dillyApiBaseUrl}/get_shops`);
    log(`Fetched shop IDs: ${JSON.stringify(response.data)}`);
    if (Array.isArray(response.data)) {
      availableShopIds = response.data.map((item: any) => item.customerId);
    } else {
      log('Unexpected shop IDs format, using empty list');
      availableShopIds = [];
    }
  } catch (error) {
    log(`Error fetching shop IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    availableShopIds = [];
  }
};

app.use('/output', express.static('output'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  log(`Webhook GET: mode=${mode}, token=${token}, challenge=${challenge}`);
  if (mode === 'subscribe' && token === verifyToken) {
    log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    log('Webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

app.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body: any = req.body;
    res.status(200).send('OK');
    log(`Received webhook: ${JSON.stringify(body)}`);
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            if (change.value.messages) {
              for (const message of change.value.messages) {
                if (message.type === 'text') {
                  const phoneNumber = message.from;
                  const messageText = message.text?.body?.toLowerCase().trim() || '';
                  log(`Received message from ${phoneNumber}: "${messageText}"`);
                  log(`Debug condition: ${messageText}, startsWith: ${messageText.startsWith('compare ca')}`);
                  if (messageText === 'get table' || messageText.startsWith('compare ca')) {
                    log('Triggering Dilly API for query processing...');
                    try {
                      if (availableShopIds.length === 0) {
                        await fetchShopIds();
                      }
                      let shopId = availableShopIds.includes('dlabparism6BFF685A') ? 'dlabparism6BFF685A' : availableShopIds[0] || 'default_shop';
                      let prompt = 'compare CA janvier 2024 et 2025';

                      if (messageText.startsWith('compare ca') && messageText.includes('for')) {
                        const parts = messageText.split('for');
                        if (parts.length > 1) {
                          const potentialShopId = parts[1].trim();
                          if (availableShopIds.includes(potentialShopId)) {
                            shopId = potentialShopId;
                            prompt = parts[0].trim();
                          } else {
                            log(`Invalid shop ID: ${potentialShopId}, using default ${shopId}`);
                          }
                        }
                      } else if (messageText.startsWith('compare ca')) {
                        prompt = messageText;
                      }

                      log(`Using prompt: ${prompt}, shop_id: ${shopId}`);
                      const dillyResponse = await axios.post(`${dillyApiBaseUrl}/process_query`, {
                        prompt: prompt,
                        shop_id: shopId
                      });
                      log(`Dilly API response: ${JSON.stringify(dillyResponse.data)}`);
                      const data = {
                        columns: dillyResponse.data.columns || [],
                        rows: dillyResponse.data.rows || []
                      };
                      const outputPath = await generateImage(data, 'png');
                      log(`Image path before send: ${outputPath}`);
                      const ngrokUrl = 'https://bfa9ca8ae10c.ngrok-free.app';
                      const imageUrl = `${ngrokUrl}/output/output.png`;
                      log(`Sending image to WhatsApp with URL: ${imageUrl}`);
                      await whatsappService.sendImage(phoneNumber, imageUrl);
                    } catch (error) {
                      log(`Error with Dilly API or Puppeteer: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      if (error instanceof Error && 'response' in error && error.response) {
                        log(`Dilly API error details: ${JSON.stringify((error as any).response.data)}`);
                      }
                      await whatsappService.sendMessage(phoneNumber, 'Failed to fetch or generate table');
                    }
                  } else {
                    await whatsappService.sendMessage(phoneNumber, `Echo: ${messageText}`);
                  }
                }
              }
            } else if (change.value.statuses) {
              for (const status of change.value.statuses) {
                log(`Received status update: ${status.status} for message ${status.id} to ${status.recipient_id}`);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    log(`Error handling webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

app.get('/health', (req: Request, res: Response) => {
  log('Health check accessed');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
fetchShopIds().then(() => {
  app.listen(PORT, () => {
    log(`Server running on http://localhost:${PORT}`);
    log(`Webhook URL: http://localhost:${PORT}/webhook`);
  });
});