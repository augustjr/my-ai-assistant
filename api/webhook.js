const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const lineClient = new line.messagingApi.MessagingApiClient(lineConfig);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook Ready');
  }

  const events = req.body.events;
  if (!events || events.length === 0) {
    return res.status(200).send('OK');
  }

  await Promise.all(events.map(async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userQuestion = event.message.text.trim();

    // ค้นหาข้อมูลบทความจาก Supabase
    const { data: articles } = await supabase
      .from('articles')
      .select('title, content, category, image_url')
      .limit(3);

    let contextText = "ไม่พบบทความในระบบ";
    let imageUrl = null;

    if (articles && articles.length > 0) {
      contextText = articles.map(a => 
        `หัวข้อ: ${a.title}\nหมวดหมู่: ${a.category}\nเนื้อหา: ${a.content}\nลิงก์รูปภาพ: ${a.image_url || '-'}`
      ).join('\n---\n');

      if (articles[0].image_url && articles[0].image_url.startsWith('http')) {
        imageUrl = articles[0].image_url;
      }
    }

    // ส่งคำถามและ Context เข้า Google Gemini API
    const prompt = `[ข้อมูลบทความจาก Supabase]:\n${contextText}\n\n-------------------------\nคำถามของผู้ใช้งาน: ${userQuestion}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'คุณคือผู้ช่วยตอบคำถามจากฐานข้อมูล Supabase ตอบกระชับ สุภาพ ไม่แต่งข้อมูลเอง หากไม่มีข้อมูลให้ตอบว่าไม่พบข้อมูลในระบบ',
        temperature: 0.2
      }
    });

    const replyMessages = [{ type: 'text', text: response.text }];

    // แนบรูปภาพหากมี
    if (imageUrl && (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.png'))) {
      replyMessages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
    }

    return lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: replyMessages
    });
  }));

  res.status(200).json({ status: 'success' });
};
