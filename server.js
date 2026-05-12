require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const pasteText = req.body.text || '';
    let messages;

    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const base64 = fileBuffer.toString('base64');
      const isPDF = req.file.mimetype === 'application/pdf';

      if (isPDF) {
        messages = [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Analyze this financial statement and return the JSON analysis as instructed.' }
          ]
        }];
      } else {
        const text = fileBuffer.toString('utf-8');
        messages = [{ role: 'user', content: 'Analyze this financial statement and return the JSON analysis as instructed.\n\n' + text }];
      }
      fs.unlinkSync(req.file.path);
    } else {
      messages = [{ role: 'user', content: 'Analyze this financial statement and return the JSON analysis as instructed.\n\n' + pasteText }];
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('API Key loaded:', apiKey ? 'YES' : 'NO');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are an expert financial analyst. Analyze financial statements and return ONLY a valid JSON object with no preamble, no explanation, and no markdown code fences. The JSON must have this exact structure: {"company": "company name or Unknown", "period": "reporting period or Unknown", "overall_health": "Healthy or Concerning or Critical", "summary": "2-3 sentence plain English summary", "metrics": [{"label": "metric name", "value": "value with unit", "note": "brief context"}], "strengths": ["strength 1", "strength 2"], "red_flags": ["flag 1", "flag 2"], "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]} Return ONLY the raw JSON object. Nothing else.',
        messages: messages
      })
    });

    const rawData = await response.text();
    console.log('API Response:', rawData.substring(0, 200));

    const data = JSON.parse(rawData);

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = (data.content || []).map(function(i) { return i.text || ''; }).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('FinSight AI running on http://localhost:' + PORT);
});
