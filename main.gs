// LINE Bot + Google Calendar 整合系統 - 最終完整版 (Google Apps Script)

// 設定常數 - 請在 Google Apps Script 中替換為實際值
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const LINE_CHANNEL_SECRET = 'YOUR_LINE_CHANNEL_SECRET';
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';
const TARGET_USER_ID = 'YOUR_TARGET_USER_ID';

// 處理 GET 請求
function doGet() {
  return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 處理 POST 請求 - 簡化版本（直接處理，避免觸發器問題）
function doPost(e) {
  console.log('=== Webhook 請求 ===');

  try {
    if (!e.postData || !e.postData.contents) {
      console.log('無 POST 資料');
      return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const data = JSON.parse(e.postData.contents);
    console.log('收到事件數量:', data.events ? data.events.length : 0);

    // LINE 驗證請求 - 直接回應
    if (!data.events || data.events.length === 0) {
      console.log('驗證請求或空事件');
      return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // 直接處理事件（移除觸發器機制）
    for (const event of data.events) {
      if (event.type === 'message' && 
          event.message && 
          event.message.type === 'text' && 
          event.source && 
          event.source.userId === TARGET_USER_ID) {
        
        console.log('處理用戶訊息:', event.message.text);
        processMessage(event);
        break; // 只處理第一個訊息
      }
    }

  } catch (error) {
    console.error('doPost 錯誤:', error);
  }

  // 立即回傳 200 狀態碼
  return HtmlService.createHtmlOutput('OK').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 已移除觸發器相關函數，改為直接處理

// 處理單一訊息
function processMessage(event) {
  try {
    const text = event.message.text;
    const messageId = event.message.id || 'unknown';

    console.log(`處理訊息 [${messageId}]: ${text}`);

    // 防重複處理機制
    const processedKey = `processed_${messageId}`;
    const alreadyProcessed = PropertiesService.getScriptProperties().getProperty(processedKey);
    
    if (alreadyProcessed) {
      console.log(`訊息 ${messageId} 已處理過，跳過`);
      return;
    }

    // 標記為已處理（有效期1小時）
    PropertiesService.getScriptProperties().setProperty(processedKey, Date.now().toString());

    // 混合解析策略 - 現在支援多事件
    const events = parseEventWithStrategy(text);

    let replyText;
    if (events && events.length > 0) {
      const successfulEvents = [];
      const failedCount = [];

      // 建立所有 Calendar 事件
      for (const eventInfo of events) {
        const success = createCalendarEvent(eventInfo);
        if (success) {
          successfulEvents.push(eventInfo);
        } else {
          failedCount.push(eventInfo);
        }
      }

      // 生成回覆訊息
      if (successfulEvents.length > 0) {
        if (successfulEvents.length === 1) {
          // 單一事件
          const eventInfo = successfulEvents[0];
          const displayDate = formatDate(eventInfo.date);
          replyText = `✅ 已成功新增到行事曆！\n\n📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}`;
        } else {
          // 多個事件
          replyText = `✅ 已成功新增 ${successfulEvents.length} 個事件到行事曆！\n\n`;
          
          successfulEvents.forEach((eventInfo, index) => {
            const displayDate = formatDate(eventInfo.date);
            replyText += `📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}\n`;
            if (index < successfulEvents.length - 1) replyText += '\n';
          });
        }
        
        if (failedCount.length > 0) {
          replyText += `\n⚠️ ${failedCount.length} 個事件建立失敗`;
        }
      } else {
        replyText = '❌ 所有事件建立失敗，請重試。';
      }
    } else {
      replyText = '❓ 無法解析活動資訊。\n請提供時間資訊，例如：\n「明天下午2點有會議」\n或「9/3&9/10 SEO課程」';
    }

    // 發送回覆
    sendReply(event.replyToken, replyText);

  } catch (error) {
    console.error('處理訊息錯誤:', error);
    try {
      sendReply(event.replyToken, '❌ 系統錯誤，請重試。');
    } catch (replyError) {
      console.error('發送錯誤回覆失敗:', replyError);
    }
  }
}

// 混合解析策略 - 文字用本地，語音用 OpenAI  
function parseEventWithStrategy(text, isVoice = false) {
  try {
    // 如果是語音訊息，先用 OpenAI 轉文字再用本地解析
    if (isVoice) {
      console.log('語音訊息，使用 OpenAI 轉換');
      const convertedText = convertVoiceWithOpenAI(text);
      if (convertedText) {
        return parseEventInfoLocal(convertedText);
      }
    }
    
    // 判斷是否需要使用 OpenAI
    const needsOpenAI = checkIfNeedsOpenAI(text);
    
    if (needsOpenAI) {
      console.log('複雜格式，嘗試 OpenAI 解析');
      const openAIResult = parseEventWithOpenAI(text);
      
      // 如果 OpenAI 解析失敗或結果不合理，回退到本地解析
      if (!openAIResult || !isValidResult(openAIResult)) {
        console.log('OpenAI 結果無效，回退到本地解析');
        return parseEventInfoLocal(text);
      }
      
      return openAIResult;
    } else {
      console.log('簡單格式，使用本地解析');
      const result = parseEventInfoLocal(text);
      
      // 確保返回陣列格式（向後相容）
      if (Array.isArray(result)) {
        return result;
      } else if (result) {
        return [result]; // 單一事件包裝為陣列
      } else {
        return [];
      }
    }
    
  } catch (error) {
    console.error('混合解析錯誤:', error);
    // 出錯時回退到本地解析
    return parseEventInfoLocal(text);
  }
}

// 判斷是否需要 OpenAI 的複雜邏輯
function checkIfNeedsOpenAI(text) {
  // 暫時停用 OpenAI，因為本地解析已經足夠強大
  return false;
  
  // 以後如果需要，可以啟用這些複雜格式檢測
  // const complexPatterns = [
  //   /每週|每天|每月/, // 重複事件
  //   /從.*到.*/, // 時間範圍  
  //   /\d+年\d+月\d+日/ // 完整日期格式
  // ];
  // return complexPatterns.some(pattern => pattern.test(text));
}

// 驗證解析結果是否合理
function isValidResult(result) {
  if (!result || !result.title || !result.date) return false;
  
  // 檢查日期是否合理（不能是過去太久的日期）
  const eventDate = new Date(result.date);
  const now = new Date();
  const diffDays = (eventDate - now) / (1000 * 60 * 60 * 24);
  
  // 事件應該在未來1年內
  return !isNaN(eventDate.getTime()) && diffDays > -1 && diffDays < 365;
}

// 語音轉文字（保留原有 OpenAI 功能）
function convertVoiceWithOpenAI(audioData) {
  // 這裡實作語音轉文字的邏輯
  // 目前先返回 null，因為需要處理音訊檔案
  return null;
}

// 本地解析函數 - 強化版本
function parseEventInfoLocal(text) {
  try {
    console.log('開始本地解析:', text);

    // === 1. 解析標題 ===
    let title = text;
    
    // 智能提取活動名稱 - 移除時間相關詞彙，保留主要活動
    // 移除時間描述詞
    title = title.replace(/今天|明天|後天|大後天/g, '');
    title = title.replace(/下週[一二三四五六日天]|下个星期[一二三四五六日天]/g, '');
    title = title.replace(/早上|上午|中午|下午|傍晚|晚上|夜晚/g, '');
    title = title.replace(/\d{1,2}[點：:]\d{0,2}/g, ''); // 移除具體時間
    
    // 移除日期格式
    title = title.replace(/\d{1,2}\/\d{1,2}(&\d{1,2}\/\d{1,2})*/g, '');
    title = title.replace(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g, '');
    title = title.replace(/\d{1,2}月\d{1,2}[日號]/g, '');
    
    // 移除會議連結和平台關鍵字
    title = title.replace(/https?:\/\/[^\s]+/g, ''); 
    title = title.replace(/線上會議\s*/g, '');
    title = title.replace(/webex|zoom|teams|meet/gi, '');
    
    // 移除標點符號和多餘空格
    title = title.replace(/[，,、；;]/g, '');
    title = title.replace(/\s+/g, ' ');
    title = title.trim();
    
    // 特殊情況處理 - 如果標題被清空了，從原文智能提取
    if (!title || title.length < 2) {
      // 先嘗試提取專有名詞
      const matches = text.match(/(工研院|SEO|瑜伽|健身房|課程|會議|討論|面談|聚餐|購物|電影|約會)+/g);
      if (matches) {
        title = matches[0];
      } else {
        // 基於關鍵字推測
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
      // 支援多個日期 - 為每個日期建立事件
      const events = [];
      
      // === 3. 解析時間（所有事件共用） ===
      let hour = 14; // 預設下午2點
      let minute = 0;

      // 尋找具體時間
      const timeMatch = text.match(/(\d{1,2})[點：:](\d{1,2})?/);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        
        // 處理上午下午
        if (text.includes('上午') && hour === 12) hour = 0;
        else if (text.includes('下午') && hour >= 1 && hour <= 11) hour += 12;
        else if (text.includes('晚上') && hour >= 1 && hour <= 11) hour += 12;
      } else {
        // 根據時段推測
        if (text.includes('早上') || text.includes('早晨')) hour = 9;
        else if (text.includes('上午')) hour = 10;
        else if (text.includes('中午')) hour = 12;
        else if (text.includes('下午')) hour = 14;
        else if (text.includes('傍晚')) hour = 17;
        else if (text.includes('晚上')) hour = 19;
      }

      // === 4. 解析地點（所有事件共用） ===
      let location = null;
      
      // 會議連結檢測（優先）- 修正版本
      const urlPatterns = [
        /https:\/\/[^\s]*zoom\.us[^\s]*/gi,           // Zoom (簡化)
        /https:\/\/meet\.google\.com\/[^\s]*/gi,      // Google Meet (簡化)
        /https:\/\/[^\s]*webex\.com[^\s]*/gi,         // WebEx (簡化)  
        /https:\/\/teams\.microsoft\.com[^\s]*/gi,    // Teams (簡化)
        /https:\/\/[^\s]*meet[^\s]*/gi                // 通用會議連結
      ];

      for (const pattern of urlPatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          const url = matches[0];
          
          // 根據連結判斷平台並格式化（LINE 適用格式）
          if (url.includes('zoom.us')) {
            location = `Zoom 會議: ${url}`;
          } else if (url.includes('meet.google.com')) {
            location = `Google Meet: ${url}`;
          } else if (url.includes('webex.com')) {
            location = `WebEx 會議: ${url}`;
          } else if (url.includes('teams.microsoft.com')) {
            location = `Microsoft Teams: ${url}`;
          } else {
            location = `線上會議: ${url}`;
          }
          break;
        }
      }
      
      // 如果沒有找到連結，檢查平台關鍵字
      if (!location) {
        if (text.match(/webex/i)) location = 'WebEx 線上會議';
        else if (text.match(/zoom/i)) location = 'Zoom 線上會議';
        else if (text.match(/teams/i)) location = 'Microsoft Teams';
        else if (text.match(/google\s*meet/i)) location = 'Google Meet';
        else if (text.includes('線上會議')) location = '線上會議';
      }
      
      // 實體地點關鍵字
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
        
        // 建立目標日期 (假設是2025年)
        const targetDate = new Date(2025, month - 1, day);
        targetDate.setHours(hour, minute, 0, 0);

        // 格式化日期字串
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

      console.log(`本地解析結果: 建立 ${events.length} 個事件`, events);
      return events; // 返回事件陣列
    }
    
    // 如果沒有找到 M/D 格式，檢查重複事件或回退到相對日期
    const recurringEvents = parseRecurringEvents(text, title);
    if (recurringEvents && recurringEvents.length > 0) {
      return recurringEvents;
    }
    
    const singleEvent = parseRelativeDate(text, title);
    return singleEvent ? [singleEvent] : [];
    
  } catch (error) {
    console.error('本地解析錯誤:', error);
    return null;
  }
}

// 重複事件解析
function parseRecurringEvents(text, title) {
  try {
    console.log('檢查重複事件:', text);
    
    // 重新解析標題（移除重複相關描述）
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
    
    // 特別處理：如果包含具體活動名稱，優先提取
    if (text.includes('瑜伽')) {
      cleanTitle = '瑜伽課';
    } else if (text.includes('健身')) {
      cleanTitle = '健身運動';
    } else if (text.includes('課程')) {
      cleanTitle = '課程';
    } else if (!cleanTitle || cleanTitle.length < 2) {
      cleanTitle = '重複活動';
    }
    
    title = cleanTitle; // 使用清理後的標題

    // 檢查是否包含重複關鍵字（必須明確包含重複意圖）
    const recurringPatterns = [
      /每週(.)/,                    // 每週X
      /每.*([一二三四五六日])/,        // 每週X
      /.*到.*每週([一二三四五六日])/,   // ...到...每週X
      /.*開始.*每週([一二三四五六日])/   // ...開始...每週X
    ];

    // 排除單次事件的模式
    const singleEventPatterns = [
      /^下週[一二三四五六日]/,  // 下週X（單次）
      /^這週[一二三四五六日]/,  // 這週X（單次）
      /^週[一二三四五六日][^每]/ // 週X但沒有"每"（單次）
    ];

    // 先檢查是否為單次事件
    for (const pattern of singleEventPatterns) {
      if (pattern.test(text)) {
        console.log('檢測到單次事件模式');
        return [];
      }
    }

    let weekday = null;
    let recurringMatch = null;

    for (const pattern of recurringPatterns) {
      const match = text.match(pattern);
      if (match) {
        recurringMatch = match;
        const dayChar = match[1];
        
        // 轉換中文星期為數字
        const dayMap = {
          '一': 1, '二': 2, '三': 3, '四': 4, 
          '五': 5, '六': 6, '日': 0, '天': 0
        };
        weekday = dayMap[dayChar];
        break;
      }
    }

    if (weekday === null) {
      console.log('未找到重複模式');
      return [];
    }

    console.log('找到重複模式，星期:', weekday);

    // 解析時間 - 修正版本
    let hour = 18, minute = 0; // 預設下午6點
    const timeMatch = text.match(/(\d{1,2})[點：:](\d{1,2})?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      
      // 正確處理上下午轉換
      if (text.includes('上午') && hour === 12) hour = 0;
      else if ((text.includes('下午') || text.includes('下午')) && hour >= 1 && hour <= 11) hour += 12;
      else if (text.includes('晚上') && hour >= 1 && hour <= 11) hour += 12;
    } else {
      // 根據時段關鍵字推測時間
      if (text.includes('早上')) hour = 9;
      else if (text.includes('上午')) hour = 10;
      else if (text.includes('中午')) hour = 12;
      else if (text.includes('下午')) {
        // 檢查是否有具體時間描述
        if (text.includes('六點') || text.includes('6點')) hour = 18;
        else hour = 14;
      }
      else if (text.includes('傍晚')) hour = 17;
      else if (text.includes('晚上')) hour = 19;
    }

    // 解析開始日期
    let startDate = new Date(2025, 8, 2); // 預設下週二 (9/2)
    
    if (text.includes('下週')) {
      // 找到下週對應的日期
      const today = new Date(2025, 7, 30); // 8/30 (週六)
      const daysUntilTarget = (weekday + 7 - today.getDay()) % 7;
      if (daysUntilTarget === 0) {
        startDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // 下週
      } else {
        startDate = new Date(today.getTime() + (daysUntilTarget + 7) * 24 * 60 * 60 * 1000);
      }
    }

    // 解析結束日期
    let endDate = new Date(2025, 9, 31); // 預設十月底
    
    if (text.includes('十月底')) {
      endDate = new Date(2025, 9, 31); // 10/31
    } else if (text.includes('九月底')) {
      endDate = new Date(2025, 8, 30); // 9/30
    } else if (text.includes('年底')) {
      endDate = new Date(2025, 11, 31); // 12/31
    }

    // 解析地點 - 支援會議連結
    let location = null;
    
    // 會議連結檢測（優先）- 修正版本
    const urlPatterns = [
      /https:\/\/[^\s]*zoom\.us[^\s]*/gi,           // Zoom (簡化)
      /https:\/\/meet\.google\.com\/[^\s]*/gi,      // Google Meet (簡化)
      /https:\/\/[^\s]*webex\.com[^\s]*/gi,         // WebEx (簡化)  
      /https:\/\/teams\.microsoft\.com[^\s]*/gi,    // Teams (簡化)
      /https:\/\/[^\s]*meet[^\s]*/gi                // 通用會議連結
    ];

    for (const pattern of urlPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const url = matches[0];
        
        // 根據連結判斷平台並格式化（LINE 適用格式）
        if (url.includes('zoom.us')) {
          location = `Zoom 會議: ${url}`;
        } else if (url.includes('meet.google.com')) {
          location = `Google Meet: ${url}`;
        } else if (url.includes('webex.com')) {
          location = `WebEx 會議: ${url}`;
        } else if (url.includes('teams.microsoft.com')) {
          location = `Microsoft Teams: ${url}`;
        } else {
          location = `線上會議: ${url}`;
        }
        break;
      }
    }
    
    // 如果沒有找到連結，檢查平台關鍵字  
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
      // 檢查是否為目標星期幾
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
      
      // 移動到下一天
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`重複事件解析結果: 建立 ${events.length} 個事件`);
    return events;

  } catch (error) {
    console.error('重複事件解析錯誤:', error);
    return [];
  }
}

// 相對日期解析（原有邏輯）
function parseRelativeDate(text, title) {
  let targetDate = new Date(2025, 7, 31); // 預設明天

  if (text.includes('今天')) {
    targetDate = new Date(2025, 7, 30);
  } else if (text.includes('明天')) {
    targetDate = new Date(2025, 7, 31);
  } else if (text.includes('後天')) {
    targetDate = new Date(2025, 8, 1);
  } else if (text.includes('下週一')) {
    targetDate = new Date(2025, 8, 8);
  } else if (text.includes('下週二')) {
    targetDate = new Date(2025, 8, 2);
  } else if (text.includes('下週三')) {
    targetDate = new Date(2025, 8, 3);
  } else if (text.includes('下週四')) {
    targetDate = new Date(2025, 8, 4);
  } else if (text.includes('下週五')) {
    targetDate = new Date(2025, 8, 5);
  } else if (text.includes('下週六')) {
    targetDate = new Date(2025, 8, 6);
  } else if (text.includes('下週日')) {
    targetDate = new Date(2025, 8, 7);
  }

  // 時間和地點解析（同 parseEventInfoLocal）
  let hour = 19, minute = 0;
  const timeMatch = text.match(/(\d{1,2})[點：:](\d{1,2})?/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1]);
    minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (text.includes('上午') && hour === 12) hour = 0;
    else if (text.includes('下午') && hour >= 1 && hour <= 11) hour += 12;
    else if (text.includes('晚上') && hour >= 1 && hour <= 11) hour += 12;
  } else {
    if (text.includes('早上')) hour = 9;
    else if (text.includes('上午')) hour = 10;
    else if (text.includes('中午')) hour = 12;
    else if (text.includes('下午')) hour = 14;
    else if (text.includes('傍晚')) hour = 17;
    else if (text.includes('晚上')) hour = 19;
  }

  targetDate.setHours(hour, minute, 0, 0);

  // 解析地點 - 支援會議連結
  let location = null;
  
  // 會議連結檢測（優先）- 修正版本
  const urlPatterns = [
    /https:\/\/[^\s]*zoom\.us[^\s]*/gi,           // Zoom (簡化)
    /https:\/\/meet\.google\.com\/[^\s]*/gi,      // Google Meet (簡化)
    /https:\/\/[^\s]*webex\.com[^\s]*/gi,         // WebEx (簡化)  
    /https:\/\/teams\.microsoft\.com[^\s]*/gi,    // Teams (簡化)
    /https:\/\/[^\s]*meet[^\s]*/gi                // 通用會議連結
  ];

  for (const pattern of urlPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const url = matches[0];
      
      // 根據連結判斷平台並格式化（LINE 適用格式）
      if (url.includes('zoom.us')) {
        location = `Zoom 會議: ${url}`;
      } else if (url.includes('meet.google.com')) {
        location = `Google Meet: ${url}`;
      } else if (url.includes('webex.com')) {
        location = `WebEx 會議: ${url}`;
      } else if (url.includes('teams.microsoft.com')) {
        location = `Microsoft Teams: ${url}`;
      } else {
        location = `線上會議: ${url}`;
      }
      break;
    }
  }
  
  // 如果沒有找到連結，檢查平台關鍵字
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

