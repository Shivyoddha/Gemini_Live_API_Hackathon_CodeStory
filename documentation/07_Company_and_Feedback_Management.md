# Company & Feedback Management
The application facilitates the management of travel companies and allows users to submit feedback for these companies.

## Company Management
*   **Model**: `Company` (`app/models/company.rb`)
    *   **Attributes**: `companyname`, `hqlocation`, `rating`.
    *   **Associations**: `has_many :trippackages`, `has_many :feedbacks`.
*   **Controller**: `CompaniesController` (`app/controllers/companies_controller.rb`) handles CRUD operations for travel companies.
    *   `index`: Displays a list of all registered companies.
    *   `show`: Shows detailed information for a specific company.
    *   `new`/`create`: Enables the creation of new company records.
    *   `edit`/`update`: Allows modification of existing company details.
    *   `destroy`: Facilitates the deletion of company records.
    *   `company_params`: Permits `companyname`, `hqlocation`, `rating`.

## Feedback Management
*   **Model**: `Feedback` (`app/models/feedback.rb`)
    *   **Attributes**: `rate` (1 to 5), `descr` (textual description).
    *   **Associations**: `belongs_to :user`, `belongs_to :company`.
*   **Controller**: `FeedbacksController` (`app/controllers/feedbacks_controller.rb`) manages the submission and display of feedback.
    *   `index`: Lists all submitted feedback.
    *   `show`: Displays a specific feedback entry.
    *   `new`/`create`: Allows authenticated users to submit new feedback for a company. The `new` action captures `user_id` and `company_id` from parameters and stores `current_company_id` in session. The `create` action then associates the feedback with `current_user` and `@current_company`.
    *   `edit`/`update`: Enables modification of existing feedback.
    *   `destroy`: Facilitates the deletion of feedback entries.
    *   `feedback_params`: Permits `rate`, `descr`, `user_id`, `company_id`.
*   **Feedback Flow**: Users who have booked slots can leave feedback for the associated company from their "My Slots" page (`home_myslots_path`). The `new_feedback_path` is linked with `user_id` and `company_id` for context. Successful feedback submission redirects the user back to their "My Slots" page.