require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── AI PROXY — key never leaves the server ──────────────────────
app.post('/api/chat', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'paste_your_key_here') {
    return res.status(500).json({ error: 'API key not set in .env file' });
  }

  const { messages, system } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':          key,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
    res.json({ text: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  ██████╗ ██████╗ ██╗███╗   ██╗██████╗ ');
  console.log('  ██╔════╝██╔══██╗██║████╗  ██║██╔══██╗');
  console.log('  ██║  ███╗██████╔╝██║██╔██╗ ██║██║  ██║');
  console.log('  ██║   ██║██╔══██╗██║██║╚██╗██║██║  ██║');
  console.log('  ╚██████╔╝██║  ██║██║██║ ╚████║██████╔╝');
  console.log('   ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ ');
  console.log('');
  console.log(`  Running at → http://localhost:${PORT}`);
  console.log('');
});
