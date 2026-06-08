// QuirófanoHH — Netlify Function: send-email
// Brevo API con soporte de adjunto .ics
// Variables de entorno en Netlify:
//   BREVO_API_KEY   → API key de Brevo
//   BREVO_FROM      → correo remitente verificado en Brevo
//   BREVO_FROM_NAME → nombre del remitente (opcional)

export const handler = async (event) => {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { to, subject, message, icsContent } = body;

  if (!to || !subject || !message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Faltan campos: to, subject, message' }),
    };
  }

  // Normalizar destinatarios
  const rawList = Array.isArray(to) ? to : String(to).split(',');
  const recipients = [...new Set(
    rawList.map(e => String(e).trim()).filter(e => e && e.includes('@'))
  )];

  if (!recipients.length) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'No hay destinatarios válidos' }),
    };
  }

  const BREVO_API_KEY   = process.env.BREVO_API_KEY;
  const BREVO_FROM      = process.env.BREVO_FROM      || 'noreply@hospitalhumanitario.ec';
  const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || 'Hospital Humanitario · QuirófanoHH';

  if (!BREVO_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'BREVO_API_KEY no configurada' }),
    };
  }

  // Convertir saltos de línea a <br> para HTML
  const htmlBody = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const brevoPayload = {
    sender: { name: BREVO_FROM_NAME, email: BREVO_FROM },
    to: recipients.map(email => ({ email })),
    subject,
    textContent: message,
    htmlContent: `<div style="font-family:monospace;font-size:13px;line-height:1.7;white-space:pre-wrap;max-width:640px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f4">${htmlBody}</div>`,
  };

  // Adjuntar .ics si viene en el payload
  if (icsContent && typeof icsContent === 'string' && icsContent.includes('BEGIN:VCALENDAR')) {
    const icsBase64 = Buffer.from(icsContent, 'utf-8').toString('base64');
    brevoPayload.attachment = [{
      name: 'cirugia_hospitalhumanitario.ics',
      content: icsBase64,
    }];
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'api-key':      BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Brevo error:', JSON.stringify(result));
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          ok: false,
          error: result?.message || 'Error de Brevo',
          detail: result,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        sent: recipients.length,
        messageId: result.messageId || null,
        withCalendar: !!brevoPayload.attachment,
      }),
    };

  } catch (err) {
    console.error('Error llamando Brevo:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
