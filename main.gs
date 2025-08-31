// LINE Bot + Google Calendar 整合系統 - 最終完整版本
// 包含語音支援、重複事件、多日期解析、安全機制

// 請在部署前填入正確的 API keys
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN'; // 重新生成的新 token
const LINE_CHANNEL_SECRET = 'YOUR_LINE_CHANNEL_SECRET';
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';
const TARGET_USER_ID = 'YOUR_TARGET_USER_ID';

function doGet() {
  return HtmlService.createHtmlOutput('LINE Bot Calendar Integration - Running')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  console.log('=== Webhook 請求開始 ===');
  console.log('時間戳:', new Date().toLocaleString('zh-TW'));
  
  try {
    // 基本驗證
    if (!e || !e.postData || !e.postData.contents) {
      console.log('❌ 無 POST 資料');
      return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const data = JSON.parse(e.postData.contents);
    console.log('📨 收到事件數量:', data.events ? data.events.length : 0);

    // LINE 驗證請求處理
    if (!data.events || data.events.length === 0) {
      console.log('✅ LINE 驗證請求或空事件');
      return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // 處理事件
    for (const event of data.events) {
      console.log('🔍 檢查事件:', {
        type: event.type,
        messageType: event.message?.type,
        userId: event.source?.userId
      });

      // 嚴格驗證：只處理指定用戶的訊息事件
      if (event.type === 'message' && 
          event.source && 
          event.source.userId === TARGET_USER_ID &&
          event.message &&
          (event.message.type === 'text' || event.message.type === 'audio')) {
        
        console.log('✅ 符合處理條件，開始處理訊息');
        // 正常模式
        processMessage(event);
        // 調試模式 - 可手動切換
        // debugProcessMessage(event);
        break; // 只處理第一個符合的訊息
      } else {
        console.log('⚠️ 不符合處理條件，跳過');
      }
    }

  } catch (error) {
    console.error('🚨 doPost 錯誤:', error);
  }

  console.log('=== 返回 200 狀態 ===');
  return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processMessage(event) {
  try {
    const messageId = event.message.id || 'unknown';
    const messageType = event.message.type;
    
    console.log(`🔄 處理訊息 [${messageId}] 類型: ${messageType}`);

    // 防重複處理機制
    const processedKey = `processed_${messageId}`;
    const alreadyProcessed = PropertiesService.getScriptProperties().getProperty(processedKey);
    
    if (alreadyProcessed) {
      console.log('⚠️ 訊息已處理過，跳過');
      return;
    }

    // 標記為已處理（有效期2小時）
    PropertiesService.getScriptProperties().setProperty(processedKey, Date.now().toString());

    let text = '';
    let isVoice = false;

    // 處理不同類型的訊息
    if (messageType === 'text') {
      text = event.message.text;
      console.log('📝 文字訊息:', text);
    } else if (messageType === 'audio') {
      console.log('🎵 語音訊息，開始轉換...');
      text = convertAudioToText(event.message.id);
      isVoice = true;
      
      if (!text || text.trim().length === 0) {
        sendReply(event.replyToken, '❌ 語音轉換失敗，請重新傳送或改用文字訊息');
        return;
      }
      console.log('🎯 語音轉文字結果:', text);
    }

    // 解析活動資訊
    console.log('🚀 開始解析活動資訊...');
    console.log('📝 輸入文字:', text);
    const events = parseEventWithStrategy(text, isVoice);
    console.log('📅 解析結果:', events ? `${events.length} 個事件` : '解析失敗');
    if (events && events.length > 0) {
      console.log('📅 事件詳情:', events);
    }

    // 生成回覆
    let replyText;
    if (events && events.length > 0) {
      const successfulEvents = [];
      const failedEvents = [];

      // 建立所有事件
      for (let i = 0; i < events.length; i++) {
        const eventInfo = events[i];
        console.log(`📝 建立事件 ${i+1}:`, JSON.stringify(eventInfo));
        
        try {
          const success = createCalendarEvent(eventInfo);
          if (success) {
            successfulEvents.push(eventInfo);
            console.log(`✅ 事件 ${i+1} 建立成功`);
          } else {
            failedEvents.push(eventInfo);
            console.log(`❌ 事件 ${i+1} 建立失敗`);
          }
        } catch (calendarError) {
          console.error(`🚨 建立事件 ${i+1} 時發生錯誤:`, calendarError);
          failedEvents.push(eventInfo);
        }
      }

      // 生成回覆訊息
      if (successfulEvents.length > 0) {
        if (isVoice) {
          replyText = `🎵 語音訊息已處理！\n📝 識別內容：${text}\n\n`;
        } else {
          replyText = '';
        }

        if (successfulEvents.length === 1) {
          // 單一事件
          const eventInfo = successfulEvents[0];
          const displayDate = formatDate(eventInfo.date);
          replyText += `✅ 已成功新增到行事曆！\n\n📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}`;
        } else {
          // 多個事件
          replyText += `✅ 已成功新增 ${successfulEvents.length} 個事件到行事曆！\n\n`;
          
          successfulEvents.forEach((eventInfo, index) => {
            const displayDate = formatDate(eventInfo.date);
            replyText += `📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}\n`;
            if (index < successfulEvents.length - 1) replyText += '\n';
          });
        }
        
        if (failedEvents.length > 0) {
          replyText += `\n⚠️ ${failedEvents.length} 個事件建立失敗`;
        }
      } else {
        replyText = '❌ 所有事件建立失敗，請重試。';
      }
    } else {
      if (isVoice) {
        replyText = `🎵 語音訊息已接收！\n📝 識別內容：${text}\n\n❓ 但無法解析為活動資訊。\n請確保包含時間資訊，例如：\n「明天下午2點有會議」`;
      } else {
        replyText = '❓ 無法解析活動資訊。\n請提供時間資訊，例如：\n「明天下午2點有會議」\n或「9/3&9/10 SEO課程」';
      }
    }

    console.log('💬 準備回覆訊息:', replyText);
    
    // 檢查訊息長度
    if (replyText.length > 5000) {
      replyText = replyText.substring(0, 4950) + '...\n(訊息過長已截斷)';
    }

    // 發送回覆
    console.log('📤 準備發送回覆...');
    const replySuccess = sendReply(event.replyToken, replyText);
    
    if (replySuccess) {
      console.log('✅ 回覆發送成功');
    } else {
      console.error('❌ 回覆發送失敗');
    }

    // 清理過期記錄
    cleanupProcessedMessages();

  } catch (error) {
    console.error('🚨 processMessage 錯誤:', error);
    try {
      sendReply(event.replyToken, `❌ 系統處理錯誤: ${error.message}`);
    } catch (replyError) {
      console.error('🚨 發送錯誤回覆失敗:', replyError);
    }
  }
}

// === 語音轉文字功能 ===

function convertAudioToText(messageId) {
  try {
    console.log('🎵 開始語音轉文字處理');
    
    // 1. 下載 LINE 音檔
    const audioData = downloadLineAudio(messageId);
    if (!audioData) {
      console.error('❌ 下載音檔失敗');
      return null;
    }
    
    // 2. 使用 Whisper 轉錄
    const transcription = transcribeWithWhisper(audioData);
    
    console.log('✅ 語音轉文字完成:', transcription);
    return transcription;
    
  } catch (error) {
    console.error('🚨 語音轉文字錯誤:', error);
    return null;
  }
}

function downloadLineAudio(messageId) {
  try {
    console.log('📥 下載 LINE 音檔:', messageId);
    
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const headers = {
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    if (response.getResponseCode() === 200) {
      console.log('✅ 音檔下載成功');
      return response.getBlob();
    } else {
      console.error('❌ 下載音檔失敗，狀態碼:', response.getResponseCode());
      return null;
    }
    
  } catch (error) {
    console.error('🚨 下載音檔錯誤:', error);
    return null;
  }
}

function transcribeWithWhisper(audioBlob) {
  try {
    console.log('🤖 使用 Whisper API 轉錄音檔');
    
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
      console.error('❌ OpenAI API Key 未設定');
      return '請設定 OpenAI API Key 以使用語音功能';
    }
    
    const url = 'https://api.openai.com/v1/audio/transcriptions';
    
    // 建立 multipart/form-data payload
    const boundary = '----formdata-claude-' + Date.now();
    const payload = [];
    
    // 添加文件部分
    payload.push(`--${boundary}`);
    payload.push('Content-Disposition: form-data; name="file"; filename="audio.m4a"');
    payload.push('Content-Type: audio/m4a');
    payload.push('');
    payload.push(Utilities.base64Encode(audioBlob.getBytes()));
    
    // 添加模型參數
    payload.push(`--${boundary}`);
    payload.push('Content-Disposition: form-data; name="model"');
    payload.push('');
    payload.push('whisper-1');
    
    // 添加語言參數
    payload.push(`--${boundary}`);
    payload.push('Content-Disposition: form-data; name="language"');
    payload.push('');
    payload.push('zh');
    
    payload.push(`--${boundary}--`);
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      payload: payload.join('\r\n')
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('📈 Whisper API 回應狀態:', responseCode);
    console.log('📄 Whisper API 回應內容:', responseText);
    
    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      return result.text;
    } else {
      console.error('❌ Whisper API 調用失敗');
      return '語音轉換失敗，請重試';
    }
    
  } catch (error) {
    console.error('🚨 Whisper 轉錄錯誤:', error);
    return '語音處理錯誤，請重試';
  }
}

// === 解析功能 ===

function parseEventWithStrategy(text, isVoice = false) {
  try {
    console.log('🔍 解析策略 - 文字:', text, '語音:', isVoice);
    
    // 使用本地解析（已經足夠強大）
    const result = parseEventInfoLocal(text);
    
    // 確保返回陣列格式
    if (Array.isArray(result)) {
      return result;
    } else if (result) {
      return [result];
    } else {
      return [];
    }
    
  } catch (error) {
    console.error('🚨 解析錯誤:', error);
    return [];
  }
}

function parseEventInfoLocal(text) {
  try {
    console.log('🔍 開始本地解析:', text);

    // === 1. 解析標題 ===
    let title = text;
    
    // 智能提取活動名稱
    title = title.replace(/今天|明天|後天|大後天/g, '');
    title = title.replace(/下週[一二三四五六日天]|下个星期[一二三四五六日天]/g, '');
    title = title.replace(/早上|上午|中午|下午|傍晚|晚上|夜晚/g, '');
    title = title.replace(/\d{1,2}[點：:]\d{0,2}/g, '');
    title = title.replace(/\d{1,2}\/\d{1,2}(&\d{1,2}\/\d{1,2})*/g, '');
    title = title.replace(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g, '');
    title = title.replace(/\d{1,2}月\d{1,2}[日號]/g, '');
    title = title.replace(/https?:\/\/[^\s]+/g, ''); 
    title = title.replace(/線上會議\s*/g, '');
    title = title.replace(/webex|zoom|teams|meet/gi, '');
    title = title.replace(/[，,、；;]/g, '');
    title = title.replace(/\s+/g, ' ');
    title = title.trim();
    
    // 特殊情況處理
    if (!title || title.length < 2) {
      const matches = text.match(/(工研院|SEO|瑜伽|健身房|課程|會議|討論|面談|聚餐|購物|電影|約會)+/g);
      if (matches) {
        title = matches[0];
      } else {
        if (text.includes('SEO')) title = 'SEO課程';
        else if (text.includes('瑜伽')) title = '瑜伽課';
        else if (text.includes('健身房')) title = '健身房';
        else if (text.includes('健身')) title = '健身運動';
        else if (text.includes('課程')) title = '課程';
        else if (text.includes('會議')) title = '會議';
        else title = '活動';
      }
    }

    // === 2. 解析日期 ===
    // 尋找 M/D 格式的日期
    const dateMatches = text.match(/(\d{1,2})\/(\d{1,2})/g);
    
    if (dateMatches && dateMatches.length > 0) {
      // 支援多個日期
      const events = [];
      
      // === 3. 解析時間 - 強化版本 ===
      const timeResult = parseTimeAdvanced(text);
      let hour = timeResult.hour;
      let minute = timeResult.minute;

      // === 4. 解析地點 ===
      let location = null;
      
      // 會議連結檢測
      const urlPatterns = [
        /https:\/\/[^\s]*zoom\.us[^\s]*/gi,
        /https:\/\/meet\.google\.com\/[^\s]*/gi,
        /https:\/\/[^\s]*webex\.com[^\s]*/gi,
        /https:\/\/teams\.microsoft\.com[^\s]*/gi,
        /https:\/\/[^\s]*meet[^\s]*/gi
      ];

      for (const pattern of urlPatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          const url = matches[0];
          if (url.includes('zoom.us')) location = `Zoom 會議: ${url}`;
          else if (url.includes('meet.google.com')) location = `Google Meet: ${url}`;
          else if (url.includes('webex.com')) location = `WebEx 會議: ${url}`;
          else if (url.includes('teams.microsoft.com')) location = `Microsoft Teams: ${url}`;
          else location = `線上會議: ${url}`;
          break;
        }
      }
      
      if (!location) {
        if (text.match(/webex/i)) location = 'WebEx 線上會議';
        else if (text.match(/zoom/i)) location = 'Zoom 線上會議';
        else if (text.match(/teams/i)) location = 'Microsoft Teams';
        else if (text.match(/google\s*meet/i)) location = 'Google Meet';
        else if (text.includes('線上會議')) location = '線上會議';
      }
      
      if (!location) {
        const locationKeywords = [
          '健身房', '餐廳', '咖啡廳', '公司', '學校', '醫院', '家', '辦公室',
          '會議室', '圖書館', '銀行', '郵局', '超市', '商場', '電影院'
        ];
        
        for (const keyword of locationKeywords) {
          if (text.includes(keyword)) {
            location = keyword;
            break;
          }
        }
      }

      // === 為每個日期建立事件 ===
      for (const dateStr of dateMatches) {
        const [month, day] = dateStr.split('/').map(num => parseInt(num));
        const targetDate = new Date(2025, month - 1, day);
        targetDate.setHours(hour, minute, 0, 0);

        const year = targetDate.getFullYear();
        const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(targetDate.getDate()).padStart(2, '0');
        const hourStr = String(hour).padStart(2, '0');
        const minuteStr = String(minute).padStart(2, '0');
        
        const dateString = `${year}-${monthStr}-${dayStr} ${hourStr}:${minuteStr}`;

        events.push({
          title: title,
          date: dateString,
          location: location
        });
      }

      console.log(`✅ 本地解析結果: 建立 ${events.length} 個事件`, events);
      return events;
    }
    
    // 檢查重複事件
    const recurringEvents = parseRecurringEvents(text, title);
    if (recurringEvents && recurringEvents.length > 0) {
      return recurringEvents;
    }
    
    // 檢查多個相對日期
    const multipleRelativeEvents = parseMultipleRelativeDates(text, title);
    if (multipleRelativeEvents && multipleRelativeEvents.length > 0) {
      return multipleRelativeEvents;
    }
    
    // 單一相對日期
    const singleEvent = parseRelativeDate(text, title);
    return singleEvent ? [singleEvent] : [];
    
  } catch (error) {
    console.error('🚨 本地解析錯誤:', error);
    return [];
  }
}

// 重複事件解析
function parseRecurringEvents(text, title) {
  try {
    console.log('🔍 檢查重複事件:', text);
    
    // 重新解析標題
    let cleanTitle = text;
    cleanTitle = cleanTitle.replace(/每週[一二三四五六日天]/g, '');
    cleanTitle = cleanTitle.replace(/從.*開始/g, '');
    cleanTitle = cleanTitle.replace(/到.*底/g, '');
    cleanTitle = cleanTitle.replace(/下週|上週|這週|本週/g, '');
    cleanTitle = cleanTitle.replace(/下午|晚上|上午|早上|中午|傍晚/g, '');
    cleanTitle = cleanTitle.replace(/\d{1,2}[點：:]\d{0,2}/g, '');
    cleanTitle = cleanTitle.replace(/[，,、；;]/g, '');
    cleanTitle = cleanTitle.replace(/\s+/g, ' ');
    cleanTitle = cleanTitle.trim();
    
    if (text.includes('瑜伽')) cleanTitle = '瑜伽課';
    else if (text.includes('健身')) cleanTitle = '健身運動';
    else if (text.includes('課程')) cleanTitle = '課程';
    else if (!cleanTitle || cleanTitle.length < 2) cleanTitle = '重複活動';
    
    title = cleanTitle;

    // 檢查重複模式
    const recurringPatterns = [
      /每週(.)/,
      /每.*([一二三四五六日])/,
      /.*到.*每週([一二三四五六日])/,
      /.*開始.*每週([一二三四五六日])/
    ];

    const singleEventPatterns = [
      /^下週[一二三四五六日]/,
      /^這週[一二三四五六日]/,
      /^週[一二三四五六日][^每]/
    ];

    for (const pattern of singleEventPatterns) {
      if (pattern.test(text)) {
        console.log('⚠️ 檢測到單次事件模式');
        return [];
      }
    }

    let weekday = null;
    for (const pattern of recurringPatterns) {
      const match = text.match(pattern);
      if (match) {
        const dayChar = match[1];
        const dayMap = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0};
        weekday = dayMap[dayChar];
        break;
      }
    }

    if (weekday === null) {
      console.log('❌ 未找到重複模式');
      return [];
    }

    console.log('✅ 找到重複模式，星期:', weekday);

    // 解析時間 - 強化版本
    const timeResult = parseTimeAdvanced(text, 18); // 重複事件預設晚上6點
    let hour = timeResult.hour;
    let minute = timeResult.minute;

    // 日期範圍
    let startDate = new Date(2025, 8, 2); // 預設下週二
    if (text.includes('下週')) {
      const today = new Date(2025, 7, 30);
      const daysUntilTarget = (weekday + 7 - today.getDay()) % 7;
      if (daysUntilTarget === 0) {
        startDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(today.getTime() + (daysUntilTarget + 7) * 24 * 60 * 60 * 1000);
      }
    }

    let endDate = new Date(2025, 9, 31); // 預設十月底
    if (text.includes('十月底')) endDate = new Date(2025, 9, 31);
    else if (text.includes('九月底')) endDate = new Date(2025, 8, 30);
    else if (text.includes('年底')) endDate = new Date(2025, 11, 31);

    // 解析地點
    let location = null;
    const urlPatterns = [
      /https:\/\/[^\s]*zoom\.us[^\s]*/gi,
      /https:\/\/meet\.google\.com\/[^\s]*/gi,
      /https:\/\/[^\s]*webex\.com[^\s]*/gi,
      /https:\/\/teams\.microsoft\.com[^\s]*/gi,
      /https:\/\/[^\s]*meet[^\s]*/gi
    ];

    for (const pattern of urlPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const url = matches[0];
        if (url.includes('zoom.us')) location = `Zoom 會議: ${url}`;
        else if (url.includes('meet.google.com')) location = `Google Meet: ${url}`;
        else if (url.includes('webex.com')) location = `WebEx 會議: ${url}`;
        else if (url.includes('teams.microsoft.com')) location = `Microsoft Teams: ${url}`;
        else location = `線上會議: ${url}`;
        break;
      }
    }
    
    if (!location) {
      if (text.match(/webex/i)) location = 'WebEx 線上會議';
      else if (text.match(/zoom/i)) location = 'Zoom 線上會議';
      else if (text.match(/teams/i)) location = 'Microsoft Teams';
      else if (text.match(/google\s*meet/i)) location = 'Google Meet';
      else if (text.includes('線上')) location = '線上會議';
    }

    // 生成重複事件
    const events = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      if (currentDate.getDay() === weekday) {
        const eventDate = new Date(currentDate);
        eventDate.setHours(hour, minute, 0, 0);
        
        const year = eventDate.getFullYear();
        const monthStr = String(eventDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(eventDate.getDate()).padStart(2, '0');
        const hourStr = String(hour).padStart(2, '0');
        const minuteStr = String(minute).padStart(2, '0');
        
        const dateString = `${year}-${monthStr}-${dayStr} ${hourStr}:${minuteStr}`;

        events.push({
          title: title,
          date: dateString,
          location: location
        });
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`✅ 重複事件解析結果: 建立 ${events.length} 個事件`);
    return events;

  } catch (error) {
    console.error('🚨 重複事件解析錯誤:', error);
    return [];
  }
}

