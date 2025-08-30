# 🤖 LINE Calendar Bot - 智能行事曆助手

將 LINE 訊息自動同步到 Google Calendar 的智能助手系統。

## ✨ 主要特色

- 📱 **LINE 整合**：通過 LINE 傳送文字或語音訊息
- 🧠 **AI 解析**：使用 OpenAI GPT 智能理解中文活動描述  
- 🎤 **語音支援**：使用 Whisper API 將語音轉為文字
- 📅 **自動同步**：直接建立到 Google Calendar
- ⚡ **即時回饋**：立即確認事件建立結果
- 🔒 **安全可靠**：LINE Signature 驗證 + 用戶白名單

## 🏗️ 系統架構

```
LINE 用戶 → LINE Bot → Google Apps Script → OpenAI API → Google Calendar
```

**處理流程：**
1. 用戶發送訊息到 LINE Bot
2. GAS 接收 Webhook 並驗證身份
3. 如果是語音，先用 Whisper 轉文字
4. 用 GPT 解析活動資訊 (標題、時間、地點)
5. 建立 Google Calendar 事件
6. 回傳確認訊息給用戶

## 📁 檔案結構

```
Jarvis/
├── main.gs                    # 主程式 - LINE Webhook 處理
├── openai-integration.gs      # OpenAI API 整合 (GPT + Whisper)
├── calendar-integration.gs    # Google Calendar API 整合
├── 部署指南.md                # 完整部署說明
└── README.md                  # 專案說明文件
```

## 🚀 快速開始

### 必要準備

1. **LINE Developer Account** - [申請連結](https://developers.line.biz/)
2. **OpenAI API Key** - [申請連結](https://platform.openai.com/)
3. **Google Apps Script** - [開始使用](https://script.google.com/)

### 一鍵部署

1. 複製程式碼到 Google Apps Script
2. 設定 API Keys 和權限
3. 部署為 Web 應用程式
4. 設定 LINE Webhook URL
5. 開始使用！

詳細步驟請參考 [📖 部署指南](./部署指南.md)

## 💬 使用範例

### 文字訊息
```
用戶: "明天下午2點有重要會議"
Bot: "✅ 已成功新增到行事曆！
     📅 重要會議  
     🕐 2024-08-30 (五) 下午02:00
     📍 未指定地點"
```

### 語音訊息  
```
用戶: [語音] "8月19號晚上8點有線上講座"
Bot: "✅ 已成功新增到行事曆！
     🎤 語音內容：8月19號晚上8點有線上講座
     📅 線上講座
     🕐 2024-08-19 (一) 晚上08:00  
     📍 線上"
```

## 🛠️ 技術細節

### 核心技術棧
- **Google Apps Script** - 後端服務平台
- **LINE Messaging API** - 訊息接收與回覆
- **OpenAI GPT-4o-mini** - 自然語言理解
- **OpenAI Whisper** - 語音轉文字
- **Google Calendar API** - 行事曆操作

### 智能解析特色
- 🇹🇼 **繁體中文優化**：針對台灣用戶語言習慣調校
- 📅 **靈活時間格式**：支援「明天」、「下週三」、「8/19」等表達
- 🎯 **語境理解**：能從對話中提取關鍵資訊
- 🔍 **內容驗證**：確保解析結果的準確性

### 安全機制
- ✅ LINE Webhook Signature 驗證
- ✅ 用戶白名單控制
- ✅ API 金鑰安全儲存
- ✅ 錯誤處理與日誌記錄

## 📊 效能與限制

### 支援格式
- ✅ 文字訊息 (無長度限制)
- ✅ 語音訊息 (建議 < 1 分鐘)
- ✅ 複雜時間表達 (相對/絕對時間)
- ✅ 多語言地點名稱

### 使用限制
- 📱 目前僅支援單一用戶 (可擴展)
- 🕐 事件預設長度 1 小時 (可調整)
- 💰 依賴 OpenAI API 額度
- 📅 使用 Google 預設行事曆

## 🔮 未來規劃

### 近期功能
- [ ] 查詢今日/明日行程
- [ ] 事件修改與刪除
- [ ] 時間衝突檢測
- [ ] 自訂提醒設定

### 長期願景  
- [ ] 多用戶支援
- [ ] Rich Menu 介面
- [ ] 智能建議功能
- [ ] 行事曆統計報告

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

### 開發環境設定
1. Fork 專案
2. 建立功能分支
3. 在 GAS 中測試
4. 提交 PR

### 程式碼規範
- 使用繁體中文註解
- 完整的錯誤處理
- Console.log 除錯資訊
- 函數命名要清楚

## 📄 授權條款

MIT License - 歡迎自由使用與修改

## 🙋‍♂️ 聯絡資訊

如有問題或建議，歡迎開 Issue 討論！

---

**⭐ 覺得有用請給個 Star，讓更多人發現這個專案！**