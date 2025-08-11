const { makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Remplace
const YOUR_BOT_TOKEN = ""; // Remplacez par votre token de bot Telegram
const YOUR_CHAT_ID = ""; // Remplacez par votre ID de chat Telegram

async function sendMsgToTelegram(message){
    /*
    const url = `https://api.telegram.org/bot${YOUR_BOT_TOKEN}/sendMessage`;
    const params = {
        chat_id: YOUR_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
    };

    try {
        const response = await axios.post(url, params);
        if (response.data.ok) {
            console.log("Message envoyé à Telegram avec succès");
        } else {
            console.error("Erreur lors de l'envoi du message à Telegram:", response.data.description);
        }
    } catch (error) {
        console.error("Erreur lors de l'envoi du message à Telegram:", error.message);
    }
        */
}

async function logToTxtFile(sender, messageTimestamp, message){
    const logMessage = `Nouveau message de ${sender} : ${message}\n`;
    const logFilePath = `${sender.replaceAll("@", "")}/${messageTimestamp}.txt`;

    // Assurez-vous que le dossier existe ou creez-le
    try {
        if (!fs.existsSync(sender.replaceAll("@", ""))) {
            fs.mkdirSync(sender.replaceAll("@", ""), { recursive: true });
        }
    } catch (error) {
        console.error("Erreur lors de la création du dossier:", error.message);
        return;
    }

    try {
        fs.appendFileSync(logFilePath, logMessage);
        console.log("Message enregistré dans le fichier:", logFilePath);
    } catch (error) {
        console.error("Erreur lors de l'enregistrement du message dans le fichier:", error.message);
    }
}

async function connectWhatsapp() {
    console.log("Initialisation pour se connecter à mon compte...");
    const auth = await useMultiFileAuthState("session");
    const socket = makeWASocket({
        //printQRInTerminal: true,
        browser: ["WisBrowser", "", ""],
        auth: auth.state,
        logger: pino({ level: "silent" }),
    });

    socket.ev.on("creds.update", auth.saveCreds);
    socket.ev.on("connection.update", async ({ connection, qr }) => {
        if (connection === "open") {
            console.log("Wis Auto Status + backup des messages Bot operationel ✅");
        } else if (qr) {
            qrcode.generate(qr, { small: true }); // Génère un QR code plus petit
        } else if (connection === "close") {
            console.log("Connexion fermé. En attente de reconnexion...");
            await connectWhatsapp();
        }
    });

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
        //console.log("Nouvelle detection de message:", messages);
        const chat = messages[0];

        const isMessagePersonal = chat.key.remoteJid.endsWith("@s.whatsapp.net");
        const isGroupMessage = chat.key.remoteJid.endsWith("@g.us");
        const isStatusMessage = chat.key.remoteJid === "status@broadcast";
        const isImageMessage = chat.message?.imageMessage;
        const isVideoMessage = chat.message?.videoMessage;
        const isAudioMessage = chat.message?.audioMessage;
        const isDocumentMessage = chat.message?.documentMessage;
        const isTextMessage = chat.message?.conversation || chat.message?.extendedTextMessage;

        //download and save medias functions
        
        async function downloadMedia() {
            let mediaType, mimetype, caption, extension;
            if (isImageMessage) {
                mediaType = chat.message.imageMessage;
                mimetype = mediaType.mimetype;
                caption = mediaType.caption || "Image reçue";
            } else if (isVideoMessage) {
                mediaType = chat.message.videoMessage;
                mimetype = mediaType.mimetype;
                caption = mediaType.caption || "Vidéo reçue";
            } else if (isAudioMessage) {
                mediaType = chat.message.audioMessage;
                mimetype = mediaType.mimetype;
                caption = "Audio reçu";
            } else if (isDocumentMessage) {
                mediaType = chat.message.documentMessage;
                mimetype = mediaType.mimetype;
                caption = mediaType.caption || "Document reçu";
            } else {
                console.log("Type de média non supporté");
                return;
            }
            extension = mimetype.split('/')[1];
        
            try {
                if (!fs.existsSync(chat.key.remoteJid.replaceAll("@", ""))) {
                    fs.mkdirSync(chat.key.remoteJid.replaceAll("@", ""), { recursive: true });
                }
            } catch (error) {
                console.error("Erreur lors de la création du dossier:", error.message);
            }
        
            const mediaBuffer = await downloadMediaMessage(
                chat,
                'buffer',
                {},
                { logger: socket.logger, reuploadRequest: socket.reuploadRequest }
            );
            const mediaPath = `${chat.key.remoteJid.replaceAll("@", "")}/${chat.key.id}.${extension}`;
            fs.writeFileSync(mediaPath, mediaBuffer);
            console.log(`Media téléchargé et enregistré sous : ${mediaPath}`);
            await logToTxtFile(chat.key.remoteJid, chat.messageTimestamp, `Media téléchargé : ${mediaPath}, Caption : ${caption}`);
        }

        //const isGroupAdmin = isGroupMessage && chat.participant && chat.participant.endsWith("@s.whatsapp.net");
        const isCommunauteMessage = chat.key.remoteJid.endsWith("@newsletter");
        
        // Vérifier si le message est envoyé par le bot lui-même
        if (chat.key.fromMe) {
            console.log("Message envoyé par le bot,: ", chat);
            return;
        }

        let pesan = (chat.message?.extendedTextMessage?.text ?? chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ?? chat.message?.conversation)?.toLowerCase() || "";
        // voir tout les status automatiquement
        if(chat.key.remoteJid == "status@broadcast"){
            console.log("Nouveau Status");
            await socket.readMessages([chat.key]);
            console.log("Status Vu : ", chat.key);
        }
        


        // gerer les discussions privées
        if (isMessagePersonal) {
            console.log("Message personnel reçu");
            //recuper les medias
            if(isAudioMessage || isImageMessage || isVideoMessage || isDocumentMessage){
                console.log("Message audio reçu");
                await downloadMedia();
            }else if (isTextMessage) {
                console.log("Message texte reçu");
                await logToTxtFile(chat.key.remoteJid, chat.messageTimestamp, pesan);
                await sendMsgToTelegram(`Nouveau message de ${chat.key.remoteJid} : ${pesan}`);
            }
        } else if (isGroupMessage) {
            console.log("Message de groupe reçu");
        } else if (isStatusMessage) {
            console.log("Message de statut reçu");
        } else if (isCommunauteMessage) {
            console.log("Message de communauté reçu");
        }

        function extractViewOnceMessage(msg) {
    if (msg?.viewOnceMessageV2) return msg.viewOnceMessageV2;
    if (msg?.viewOnceMessage) return msg.viewOnceMessage;
    if (msg?.ephemeralMessage?.message?.viewOnceMessageV2) return msg.ephemeralMessage.message.viewOnceMessageV2;
    if (msg?.ephemeralMessage?.message?.viewOnceMessage) return msg.ephemeralMessage.message.viewOnceMessage;
    return null;
}
        const viewOnceMessage = extractViewOnceMessage(chat.message);

        //telecharger les medias à vu unique
        if (viewOnceMessage) {
            console.log("Message à vue unique reçu");
            const realMessage = viewOnceMessage.message;

            try {
                const buffer = await downloadMediaMessage(
                { message: realMessage, type: 'viewOnce' },
                'buffer'
                );

                const fileType = realMessage?.imageMessage ? 'jpg' :
                                realMessage?.videoMessage ? 'mp4' : 'bin';

                const fileName = `media_${Date.now()}.${fileType}`;
                fs.writeFileSync(path.join(__dirname, fileName), buffer);
                console.log(`📥 Média enregistré : ${fileName}`);
            } catch (err) {
                console.error('❌ Erreur lors du téléchargement du média :', err);
            }
            //await downloadMedia();
        }

        
        


        //console.log (`Nouveau message de ${chat.key.remoteJid} : ${pesan}`);
        console.log("Chat : ", chat);
        //console.log("Message : ", messages);
        //await sendMsgToTelegram(`Nouveau message de ${chat.key.remoteJid} : ${pesan}`);
        //await logToTxtFile(chat.key.remoteJid, chat.messageTimestamp, pesan);
            

    });
}

connectWhatsapp();