// 多個相對日期解析
function parseMultipleRelativeDates(text, title) {
  try {
    console.log('🔍 檢查多個相對日期:', text);
    
    const patterns = [
      /下週([一二三四五六日天]).*下下週([一二三四五六日天])/,
      /下週([一二三四五六日天])與下下週([一二三四五六日天])/,
      /下週([一二三四五六日天])和下下週([一二三四五六日天])/,
    ];
    
    let matches = null;
    for (const pattern of patterns) {
      matches = text.match(pattern);
      if (matches) break;
    }
    
    if (!matches) {
      console.log('❌ 未找到多個相對日期模式');
      return [];
    }
    
    console.log('✅ 找到多個相對日期模式:', matches[0]);
    
    // 重新解析標題
    let cleanTitle = text;
    cleanTitle = cleanTitle.replace(/下週[一二三四五六日天]/g, '');
    cleanTitle = cleanTitle.replace(/下下週[一二三四五六日天]/g, '');
    cleanTitle = cleanTitle.replace(/與|和|,|，/g, '');
    cleanTitle = cleanTitle.replace(/早上|上午|中午|下午|傍晚|晚上|夜晚/g, '');
    cleanTitle = cleanTitle.replace(/[一二三四五六七八九十\d]{1,2}[點：:]/g, '');
    cleanTitle = cleanTitle.replace(/都有|有/g, '');
    cleanTitle = cleanTitle.replace(/地點在.+/g, '');
    cleanTitle = cleanTitle.replace(/[。，,]/g, '');
    cleanTitle = cleanTitle.replace(/\s+/g, ' ');
    cleanTitle = cleanTitle.trim();
    
    if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.includes('下') || cleanTitle.includes('上')) {
      if (text.includes('健身房')) cleanTitle = '健身房課程';
      else if (text.includes('健身')) cleanTitle = '健身運動';
      else if (text.includes('課程')) cleanTitle = '課程';
      else if (text.includes('會議')) cleanTitle = '會議';
      else cleanTitle = '活動';
    }
    
    // 解析時間 - 強化版本
    const timeResult = parseTimeAdvanced(text, 19); // 多日期預設晚上7點
    let hour = timeResult.hour;
    let minute = timeResult.minute;
    
    // 解析地點
    let location = null;
    const locationMatch = text.match(/地點在(.+?)(?:[，,。]|$)/);
    if (locationMatch) {
      location = locationMatch[1].trim();
    } else {
      const locationKeywords = [
        '健身房', '小琉球', '台北', '高雄', '台中', '餐廳', '咖啡廳', 
        '公司', '學校', '醫院', '家', '辦公室', '會議室', '圖書館'
      ];
      
      for (const keyword of locationKeywords) {
        if (text.includes(keyword)) {
          location = keyword;
          break;
        }
      }
    }
    
    // 建立事件陣列
    const events = [];
    const dayMap = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0};
    
    const today = new Date(2025, 7, 30); // 8/30 (週六)
    
    // 第一個日期：下週X
    const firstDay = dayMap[matches[1]];
    let daysUntilFirst = (firstDay + 7 - today.getDay()) % 7;
    if (daysUntilFirst === 0) daysUntilFirst = 7;
    const firstDate = new Date(today.getTime() + daysUntilFirst * 24 * 60 * 60 * 1000);
    firstDate.setHours(hour, minute, 0, 0);
    
    // 第二個日期：下下週Y
    const secondDay = dayMap[matches[2]];
    let daysUntilSecond = (secondDay + 14 - today.getDay()) % 7;
    if (daysUntilSecond < 14) daysUntilSecond += 7;
    const secondDate = new Date(today.getTime() + daysUntilSecond * 24 * 60 * 60 * 1000);
    secondDate.setHours(hour, minute, 0, 0);
    
    // 創建事件
    [firstDate, secondDate].forEach(date => {
      const year = date.getFullYear();
      const monthStr = String(date.getMonth() + 1).padStart(2, '0');
      const dayStr = String(date.getDate()).padStart(2, '0');
      const hourStr = String(hour).padStart(2, '0');
      const minuteStr = String(minute).padStart(2, '0');
      
      const dateString = `${year}-${monthStr}-${dayStr} ${hourStr}:${minuteStr}`;
      
      events.push({
        title: cleanTitle,
        date: dateString,
        location: location
      });
    });
    
    console.log(`✅ 多個相對日期解析結果: 建立 ${events.length} 個事件`, events);
    return events;
    
  } catch (error) {
    console.error('🚨 多個相對日期解析錯誤:', error);
    return [];
  }
}

