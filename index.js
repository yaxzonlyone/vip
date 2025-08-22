// index.js
// WhatsApp MD bot (pairing code). Run with: node index.js
// Requires: npm i @whiskeysockets/baileys pino

import baileys from "@whiskeysockets/baileys"
import readline from "readline"
import pino from "pino"
import { readdirSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = baileys

// setup readline
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, res))

// helper: load plugins dari folder ./plugins
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const plugins = []
for (const file of readdirSync(path.join(__dirname, "plugins")).filter(f => f.endsWith(".js"))) {
  const plugin = await import(`./plugins/${file}`)
  if (typeof plugin.default === "function") plugins.push(plugin.default)
}

async function startBot() {
  console.clear()
  console.log("🚀 Starting WhatsApp Bot...\n")

  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "110.0.5585.95"],
    syncFullHistory: false,
    // logger pake pino, diset silent biar terminal bersih
    logger: pino({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect } = u

    if (connection === "connecting") {
      console.log("🔄 Connecting to WhatsApp...")
    }
    if (connection === "open") {
      console.log("✅ Bot connected successfully!\n")
    }
    if (connection === "close") {
      console.log("❌ Connection closed")
    }

    if (lastDisconnect?.error) {
      const statusCode = lastDisconnect.error?.output?.statusCode
      console.error("⚠️ Disconnect reason:", lastDisconnect.error?.message || lastDisconnect.error)

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting...")
        startBot()
      } else {
        console.log("❌ Session expired, hapus folder auth lalu pairing ulang")
        process.exit(1)
      }
    }
  })

  // generate pairing code
  if (!state.creds?.registered) {
    const input = await ask("📱 Masukin nomor (pakai kode negara, tanpa '+', contoh: 62812xxxx): ")
    rl.close()
    const phoneNumber = String(input).replace(/[^0-9]/g, "")
    if (!phoneNumber) {
      console.error("❌ Nomor tidak valid.")
      process.exit(1)
    }
    try {
      const code = await sock.requestPairingCode(phoneNumber)
      console.log("\n=== 🔗 KODE PAIRING ===")
      console.log(code)
      console.log("=======================\n")
    } catch (e) {
      console.error("❌ Gagal minta pairing code:", e?.message || e)
      process.exit(1)
    }
  } else {
    rl.close()
    console.log("✅ Session sudah terdaftar, bot siap.\n")
  }

  // handler pesan
  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!messages?.length) return
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    try {
      // auto read
      await sock.readMessages([m.key])

      // lempar ke semua plugin
      for (const plugin of plugins) {
        await plugin(sock, m)
      }
    } catch (e) {
      console.error("plugin error:", e)
    }
  })
}

startBot()
