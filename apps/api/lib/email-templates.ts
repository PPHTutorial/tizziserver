// TIZZI GAS - Professional Email Templates

interface EmailVerificationData {
  firstName?: string
  verificationCode: string
  email: string
}

// Simple, clean, and professional template with brand colors
const baseStyles = `
  body { 
    margin: 0; 
    padding: 0; 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
    line-height: 1.6; 
    color: #0F0618; 
    background-color: #FFFFFF; 
  }
  .email-container { 
    max-width: 500px; 
    margin: 0 auto; 
    background-color: #FFFFFF; 
  }
  .header { 
    background-color: #0F0618;
    padding: 30px 20px; 
    text-align: center; 
  }
  .logo { 
    color: #FFFFFF; 
    font-size: 28px; 
    font-weight: 700; 
    letter-spacing: 2px; 
    margin: 0; 
  }
  .content { 
    padding: 40px 30px; 
    text-align: center;
  }
  .greeting { 
    font-size: 20px; 
    font-weight: 600; 
    color: #0F0618; 
    margin-bottom: 20px; 
  }
  .message { 
    font-size: 15px; 
    color: #0F0618; 
    margin-bottom: 30px; 
    line-height: 1.6; 
  }
  .code-container { 
    background-color: #0F0618;
    border-radius: 8px; 
    padding: 25px 20px; 
    text-align: center; 
    margin: 30px 0; 
  }
  .verification-code { 
    font-size: 36px; 
    font-weight: 700; 
    color: #E16232; 
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; 
    letter-spacing: 6px; 
    margin: 0; 
  }
  .expiry-text {
    font-size: 13px;
    color: #0F0618;
    margin-top: 15px;
    opacity: 0.7;
  }
  .footer { 
    background-color: #0F0618;
    padding: 20px 30px; 
    text-align: center;
  }
  .footer-text { 
    font-size: 12px; 
    color: #FFFFFF; 
    margin: 0; 
    opacity: 0.8;
  }
`

export function createEmailVerificationTemplate(data: EmailVerificationData) {
  const firstName = data.firstName || 'User'
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email - TIZZI GAS</title>
      <style>${baseStyles}</style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <h1 class="logo">TIZZI GAS</h1>
        </div>
        
        <!-- Content -->
        <div class="content">
          <h2 class="greeting">Hi ${firstName}! 👋</h2>
          
          <p class="message">
            Please verify your email address with the code below:
          </p>
          
          <div class="code-container">
            <div class="verification-code">${data.verificationCode}</div>
          </div>
          
          <p class="expiry-text">This code expires in 15 minutes</p>
          
          <p class="message" style="font-size: 13px; color: #0F0618; opacity: 0.6; margin-top: 30px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        
        <!-- Footer -->
        <div class="footer">
          <p class="footer-text">
            © ${new Date().getFullYear()} TIZZI GAS. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  const text = `
Hi ${firstName}!

Please verify your email address with this code:

${data.verificationCode}

This code expires in 15 minutes.

If you didn't request this, you can safely ignore this email.

© ${new Date().getFullYear()} TIZZI GAS. All rights reserved.
  `

  return {
    subject: 'Verify Your Email - TIZZI GAS',
    html,
    text
  }
}

