# Flutter Integration Guide - Nalo SMS Service

## API Integration Updates

With the migration from Twilio to Nalo Solutions SMS, here are the Flutter integration updates:

### 1. OTP Verification Service

Update your Flutter OTP service to work with the new backend:

```dart
// lib/services/auth_service.dart
class AuthService {
  static const String baseUrl = 'http://your-server-url/api';
  
  // Send OTP using Nalo Solutions SMS
  static Future<ApiResponse> sendOTP(String phoneNumber, String userId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/send-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phoneNumber': phoneNumber,
          'userId': userId,
        }),
      );
      
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return ApiResponse(
          success: true,
          message: data['message'] ?? 'OTP sent successfully',
          data: data['data'],
        );
      } else {
        return ApiResponse(
          success: false,
          message: data['message'] ?? 'Failed to send OTP',
          error: data['error'],
        );
      }
    } catch (e) {
      return ApiResponse(
        success: false,
        message: 'Network error occurred',
        error: e.toString(),
      );
    }
  }
  
  // Verify OTP
  static Future<ApiResponse> verifyOTP(String phoneNumber, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phoneNumber': phoneNumber,
          'otp': otp,
        }),
      );
      
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return ApiResponse(
          success: true,
          message: data['message'] ?? 'Phone verified successfully',
          data: data['data'],
        );
      } else {
        return ApiResponse(
          success: false,
          message: data['message'] ?? 'Invalid OTP',
          error: data['error'],
        );
      }
    } catch (e) {
      return ApiResponse(
        success: false,
        message: 'Network error occurred',
        error: e.toString(),
      );
    }
  }
}
```

### 2. Notification Service

Integrate with the new notification system:

```dart
// lib/services/notification_service.dart
class NotificationService {
  static const String baseUrl = 'http://your-server-url/api';
  
  // Get user notifications
  static Future<ApiResponse> getNotifications(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/notifications/user'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );
      
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return ApiResponse(
          success: true,
          data: data['data'],
        );
      } else {
        return ApiResponse(
          success: false,
          message: data['message'] ?? 'Failed to load notifications',
        );
      }
    } catch (e) {
      return ApiResponse(
        success: false,
        message: 'Network error occurred',
        error: e.toString(),
      );
    }
  }
  
  // Mark notification as read
  static Future<ApiResponse> markAsRead(String notificationId, String token) async {
    try {
      final response = await http.patch(
        Uri.parse('$baseUrl/notifications/user/$notificationId/read'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );
      
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return ApiResponse(
          success: true,
          message: 'Notification marked as read',
        );
      } else {
        return ApiResponse(
          success: false,
          message: data['message'] ?? 'Failed to update notification',
        );
      }
    } catch (e) {
      return ApiResponse(
        success: false,
        message: 'Network error occurred',
        error: e.toString(),
      );
    }
  }
}
```

### 3. Phone Number Formatting

Ensure proper phone number formatting for Nalo Solutions:

```dart
// lib/utils/phone_utils.dart
class PhoneUtils {
  // Format phone number for Ghana (+233)
  static String formatPhoneNumber(String phoneNumber) {
    // Remove all non-digit characters
    String cleaned = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    
    // Handle Ghana phone numbers
    if (cleaned.startsWith('0')) {
      // Convert 0XXXXXXXXX to +233XXXXXXXXX
      cleaned = '233' + cleaned.substring(1);
    } else if (cleaned.startsWith('233')) {
      // Already in correct format
    } else if (cleaned.length == 9) {
      // Add Ghana country code
      cleaned = '233' + cleaned;
    }
    
    return '+' + cleaned;
  }
  
  // Validate Ghana phone number
  static bool isValidGhanaPhone(String phoneNumber) {
    String formatted = formatPhoneNumber(phoneNumber);
    // Ghana phone numbers: +233XXXXXXXXX (12 digits total)
    return RegExp(r'^\+233\d{9}$').hasMatch(formatted);
  }
}
```

### 4. OTP Screen Updates

Update your OTP verification screen:

