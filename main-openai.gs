// LINE Bot + Google Calendar 整合系統 - OpenAI 語意解析版本
// 使用 OpenAI GPT 進行智能事件解析

const LINE_CHANNEL_ACCESS_TOKEN = '1BShF253TlEEDx0cFbpGd6X8HW2Qxt1FtPtWJ+TxvRpUb9WphrBG+Qtw4facJ9NmlPzUkC2WrlY6TrzF+8VDMGs3Ot7VHC81qDXmghrj4wIfobRkcFI2VvkqHrV2nHpzpG3hfaAp7T+VVf5EXN8GTgdB04t89/1O/w1cDnyilFU=';
const LINE_CHANNEL_SECRET = '38d85eb5b2bb9c4b3b8aac3b5ce2e7d1';
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';
const TARGET_USER_ID = 'Ue8b41f9481501dc653aca30f9bb2b807';

function doGet() {
  return HtmlService.createHtmlOutput('LINE Bot Calendar Integration - OpenAI Version')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 緊急安全開關
const EMERGENCY_STOP = false;

// 防重複處理機制
function isMessageProcessed(messageId) {
  const properties = PropertiesService.getScriptProperties();
  const processedMessages = properties.getProperty('processed_messages');
  if (!processedMessages) return false;
  
  const messageList = JSON.parse(processedMessages);
  return messageList.includes(messageId);
}

function markMessageProcessed(messageId) {
  const properties = PropertiesService.getScriptProperties();
  let processedMessages = properties.getProperty('processed_messages');
  
  if (!processedMessages) {
    processedMessages = '[]';
  }
  
  const messageList = JSON.parse(processedMessages);
  if (!messageList.includes(messageId)) {
    messageList.push(messageId);
    
    if (messageList.length > 100) {
      messageList.splice(0, messageList.length - 100);
    }
    
    properties.setProperty('processed_messages', JSON.stringify(messageList));
  }
}

async function doPost(e) {
  if (EMERGENCY_STOP) {
    console.log('🚨 緊急停止模式啟用');
    return HtmlService.createHtmlOutput('EMERGENCY_STOP').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  console.log('=== OpenAI 版本 Webhook 開始 ===');
  console.log('時間戳:', new Date().toLocaleString('zh-TW'));
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      console.log('❌ 無 POST 資料');
      return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const data = JSON.parse(e.postData.contents);
    console.log('📨 收到事件數量:', data.events ? data.events.length : 0);

    for (const event of data.events || []) {
      if (event.type === 'message' && 
          event.source?.userId === TARGET_USER_ID && 
          (event.message.type === 'text' || event.message.type === 'audio')) {
        
        console.log('✅ 符合處理條件');
        
        const messageId = event.message.id;
        if (isMessageProcessed(messageId)) {
          console.log('⚠️ 訊息已處理過，跳過:', messageId);
          continue;
        }
        
        markMessageProcessed(messageId);
        
        if (!event.replyToken) {
          console.error('❌ replyToken 為 undefined');
          continue;
        }
        
        try {
          console.log('🤖 開始 OpenAI 事件解析');
          await processMessageWithOpenAI(event);
          console.log('✅ OpenAI 處理完成');
        } catch (processError) {
          console.error('🚨 OpenAI 處理錯誤:', processError);
          sendReply(event.replyToken, `❌ 處理錯誤: ${processError.message}`);
        }
        break;
      }
    }

  } catch (error) {
    console.error('🚨 doPost 錯誤:', error);
  }
  
  return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// OpenAI 事件解析主函數
async function processMessageWithOpenAI(event) {
  console.log('🤖 開始 OpenAI 語意解析');
  
  let messageText = '';
  
  if (event.message.type === 'text') {
    messageText = event.message.text;
  } else if (event.message.type === 'audio') {
    console.log('🎵 語音訊息，開始轉換...');
    messageText = await convertAudioToText(event.message.id);
    if (!messageText || messageText.trim().length === 0) {
      sendReply(event.replyToken, '❌ 語音轉換失敗，請重新傳送');
      return;
    }
  }
  
  console.log('📝 處理訊息:', messageText);
  
  try {
    // 使用 OpenAI 解析事件
    const eventData = await parseEventWithOpenAI(messageText);
    console.log('🔍 OpenAI 解析結果:', eventData);
    
    if (!eventData.isEvent) {
      sendReply(event.replyToken, `收到您的訊息：${messageText}`);
      return;
    }
    
    // 建立行事曆事件
    const success = await createCalendarEventFromOpenAI(eventData);
    
    if (success) {
      const reply = formatEventReply(eventData);
      sendReply(event.replyToken, reply);
    } else {
      sendReply(event.replyToken, '❌ 建立行事曆事件失敗');
    }
    
  } catch (error) {
    console.error('🚨 OpenAI 解析錯誤:', error);
    sendReply(event.replyToken, `❌ 解析錯誤: ${error.message}`);
  }
}

// OpenAI 事件解析函數
async function parseEventWithOpenAI(messageText) {
  console.log('🤖 呼叫 OpenAI API 解析事件');
  
  const prompt = `分析這個中文訊息，提取行事曆事件資訊：「${messageText}」

當前時間：${new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}
今天是：${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}（星期${['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]}）

請回覆一個 JSON 物件，格式如下：

{
  "isEvent": true,
  "summary": "簡潔的事件名稱",
  "description": "原始訊息內容",
  "location": "地點",
  "start": {
    "dateTime": "2025-09-02T17:00:00",
    "timeZone": "Asia/Taipei"
  },
  "end": {
    "dateTime": "2025-09-02T18:00:00",
    "timeZone": "Asia/Taipei"
  },
  "eventType": "default",
  "repeat": {
    "isRepeating": true,
    "frequency": "daily",
    "endDate": "2025-09-08",
    "description": "每天，至 2025/9/8"
  },
  "reminders": {
    "useDefault": true
  }
}

重要解析規則：
1. summary: 提取核心事件名稱（如「吃飯」）
2. location: 提取地點資訊
3. 時間格式：ISO 8601，時區 Asia/Taipei
4. repeat 物件：
   - isRepeating: 是否重複事件
   - frequency: "daily"/"weekly"/"monthly" 或 null
   - endDate: 重複結束日期（YYYY-MM-DD），如果是「這週」就到本週日
   - description: 給用戶看的重複說明
5. 日期理解：
   - 根據今天的星期幾，正確理解相對日期
   - "今天"、"本週X" 要對應到正確的日期
   - "這週從今天開始，每天" = frequency:"daily", endDate:"本週日"
   - "每週二" = frequency:"weekly", endDate:null（預設3個月）
   - "晚上八點" = 20:00:00（使用24小時制）
   - 讓 AI 根據當前日期動態判斷所有相對時間
6. 只回覆 JSON，不要其他內容`;

  const response = await UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      model: 'gpt-3.5-turbo-1106',
      messages: [
        {
          role: 'system', 
          content: '你是專業的行事曆事件解析助手。請直接判斷重複模式和結束時間，不需要複雜的 RRULE。例如「這週從今天開始，每天」= frequency:"daily", endDate:"本週日"。讓你來決定所有重複邏輯，我只負責執行。只回覆純 JSON。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" }
    }),
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    const errorText = response.getContentText();
    console.error('OpenAI API 詳細錯誤:', errorText);
    throw new Error(`OpenAI API 錯誤 ${response.getResponseCode()}: ${errorText}`);
  }
  
  const result = JSON.parse(response.getContentText());
  const content = result.choices[0].message.content.trim();
  
  console.log('🤖 OpenAI 回應內容:', content);
  
  // 清理並解析 JSON
  try {
    // 移除可能的 markdown 代碼塊標記
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // 嘗試找到 JSON 物件的開始和結束
    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
    }
    
    console.log('🔧 清理後的內容:', cleanContent);
    
    const eventData = JSON.parse(cleanContent);
    return eventData;
  } catch (parseError) {
    console.error('❌ JSON 解析錯誤:', parseError);
    console.log('🔍 原始內容:', content);
    console.log('🔍 清理後內容:', cleanContent || 'undefined');
    
    // 嘗試修復常見的 JSON 錯誤
    try {
      let fixedContent = content.trim();
      
      // 移除額外的文字，只保留 JSON 部分
      const jsonMatch = fixedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        fixedContent = jsonMatch[0];
        console.log('🔧 使用正規表達式提取的 JSON:', fixedContent);
        const eventData = JSON.parse(fixedContent);
        return eventData;
      }
    } catch (fixError) {
      console.error('❌ JSON 修復嘗試也失敗:', fixError);
    }
    
    throw new Error(`OpenAI 回應格式錯誤: ${parseError.message}`);
  }
}

