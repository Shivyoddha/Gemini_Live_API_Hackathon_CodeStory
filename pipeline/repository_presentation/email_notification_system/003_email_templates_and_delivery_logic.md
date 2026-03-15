### Slide 3: Email Templates and Delivery Logic
- HTML and text email templates are located in `app/views/procurement_mailer/`.
- Uses `ProcurementMailer` class for defining email logic.
- Emails include document details, status, and links to the portal.
- Email sending is non-blocking; failures are logged but do not halt application workflow.