import fs from "fs";
import _ from "lodash";
import TelegramBot from "node-telegram-bot-api";
import { log } from "./utils";
import low from "lowdb";
import FileSync from "lowdb/adapters/FileSync";

const adapter = new FileSync("data/db.json", {
    defaultValue: { userStickers: {}, deleteMode: [] }
});
const db = low(adapter);

function getStickers(userId) {
    const isUserInDb = db.has(`userStickers.${userId}`).value();
    let stickers;
    if (isUserInDb) {
        stickers = db.get(`userStickers.${userId}`).value();
    } else {
        stickers = [];
    }
    return stickers;
}

function addStickerToUser(userId, stickerId, uniqueId, bot, chatId) {
    const isIncluded = db
        .get(`userStickers.${userId}`)
        .find({ id: uniqueId })
        .value();
    if (!isIncluded) {
        db.get(`userStickers.${userId}`)
            .push({ id: uniqueId, sticker_file_id: stickerId, type: "sticker" })
            .write();
        bot.sendMessage(chatId, "Sticker added to your favourites.");
    } else {
        bot.sendMessage(chatId, "Sticker is already in your favourites.");
    }
}

function addUserToDb(userId) {
    db.set(`userStickers.${userId}`, []).write();
}

async function processSticker(bot, msg, users) {
    if (users.includes(msg.from.id)) {
        const isUserInDb = db.has(`userStickers.${msg.from.id}`).value();
        if (isUserInDb) {
            log("User is in database");
            addStickerToUser(
                msg.from.id,
                msg.sticker.file_id,
                msg.sticker.file_unique_id,
                bot,
                msg.chat.id
            );
        } else {
            log("User is not in database");
            addUserToDb(msg.from.id);
            log("User added to database");
            addStickerToUser(
                msg.from.id,
                msg.sticker.file_id,
                msg.sticker.file_unique_id,
                bot,
                msg.chat.id
            );
        }
    }
}

async function readConfig() {
    const configFile = fs.readFileSync("./data/config.json");
    const config = JSON.parse(configFile);
    return config;
}

async function init() {
    const config = await readConfig();
    const bot = new TelegramBot(config.token, { polling: true });

    bot.on("sticker", msg => {
        if (msg.chat.type === "private") {
            processSticker(bot, msg, config.users);
            console.log(msg.from.id, msg.sticker.file_unique_id)
        }
    });

    bot.on("inline_query", query => {
        if (config.users.includes(query.from.id)) {
            const userId = query.from.id;
            const allReplies = getStickers(userId);

            const offset = Number(query.offset) || 0;
            const nextOffset =
                offset + 50 > allReplies.length ? null : offset + 50;
            const reply = _.slice(allReplies, offset, offset + 50);

            let replyOptions = {
                next_offset: nextOffset,
                cache_time: 1
            };
            if (allReplies.length === 0) {
                replyOptions["switch_pm_text"] = "No stickers found!";
                replyOptions["switch_pm_parameter"] = "_";
            }

            bot.answerInlineQuery(query.id, reply, replyOptions);
        } else {
            bot.answerInlineQuery(query.id, [], {
                switch_pm_text: "You are not an authorised user!",
                switch_pm_parameter: "_"
            });
        }
    });

    bot.on("polling_error", console.error);
}

init();
