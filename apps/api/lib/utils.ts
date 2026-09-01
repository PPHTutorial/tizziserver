import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import crypto from 'crypto'

interface TokenPayload {
  userId: string
  email?: string
  phone?: string
  role: string
}

export class AuthUtils {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }

  static generateToken(payload: TokenPayload, expiresIn: jwt.SignOptions['expiresIn'] = '24h'): string {
    const secret = process.env.JWT_SECRET
    const options: SignOptions = { expiresIn }
    if (!secret) throw new Error('JWT_SECRET is not defined')
    return jwt.sign(payload, secret, options)
  }

  static verifyToken(token: string): TokenPayload {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET is not defined')
    return jwt.verify(token, secret) as TokenPayload
  }

  static generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString()
  }

  static generateUniqueOrderNumber(): string {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(3).toString('hex').toUpperCase()
    return `TG${timestamp}${random}`
  }
}

export class ResponseUtils {
  static success<T>(data: T = null as T, message = 'Success') {
    return Response.json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  }

  static error(message = 'Error', statusCode = 400, errors: unknown = null) {
    return Response.json({
      success: false,
      message,
      statusCode,
      errors,
      timestamp: new Date().toISOString(),
    }, { status: statusCode });
  }
}

export class LocationUtils {
  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1)
    const dLon = this.deg2rad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const d = R * c // Distance in kilometers
    return d
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180)
  }
}

export class ValidationUtils {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    return phoneRegex.test(phone)
  }

  static sanitizeString(str: string): string {
    return str.trim().replace(/[<>]/g, '')
  }
}

export class NaloSMSUtils {
  // Nalo Solutions SMS API configuration
  private static readonly BASE_URL = process.env.NALO_API_BASE_URL || 'https://sms.nalosolutions.com/smsbackend/clientapi/Resl_Nalo/send-message/'
  
  static async sendSMS(phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const apiKey = process.env.NALO_API_KEY
      const senderId = process.env.NALO_SENDER_ID || 'TizziGas'
      
      if (!apiKey) {
        throw new Error('NALO_API_KEY is not defined in environment variables')
      }

      // Clean and format phone number for Nalo Solutions
      // Remove all non-digit characters except +
      const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '')

      console.log('Original phone:', phoneNumber)
      console.log('Formatted phone:', cleanPhoneNumber)

      // Construct the GET URL with parameters for Nalo Solutions
      const apiUrl = new URL(this.BASE_URL)
      apiUrl.searchParams.append('key', apiKey)
      apiUrl.searchParams.append('destination', cleanPhoneNumber)
      apiUrl.searchParams.append('source', senderId)
      apiUrl.searchParams.append('message', message)
      apiUrl.searchParams.append('type', '0') // 0 for normal SMS, 1 for flash SMS
      apiUrl.searchParams.append('dlr', '1') // Delivery receipt requested

      console.log('Sending SMS to:', cleanPhoneNumber)

