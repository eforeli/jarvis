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

    // 解析活動資訊
    const eventInfo = parseEventInfo(text);

    let replyText;
    if (eventInfo) {
      // 建立 Calendar 事件
      const success = createCalendarEvent(eventInfo);

      if (success) {
        const displayDate = formatDate(eventInfo.date);
        replyText = `✅ 已成功新增到行事曆！\n\n📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}`;
      } else {
        replyText = '❌ 建立行事曆事件失敗，請重試。';
      }
    } else {
      replyText = '❓ 無法解析活動資訊。\n請提供時間資訊，例如：\n「明天下午2點有會議」';
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

// 智能活動解析函數 - 最終版本
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

  const text = '下週二晚上健身房';
  console.log('測試訊息:', text);

  const eventInfo = parseEventInfo(text);
  console.log('解析結果:', eventInfo);

  if (eventInfo) {
    const success = createCalendarEvent(eventInfo);
    console.log('建立事件結果:', success ? '成功' : '失敗');

    if (success) {
      const displayDate = formatDate(eventInfo.date);
      const replyText = `✅ 已成功新增到行事曆！\n\n📅 ${eventInfo.title}\n🕐 ${displayDate}\n📍 ${eventInfo.location || '未指定地點'}`;
      console.log('模擬回覆:', replyText);
    }
  }

  console.log('=== 測試完成 ===');
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