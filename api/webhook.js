const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    // ดึงข้อมูลจาก Supabase
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

    // เรียก Gemini Model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "คุณคือผู้ช่วยค้นหาบทความ ตอบคำถามจากข้อมูลบทความที่ได้รับเท่านั้น สุภาพ กระชับ ไม่แต่งข้อมูลเอง หากไม่มีข้อมูลให้ตอบว่าไม่พบข้อมูลในระบบ"
    });

    const prompt = `[ข้อมูลบทความจาก Supabase]:\n${contextText}\n\n-------------------------\nคำถามของผู้ใช้งาน: ${userQuestion}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiReplyText = response.text();

    const replyMessages = [{ type: 'text', text: aiReplyText }];

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
