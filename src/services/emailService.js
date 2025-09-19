const nodemailer = require('nodemailer');

/**
 * Envoi d'un email contenant un compte-rendu de maraude
 * @param {Object} options
 * @param {Object} options.report - Rapport complet (avec associations)
 * @param {string[]} options.recipients - Liste d'emails
 * @param {string} options.subject - Sujet de l'email
 * @param {string} options.message - Message personnalisé
 * @param {string} options.senderName - Nom de l’expéditeur
 * @param {string} options.senderEmail - Email de l’expéditeur
 */
async function sendReportEmail({ report, recipients, subject, message, senderName, senderEmail }) {
  try {
    // ⚙️ Config transport SMTP (utilise tes vraies infos)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true si port 465
      auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password'
      }
    });

    // 📝 Construction du contenu HTML du rapport
    const htmlContent = `
      <h2 style="color:#2563eb;">Compte-rendu de maraude</h2>
      <p><strong>Maraude :</strong> ${report.maraudeAction?.title || ''}</p>
      <p><strong>Association :</strong> ${report.maraudeAction?.association?.name || ''}</p>
      <p><strong>Date :</strong> ${report.reportDate}</p>
      <p><strong>Bénéficiaires :</strong> ${report.beneficiariesCount || 0}</p>
      <p><strong>Bénévoles :</strong> ${report.volunteersCount || 0}</p>

      <h3>Distributions :</h3>
      <ul>
        ${report.distributions
          .map(
            d =>
              `<li>${d.distributionType?.name || 'Inconnu'} : ${d.quantity} ${
                d.notes ? `(${d.notes})` : ''
              }</li>`
          )
          .join('')}
      </ul>

      ${
        report.alerts?.length > 0
          ? `
        <h3>⚠️ Alertes :</h3>
        <ul>
          ${report.alerts
            .map(
              a =>
                `<li><strong>${a.severity.toUpperCase()}</strong> - ${a.situationDescription || ''}</li>`
            )
            .join('')}
        </ul>
      `
          : ''
      }

      <h3>Notes générales :</h3>
      <p>${report.generalNotes || 'Aucune note.'}</p>

      ${
        message
          ? `<hr><p><strong>Message personnalisé de ${senderName} :</strong></p><p>${message}</p>`
          : ''
      }

      <p style="margin-top:20px;color:#6b7280;">Envoyé par ${senderName} &lt;${senderEmail}&gt;</p>
    `;

    // 📩 Options de l’email
    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipients.join(','),
      subject,
      html: htmlContent
    };

    // 🚀 Envoi
    await transporter.sendMail(mailOptions);

    return true;
  } catch (error) {
    console.error('Erreur envoi email:', error);
    return false;
  }
}

module.exports = { sendReportEmail };
