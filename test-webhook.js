// 測試 LINE Webhook 連線
// 在瀏覽器 console 中執行

const webhookUrl = 'YOUR_GAS_WEBAPP_URL'; // 替換為你的 GAS URL

const testData = {
  events: [{
    type: 'message',
    message: {
      type: 'text',
      text: '測試訊息',
      id: 'test123'
    },
    source: {
      userId: 'YOUR_TARGET_USER_ID' // 替換為你的 USER_ID
    }
  }]
};

fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testData)
})
.then(response => response.text())
.then(data => console.log('Response:', data))
.catch(error => console.error('Error:', error));