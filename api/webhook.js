const line = require('@line/bot-sdk');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

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

    try {
      const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
      
      // ดึงรายชื่อโมเดลทั้งหมดที่ API Key ตัวนี้ใช้งานได้
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const listData = await listRes.json();

      let replyMsg = '';
      if (listData.models) {
        const supported = listData.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        replyMsg = `โมเดลที่ใช้งานได้:\n` + supported.slice(0, 5).join('\n');
      } else {
        replyMsg = `Error: ${JSON.stringify(listData)}`;
      }

      return await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyMsg }]
      });

    } catch (err) {
      return await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `Debug Error: ${err.message}` }]
      });
    }
  }));

  res.status(200).json({ status: 'success' });
};
