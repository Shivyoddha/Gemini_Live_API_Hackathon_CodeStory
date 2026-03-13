## Project Structure & Core Modules

The application follows a standard Rails directory structure, with key components organized under the `app/` directory:

*   **`app/assets/`**: Contains static assets like images, JavaScript, and stylesheets.
    *   `app/assets/images/`: Stores various image assets, including carousel images and logos.
    *   `app/assets/javascript/`: Houses Stimulus controllers and the main `application.js` entry point for ESBuild.
    *   `app/assets/stylesheets/`: Contains SCSS and CSS files, including Bootstrap integration and custom styles (`login.css`, `about.css`).
*   **`app/channels/`**: Contains Action Cable channels for real-time features, though currently minimal with `ApplicationCable`.
*   **`app/controllers/`**: Defines the application's request-response logic.
    *   `ApplicationController`: Base controller for common logic, including Devise parameter sanitization.
    *   `HomeController`: Manages public-facing pages like the index, about, and user's booked slots.
    *   `CompaniesController`: Handles CRUD operations for `Company` resources.
    *   `TrippackagesController`: Manages CRUD operations for `Trippackage` resources.
    *   `SlotsController`: Handles booking `Slot` resources for users and packages.
    *   `FeedbacksController`: Manages CRUD operations for `Feedback` resources.
    *   `MainportalController`: Provides administrative dashboards for package management.
*   **`app/helpers/`**: Contains helper modules for views, though mostly empty in the provided context.
*   **`app/jobs/`**: Stores background jobs, with a base `ApplicationJob`.
*   **`app/mailers/`**: Contains mailer classes, with a base `ApplicationMailer`, primarily used by Devise for user notifications.
*   **`app/models/`**: Defines the application's data models and their relationships.
    *   `ApplicationRecord`: Base class for all ActiveRecord models.
    *   `User`: Represents application users, integrated with Devise for authentication.
    *   `Company`: Represents travel companies.
    *   `Trippackage`: Represents available travel packages.
    *   `Slot`: Represents a booking made by a user for a trip package.
    *   `Feedback`: Represents feedback provided by a user for a company.
*   **`app/views/`**: Contains ERB templates for rendering HTML, categorized by controller, and partials (`_header.html.erb`, `_footer.html.erb`). Devise-specific views are also present here.
*   **`bin/`**: Contains executable scripts for various tasks, including `rails`, `rake`, `bundle`, `dev`, and `setup`.
*   **`config/`**: Holds application configuration, including database settings, routes, environment-specific configurations, and initializers for gems like Devise and RailsAdmin.
*   **`db/`**: Contains database schema, migration files, and seed data.