// 根據 OpenAI 解析結果建立行事曆事件
async function createCalendarEventFromOpenAI(eventData) {
  try {
    console.log('📅 建立 Google Calendar 事件');
    
    const calendar = CalendarApp.getDefaultCalendar();
    
    // 解析時間
    const startDate = new Date(eventData.start.dateTime);
    const endDate = new Date(eventData.end.dateTime);
    
    console.log('📅 事件時間:', startDate.toLocaleString('zh-TW'), '-', endDate.toLocaleString('zh-TW'));
    
    let event;
    
    // 處理重複事件 - 簡化邏輯，讓 AI 決定一切
    if (eventData.repeat && eventData.repeat.isRepeating) {
      try {
        console.log('🔄 處理重複事件:', eventData.repeat);
        
        let recurrence;
        
        // 根據 AI 的判斷建立重複規則
        switch (eventData.repeat.frequency) {
          case 'daily':
            recurrence = CalendarApp.newRecurrence().addDailyRule();
            break;
          case 'weekly':
            recurrence = CalendarApp.newRecurrence().addWeeklyRule();
            break;
          case 'monthly':
            recurrence = CalendarApp.newRecurrence().addMonthlyRule();
            break;
          default:
            throw new Error('未知的重複頻率: ' + eventData.repeat.frequency);
        }
        
        // 設定結束條件
        if (eventData.repeat.endDate) {
          // 有明確結束日期
          const endDate = new Date(eventData.repeat.endDate + 'T23:59:59');
          recurrence = recurrence.until(endDate);
          console.log('📅 設定重複至:', endDate.toLocaleString('zh-TW'));
        } else {
          // 預設3個月（12次）
          recurrence = recurrence.times(12);
          console.log('📅 設定重複12次（預設3個月）');
        }
        
        // 建立重複事件系列
        const eventSeries = calendar.createEventSeries(
          eventData.summary,
          startDate,
          endDate,
          recurrence,
          {
            description: eventData.description || '',
            location: eventData.location || ''
          }
        );
        console.log('✅ 重複事件系列建立成功:', eventSeries.getId());
        return true;
        
      } catch (recError) {
        console.log('⚠️ 重複事件處理失敗，建立單次事件:', recError);
      }
    }
    
    // 建立單次事件
    event = calendar.createEvent(
      eventData.summary,
      startDate,
      endDate,
      {
        description: eventData.description || '',
        location: eventData.location || ''
      }
    );
    
    console.log('✅ 單次事件建立成功:', event.getId());
    
    return true;
    
  } catch (error) {
    console.error('🚨 建立行事曆事件錯誤:', error);
    return false;
  }
}