```dart
// lib/screens/otp_verification_screen.dart
class OTPVerificationScreen extends StatefulWidget {
  final String phoneNumber;
  final String userId;
  
  const OTPVerificationScreen({
    Key? key,
    required this.phoneNumber,
    required this.userId,
  }) : super(key: key);
  
  @override
  _OTPVerificationScreenState createState() => _OTPVerificationScreenState();
}

class _OTPVerificationScreenState extends State<OTPVerificationScreen> {
  final TextEditingController _otpController = TextEditingController();
  bool _isLoading = false;
  bool _isResending = false;
  int _countdown = 30;
  Timer? _timer;
  
  @override
  void initState() {
    super.initState();
    _startCountdown();
  }
  
  void _startCountdown() {
    _timer = Timer.periodic(Duration(seconds: 1), (timer) {
      if (_countdown == 0) {
        timer.cancel();
      } else {
        setState(() {
          _countdown--;
        });
      }
    });
  }
  
  Future<void> _verifyOTP() async {
    if (_otpController.text.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Please enter a valid 6-digit OTP')),
      );
      return;
    }
    
    setState(() {
      _isLoading = true;
    });
    
    final response = await AuthService.verifyOTP(
      widget.phoneNumber,
      _otpController.text,
    );
    
    setState(() {
      _isLoading = false;
    });
    
    if (response.success) {
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response.message)),
      );
    }
  }
  
  Future<void> _resendOTP() async {
    setState(() {
      _isResending = true;
    });
    
    final response = await AuthService.sendOTP(
      widget.phoneNumber,
      widget.userId,
    );
    
    setState(() {
      _isResending = false;
      _countdown = 30;
    });
    
    if (response.success) {
      _startCountdown();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('OTP sent successfully')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response.message)),
      );
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Verify Phone Number'),
      ),
      body: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          children: [
            Text(
              'Enter the 6-digit code sent to',
              style: TextStyle(fontSize: 16),
            ),
            Text(
              widget.phoneNumber,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 30),
            TextField(
              controller: _otpController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(
                labelText: 'OTP Code',
                border: OutlineInputBorder(),
              ),
            ),
            SizedBox(height: 20),
            ElevatedButton(
              onPressed: _isLoading ? null : _verifyOTP,
              child: _isLoading
                  ? CircularProgressIndicator(color: Colors.white)
                  : Text('Verify OTP'),
            ),
            SizedBox(height: 20),
            TextButton(
              onPressed: _countdown > 0 || _isResending ? null : _resendOTP,
              child: _isResending
                  ? CircularProgressIndicator()
                  : Text(_countdown > 0
                      ? 'Resend in ${_countdown}s'
                      : 'Resend OTP'),
            ),
          ],
        ),
      ),
    );
  }
  
  @override
  void dispose() {
    _timer?.cancel();
    _otpController.dispose();
    super.dispose();
  }
}
```

### 5. API Response Model

Create a consistent API response model:

```dart
// lib/models/api_response.dart
class ApiResponse {
  final bool success;
  final String message;
  final dynamic data;
  final String? error;
  
  ApiResponse({
    required this.success,
    this.message = '',
    this.data,
    this.error,
  });
  
  factory ApiResponse.fromJson(Map<String, dynamic> json) {
    return ApiResponse(
      success: json['success'] ?? false,
      message: json['message'] ?? '',
      data: json['data'],
      error: json['error'],
    );
  }
}
```

## Key Changes from Twilio Integration

1. **No Client-Side SMS**: Nalo Solutions is server-side only, so all SMS sending happens through your backend
2. **Improved Cost**: Nalo Solutions typically offers better rates for West African markets
3. **Better Delivery**: Optimized routing for Ghana and surrounding countries
4. **Enhanced Features**: Bulk SMS capabilities and delivery status tracking

## Testing

1. **Use Test Numbers**: Start with test phone numbers during development
2. **Monitor SMS Credits**: Keep track of your Nalo Solutions account balance
3. **Test Network Conditions**: Ensure OTP works under poor network conditions
4. **Validate Phone Formats**: Test with various phone number formats

## Production Considerations

1. **Rate Limiting**: The backend has SMS rate limiting to prevent abuse
2. **Error Handling**: Implement proper error handling for SMS failures
3. **Retry Logic**: Add retry logic for failed OTP attempts
4. **User Experience**: Show clear messages about SMS delivery delays
