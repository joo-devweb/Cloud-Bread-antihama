// Defender.js
import { getContentType } from '@whiskeysockets/baileys';

/* RegExp util */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}]/u; // Emoji range
const ZW_RE = /[\u200B-\u200D\u2060\u3164]/; // Zero-width & Hangul filler
const NULL_RE = /\u0000/; // Null byte
const EMOJI_UNICODE_RE = /\p{Emoji}/u; // Unicode property for emojis

export function isBug(protoMsg) {
  const msg = protoMsg.message || {};
  const type = getContentType(msg);
  const node = msg[type] || {};
  const ctx = node.contextInfo || {};
  const jsonStringMsg = JSON.stringify(msg);
  const jsonSize = jsonStringMsg.length;

  let bugType = null;

  /* --- NEW BUG DETECTION: TAMA Concuerror Bomb 🔥 --- */
  // Kombinasi interactiveMessage dalam viewOnceMessage yang berisi carouselMessage
  // dengan kartu berlebihan dan nativeFlowMessage.messageParamsJson yang sangat besar.
  if (msg.viewOnceMessage?.message?.interactiveMessage?.carouselMessage) {
    const carousel = msg.viewOnceMessage.message.interactiveMessage.carouselMessage;
    
    // Trigger 1: Banyaknya cards yang tidak wajar (lebih dari 10 kartu)
    if ((carousel.cards?.length || 0) > 10) { 
        // Trigger 2: nativeFlowMessage.messageParamsJson yang sangat besar di salah satu kartu
        const oversizedParamJson = carousel.cards.some(card => {
            return card.nativeFlowMessage?.messageParamsJson &&
                   card.nativeFlowMessage.messageParamsJson.length > 5000; // Threshold contoh 5KB
        });

        // Trigger 3: Konteks info aneh di dalam carousel atau quotedMessage
        const interactiveCtx = msg.viewOnceMessage.message.interactiveMessage.contextInfo || {};
        const quotedMsgCtx = ctx.quotedMessage?.extendedTextMessage?.contextInfo || {};

        // Suspicious JID (seperti "13135550002@s.whatsapp.net") di mentionedJid
        const suspiciousJIDinCtx = (interactiveCtx.mentionedJid || []).some(jid => jid === "13135550002@s.whatsapp.net") ||
                                   (quotedMsgCtx.mentionedJid || []).some(jid => jid === "13135550002@s.whatsapp.net");
                                   
        // Suspicious forwarding score atau business owner JID
        const suspiciousForwardInfo = interactiveCtx.forwardingScore > 500 || // Score tinggi
                                      interactiveCtx.businessMessageForwardInfo?.businessOwnerJid === "13135550002@s.whatsapp.net" ||
                                      (quotedMsgCtx.participant === "0@s.whatsapp.net" && quotedMsgCtx.remoteJid === "status@broadcast");

        // Jika salah satu kondisi ini terpenuhi, maka ini adalah TAMA Concuerror Bomb
        if (oversizedParamJson || suspiciousJIDinCtx || suspiciousForwardInfo) {
            bugType = 'TAMA Concuerror Bomb';
            // Jika sudah terdeteksi TAMA, langsung return tanpa cek bug lainnya.
            return bugType;
        }
    }
  }
  /* --- END NEW BUG DETECTION --- */


  /* 1 ─ Mention flood */
  if ((ctx.mentionedJid?.length || 0) > 1_000) {
    bugType = 'Mention Flood';
  }
  /* 2 ─ Status-broadcast mention bomb */
  else if (protoMsg.key.remoteJid === 'status@broadcast' && (ctx.mentionedJid?.length || 0) > 100) {
    bugType = 'Status Broadcast Mention Bomb';
  }
  /* 3 ─ Oversize JSON (> 50 KB) */
  else if (jsonSize > 50_000) {
    bugType = 'Oversize JSON';
  }
  /* 4 ─ listMessage apocalypse */
  else if (msg.listMessage?.sections?.length > 20) {
    bugType = 'List Message Apocalypse';
  }
  /* 5 ─ albumMessage tsunami */
  else if (msg.viewOnceMessage?.message?.albumMessage?.messageList?.length > 5) {
    bugType = 'Album Message Tsunami';
  }
  /* 6 ─ interactiveMessage disisipkan di viewOnce (format edge) */
  else if (msg.viewOnceMessage?.message?.interactiveMessage) {
    // Bug ini sudah sebagian ditangani oleh TAMA Concuerror Bomb jika ada carousel
    // Tapi jika interactiveMessage sederhana dalam viewOnce, ini tetap terdeteksi.
    bugType = 'Interactive Message in ViewOnce';
  }
  /* 7 ─ Heavy carousel / nativeFlow & invalid paramsJson */
  else if (node.carouselMessage?.cards?.length > 5) {
    // Bug ini sebagian ditangani oleh TAMA Concuerror Bomb jika dalam viewOnce.
    // Ini menangani carousel message yang tidak dalam viewOnce.
    bugType = 'Heavy Carousel';
  } else if (node.nativeFlowResponseMessage?.paramsJson) {
    const pj = node.nativeFlowResponseMessage.paramsJson;
    // 7a – oversize paramsJson
    if (pj.length > 10_000) {
      bugType = 'Oversize ParamsJson';
    }
    // 7b – hanya “{” atau “}” atau sangat pendek
    else if (pj.trim() === '{' || pj.trim() === '}' || pj.length < 3) {
      bugType = 'Short/Invalid ParamsJson';
    }
    // 7c – mengandung null byte
    else if (NULL_RE.test(pj)) {
      bugType = 'Null Byte in ParamsJson';
    }
  }
  /* 8 ─ Call-offer spam */
  else if (type === 'call' || msg.callOfferMessage || msg.call) {
    bugType = 'Call Offer Spam';
  }
  /* 9 ─ Media size palsu besar */
  else if (node.stickerMessage?.fileLength?.low > 5_000_000 ||
           node.audioMessage?.fileLength > 5_000_000 ||
           node.documentMessage?.fileLength > 5_000_000) {
    bugType = 'Fake Large Media Size';
  }
  /* 10 ─ Emoji/zero-width text bomb */
  const textContent = (type === 'conversation')
    ? node
    : (type === 'extendedTextMessage')
      ? node.text
      : '';
  if (typeof textContent === 'string' && textContent.length > 2_000 &&
      (EMOJI_RE.test(textContent) || ZW_RE.test(textContent))) {
    bugType = 'Emoji/Zero-Width Text Bomb';
  }
  /* 11 ─ Null-byte di mana pun */
  else if (NULL_RE.test(jsonStringMsg)) {
    bugType = 'Null Byte Anywhere';
  }
  /* 12 ─ “Virus JID” (format ID aneh) */
  const jid = (protoMsg.key.participant || protoMsg.key.remoteJid) || '';
  if (!/^[0-9]+@s\.whatsapp\.net$/.test(jid) &&
      !jid.endsWith('@g.us') &&
      jid !== 'status@broadcast') {
    bugType = 'Virus JID (Strange ID Format)';
  }
  /* 13 ─ Waveform Bomb */
  else if (
    msg.audioMessage &&
    Array.isArray(msg.audioMessage.waveform) &&
    msg.audioMessage.waveform.length >= 500
  ) {
    bugType = 'Waveform Bomb';
  }
  /* 14 ─ Page Count / File Size Oversize (Document Message) */
  else if (msg.documentMessage) {
    const pages = msg.documentMessage.pageCount || 0;
    const size = Number(msg.documentMessage.fileLength || 0);
    if (pages > 10000 || size > 50 * 1024 * 1024) { // 50 MB
      bugType = 'Oversize Document (Pages/Size)';
    }
  }
  /* 15 ─ Emoji-Bomb & Zero Width Flood (Text Message) */
  else if (msg.conversation || msg.extendedTextMessage?.text) {
    const textToCheck = msg.conversation || msg.extendedTextMessage.text;
    const zeroWidth = (textToCheck.match(ZW_RE) || []).length;
    const emojiCount = (textToCheck.match(EMOJI_UNICODE_RE) || []).length;
    if (zeroWidth + emojiCount >= 300) {
      bugType = 'Emoji/Zero Width Flood';
    }
  }
  /* 16 ─ Virus-JID (mention aneh) */
  else if ((ctx.mentionedJid || []).filter(j => !/^\d+@s\.whatsapp\.net$/.test(j)).length > 50) {
    bugType = 'Virus JID (Strange Mention)';
  }
  /* 17 ─ List Overflow */
  else if (['listResponseMessage', 'interactiveMessage'].includes(type) &&
           ((msg.listResponseMessage?.sections?.length || 0) > 128 ||
            (msg.interactiveMessage?.nativeFlowMessage?.buttons?.length || 0) > 128 ||
            jsonSize > 20000)) {
    bugType = 'List/Interactive Message Overflow';
  }
  /* 18 ─ Mention Storm */
  else if ((msg.groupMentionedMessage?.message?.contextInfo?.mentionedJid?.length ||
            ctx.mentionedJid?.length || 0) > 50) {
    bugType = 'Mention Storm';
  }
  /* 19 ─ Media Sidecar Bomb */
  else if ((type.endsWith('Message')) && (node.seconds > 10800 || jsonSize > 15000)) {
    bugType = 'Media Sidecar Bomb';
  }

  return bugType; // Mengembalikan tipe bug jika terdeteksi, null jika tidak
}