// 格式化事件回覆
function formatEventReply(eventData) {
  const startDate = new Date(eventData.start.dateTime);
  const endDate = new Date(eventData.end.dateTime);
  
  let reply = `✅ 已建立行事曆事件：\n📅 ${eventData.summary}\n🕐 ${startDate.toLocaleString('zh-TW')}`;
  
  if (startDate.getTime() !== endDate.getTime()) {
    reply += ` - ${endDate.toLocaleString('zh-TW')}`;
  }
  
  if (eventData.location) {
    reply += `\n📍 ${eventData.location}`;
  }
  
  if (eventData.repeat && eventData.repeat.isRepeating) {
    // 直接使用 AI 提供的描述
    reply += `\n🔄 重複事件（${eventData.repeat.description}）`;
  }
  
  return reply;
}

// LINE 回覆函數
function sendReply(replyToken, message) {
  try {
    console.log('📤 發送 LINE 回覆:', message);
    
    if (!replyToken || !message) {
      console.error('❌ replyToken 或 message 無效');
      return false;
    }
    
    const url = 'https://api.line.me/v2/bot/message/reply';
    const payload = {
      replyToken: replyToken,
      messages: [{
        type: 'text',
        text: message
      }]
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode === 200) {
      console.log('✅ LINE 回覆成功');
      return true;
    } else {
      console.error('❌ LINE 回覆失敗:', statusCode, response.getContentText());
      return false;
    }
  } catch (error) {
    console.error('🚨 發送回覆錯誤:', error);
    return false;
  }
}

