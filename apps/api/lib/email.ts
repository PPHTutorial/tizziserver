// TIZZI GAS - Email Service
import nodemailer from 'nodemailer'

// Create transporter using SMTP credentials from .env
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
      from: `TIZZI GAS <${process.env.SMTP_USER}>`,
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

