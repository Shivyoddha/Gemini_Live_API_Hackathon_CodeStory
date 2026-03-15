### Slide 2: Schema Details (`users` table)
- `user_id`: Unique identifier for the user.
- `user_name`: Login username (e.g., 'U', 'P', 'admin'). Indexed and unique.
- `password_digest`: Stores the securely hashed password using bcrypt.
- `display_name`: User's full name for display.
- `email`: User's email address. Indexed.
- `is_admin`: Boolean flag indicating administrative privileges.