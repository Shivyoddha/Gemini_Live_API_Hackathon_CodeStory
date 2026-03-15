## Email Notification System

### Slide 1: Comprehensive Notification Triggers
This system features a comprehensive email notification service designed to keep all relevant parties informed. Emails are automatically triggered for virtually every significant status change within the procurement workflow. This includes notifying approvers the moment a new document lands in their queue, and promptly alerting the buyer with updates whenever their document is approved or rejected.

### Slide 2: Configuration and Delivery
The email system is primarily configured to utilize **Gmail's SMTP settings** for sending messages. We've implemented strategies to ensure that email delivery is non-blocking; this means that if an email fails to send for any reason, the application's core functionality will not be interrupted. For ease of setup and troubleshooting, the repository includes a dedicated debug script, `debug_email.rb`, which can be run directly to diagnose and resolve any email configuration issues.