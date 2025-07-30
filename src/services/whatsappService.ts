import axios, { AxiosInstance } from 'axios';
import fs from 'fs';

export class WhatsAppService {
  private client: AxiosInstance;

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
      const error = `Missing or invalid WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID: token=${accessToken?.substring(0, 10)}..., phoneId=${phoneNumberId}`;
      fs.appendFileSync('app.log', `${new Date().toISOString()} - ${error}\n`);
      throw new Error(error);
    }
    fs.appendFileSync('app.log', `${new Date().toISOString()} - Initialized with accessToken: ${accessToken.substring(0, 10)}... and phoneNumberId: ${phoneNumberId}\n`);
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/v22.0/${phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendMessage(to: string, message?: string, template?: { name: string; language: { code: string } }) {
    try {
      const payload: any = {
        messaging_product: 'whatsapp',
        to,
      };
      if (message) {
        payload.type = 'text';
        payload.text = { body: message };
      } else if (template) {
        payload.type = 'template';
        payload.template = template;
      }
      const response = await this.client.post('/messages', payload);
      fs.appendFileSync('app.log', `${new Date().toISOString()} - Message sent to ${to}: SID ${response.data.messages[0]?.id}\n`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response
        ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`
        : error.message;
      fs.appendFileSync('app.log', `${new Date().toISOString()} - Error sending WhatsApp message: ${errorMessage}\n`);
      throw error;
    }
  }

  async sendImage(to: string, imageUrl: string) {
    try {
      fs.appendFileSync('app.log', `${new Date().toISOString()} - Attempting to send image from ${imageUrl}`);
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: imageUrl },
      };
      const response = await this.client.post('/messages', payload);
      fs.appendFileSync('app.log', `${new Date().toISOString()} - Image sent to ${to}: SID ${response.data.messages[0]?.id}\n`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response
        ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`
        : error.message;
      fs.appendFileSync('app.log', `${new Date().toISOString()} - Error sending WhatsApp image: ${errorMessage}\n`);
      throw error;
    }
  }
}