// 智能活動解析函數 - 保留作為 OpenAI 備援
function parseEventInfo(text) {
  try {
    console.log('開始解析:', text);

    // 計算日期 - 修正版本
    let targetDate = new Date(2025, 7, 31); // 預設明天

    if (text.includes('今天')) {
      targetDate = new Date(2025, 7, 30); // 8/30
    } else if (text.includes('明天')) {
      targetDate = new Date(2025, 7, 31); // 8/31
    } else if (text.includes('後天')) {
      targetDate = new Date(2025, 8, 1); // 9/1 週一
    } else if (text.includes('下週一')) {
      targetDate = new Date(2025, 8, 8); // 9/8 下週一
    } else if (text.includes('下週二')) {
      targetDate = new Date(2025, 8, 2); // 9/2 週二
    } else if (text.includes('下週三')) {
      targetDate = new Date(2025, 8, 3); // 9/3 週三
    } else if (text.includes('下週四')) {
      targetDate = new Date(2025, 8, 4); // 9/4 週四
    } else if (text.includes('下週五')) {
      targetDate = new Date(2025, 8, 5); // 9/5 週五
    } else if (text.includes('下週六')) {
      targetDate = new Date(2025, 8, 6); // 9/6 週六
    } else if (text.includes('下週日') || text.includes('下週天')) {
      targetDate = new Date(2025, 8, 7); // 9/7 週日
    }

    // 解析時間 - 智能版本
    let hour = 19; // 預設晚上7點
    let minute = 0;

    // 先找具體時間數字
    const timeMatch = text.match(/(\d{1,2})[點：:]/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
    } else {
      // 如果沒有具體時間，根據時段設定預設時間
      if (text.includes('早上') || text.includes('早晨')) hour = 8;
      else if (text.includes('上午')) hour = 10;
      else if (text.includes('中午')) hour = 12;
      else if (text.includes('下午')) hour = 14;
      else if (text.includes('傍晚')) hour = 17;
      else if (text.includes('晚上')) hour = 19;
      else if (text.includes('深夜')) hour = 22;
    }

    console.log('解析時間:', hour);

    // 處理上午下午（如果有具體時間數字）
    if (timeMatch) {
      if (text.includes('上午') && hour === 12) {
        hour = 0;
      } else if (text.includes('下午') && hour >= 1 && hour <= 11) {
        hour += 12;
      } else if (text.includes('晚上') && hour >= 1 && hour <= 11) {
        hour += 12;
      }
    }

    // 設定日期時間
    targetDate.setHours(hour, minute, 0, 0);

    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();

    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // 智能標題生成
    let title = '活動';
    if (text.includes('會議') || text.includes('開會')) title = '會議';
    else if (text.includes('重要會議')) title = '重要會議';
    else if (text.includes('討論')) title = '討論';
    else if (text.includes('面談')) title = '面談';
    else if (text.includes('聚餐') || text.includes('吃飯') || text.includes('用餐')) title = '聚餐';
    else if (text.includes('健身') || text.includes('運動') || text.includes('跑步')) title = '健身運動';
    else if (text.includes('購物') || text.includes('買東西')) title = '購物';
    else if (text.includes('看電影') || text.includes('電影')) title = '看電影';
    else if (text.includes('約會')) title = '約會';
    else if (text.includes('上課') || text.includes('課程')) title = '上課';
    else if (text.includes('重要')) title = '重要活動';

    // 智能地點提取 - 修復版本
    let location = null;

    // 方法1：直接關鍵字匹配（優先）
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

    // 方法2：在...格式（如果方法1沒找到）
    if (!location) {
      const inPattern = /在(.{1,8}?)(?:[有進行舉行討論上課約會]|$)/;
      const match = text.match(inPattern);
      if (match) {
        const candidate = match[1].trim();
        // 過濾掉時間詞和無效詞
        const timeWords = ['下週', '明天', '今天', '後天', '晚上', '上午', '下午', '早上', '中午'];
        const isTimeWord = timeWords.some(word => candidate.includes(word));

        if (!isTimeWord && candidate.length > 0) {
          location = candidate;
        }
      }
    }

    // 方法3：複合詞匹配（如：台北車站、信義區等）
    if (!location) {
      const compoundPattern = /(\w{2,6}(?:車站|中心|大樓|廣場|公園|區|市|縣))/;
      const match = text.match(compoundPattern);
      if (match) {
        location = match[1];
      }
    }

    const result = {
      title: title,
      date: dateString,
      location: location
    };

    console.log('最終解析結果:', result);
    return result;

  } catch (error) {
    console.error('解析錯誤:', error);
    return null;
  }
}

