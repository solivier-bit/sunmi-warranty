const express = require('express');
const CryptoJS = require('crypto-js');

const app = express();
app.use(express.json());

// Sunmi encryption config
const CONFIG = {
  isEncrypted: 1,
  md5Key: 'Jihewobox15',
  desKey: CryptoJS.enc.Utf8.parse('jihexxkj'),
  desIv:  CryptoJS.enc.Utf8.parse('98765432'),
};

function encryptParams(serialNumber) {
  const payload = JSON.stringify({ msn: serialNumber });
  const encrypted = CryptoJS.TripleDES.encrypt(payload, CONFIG.desKey, {
    iv: CONFIG.desIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encodeURIComponent(encrypted.toString());
}

function buildSign(params, timeStamp, randomNum) {
  const md5KeyHash = CryptoJS.MD5(CONFIG.md5Key).toString();
  const raw = params + CONFIG.isEncrypted + timeStamp + randomNum + md5KeyHash;
  return CryptoJS.MD5(raw).toString();
}

async function checkWarranty(serialNumber) {
  const timeStamp = Math.floor(Date.now() / 1000);
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const params    = encryptParams(serialNumber);
  const sign      = buildSign(params, timeStamp, randomNum);

  const body = new URLSearchParams({
    service:     'Serviceplat.getMachineInfoByMsn',
    timeStamp:   timeStamp,
    randomNum:   randomNum,
    isEncrypted: CONFIG.isEncrypted,
    lang:        'en',
    params:      params,
    sign:        sign,
  });

  const res = await fetch(
    'https://webapi.sunmi.com/webapi/website/web/docking/1.0/?service=Serviceplat.getMachineInfoByMsn',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    }
  );

  return await res.json();
}

// GET /warranty?sn=YOUR_SERIAL_NUMBER
app.get('/warranty', async (req, res) => {
  const { sn } = req.query;

  if (!sn) {
    return res.status(400).json({ error: 'Missing serial number. Use ?sn=YOUR_SERIAL_NUMBER' });
  }

  try {
    const json = await checkWarranty(sn);

    if (json.code === 1 && json.data && json.data.machine_msn) {
      const d = json.data;
      return res.json({
        sunmi_device:    true,
        serial:          d.machine_msn,
        device:          d.machine_name || d.machine_en_name,
        warranty_status: d.machine_warranty_status === 1 ? 'In Warranty' : 'Out of Warranty',
        in_warranty:     d.machine_warranty_status === 1,
        expires:         d.machine_over_date,
        activated:       d.machine_active_date,
      });
    } else {
      // Device not found in Sunmi system — not a Sunmi device, do nothing
      return res.json({
        sunmi_device: false,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reach Sunmi API' });
  }
});

// Health check
app.get('/', (req, res) => res.send('Sunmi Warranty API is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
