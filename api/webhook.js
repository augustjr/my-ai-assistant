const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

    try {
      // 1. ดึงข้อมูลจาก Supabase
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

      // 2. เรียกผ่าน Google Cloud Gemini REST API
      const prompt = `คุณคือผู้ช่วยตอบคำถามจากฐานข้อมูล ตอบกระชับ สุภาพ\nข้อมูลอ้างอิง:\n${contextText}\n\nคำถาม: ${userQuestion}`;
      const apiKey = process.env.GEMINI_API_KEY.trim();

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const geminiData = await geminiRes.json();
      let aiReplyText = "ขออภัย ไม่สามารถประมวลผลคำตอบได้ในขณะนี้";

      if (geminiData.candidates && geminiData.candidates[0].content.parts[0].text) {
        aiReplyText = geminiData.candidates[0].content.parts[0].text;
      } else if (geminiData.error) {
        aiReplyText = `API Error: ${geminiData.error.message}`;
      }

      const replyMessages = [{ type: 'text', text: aiReplyText }];

      if (imageUrl && (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.png'))) {
        replyMessages.push({
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl
        });
      }

      return await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: replyMessages
      });

    } catch (err) {
      console.error("Error detail:", err);
      return await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `เกิดข้อผิดพลาด: ${err.message}` }]
      });
    }
  }));

  res.status(200).json({ status: 'success' });
};