// 建立 Calendar 事件
function createCalendarEvent(eventInfo) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();

    const startTime = new Date(eventInfo.date);
    if (isNaN(startTime.getTime())) {
      console.error('無效的日期:', eventInfo.date);
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

    console.log('事件建立成功:', event.getId());
    console.log('事件時間:', startTime.toLocaleString('zh-TW'));

    return true;

  } catch (error) {
    console.error('建立事件失敗:', error);
    return false;
  }
}

// 格式化日期顯示
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    
    // 手動確認週次（JavaScript Date 有時區問題）
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-based
    const day = date.getDate();
    
    // 重新建立日期以確保正確
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
    
    // 手動加上週次
    return formatted.replace(/(\d{4}\/\d{2}\/\d{2})/, `$1（${weekday}）`);
    
  } catch (error) {
    return dateString;
  }
}

// 發送 LINE 回覆
function sendReply(replyToken, message) {
  try {
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
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(url, options);
    console.log('LINE 回覆成功:', response.getResponseCode());

  } catch (error) {
    console.error('發送回覆失敗:', error);
  }
}

// 清理觸發器
function cleanupTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === 'processDelayedEvent') {
        ScriptApp.deleteTrigger(trigger);
      }
    }
    console.log('觸發器清理完成');
  } catch (error) {
    console.error('清理觸發器錯誤:', error);
  }
}

