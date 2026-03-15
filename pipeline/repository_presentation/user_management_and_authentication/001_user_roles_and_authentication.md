### Slide 1: User Roles and Authentication
- Supports distinct user roles:
    - Buyer (U): Initiates documents.
    - Approvers (P, Q, R, S): Review and approve documents sequentially.
    - Administrator: Manages users and system settings.
- Implements session-based authentication for logged-in users.
- Passwords are securely stored using bcrypt hashing, managed by `has_secure_password`.