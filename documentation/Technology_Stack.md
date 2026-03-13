## Technology Stack

The Traveller application leverages a robust set of technologies for both its backend and frontend operations, ensuring efficiency, maintainability, and a responsive user experience.

| Library Name             | General Purpose                     | Specific Usage Within This Project                                   |
| :----------------------- | :---------------------------------- | :------------------------------------------------------------------- |
| **Ruby**                 | Programming Language                | Core language for the backend application.                           |
| **Rails 7.0.4.3**        | Web Application Framework           | Provides MVC structure, ORM (ActiveRecord), routing, and more.       |
| **MySQL2 (~> 0.5)**      | Database Connector                  | Adapter for connecting Rails to a MySQL database.                    |
| **Puma (~> 5.0)**        | Web Server                          | Serves the Rails application in production and development.          |
| **RailsAdmin**           | Admin Interface                     | Provides a comprehensive dashboard for managing application data.    |
| **Devise (4.9.2)**       | Authentication Solution             | Handles user authentication, registration, password reset, etc.      |
| **Sprockets-Rails**      | Asset Pipeline                      | Manages and compiles application assets (JS, CSS, images).           |
| **JSbundling-rails**     | JavaScript Bundling                 | Integrates `esbuild` for efficient JavaScript bundling.              |
| **Turbo-rails (7.3.0)**  | SPA-like Page Accelerator           | Part of Hotwire, enables fast page navigation and partial updates.   |
| **Stimulus-rails (1.2.1)** | Modest JavaScript Framework         | Part of Hotwire, adds interactivity to HTML with minimal JavaScript. |
| **CSSbundling-rails**    | CSS Bundling                        | Integrates `sass` for efficient CSS processing.                      |
| **Jbuilder (2.11.5)**    | JSON API Builder                    | Simplifies building JSON responses for API endpoints.                |
| **Bootstrap (~> 5.2.3)** | Frontend UI Framework               | Provides pre-built UI components and responsive design utilities.    |
| **Bootstrap-icons (~1.10.5)** | Icon Library                        | Provides a set of open-source SVG icons for UI.                      |
| **Sass (~1.62.1)**       | CSS Preprocessor                    | Compiles SCSS files into standard CSS.                               |
| **esbuild (~0.17.18)**   | JavaScript Bundler                  | Bundles JavaScript files for efficient delivery to the browser.      |
| **ActiveRecord (7.0.4.3)** | Object-Relational Mapping (ORM)     | Maps Ruby objects to database records.                               |
| **Action Cable (7.0.4.3)** | WebSocket Framework                 | Provides real-time communication capabilities (though not heavily used in visible code). |
| **Active Job (7.0.4.3)** | Background Job Framework            | Manages and runs asynchronous tasks (e.g., email delivery).         |
| **Active Storage (7.0.4.3)** | File Upload Management              | Handles file uploads to cloud storage services or local disk.        |
| **Capybara (3.39.0)**    | Web Automation/Testing              | Used for system testing, interacting with the application as a user. |
| **Selenium-WebDriver (4.9.0)** | Browser Automation                | Drives web browsers for automated testing.                           |
| **Webdrivers (5.2.0)**   | WebDriver Management                | Automatically downloads and manages browser drivers for Selenium.    |
| **Debug (1.7.2)**        | Ruby Debugger                       | Provides debugging capabilities for development and testing.         |
| **Web-Console (4.2.0)**  | In-Browser Debugging Console        | Offers an interactive Ruby console in development error pages.       |