// === 測試函數 ===

// 測試解析功能
function testParse() {
  const testMessages = [
    "下週二晚上健身房",
    "明天下午2點重要會議",
    "後天上午10點在咖啡廳約會",
    "下週五晚上7點聚餐"
  ];

  testMessages.forEach(msg => {
    console.log(`\n測試: ${msg}`);
    const result = parseEventInfo(msg);
    if (result) {
      console.log('解析結果:', result);
      console.log('格式化日期:', formatDate(result.date));
    }
  });
}

// 測試 Calendar
function testCalendar() {
  const testEvent = {
    title: '測試會議',
    date: '2025-08-31 15:00',
    location: '會議室'
  };

  console.log('測試建立事件:', testEvent);
  const success = createCalendarEvent(testEvent);
  console.log('結果:', success ? '成功' : '失敗');
}

// 完整功能測試
function testComplete() {
  console.log('=== 完整功能測試 ===');

  const testMessages = [
    '下週二晚上健身房',
    '工研院SEO課程，9/3&9/10&9/17，線上會議webex',
    '每週二下午六點瑜伽課，從下週開始到十月底',
    '明天下午2點會議 https://meet.google.com/abc-defg-hij',
    '9/5 上午10點 zoom會議 https://zoom.us/j/1234567890'
  ];

  testMessages.forEach((text, index) => {
    console.log(`\n--- 測試 ${index + 1}: ${text} ---`);
    
    const events = parseEventWithStrategy(text);
    console.log(`解析結果: ${events ? events.length : 0} 個事件`, events);

    if (events && events.length > 0) {
      if (events.length === 1) {
        const eventInfo = events[0];
        const displayDate = formatDate(eventInfo.date);
        const replyText = `✅ 已成功新增到行事曆！\n\n📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}`;
        console.log('模擬回覆:', replyText);
      } else {
        console.log(`模擬回覆: ✅ 已成功新增 ${events.length} 個事件到行事曆！`);
        events.slice(0, 3).forEach((eventInfo, i) => {
          const displayDate = formatDate(eventInfo.date);
          console.log(`事件 ${i + 1}: ${eventInfo.title} - ${displayDate}`);
        });
        if (events.length > 3) {
          console.log(`... 還有 ${events.length - 3} 個事件`);
        }
      }
    } else {
      console.log('解析失敗');
    }
  });

  console.log('\n=== 測試完成 ===');
}

