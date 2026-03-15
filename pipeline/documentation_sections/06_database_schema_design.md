## Database Schema Design

The application utilizes a PostgreSQL database (as indicated by `enable_extension "plpgsql"` in `db/schema.rb` and setup instructions) with three main tables: `users`, `doc_as`, and `doc_bs`. The schema is designed to support user authentication, document details, and the multi-stage approval workflow.

### Table: `users`

Stores user credentials, roles, and identifying information.

| Column          | Type     | Constraints                                         | Description                                         |
| :-------------- | :------- | :-------------------------------------------------- | :-------------------------------------------------- |
| `id`            | `bigint` | `PK`                                                | Primary key.                                        |
| `user_id`       | `string` | `NOT NULL`, `unique:true` (initially), `index`     | Unique identifier for the user (e.g., 'U', 'P').    |
| `user_name`     | `string` | `NOT NULL`, `unique:true`, `index`                | Login username (e.g., 'U', 'P', 'admin').           |
| `password_digest`| `string` | `NOT NULL`                                          | Hashed password using bcrypt.                       |
| `display_name`  | `string` | `nullable`                                          | Human-readable name for the user.                   |
| `email`         | `string` | `nullable`, `index` (not unique)                    | User's email address.                               |
| `is_admin`      | `boolean`| `DEFAULT: false`                                    | Flag indicating if the user has administrative privileges. |
| `created_at`    | `datetime`| `NOT NULL`                                          | Timestamp of creation.                              |
| `updated_at`    | `datetime`| `NOT NULL`                                          | Timestamp of last update.                           |

*Note: The `email` index was initially unique but later removed to allow for multiple approvers to share a single email address (e.g., `brc@nitk.edu.in`), as seen in `db/migrate/20240101000005_remove_unique_email_constraint.rb`.*

### Table: `doc_as`

Stores details for Document A and tracks its approval workflow.

| Column        | Type      | Constraints                                          | Description                                             |
| :------------ | :-------- | :--------------------------------------------------- | :------------------------------------------------------ |
| `id`          | `bigint`  | `PK`                                                 | Primary key.                                            |
| `user_id`     | `bigint`  | `FK` to `users.id`, `NOT NULL`, `index`              | Foreign key linking to the buyer (initiator) of Doc A.  |
| `eq_id`       | `string`  | `NOT NULL`, `unique:true`, `index`                 | Unique equipment identifier (e.g., "CSE_1").            |
| `name`        | `string`  | `NOT NULL`                                           | Name of the equipment.                                  |
| `cost`        | `decimal` | `NOT NULL`, `precision: 10`, `scale: 2`              | Cost of the equipment.                                  |
| `head`        | `string`  | `NOT NULL`                                           | Head of purchase (e.g., "OPC", "IRG", "Project").       |
| `u_date`      | `datetime`| `nullable`                                           | Date of initiation/remarks by User U.                   |
| `u_remarks`   | `text`    | `nullable`                                           | Remarks by User U.                                      |
| `p_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver P.                 |
| `p_remarks`   | `text`    | `nullable`                                           | Remarks by Approver P.                                  |
| `q_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver Q.                 |
| `q_remarks`   | `text`    | `nullable`                                           | Remarks by Approver Q.                                  |
| `r_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver R.                 |
| `r_remarks`   | `text`    | `nullable`                                           | Remarks by Approver R.                                  |
| `s_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver S.                 |
| `s_remarks`   | `text`    | `nullable`                                           | Remarks by Approver S.                                  |
| `status`      | `integer` | `DEFAULT: 0` (enum mapping defined in `DocA` model)  | Current status of the document workflow (`draft`, `pending_p_approval`, etc.). |
| `created_at`  | `datetime`| `NOT NULL`                                           | Timestamp of creation.                                  |
| `updated_at`  | `datetime`| `NOT NULL`                                           | Timestamp of last update.                               |

### Table: `doc_bs`

Stores details for Document B and tracks its approval workflow. Many fields mirror `doc_as`.

| Column        | Type      | Constraints                                          | Description                                             |
| :------------ | :-------- | :--------------------------------------------------- | :------------------------------------------------------ |
| `id`          | `bigint`  | `PK`                                                 | Primary key.                                            |
| `user_id`     | `bigint`  | `FK` to `users.id`, `NOT NULL`, `index`              | Foreign key linking to the buyer (initiator) of Doc B.  |
| `eq_id`       | `string`  | `NOT NULL`                                           | Equipment identifier (inherited from Doc A or generated). |
| `name`        | `string`  | `NOT NULL`                                           | Name of the equipment.                                  |
| `cost`        | `decimal` | `NOT NULL`, `precision: 10`, `scale: 2`              | Cost of the equipment.                                  |
| `head`        | `string`  | `NOT NULL`                                           | Head of purchase.                                       |
| `proceedings` | `text`    | `NOT NULL`                                           | Additional comments or proceedings specific to Doc B.   |
| `u_date`      | `datetime`| `nullable`                                           | Date of initiation/remarks by User U.                   |
| `u_remarks`   | `text`    | `nullable`                                           | Remarks by User U.                                      |
| `p_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver P.                 |
| `p_remarks`   | `text`    | `nullable`                                           | Remarks by Approver P.                                  |
| `q_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver Q.                 |
| `q_remarks`   | `text`    | `nullable`                                           | Remarks by Approver Q.                                  |
| `r_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver R.                 |
| `r_remarks`   | `text`    | `nullable`                                           | Remarks by Approver R.                                  |
| `s_date`      | `datetime`| `nullable`                                           | Date of approval/remarks by Approver S.                 |
| `s_remarks`   | `text`    | `nullable`                                           | Remarks by Approver S.                                  |
| `status`      | `integer` | `DEFAULT: 0` (enum mapping defined in `DocB` model)  | Current status of the document workflow.                |
| `created_at`  | `datetime`| `NOT NULL`                                           | Timestamp of creation.                                  |
| `updated_at`  | `datetime`| `NOT NULL`                                           | Timestamp of last update.                               |

### Entity Relationship Diagram:

```mermaid
erDiagram
    USERS {
        bigint id PK
        string user_id UNIQUE "Initially, then relaxed in 20240101000004"
        string user_name UNIQUE
        string password_digest
        string display_name
        string email INDEX "Not unique after 20240101000005"
        boolean is_admin
        datetime created_at
        datetime updated_at
    }

    DOC_AS {
        bigint id PK
        bigint user_id FK "References creator (Buyer U)"
        string eq_id UNIQUE
        string name
        decimal cost
        string head
        datetime u_date
        text u_remarks
        datetime p_date
        text p_remarks
        datetime q_date
        text q_remarks
        datetime r_date
        text r_remarks
        datetime s_date
        text s_remarks
        integer status
        datetime created_at
        datetime updated_at
    }

    DOC_BS {
        bigint id PK
        bigint user_id FK "References creator (Buyer U)"
        string eq_id
        string name
        decimal cost
        string head
        text proceedings
        datetime u_date
        text u_remarks
        datetime p_date
        text p_remarks
        datetime q_date
        text q_remarks
        datetime r_date
        text r_remarks
        datetime s_date
        text s_remarks
        integer status
        datetime created_at
        datetime updated_at
    }

    USERS ||--o{ DOC_AS : "initiates"
    USERS ||--o{ DOC_BS : "initiates"
```