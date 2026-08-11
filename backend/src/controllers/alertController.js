const { Resend } = require('resend');

const sendLowSourceAlert = async (req, res, next) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { sourceLevel } = req.body;

    const { data, error } = await resend.emails.send({
      from: 'Your App <onboarding@resend.dev>',
      to: [process.env.ALERT_EMAIL || 'sangmolama29@gmail.com'],
      subject: 'Water Tank Alert: Source Low',
      text: `Source tank level is low: ${sourceLevel}%`,
      html: `<p>Source tank level is low: <strong>${sourceLevel}%</strong></p>`,
    });

    if (error) {
      return res.status(500).json({ error });
    }

    return res.status(200).json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};

module.exports = { sendLowSourceAlert };
