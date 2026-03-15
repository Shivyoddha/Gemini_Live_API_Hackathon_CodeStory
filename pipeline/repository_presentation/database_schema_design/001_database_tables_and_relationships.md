### Slide 1: Database Tables and Relationships
- The application utilizes PostgreSQL as its database.
- Key tables include:
    - `users`: Stores user credentials, roles, display names, and emails.
    - `doc_as`: Stores details for Document A, including equipment info, approval dates, remarks, and status.
    - `doc_bs`: Stores details for Document B, similar to `doc_as` with an added `proceedings` field.
- Relationships: `doc_as` and `doc_bs` belong to `users` via `user_id` foreign keys.