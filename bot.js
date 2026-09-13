const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const express = require('express');
require('dotenv').config();

// Initialize AI clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Express server to keep Render web service happy
const app = express();
app.get('/', (req, res) => res.send('AI Bot & Web Server Active 🟢'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}.`));

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let designatedChannelId = null;

// Pool of AI engines to mix and match randomly for variety and humor
async function getRandomAiResponse(prompt) {
  const providers = ['groq', 'openai', 'gemini'];
  const chosenProvider = providers[Math.floor(Math.random() * providers.length)];
  
  const funnySystemPrompt = "You are a hilarious, witty, slightly sarcastic, and unpredictable Discord AI companion. Keep your answers punchy, entertaining, and don't be afraid to drop a funny joke or clever banter.";

  try {
    if (chosenProvider === 'groq') {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: funnySystemPrompt },
          { role: "user", content: prompt }
        ]
      });
      return completion.choices[0]?.message?.content;
    } else if (chosenProvider === 'openai') {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: funnySystemPrompt },
          { role: "user", content: prompt }
        ]
      });
      return completion.choices[0]?.message?.content;
    } else {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction: funnySystemPrompt }
      });
      return response.text;
    }
  } catch (err) {
    console.error(`Error with ${chosenProvider}, fallbacking...`, err);
    return "My brain just lagged out for a second. Try saying that again!";
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register the /setchannel slash command
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const command = new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Set this channel as the active chat zone for the AI bot!');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [command.toJSON()] },
    );
    console.log('Successfully registered /setchannel slash command.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setchannel') {
    designatedChannelId = interaction.channelId;
    await interaction.reply(`🎯 Got it! This channel has been locked in as my hangout spot. Talk to me here or reply to my messages!`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isTargetChannel = designatedChannelId && message.channelId === designatedChannelId;
  const isReplyToBot = message.reference && (await message.channel.messages.fetch(message.reference.messageId))?.author?.id === client.user.id;
  const isMentioned = message.mentions.has(client.user);

  // Trigger if it's in the set channel, a reply to the bot, or a direct mention
  if (isTargetChannel || isReplyToBot || isMentioned) {
    const cleanPrompt = message.content
      .replace(`<@!${client.user.id}>`, '')
      .replace(`<@${client.user.id}>`, '')
      .trim();

    if (!cleanPrompt) return;

    try {
      await message.channel.sendTyping();
      const replyText = await getRandomAiResponse(cleanPrompt);
      await message.reply(replyText || "Yikes, I got nothing.");
    } catch (error) {
      console.error(error);
      await message.reply("Oof, my circuits fried on that one.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
