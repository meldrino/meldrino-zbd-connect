const express = require('express');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

const sessions = {};

app.use(express.static('public'));

app.get('/start', async (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = { status: 'waiting', token: null };

  const ws = new WebSocket('wss://api.zebedee.io/api/internal/v1/qrauth-socket', {
    headers: {
      'Origin': 'chrome-extension://kpjdchaapjheajadlaakiiigcbhoppda',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'internal-connection-sub-qr-auth',
      data: {
        browserOS: 'Windows',
        browserName: 'Chrome',
        QRCodeZClient: 'browser-extension'
      }
    }));
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'internal-hash-retrieved') {
      const hash = msg.data;
      const url = `https://zebedee.io/qrauth/${hash}?QRCodeZClient=browser-extension`;
      const qr = await QRCode.toDataURL(url, { width: 300 });
      sessions[sessionId].qr = qr;
      sessions[sessionId].status = 'qr_ready';
    }

    if (msg.type === 'QR_CODE_AUTH_USER_DATA') {
      sessions[sessionId].username = msg.data.username;
    }

    if (msg.type === 'QR_CODE_AUTH_USER_ACCEPT') {
      const token = msg.data.token;
      const tokenQr = await QRCode.toDataURL(token, { width: 300 });
      sessions[sessionId].token = token;
      sessions[sessionId].tokenQr = tokenQr;
      sessions[sessionId].status = 'authenticated';
      ws.close();
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    if (sessions[sessionId]) {
      sessions[sessionId].status = 'error';
    }
  });

  ws.on('close', () => {
    if (sessions[sessionId] && sessions[sessionId].status !== 'authenticated') {
      sessions[sessionId].status = 'closed';
    }
  });

  setTimeout(() => {
    delete sessions[sessionId];
  }, 10 * 60 * 1000);

  res.json({ sessionId });
});

app.get('/status/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.json({ status: 'not_found' });
  res.json(session);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
