# Data Model & Relationships
The core data models within the Traveller application include `User`, `Company`, `Trippackage`, `Slot`, and `Feedback`. These models are designed to capture essential information for travel planning, booking, and review processes, and are interconnected through well-defined relationships.

## Core Models and Attributes

| Model       | Attributes                                                                                                  | Description                                                                                             |
| :---------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `User`      | `id`, `email`, `encrypted_password`, `reset_password_token`, `remember_created_at`, `created_at`, `updated_at`, `name`, `homelocation`, `phoneno` | Represents application users, handling authentication and storing personal contact/location details.    |
| `Company`   | `id`, `companyname`, `hqlocation`, `rating`, `created_at`, `updated_at`                                     | Represents travel companies, including their name, headquarters, and a rating.                          |
| `Trippackage` | `id`, `package_name`, `destination`, `departure`, `arrival`, `description`, `budget`, `travelfrom`, `noofbookings`, `packcountry`, `created_at`, `updated_at`, `company_id` | Details of a travel package, including its name, destination, dates, budget, description, and associated company. |
| `Slot`      | `id`, `bookingtime`, `created_at`, `updated_at`, `user_id`, `trippackage_id`                                | Represents a user's booking for a specific travel package at a specific time.                           |
| `Feedback`  | `id`, `rate`, `descr`, `created_at`, `updated_at`, `user_id`, `company_id`                                  | Stores user feedback, including a rating and a textual description, linked to a user and a company.     |

## Entity-Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Slot : "books"
    User ||--o{ Feedback : "gives"
    Company ||--o{ Trippackage : "offers"
    Company ||--o{ Feedback : "receives"
    Trippackage ||--o{ Slot : "has"
    Slot {
        bigint id PK
        datetime bookingtime
        datetime created_at
        datetime updated_at
        bigint user_id FK
        bigint trippackage_id FK
    }
    User {
        bigint id PK
        string email
        string encrypted_password
        string reset_password_token
        datetime remember_created_at
        datetime created_at
        datetime updated_at
        string name
        string homelocation
        string phoneno
    }
    Trippackage {
        bigint id PK
        string package_name
        string destination
        datetime departure
        datetime arrival
        text description
        datetime created_at
        datetime updated_at
        int budget
        string travelfrom
        int noofbookings
        string packcountry
        bigint company_id FK
    }
    Company {
        bigint id PK
        string companyname
        string hqlocation
        int rating
        datetime created_at
        datetime updated_at
    }
    Feedback {
        bigint id PK
        int rate
        text descr
        datetime created_at
        datetime updated_at
        bigint user_id FK
        bigint company_id FK
    }
```