const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const express = require('express');
const Database = require('better-sqlite3');
require('dotenv').config();

// --- Local Database Setup (SQLite) ---
const db = new Database('database.sqlite');
db.prepare(`
  CREATE TABLE IF NOT EXISTS server_configs (
    guild_id TEXT PRIMARY KEY,
    custom_name TEXT DEFAULT 'CustomBot',
    logo_url TEXT,
    personality TEXT DEFAULT 'Helpful companion',
    active_ai TEXT DEFAULT 'groq',
    reply_chance REAL DEFAULT 0.03
  )
`).run();

// --- Services Setup ---
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: 'https://api.groq.com/openai/v1' 
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Local Web Dashboard for Server Customization ---
app.get('/dashboard/:guildId', (req, res) => {
  const { guildId } = req.params;
  const config = db.prepare('SELECT * FROM server_configs WHERE guild_id = ?').get(guildId);
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Bot Customization Dashboard</title></head>
      <body style="background:#0d1117; color:#c9d1d9; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
        <div style="background:#161b22; padding:30px; border-radius:12px; width:380px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
          <h2>Customize Bot Identity</h2>
          <form method="POST" action="/update/${guildId}">
            <label style="font-size:14px;">Custom Name:</label><br>
            <input type="text" name="custom_name" value="${config?.custom_name || 'CustomBot'}" style="width:100%; padding:8px; margin-top:5px; margin-bottom:15px; background:#0d1117; border:1px solid #30363d; color:#fff; border-radius:6px;"><br>
            
            <label style="font-size:14px;">Logo Image URL:</label><br>
            <input type="text" name="logo_url" value="${config?.logo_url || ''}" style="width:100%; padding:8px; margin-top:5px; margin-bottom:15px; background:#0d1117; border:1px solid #30363d; color:#fff; border-radius:6px;"><br>
            
            <label style="font-size:14px;">Personality / Vibe:</label><br>
            <textarea name="personality" rows="3" style="width:100%; padding:8px; margin-top:5px; margin-bottom:15px; background:#0d1117; border:1px solid #30363d; color:#fff; border-radius:6px;">${config?.personality || 'Helpful and witty'}</textarea><br>

            <label style="font-size:14px;">AI Engine Choice:</label><br>
            <select name="active_ai" style="width:100%; padding:8px; margin-top:5px; margin-bottom:20px; background:#0d1117; border:1px solid #30363d; color:#fff; border-radius:6px;">
              <option value="groq" ${config?.active_ai === 'groq' ? 'selected' : ''}>Groq (Llama 3.3 - Ultra Fast)</option>
              <option value="openai" ${config?.active_ai === 'openai' ? 'selected' : ''}>ChatGPT (GPT-4o-mini)</option>
              <option value="gemini" ${config?.active_ai === 'gemini' ? 'selected' : ''}>Gemini Flash</option>
            </select><br>

            <button type="submit" style="width:100%; padding:10px; background:#238636; border:none; color:#fff; font-weight:bold; border-radius:6px; cursor:pointer;">Save Customizations</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/update/:guildId', (req, res) => {
  const { guildId } = req.params;
  const { custom_name, logo_url, personality, active_ai } = req.body;

  db.prepare(`
    INSERT INTO server_configs (guild_id, custom_name, logo_url, personality, active_ai)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      custom_name = excluded.custom_name,
      logo_url = excluded.logo_url,
      personality = excluded.personality,
      active_ai = excluded.active_ai
  `).run(guildId, custom_name, logo_url, personality, active_ai);

  res.send('<h3 style="font-family:sans-serif; text-align:center; margin-top:50px;">Settings saved successfully! You can close this window and return to Discord.</h3>');
});

// --- Discord Slash Commands ---
client.once('ready', async () => {
  console.log(`AI Bot logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('configure')
      .setDescription('Get the private web dashboard link to customize this AI bot for your server.')
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'configure') {
    await interaction.reply({ 
      content: `Customize your server's AI bot identity here: \`https://your-render-url.onrender.com/dashboard/${interaction.guildId}\``, 
      ephemeral: true 
    });
  }
});

// --- Token-Optimized AI Chat Listener ---
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  let config = db.prepare('SELECT * FROM server_configs WHERE guild_id = ?').get(message.guild.id);
  
  const botName = config?.custom_name || 'CustomBot';
  const personality = config?.personality || 'Helpful companion';
  const activeAi = config?.active_ai || 'groq';
  const isMentioned = message.mentions.has(client.user);

  // Token Saver: Only respond if mentioned OR randomly trigger on 3% of messages
  const shouldRandomlyChimeIn = Math.random() < 0.03;
  if (!isMentioned && !shouldRandomlyChimeIn) return;

  try {
    let aiResponse = '';
    const systemPrompt = `You are [${botName}], a Discord bot. Vibe/Personality: ${personality}. Keep responses concise, punchy, and under 2 sentences to save tokens.`;
    const userPrompt = message.content;

    if (activeAi === 'groq') {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 50,
      });
      aiResponse = completion.choices[0].message.content;
    } else if (activeAi === 'openai') {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 50,
      });
      aiResponse = completion.choices[0].message.content;
    } else {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\nUser says: "${userPrompt}"`,
      });
      aiResponse = response.text();
    }

    if (message.guild.members.me.nickname !== botName) {
      await message.guild.members.me.setNickname(botName).catch(() => {});
    }

    await message.reply(aiResponse);
  } catch (err) {
    console.error('AI generation error:', err);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('AI web server & bot active.'));
client.login(process.env.DISCORD_TOKEN);