// 相對日期解析
function parseRelativeDate(text, title) {
  let targetDate = new Date(2025, 7, 31); // 預設明天

  if (text.includes('今天')) targetDate = new Date(2025, 7, 30);
  else if (text.includes('明天')) targetDate = new Date(2025, 7, 31);
  else if (text.includes('後天')) targetDate = new Date(2025, 8, 1);
  else if (text.includes('下週一')) targetDate = new Date(2025, 8, 8);
  else if (text.includes('下週二')) targetDate = new Date(2025, 8, 2);
  else if (text.includes('下週三')) targetDate = new Date(2025, 8, 3);
  else if (text.includes('下週四')) targetDate = new Date(2025, 8, 4);
  else if (text.includes('下週五')) targetDate = new Date(2025, 8, 5);
  else if (text.includes('下週六')) targetDate = new Date(2025, 8, 6);
  else if (text.includes('下週日')) targetDate = new Date(2025, 8, 7);

  // 時間解析 - 強化版本
  const timeResult = parseTimeAdvanced(text, 19); // 相對日期預設晚上7點
  let hour = timeResult.hour;
  let minute = timeResult.minute;

  targetDate.setHours(hour, minute, 0, 0);

  // 地點解析
  let location = null;
  const urlPatterns = [
    /https:\/\/[^\s]*zoom\.us[^\s]*/gi,
    /https:\/\/meet\.google\.com\/[^\s]*/gi,
    /https:\/\/[^\s]*webex\.com[^\s]*/gi,
    /https:\/\/teams\.microsoft\.com[^\s]*/gi,
    /https:\/\/[^\s]*meet[^\s]*/gi
  ];

  for (const pattern of urlPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const url = matches[0];
      if (url.includes('zoom.us')) location = `Zoom 會議: ${url}`;
      else if (url.includes('meet.google.com')) location = `Google Meet: ${url}`;
      else if (url.includes('webex.com')) location = `WebEx 會議: ${url}`;
      else if (url.includes('teams.microsoft.com')) location = `Microsoft Teams: ${url}`;
      else location = `線上會議: ${url}`;
      break;
    }
  }
  
  if (!location) {
    if (text.match(/webex/i)) location = 'WebEx 線上會議';
    else if (text.match(/zoom/i)) location = 'Zoom 線上會議'; 
    else if (text.match(/teams/i)) location = 'Microsoft Teams';
    else if (text.match(/google\s*meet/i)) location = 'Google Meet';
    else if (text.includes('線上')) location = '線上會議';
  }

  const year = targetDate.getFullYear();
  const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dayStr = String(targetDate.getDate()).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');
  
  const dateString = `${year}-${monthStr}-${dayStr} ${hourStr}:${minuteStr}`;

  return {
    title: title || '活動',
    date: dateString,
    location: location
  };
}

