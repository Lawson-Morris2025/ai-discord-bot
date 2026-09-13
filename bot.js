// bot.js
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const express = require('express');
const path = require('path');
require('dotenv').config();

// Initialize AI clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Express Setup for Web Dashboard
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// In-memory storage for single-server settings
let serverConfig = {
  customName: "AI Assistant",
  logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  personality: "You are a helpful, witty, and concise Discord AI assistant.",
  activeAi: "groq"
};

// Serve Dashboard HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/update', (req, res) => {
  serverConfig.customName = req.body.custom_name || serverConfig.customName;
  serverConfig.logoUrl = req.body.logo_url || serverConfig.logoUrl;
  serverConfig.personality = req.body.personality || serverConfig.personality;
  serverConfig.activeAi = req.body.active_ai || serverConfig.activeAi;
  res.send(`<!DOCTYPE html><html><body style="background:#0d1117;color:#c9d1d9;font-family:sans-serif;text-align:center;padding-top:50px;"><h2>Settings Saved Successfully!</h2><p><a href="/" style="color:#238636;">Go Back</a></p></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI web server & dashboard active on port ${PORT}.`));

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}! Bot is ready.`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Respond if mentioned or if it's in a channel where it should listen
  if (message.mentions.has(client.user)) {
    const prompt = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
    if (!prompt) return;

    try {
      await message.channel.sendTyping();
      let reply = "";

      const systemPrompt = serverConfig.personality;

      if (serverConfig.activeAi === 'groq') {
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ]
        });
        reply = completion.choices[0]?.message?.content;
      } else if (serverConfig.activeAi === 'openai') {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ]
        });
        reply = completion.choices[0]?.message?.content;
      } else if (serverConfig.activeAi === 'gemini') {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { systemInstruction: systemPrompt }
        });
        reply = response.text;
      }

      await message.reply(reply || "Hmm, I didn't get a response from the AI engine.");
    } catch (error) {
      console.error(error);
      await message.reply("Oops! Something went wrong processing your request.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
