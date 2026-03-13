## Data & Persistence Layer

The application interacts with a **MySQL** database. The data model is defined using ActiveRecord, providing an Object-Relational Mapping (ORM) layer.

### Entities

*   **`User`**: Manages user accounts with attributes for authentication (email, encrypted password), personal details (name, homelocation, phoneno), and timestamps.
    *   Associations: `has_many :slots`, `has_many :feedbacks`.
*   **`Company`**: Stores information about travel companies.
    *   Attributes: `companyname`, `hqlocation`, `rating`, timestamps.
    *   Associations: `has_many :trippackages`, `has_many :feedbacks`.
*   **`Trippackage`**: Represents available travel packages.
    *   Attributes: `package_name`, `destination`, `departure`, `arrival`, `budget`, `description`, `travelfrom`, `noofbookings`, `packcountry`, timestamps.
    *   Associations: `has_many :slots`, `belongs_to :company`.
*   **`Slot`**: Represents a booking for a trip package by a user.
    *   Attributes: `bookingtime`, timestamps.
    *   Associations: `belongs_to :user`, `belongs_to :trippackage`.
*   **`Feedback`**: Stores user feedback for companies.
    *   Attributes: `rate`, `descr`, timestamps.
    *   Associations: `belongs_to :user`, `belongs_to :company`.

### Database Schema

```mermaid
erDiagram
    USERS {
        BIGINT id PK
        VARCHAR email
        VARCHAR encrypted_password
        VARCHAR reset_password_token
        DATETIME reset_password_sent_at
        DATETIME remember_created_at
        DATETIME created_at
        DATETIME updated_at
        VARCHAR name
        VARCHAR homelocation
        VARCHAR phoneno
    }

    COMPANIES {
        BIGINT id PK
        VARCHAR companyname
        VARCHAR hqlocation
        INTEGER rating
        DATETIME created_at
        DATETIME updated_at
    }

    TRIPPACKAGES {
        BIGINT id PK
        VARCHAR package_name
        VARCHAR destination
        DATETIME departure
        DATETIME arrival
        TEXT description
        DATETIME created_at
        DATETIME updated_at
        INTEGER budget
        VARCHAR travelfrom
        INTEGER noofbookings
        VARCHAR packcountry
        BIGINT company_id FK
    }

    SLOTS {
        BIGINT id PK
        DATETIME bookingtime
        DATETIME created_at
        DATETIME updated_at
        BIGINT user_id FK
        BIGINT trippackage_id FK
    }

    FEEDBACKS {
        BIGINT id PK
        INTEGER rate
        TEXT descr
        DATETIME created_at
        DATETIME updated_at
        BIGINT user_id FK
        BIGINT company_id FK
    }

    USERS ||--o{ SLOTS : "has_many"
    USERS ||--o{ FEEDBACKS : "has_many"
    COMPANIES ||--o{ TRIPPACKAGES : "has_many"
    COMPANIES ||--o{ FEEDBACKS : "has_many"
    TRIPPACKAGES ||--o{ SLOTS : "has_many"
```