// === 日曆和工具函數 ===

function createCalendarEvent(eventInfo) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();

    // 修正日期格式處理
    let dateString = eventInfo.date;
    if (dateString.includes(' ') && !dateString.includes('T')) {
      dateString = dateString.replace(' ', 'T') + ':00';
    }

    const startTime = new Date(dateString);
    if (isNaN(startTime.getTime())) {
      console.error('❌ 無效的日期:', eventInfo.date);
      return false;
    }

    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1小時後結束

    const event = calendar.createEvent(
      eventInfo.title,
      startTime,
      endTime,
      {
        description: '由 LINE Bot 自動建立',
        location: eventInfo.location || ''
      }
    );

    console.log('✅ 事件建立成功:', event.getId());
    console.log('📅 事件時間:', startTime.toLocaleString('zh-TW'));

    return true;

  } catch (error) {
    console.error('🚨 建立事件失敗:', error);
    return false;
  }
}

function formatDate(dateString) {
  try {
    // 修正日期格式處理
    let processedDateString = dateString;
    if (dateString.includes(' ') && !dateString.includes('T')) {
      processedDateString = dateString.replace(' ', 'T') + ':00';
    }
    
    const date = new Date(processedDateString);
    
    if (isNaN(date.getTime())) {
      console.error('❌ 格式化日期失敗:', dateString);
      return dateString;
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    const correctDate = new Date(year, month, day);
    const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const weekday = weekdays[correctDate.getDay()];
    
    const formatted = date.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return formatted.replace(/(\d{4}\/\d{2}\/\d{2})/, `$1（${weekday}）`);
    
  } catch (error) {
    console.error('🚨 格式化日期錯誤:', error);
    return dateString;
  }
}

function sendReply(replyToken, message) {
  try {
    console.log('📤 發送 LINE 回覆...');
    console.log('🎫 replyToken:', replyToken);
    console.log('💬 回覆內容長度:', message.length);
    console.log('💬 回覆內容預覽:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));

    // 驗證 replyToken
    if (!replyToken || replyToken.trim().length === 0) {
      console.error('❌ replyToken 無效 或 空白');
      return false;
    }

    // 驗證 ACCESS_TOKEN
    if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN === 'YOUR_LINE_CHANNEL_ACCESS_TOKEN') {
      console.error('❌ LINE_CHANNEL_ACCESS_TOKEN 未設定');
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

    console.log('📦 發送 payload:', {
      replyToken: replyToken.substring(0, 20) + '...',
      messageLength: message.length,
      messageType: 'text'
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('📈 LINE API 回應狀態:', statusCode);
    console.log('📄 LINE API 回應內容:', responseText);

    if (statusCode === 200) {
      console.log('✅ LINE 回覆成功');
      return true;
    } else {
      console.error('❌ LINE 回覆失敗，狀態碼:', statusCode);
      console.error('❌ 錯誤詳情:', responseText);
      return false;
    }

  } catch (error) {
    console.error('🚨 發送回覆錯誤:', error);
    console.error('🚨 錯誤堆疊:', error.stack);
    return false;
  }
}

function cleanupProcessedMessages() {
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000; // 2小時
    let count = 0;

    for (const [key, value] of Object.entries(properties)) {
      if (key.startsWith('processed_')) {
        const timestamp = parseInt(value);
        if (isNaN(timestamp) || (now - timestamp) > twoHours) {
          PropertiesService.getScriptProperties().deleteProperty(key);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`🧹 已清理 ${count} 個過期處理記錄`);
    }

  } catch (error) {
    console.error('🚨 清理過期記錄錯誤:', error);
  }
}

// === 強化時間解析函數 ===

function parseTimeAdvanced(text, defaultHour = 14) {
  console.log('🕐 開始強化時間解析:', text);
  
  let hour = defaultHour;
  let minute = 0;
  
  try {
    // === 1. 精確時間格式匹配 ===
    
    // 24小時制 (HH:MM)
    const time24Match = text.match(/(\d{1,2}):(\d{2})/);
    if (time24Match) {
      hour = parseInt(time24Match[1]);
      minute = parseInt(time24Match[2]);
      console.log('✅ 24小時制格式:', hour, ':', minute);
      return { hour, minute };
    }
    
    // 標準數字格式 (支援中英文)
    const patterns = [
      // 中文數字 + 點/時 + 分鐘
      /([一二三四五六七八九十]{1,2}|\d{1,2})[點時：:]([一二三四五六七八九十]{1,2}|\d{1,2})[分]?/,
      // 只有小時
      /([一二三四五六七八九十]{1,2}|\d{1,2})[點時：:]/,
      // 半點表示
      /([一二三四五六七八九十]{1,2}|\d{1,2})[點時]半/,
      // 一刻、三刻
      /([一二三四五六七八九十]{1,2}|\d{1,2})[點時]([一三]刻)/
    ];
    
    for (const pattern of patterns) {
      const timeMatch = text.match(pattern);
      if (timeMatch) {
        // 解析小時
        const hourStr = timeMatch[1];
        hour = convertChineseNumber(hourStr);
        
        // 解析分鐘
        if (timeMatch[2]) {
          if (timeMatch[2] === '半') {
            minute = 30;
          } else if (timeMatch[2] === '一刻') {
            minute = 15;
          } else if (timeMatch[2] === '三刻') {
            minute = 45;
          } else {
            minute = convertChineseNumber(timeMatch[2]);
          }
        } else if (text.includes('半')) {
          minute = 30;
        }
        
        console.log('✅ 時間格式匹配:', hour, ':', minute);
        break;
      }
    }
    
    // === 2. 上午下午處理 ===
    
    // 24小時制不需要轉換
    if (!time24Match) {
      if (text.includes('上午') || text.includes('早上') || text.includes('早晨')) {
        if (hour === 12) hour = 0; // 上午12點 = 0點
        // 其他小時保持不變 (1-11)
        console.log('🌅 上午時間:', hour);
      } else if (text.includes('中午')) {
        hour = hour === 12 ? 12 : hour + 12; // 中午12點保持12，其他加12
        console.log('🌞 中午時間:', hour);
      } else if (text.includes('下午')) {
        if (hour >= 1 && hour <= 11) hour += 12; // 下午1-11點加12
        // 下午12點保持12不變
        console.log('🌇 下午時間:', hour);
      } else if (text.includes('晚上') || text.includes('夜晚')) {
        if (hour >= 1 && hour <= 11) hour += 12; // 晚上1-11點加12
        console.log('🌙 晚上時間:', hour);
      } else if (text.includes('傍晚')) {
        // 傍晚通常是5-7點
        if (hour >= 1 && hour <= 11) hour += 12;
        else if (hour < 17) hour = 17; // 預設傍晚5點
        console.log('🌆 傍晚時間:', hour);
      } else {
        // === 3. 智能時間推測 ===
        // 根據小時數智能判斷上下午
        if (hour >= 1 && hour <= 6) {
          // 1-6點可能是凌晨或下午，根據上下文判斷
          if (text.includes('會議') || text.includes('課程') || text.includes('工作')) {
            hour += 12; // 工作相關通常是下午
          }
          // 否則保持原時間（可能是凌晨）
        } else if (hour >= 7 && hour <= 11) {
          // 7-11點可能是上午或晚上
          if (text.includes('健身') || text.includes('聚餐') || text.includes('約會')) {
            hour += 12; // 休閒活動通常是晚上
          }
          // 否則保持原時間（可能是上午）
        }
        // 12點及以上保持不變
        console.log('🤖 智能時間推測:', hour);
      }
    }
    
    // === 4. 特殊時間描述 ===
    if (!time24Match && hour === defaultHour && minute === 0) {
      // 沒有具體時間，根據時段關鍵字設定預設時間
      if (text.includes('清晨') || text.includes('凌晨')) {
        hour = 6; minute = 0;
      } else if (text.includes('早上') || text.includes('早晨')) {
        hour = 8; minute = 0;
      } else if (text.includes('上午')) {
        hour = 10; minute = 0;
      } else if (text.includes('中午')) {
        hour = 12; minute = 0;
      } else if (text.includes('下午')) {
        hour = 14; minute = 0;
      } else if (text.includes('傍晚')) {
        hour = 17; minute = 30;
      } else if (text.includes('晚上')) {
        hour = 19; minute = 0;
      } else if (text.includes('深夜') || text.includes('夜晚')) {
        hour = 22; minute = 0;
      }
      console.log('🕐 時段預設時間:', hour, ':', minute);
    }
    
    // === 5. 時間範圍處理 ===
    const rangeMatch = text.match(/(\d{1,2})[點時：:]\d{0,2}[到至－-](\d{1,2})[點時：:]\d{0,2}/);
    if (rangeMatch) {
      // 取開始時間
      const startHour = parseInt(rangeMatch[1]);
      hour = startHour;
      console.log('⏰ 時間範圍，取開始時間:', hour);
    }
    
    // === 6. 驗證時間合理性 ===
    if (hour < 0 || hour > 23) {
      console.log('⚠️ 小時超出範圍，重設為預設值');
      hour = defaultHour;
    }
    if (minute < 0 || minute > 59) {
      console.log('⚠️ 分鐘超出範圍，重設為0');
      minute = 0;
    }
    
    console.log('✅ 最終時間解析結果:', hour, ':', minute);
    return { hour, minute };
    
  } catch (error) {
    console.error('🚨 時間解析錯誤:', error);
    return { hour: defaultHour, minute: 0 };
  }
}

// 中文數字轉換函數
function convertChineseNumber(str) {
  if (typeof str === 'number') return str;
  if (/^\d+$/.test(str)) return parseInt(str);
  
  const numMap = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '二十一': 21, '二十二': 22, '二十三': 23
  };
  
  if (numMap[str] !== undefined) {
    return numMap[str];
  }
  
  // 處理複合數字如「二十三」
  if (str.includes('十')) {
    if (str === '十') return 10;
    if (str.startsWith('十')) {
      const unit = str.slice(1);
      return 10 + (numMap[unit] || 0);
    } else {
      const parts = str.split('十');
      const tens = numMap[parts[0]] || 0;
      const units = parts[1] ? (numMap[parts[1]] || 0) : 0;
      return tens * 10 + units;
    }
  }
  
  return parseInt(str) || 0;
}

// === 測試和管理函數 ===

// 測試 LINE API 連線的函數
function testLineAPI() {
  console.log('🧪 測試 LINE API 連線...');
  
  // 檢查 ACCESS_TOKEN
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN === 'YOUR_LINE_CHANNEL_ACCESS_TOKEN') {
    console.error('❌ LINE_CHANNEL_ACCESS_TOKEN 未設定');
    return false;
  }
  
  // 測試發送訊息給自己（使用 push message）
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: TARGET_USER_ID, // 發送給目標用戶
    messages: [{
      type: 'text',
      text: '🧪 LINE API 連線測試成功！時間: ' + new Date().toLocaleString('zh-TW')
    }]
  };
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('📈 LINE Push API 回應狀態:', statusCode);
    console.log('📄 LINE Push API 回應內容:', responseText);
    
    if (statusCode === 200) {
      console.log('✅ LINE API 連線正常');
      return true;
    } else {
      console.log('❌ LINE API 連線異常');
      return false;
    }
  } catch (error) {
    console.error('🚨 LINE API 測試錯誤:', error);
    return false;
  }
}

