// api/vision.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { imageBase64 } = req.body || {};
    if (!imageBase64 || !imageBase64.includes(',')) return res.status(400).json({ error: 'Missing imageBase64' });

    const b64 = imageBase64.split(',').pop();
    const region = process.env.AWS_REGION || 'us-east-1';
    const key = process.env.AWS_ACCESS_KEY_ID;
    const secret = process.env.AWS_SECRET_ACCESS_KEY;
    if (!key || !secret) return res.status(500).json({ error: 'Missing AWS credentials' });

    const host = `rekognition.${region}.amazonaws.com`;
    const amzTarget = 'RekognitionService.DetectLabels';
    const body = JSON.stringify({ Image: { Bytes: b64 }, MaxLabels: 15, MinConfidence: 70 });

    // ---- SigV4 signing (minimal) ----
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0,15)+'Z'; // yyyymmddThhmmssZ
    const dateStamp = amzDate.slice(0,8);
    const service = 'rekognition';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${amzTarget}\n`;
    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
    const kDate = hmac('AWS4' + secret, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authHeader = `${algorithm} Credential=${key}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const rekResp = await fetch(`https://${host}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Date': amzDate,
        'X-Amz-Target': amzTarget,
        'Authorization': authHeader
      },
      body
    });

    const data = await rekResp.json();
    const keywords = (data.Labels || []).map(l => l.Name).slice(0, 8);
    res.status(200).json({ keywords, rawCount: (data.Labels || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};