// 語音轉文字（Whisper API）
async function convertAudioToText(messageId) {
  try {
    console.log('🎵 開始語音轉文字:', messageId);
    
    // 下載音訊檔案
    const audioData = downloadLineAudio(messageId);
    if (!audioData) {
      throw new Error('無法下載音訊檔案');
    }
    
    // 使用 Whisper API 轉換
    const transcription = await transcribeWithWhisper(audioData);
    
    console.log('✅ 語音轉文字完成:', transcription);
    return transcription;
    
  } catch (error) {
    console.error('🚨 語音轉文字錯誤:', error);
    return null;
  }
}

function downloadLineAudio(messageId) {
  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    
    if (response.getResponseCode() === 200) {
      return response.getBlob();
    } else {
      throw new Error(`下載失敗: ${response.getResponseCode()}`);
    }
  } catch (error) {
    console.error('下載音訊失敗:', error);
    return null;
  }
}

async function transcribeWithWhisper(audioBlob) {
  try {
    const formData = {
      'model': 'whisper-1',
      'file': audioBlob,
      'language': 'zh'
    };
    
    const response = await UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      payload: formData
    });
    
    if (response.getResponseCode() === 200) {
      const result = JSON.parse(response.getContentText());
      return result.text;
    } else {
      throw new Error(`Whisper API 錯誤: ${response.getResponseCode()}`);
    }
  } catch (error) {
    console.error('Whisper 轉換錯誤:', error);
    return null;
  }
}

// 測試 OpenAI API Key
async function testOpenAIConnection() {
  try {
    const response = await UrlFetchApp.fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    console.log('API Key 測試結果:', response.getResponseCode());
    console.log('回應內容:', response.getContentText());
    
    return response.getResponseCode() === 200;
  } catch (error) {
    console.error('API Key 測試錯誤:', error);
    return false;
  }
}

// 測試函數
function testOpenAIParsing() {
  const testMessage = '這週從今天開始，每天的下午五點都要在家裡吃飯';
  
  console.log('=== 測試訊息:', testMessage, '===');
  parseEventWithOpenAI(testMessage).then(result => {
    console.log('✅ 解析成功:', JSON.stringify(result, null, 2));
    
    // 測試建立事件
    createCalendarEventFromOpenAI(result).then(success => {
      if (success) {
        console.log('✅ 事件建立成功');
      } else {
        console.log('❌ 事件建立失敗');
      }
    });
  }).catch(error => {
    console.error('❌ 測試錯誤:', error);
  });
}

function testAllMessages() {
  const testMessages = [
    '明天晚上7點瑜伽',
    '每週二下午3點開會', 
    '9/5下午2點會議',
    'εει下週五中午12點與客戶聚餐'
  ];
  
  for (const msg of testMessages) {
    console.log('\n=== 測試訊息:', msg, '===');
    parseEventWithOpenAI(msg).then(result => {
      console.log('解析結果:', JSON.stringify(result, null, 2));
    }).catch(error => {
      console.error('測試錯誤:', error);
    });
  }
}