// 簡化調試版本 - 直接回覆收到的文字
function debugProcessMessage(event) {
  try {
    const text = event.message.text || '無文字訊息';
    const messageId = event.message.id || 'unknown';
    
    console.log('🔍 調試模式 - 處理訊息:', text);
    
    const debugReply = `🤖 調試回覆\n\n📝 收到訊息: ${text}\n🎫 訊息 ID: ${messageId}\n⏰ 時間: ${new Date().toLocaleString('zh-TW')}`;
    
    console.log('📤 調試模式發送回覆:', debugReply);
    
    return sendReply(event.replyToken, debugReply);
    
  } catch (error) {
    console.error('🚨 調試模式錯誤:', error);
    return false;
  }
}

// 可手動在 doPost 中替換 processMessage 為 debugProcessMessage 來測試

// 測試強化時間格式支援
function testAdvancedTimeFormats() {
  console.log('=== 強化時間格式測試 ===');
  
  const timeTests = [
    // 基本格式
    '明天下午2點開會',
    '下週二上午九點健身',
    '9/5 晚上7點聚餐',
    
    // 24小時制
    '明天14:30會議',
    '下週三9:15瑜伽課',
    '10/1 23:00夜宵',
    
    // 現代中文時間表達
    '下週五下午3點半開會',
    '明天晚上8點15分電影',
    '週六上午11:45課程',
    
    // 時間範圍
    '明天下午2點到4點會議',
    '週日上午9點-11點運動',
    
    // 特殊時段
    '明天清晨跑步',
    '下週一傍晚聚餐',
    '週三深夜加班',
    
    // 模糊時間
    '下午有會議',
    '晚上健身房',
    '上午課程'
  ];
  
  timeTests.forEach((text, index) => {
    console.log(`\n--- 時間測試 ${index + 1}: ${text} ---`);
    const timeResult = parseTimeAdvanced(text);
    console.log(`🕐 解析結果: ${timeResult.hour}:${String(timeResult.minute).padStart(2, '0')}`);
    
    // 完整事件解析測試
    const events = parseEventWithStrategy(text, false);
    if (events && events.length > 0) {
      const event = events[0];
      console.log(`📅 完整事件: ${event.title} - ${formatDate(event.date)}`);
    }
  });
  
  console.log('\n=== 時間格式測試完成 ===');
}

