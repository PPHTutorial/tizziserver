// Stall — Email Service
import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST || 'localhost'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'Stall <no-reply@stall.local>'

// Create transporter. In dev this targets Mailpit (localhost:1025, no auth);
// in prod set SMTP_HOST/PORT/USER/PASS to the real provider.
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465, STARTTLS/none otherwise
  ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
})

// Verify transporter configuration
export async function verifyEmailTransporter() {
  try {
    await transporter.verify()
    console.log('✅ Email transporter is ready')
    return true
  } catch (error) {
    console.error('❌ Email transporter verification failed:', error)
    return false
  }
}

// Email template interface
interface EmailTemplate {
  subject: string
  html: string
  text: string
}

// Send email function
export async function sendEmail(
  to: string,
  template: EmailTemplate,
  attachments?: Array<{ filename: string; path?: string; content?: string | Buffer }>
) {
  try {
    // Verify transporter before sending
    const isReady = await verifyEmailTransporter()
    if (!isReady) {
      return { 
        success: false, 
        error: 'Email service is not configured properly' 
      }
    }

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      attachments,
    })

    console.log('✅ Email sent successfully:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('❌ Email sending failed:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Generate verification code
export function generateEmailVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

