require('dotenv').config();
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

axios.post('https://api.telegram.org/bot' + token + '/sendMessage', {
  chat_id: chatId,
  text: '✅ *Monitor Ton conectado!*\n\nVou te avisar aqui sempre que o site da Ton mudar. 🚀',
  parse_mode: 'Markdown',
})
.then(r => console.log('ENVIADO! ok =', r.data.ok))
.catch(e => console.error('ERRO:', e.response?.data ?? e.message));