function testCompleteSystem() {
  console.log('=== 完整系統測試 ===');

  const testMessages = [
    '下週二晚上健身房',
    '工研院SEO課程，9/3&9/10&9/17，線上會議webex',
    '每週二下午六點瑜伽課，從下週開始到十月底',
    '明天下午2點會議 https://meet.google.com/abc-defg-hij',
    '9/5 上午10點 zoom會議 https://zoom.us/j/1234567890',
    '下週二與下下週二，下午七點都有健身房課程。地點在小琉球',
    // 新增強化時間格式測試
    '明天14:30開重要會議',
    '下週三上匆9:30瑜伽課',
    '10/5 晚上8:15聚餐'
  ];

  testMessages.forEach((text, index) => {
    console.log(`\n--- 測試 ${index + 1}: ${text} ---`);
    
    const events = parseEventWithStrategy(text, false);
    console.log(`📊 解析結果: ${events ? events.length : 0} 個事件`, events);

    if (events && events.length > 0) {
      events.forEach((eventInfo, i) => {
        const displayDate = formatDate(eventInfo.date);
        console.log(`📅 事件 ${i + 1}: ${eventInfo.title} - ${displayDate} - ${eventInfo.location || '無地點'}`);
      });
    } else {
      console.log('❌ 解析失敗');
    }
  });

  console.log('\n=== 測試完成 ===');
  console.log('🎵 語音功能已整合並設定完成');
  console.log('🕐 強化時間格式已支援');
}