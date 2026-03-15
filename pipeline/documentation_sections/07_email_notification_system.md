## Email Notification System

The application integrates an email notification system to keep participants informed about the status and progression of procurement documents. It is configured to use Gmail's SMTP server and designed for robustness, ensuring email delivery failures do not block core application functionality.

### Configuration:

*   **Mailer Gem**: Rails' `ActionMailer` is used for handling email.
*   **SMTP Service**: Gmail SMTP (`smtp.gmail.com:587`) is configured as the delivery method.
*   **Credentials**:
    *   `GMAIL_USERNAME`: The sender's Gmail address (e.g., `anish.kumbhar02@gmail.com`).
    *   `GMAIL_PASSWORD`: A Gmail App Password (16 characters, no spaces). This is crucial for authentication.
    *   These credentials are managed via environment variables (`ENV['GMAIL_USERNAME']`, `ENV['GMAIL_PASSWORD']`) for security and environment flexibility. Default values are provided in `config/initializers/gmail_config.rb` and `config/environments/development.rb` for local development.
*   **Default From Address**: Set in `app/mailers/application_mailer.rb` to `ENV['GMAIL_USERNAME']`.
*   **Environment-Specific Settings**:
    *   `config/environments/development.rb`: Configured for immediate delivery (`deliver_now`) and uses default credentials if environment variables are not set. `raise_delivery_errors` is true for debugging.
    *   `config/environments/production.rb`: Requires environment variables for `GMAIL_USERNAME` and `GMAIL_PASSWORD`. `log_level` is `info`, and `perform_caching` is false.

### Email Types and Triggers:

The `ProcurementMailer` is responsible for sending three primary types of notifications:

1.  **New Document Submission (to Approvers)**:
    *   **Trigger**: When a `DocA` or `DocB` is created by User U and forwarded to Approver P, or when an approver forwards a document to the next approver (e.g., P to Q).
    *   **Recipient**: The next approver in the chain (e.g., 'P', 'Q', 'R', 'S').
    *   **Content**: Includes document details (Equipment ID, Name, Cost, Head), creator's username, submission date, and a link to review the document in the portal.

2.  **Document Approved Status (to Buyer)**:
    *   **Trigger**: When a `DocA` or `DocB` is approved by any approver, or fully approved.
    *   **Recipient**: The original buyer (User U).
    *   **Content**: Provides an update on the document's status, indicating which approver approved it and the current stage.

3.  **Document Rejected Status (to Buyer)**:
    *   **Trigger**: When a `DocA` or `DocB` is rejected by any approver.
    *   **Recipient**: The original buyer (User U).
    *   **Content**: Informs the buyer about the rejection, includes the rejection reason and approver's remarks, prompting necessary action.

### Robustness and Non-blocking Design:

*   **Error Handling**: Email sending is wrapped in `begin...rescue` blocks within the controllers (`DocAsController`, `DocBsController`). If an email fails to send (e.g., due to incorrect credentials or network issues), the error is logged (`Rails.logger.error`), but the application's core workflow continues uninterrupted. This prevents email delivery failures from crashing the main application.
*   **Delivery Method**: `deliver_now` is used for immediate synchronous delivery in development. For production, `config.action_job.queue_adapter = :inline` implies emails are processed synchronously by default, but this could be configured for an asynchronous queue for better performance and resilience in a larger deployment.

### Email Templates (`app/views/procurement_mailer/`):

*   **HTML Templates**: Richly formatted HTML templates (`.html.erb`) are used for a professional appearance, including a standard header (IRIS branding), information boxes for document details, and status badges.
*   **Text Templates**: Plain text versions (`.text.erb`) are provided for compatibility with email clients that do not render HTML.
*   **Layout**: A common `app/views/layouts/mailer.html.erb` ensures consistent branding and structure across all transactional emails.

### Email Recipients Mapping:

The `ProcurementMailer` intelligently determines recipient emails:

*   It first tries to find the email associated with the `User` record (based on `user_name`).
*   If not found or `nil`, it falls back to hardcoded default emails for specific roles (e.g., 'U' goes to `anish.kumbhar04@gmail.com`, 'P', 'Q', 'R', 'S' go to `brc@nitk.edu.in`), as seen in `app/mailers/procurement_mailer.rb#get_default_email`. This allows for a shared mailbox for approvers.

### Debugging Tools:

*   `debug_email.rb`: A script designed to be loaded in the Rails console (`rails console` then `load 'debug_email.rb'`) to diagnose email configuration issues, including environment variables, Rails settings, SMTP connection testing, and attempting a test email send.
*   `test_email.rb`: A simpler script to send test emails to User U and Approver P, useful for verifying basic email functionality.