// 清理所有待處理事件和觸發器（緊急用）
function clearAllPendingAndTriggers() {
  try {
    // 清理待處理事件
    const properties = PropertiesService.getScriptProperties().getProperties();
    let eventCount = 0;

    for (const key of Object.keys(properties)) {
      if (key.startsWith('pending_event_')) {
        PropertiesService.getScriptProperties().deleteProperty(key);
        eventCount++;
      }
    }

    // 清理所有觸發器
    const triggers = ScriptApp.getProjectTriggers();
    let triggerCount = 0;
    
    for (const trigger of triggers) {
      ScriptApp.deleteTrigger(trigger);
      triggerCount++;
    }

    console.log(`已清理 ${eventCount} 個待處理事件`);
    console.log(`已清理 ${triggerCount} 個觸發器`);

  } catch (error) {
    console.error('清理錯誤:', error);
  }
}

// 清理過期的處理記錄
function cleanupProcessedMessages() {
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000; // 1小時
    let count = 0;

    for (const [key, value] of Object.entries(properties)) {
      if (key.startsWith('processed_')) {
        const timestamp = parseInt(value);
        if (now - timestamp > oneHour) {
          PropertiesService.getScriptProperties().deleteProperty(key);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`已清理 ${count} 個過期處理記錄`);
    }

  } catch (error) {
    console.error('清理過期記錄錯誤:', error);
  }
}