      // Send SMS via Nalo Solutions API (GET request)
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
      })

      // Nalo Solutions returns a plain text response, not JSON
      const responseText = await response.text()
      console.log('Nalo API Response:', responseText)

      // Check if the response indicates success
      // Nalo typically returns "1701" for success or error codes for failures
      const isSuccess = responseText.trim().includes('1701') || responseText.includes('success')

      if (!isSuccess) {
        console.error('Nalo SMS API error:', responseText)

        // Map common error codes to user-friendly messages
        let errorMessage = 'Failed to send SMS'
        if (responseText.includes('1702')) {
          errorMessage = 'Invalid phone number'
        } else if (responseText.includes('1703')) {
          errorMessage = 'Insufficient balance'
        } else if (responseText.includes('1704')) {
          errorMessage = 'Invalid API configuration'
        } else if (responseText.includes('1705')) {
          errorMessage = 'Message too long'
        } else if (responseText.includes('1706')) {
          errorMessage = 'Invalid destination number'
        } else if (responseText.includes('1708')) {
          errorMessage = 'Invalid delivery receipt configuration'
        }

        return {
          success: false,
          error: errorMessage
        }
      }

      // Log successful SMS send
      console.log('SMS sent successfully:', {
        phoneNumber,
        response: responseText,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        messageId: responseText.trim() // Extract message ID if available in response
      }
    } catch (error) {
      console.error('Nalo SMS Service Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SMS service error'
      }
    }
  }
  
  static async sendBulkSMS(recipients: string[], message: string): Promise<{ success: boolean; results?: Array<{ phoneNumber: string; success: boolean; error?: string }>; error?: string }> {
    try {
      if (!recipients || recipients.length === 0) {
        return {
          success: false,
          error: 'No recipients provided'
        }
      }

      const results: Array<{ phoneNumber: string; success: boolean; error?: string }> = []

      // Send SMS to each recipient sequentially
      // Note: For better performance, you might want to implement parallel sending with rate limiting
      for (const phoneNumber of recipients) {
        const result = await this.sendSMS(phoneNumber, message)
        results.push({
          phoneNumber,
          success: result.success,
          error: result.error
        })
        
        // Add small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const allSuccessful = results.every(r => r.success)
      
      return {
        success: allSuccessful,
        results
      }
    } catch (error) {
      console.error('Nalo Bulk SMS Service Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown bulk SMS service error'
      }
    }
  }

  static async checkDeliveryStatus(messageId: string): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
      const apiKey = process.env.NALO_API_KEY
      
      if (!apiKey) {
        throw new Error('NALO_API_KEY is not defined in environment variables')
      }

      // Note: Update this URL based on Nalo API documentation for delivery reports
      const reportUrl = process.env.NALO_REPORT_URL || `${this.BASE_URL.replace('/send-message/', '/reports/')}${messageId}`
      
      const apiUrl = new URL(reportUrl)
      apiUrl.searchParams.append('key', apiKey)

      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
      })

      const responseText = await response.text()
      
      // Parse response based on Nalo API format
      // Adjust this based on actual API response format
      if (response.ok && responseText.includes('delivered')) {
        return {
          success: true,
          status: 'delivered'
        }
      } else {
        return {
          success: false,
          error: 'Failed to check delivery status'
        }
      }
    } catch (error) {
      console.error('Nalo Status Check Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown status check error'
      }
    }
  }

  static async getAccountBalance(): Promise<{ success: boolean; balance?: number; currency?: string; error?: string }> {
    try {
      const apiKey = process.env.NALO_API_KEY
      
      if (!apiKey) {
        throw new Error('NALO_API_KEY is not defined in environment variables')
      }

      // Note: Update this URL based on Nalo API documentation for balance inquiry
      const balanceUrl = process.env.NALO_BALANCE_URL || `${this.BASE_URL.replace('/send-message/', '/balance/')}`
      
      const apiUrl = new URL(balanceUrl)
      apiUrl.searchParams.append('key', apiKey)

      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
      })

      const responseText = await response.text()
      
      // Parse response based on Nalo API format
      // Adjust this based on actual API response format
      // Example: If response is JSON, parse it; if plain text, extract balance
      try {
        const responseData = JSON.parse(responseText)
        if (responseData.balance !== undefined) {
          return {
            success: true,
            balance: parseFloat(responseData.balance),
            currency: responseData.currency || 'GHS'
          }
        }
      } catch {
        // If not JSON, try to extract from plain text
        const balanceMatch = responseText.match(/(\d+\.?\d*)/)
        if (balanceMatch) {
          return {
            success: true,
            balance: parseFloat(balanceMatch[1] ?? balanceMatch[0]),
            currency: 'GHS'
          }
        }
      }

      return {
        success: false,
        error: 'Failed to get account balance'
      }
    } catch (error) {
      console.error('Nalo Balance Check Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown balance check error'
      }
    }
  }
}
