// plugins/sticker.js
import { writeFileSync, unlinkSync, readFileSync } from "fs"
import { spawn } from "child_process"
import path from "path"
import os from "os"
import { downloadMediaMessage } from "@whiskeysockets/baileys"

export default async function sticker(sock, m) {
  try {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || ""
    const isCmd = text.startsWith(".sticker")
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage

    if (!isCmd) return

    const mediaMsg = quoted ? quoted : m.message?.imageMessage || m.message?.videoMessage
    if (!mediaMsg) {
      await sock.sendMessage(m.key.remoteJid, { text: "❌ kirim gambar/video + reply pake .sticker" }, { quoted: m })
      return
    }

    // download media pake baileys helper
    const buffer = await downloadMediaMessage(
      { message: mediaMsg },
      "buffer",
      {}
    )
    if (!buffer) return

    // simpan file sementara
    const tmpIn = path.join(os.tmpdir(), `${Date.now()}.jpg`)
    const tmpOut = path.join(os.tmpdir(), `${Date.now()}.webp`)
    writeFileSync(tmpIn, buffer)

    // convert pake ffmpeg → webp
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-i", tmpIn,
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white",
        "-loop", "0",
        "-ss", "00:00:00",
        "-t", "00:00:08",
        "-an",
        "-vcodec", "libwebp",
        tmpOut
      ])
      ff.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg error")))
    })

    // kirim sticker
    const webp = readFileSync(tmpOut)
    await sock.sendMessage(m.key.remoteJid, { sticker: webp }, { quoted: m })

    // hapus file sementara
    unlinkSync(tmpIn)
    unlinkSync(tmpOut)

  } catch (e) {
    console.error("sticker plugin error:", e)
    await sock.sendMessage(m.key.remoteJid, { text: "❌ gagal bikin stiker" }, { quoted: m })
  }
}
