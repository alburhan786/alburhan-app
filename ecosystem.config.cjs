Build a Unified Notification Center for the Al Burhan Tours & Travels ERP.

Requirements:

1. Create a Communication Center module.

2. Add submodules:
- Dashboard
- Notification Queue
- WhatsApp
- SMS
- RCS
- Email
- Push Notifications
- Templates
- Campaigns
- Delivery Logs
- Failed Messages
- Scheduled Messages
- Automation Rules

3. Build a Notification Engine.

Every business event must create a notification event.

Supported events:
- New Booking
- Booking Approved
- Booking Cancelled
- Payment Received
- Payment Due
- Invoice Generated
- Receipt Generated
- Visa Ready
- Flight Assigned
- Hotel Assigned
- Room Assigned
- Bus Assigned
- Passport Expiry
- Departure Reminder
- Arrival Reminder
- Return Reminder
- Feedback Request

4. Channel Support:
- Meta WhatsApp Cloud API (or BotBee if configured)
- Fast2SMS or MSG91
- RCS Business Messaging
- SMTP Email
- Firebase Push Notifications

5. Allow admin to enable or disable channels per event.

6. Store every notification in a notification_logs table with:
- notification_id
- event_type
- customer_id
- booking_id
- channel
- template
- status
- provider_response
- sent_at
- delivered_at
- retry_count

7. Create a Notification Dashboard showing:
- Today Sent
- Delivered
- Failed
- Pending
- Cost
- Delivery Rate

8. Add a Retry Failed Messages feature.

9. Add Scheduled Messages.

10. Test all notification types end-to-end without affecting existing ERP functionality.module.exports = {
  apps: [{
    name: 'alburhan-tours',
    script: 'artifacts/api-server/dist/index.cjs',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    }
  }]
};
n zazq