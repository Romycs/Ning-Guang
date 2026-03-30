const TelegramBot = require('node-telegram-bot-api');
const ytdl = require('ytdl-core');
const axios = require('axios');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('❌ Ошибка: BOT_TOKEN не установлен в .env файле');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Хранилище состояния и истории
let userMode = {};
let userHistory = {};
let multiLinks = {};

console.log('✅ Бот запущен и готов к работе!');

// Старт
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcome = "🔥 Привет! Я супер-загрузчик видео/аудио. Выбери действие:";
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎬 Скачать видео", callback_data: "video" }],
                [{ text: "🎵 Скачать аудио", callback_data: "audio" }],
                [{ text: "📥 Скачать несколько ссылок", callback_data: "multi" }]
            ]
        }
    };
    bot.sendMessage(chatId, welcome, opts);
});

// Обработка кнопок
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const choice = query.data;

    if (choice === 'multi') {
        multiLinks[chatId] = [];
        bot.sendMessage(chatId, "📥 Режим мульти-ссылок активирован. Отправляй ссылки по одной. Когда все ссылки готовы, напиши /done");
        return;
    }

    userMode[chatId] = choice;
    bot.sendMessage(chatId, `✅ Вы выбрали: ${choice === 'video' ? 'Видео' : 'Аудио'}\nОтправь ссылку:`);
});

// Завершение мультиссылок
bot.onText(/\/done/, async (msg) => {
    const chatId = msg.chat.id;
    if (!multiLinks[chatId] || multiLinks[chatId].length === 0) {
        return bot.sendMessage(chatId, "⚠️ Нет ссылок для скачивания");
    }

    bot.sendMessage(chatId, "⏳ Скачиваю все ссылки...");

    for (const link of multiLinks[chatId]) {
        try {
            await handleLink(chatId, link, 'video');
        } catch (error) {
            console.error(`Ошибка при обработке ${link}:`, error.message);
        }
    }

    multiLinks[chatId] = [];
    bot.sendMessage(chatId, "✅ Все ссылки обработаны!");
});

// Обработка сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    // Проверка мультиссылок
    if (multiLinks[chatId] && Array.isArray(multiLinks[chatId])) {
        multiLinks[chatId].push(text);
        return bot.sendMessage(chatId, `✅ Ссылка добавлена. Всего ссылок: ${multiLinks[chatId].length}`);
    }

    // Проверка выбранного режима
    if (!userMode[chatId]) {
        return bot.sendMessage(chatId, "⚠️ Сначала выбери формат через кнопки (/start)");
    }

    await handleLink(chatId, text, userMode[chatId]);
});

// Обработчик ссылки (YouTube, TikTok, Instagram, Facebook)
async function handleLink(chatId, link, mode) {
    // Сохраняем историю
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ link, type: mode, time: new Date().toISOString() });

    try {
        bot.sendMessage(chatId, `⏳ Обрабатываю: ${link}`);

        // YouTube
        if (link.includes("youtube.com") || link.includes("youtu.be")) {
            if (mode === 'audio') {
                const stream = ytdl(link, { filter: 'audioonly' });
                return bot.sendAudio(chatId, stream);
            } else {
                const stream = ytdl(link, { filter: 'audioandvideo' });
                return bot.sendVideo(chatId, stream);
            }
        }

        // TikTok
        if (link.includes("tiktok.com")) {
            const res = await axios.get(`https://api.tiklydown.me/api/download?url=${link}`);
            const video = res.data.video.noWatermark;

            if (mode === 'audio') return bot.sendAudio(chatId, video);
            else return bot.sendVideo(chatId, video);
        }

        // Instagram / Facebook
        if (link.includes("instagram.com") || link.includes("facebook.com")) {
            const res = await axios.get(`https://api.tiktokfullapi.com/download?url=${encodeURIComponent(link)}`);
            const video = res.data.video || link;

            if (mode === 'audio') return bot.sendAudio(chatId, video);
            else return bot.sendVideo(chatId, video);
        }

        bot.sendMessage(chatId, "✅ Готово!");
    } catch (e) {
        console.error(`Ошибка при скачивании ${link}:`, e.message);
        bot.sendMessage(chatId, `❌ Ошибка при скачивании: ${link}\n${e.message}`);
    }
}

// Команда /history - ИСПРАВЛЕНА
bot.onText(/\/history/, (msg) => {
    const chatId = msg.chat.id;
    if (!userHistory[chatId] || userHistory[chatId].length === 0) {
        return bot.sendMessage(chatId, "📭 История пустая");
    }

    let historyText = "📝 Ваша история (последние 10 ссылок):\n\n";
    userHistory[chatId].slice(-10).forEach((item, i) => {
        historyText += `${i + 1}. [${item.type}] ${item.link} (${item.time})\n`;
    });

    bot.sendMessage(chatId, historyText);
});

// Команда /clear - очистить историю
bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;
    userHistory[chatId] = [];
    bot.sendMessage(chatId, "✅ История очищена");
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});