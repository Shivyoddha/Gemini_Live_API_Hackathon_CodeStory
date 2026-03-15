## Frontend and User Interface

The frontend of the IRIS Procurement Portal is designed for a modern, responsive, and intuitive user experience. It primarily uses ERB templates for dynamic content generation and inline CSS for styling, supplemented by basic HTML structure.

### Core UI Framework:

*   **Templating Engine**: ERB (Embedded Ruby) is used across `app/views/` to render dynamic HTML content, integrating Ruby logic directly into the view files.
*   **Styling**: Primarily achieved through inline `<style>` tags within `app/views/layouts/application.html.erb` and `app/views/sessions/new.html.erb`. This approach delivers a custom aesthetic without external CSS frameworks, focusing on a clean, professional appearance.
    *   **Gradient Aesthetic**: The login page, in particular, leverages a background image and responsive styling to create a visually appealing entry point.
    *   **Responsive Design**: CSS rules are in place (e.g., `max-width`, `grid-template-columns`) to adapt the layout for different screen sizes, ensuring usability on various devices.

### Key User Interface Elements:

*   **Login Page (`app/views/sessions/new.html.erb`)**:
    *   Features a clear login form for `user_name` and `password`.
    *   Prominently displays a table of prototype login credentials for quick access and testing.
    *   Includes dynamic alert messages for login failures (`alert`).
    *   Utilizes a dedicated `login-container` for visual distinctiveness.
*   **Header (`app/views/layouts/application.html.erb`)**:
    *   Present on all authenticated pages.
    *   Displays "IRIS Procurement Portal" title.
    *   Shows current user information (`display_name_or_username`) and a logout button.
    *   Includes an "Admin" button/link for administrators.
*   **Dashboard (`app/views/dashboard/index.html.erb`)**:
    *   **Personalized View**: Welcome message for the `current_user`.
    *   **Pending Approvals**: For approvers, a dedicated section lists `DocA` and `DocB` documents awaiting their review, with direct links to "Review."
    *   **My Documents (for Buyers)**: Buyers see options to create "New Document A" or "New Document B." Documents are categorized into tabs ("Document A" and "Document B") for easy navigation.
    *   **Processed Documents (for Approvers)**: Approvers can view documents they have already processed, showing `eq_id`, `name`, `cost`, status, and creator.
    *   **Status Badges**: Documents are visually tagged with color-coded badges (`badge-success`, `badge-warning`, `badge-danger`, `badge-info`) to quickly convey their status (e.g., "Approved," "Pending," "Rejected," "Draft"). The `badge_color_for_status` helper (`app/helpers/dashboard_helper.rb`) maps status to CSS classes.
*   **Document Forms (`app/views/doc_as/new.html.erb`, `app/views/doc_bs/new.html.erb`)**:
    *   Structured forms with labels, text fields, number fields, text areas, and select dropdowns.
    *   **Auto-generated Equipment ID**: Displays the automatically generated `eq_id` prominently, informing the user it's not manually editable.
    *   **Cost Input**: Features a "Rs." prefix for cost fields.
    *   **Remarks Fields**: Allows users/approvers to add detailed comments at each stage.
    *   Dynamic display of inherited fields for `DocB` when auto-generated from `DocA`.
*   **Document Details View (`app/views/doc_as/show.html.erb`, `app/views/doc_bs/show.html.erb`)**:
    *   Presents a comprehensive view of document information, including basic details and a detailed "Approval History" table.
    *   **Action Required**: For pending documents, an "Action Required" section appears, allowing the current approver to input `remarks` and choose "Approve" or "Reject." A separate hidden rejection form is shown when "Reject" is clicked, requiring a specific rejection reason.
*   **Alerts and Notifications**: Standard Rails `notice` and `alert` messages are styled consistently and displayed at the top of the content area.

### Helpers:

*   **`dashboard_helper.rb`**: Provides `badge_color_for_status` to determine the appropriate color for status badges.
*   **`doc_as_helper.rb` / `doc_bs_helper.rb`**: Contains `can_approve?` logic to dynamically show/hide approval forms based on the current user's role and the document's status. Also includes `badge_color_for_status` for consistency.