// LINE Bot + Google Calendar 整合系統 - 生產版本
// 包含語音支援、重複事件、多日期解析、安全機制

const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const LINE_CHANNEL_SECRET = 'YOUR_LINE_CHANNEL_SECRET';
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';
const TARGET_USER_ID = 'YOUR_TARGET_USER_ID';

function doGet() {
  return HtmlService.createHtmlOutput('LINE Bot Calendar Integration - Running')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 緊急安全開關 - 設為 false 啟用處理（已修復防重複機制）
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
    
    // 只保留最近100條訊息記錄，避免無限增長
    if (messageList.length > 100) {
      messageList.splice(0, messageList.length - 100);
    }
    
    properties.setProperty('processed_messages', JSON.stringify(messageList));
  }
}

// 詳細代碼請參考 main-local.gs
// 此檔案為部署用版本，隱藏敏感資訊