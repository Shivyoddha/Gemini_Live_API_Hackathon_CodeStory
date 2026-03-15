## Database Schema Design

### Slide 1: Core Tables
The database schema is structured around three primary tables. The `Users` table is central, storing essential user information such as authentication credentials (`user_id`, `user_name`, `password_digest`), contact details (`email`), and role information (`is_admin`). The `Doc_As` table holds all the data related to Document A, including equipment specifics (`eq_id`, `name`, `cost`, `head`), approval timestamps, remarks, and the document's current `status`. Similarly, the `Doc_Bs` table captures the details for Document B, including a `proceedings` field specific to this document.

### Slide 2: Key Fields and Relationships
To ensure efficient data retrieval, the `eq_id` field in the `Doc_As` table is uniquely indexed. This allows for quick lookups of documents based on their equipment ID. Furthermore, foreign key constraints are established to link documents back to the users who created or are processing them, maintaining data integrity and enabling relational queries between the tables.