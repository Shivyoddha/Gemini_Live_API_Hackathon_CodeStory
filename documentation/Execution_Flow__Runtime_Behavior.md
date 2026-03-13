## Execution Flow & Runtime Behavior

1.  **Application Startup**:
    *   When initiated in development mode via `bin/dev` (which uses Foreman and `Procfile.dev`), the application starts a Rails server (`bin/rails server`), a JavaScript build process (`yarn build --watch`), and a CSS build process (`yarn build:css --watch`).
    *   In production, the `puma` server is typically used to handle requests.
    *   `config.ru` is the Rack entry point, loading `config/environment.rb` which in turn initializes the Rails application.
2.  **Request Processing**:
    *   Upon receiving an HTTP request, Rails routes it based on `config/routes.rb`.
    *   The request is dispatched to the appropriate controller action (e.g., `HomeController#index`, `TrippackagesController#show`).
    *   Controllers interact with models (ActiveRecord) to fetch or manipulate data from the MySQL database.
    *   Data is then passed to views (ERB templates) for rendering.
    *   For actions responding to JSON, `Jbuilder` templates generate the necessary JSON output.
3.  **Frontend Interactions**:
    *   The `application.js` file, acting as the entry point for JavaScript, imports `@hotwired/turbo-rails` and Stimulus controllers.
    *   `esbuild` bundles these JavaScript assets into `app/assets/builds/application.js`.
    *   `sass` compiles SCSS into `app/assets/builds/application.css`.
    *   Turbo handles most link clicks and form submissions, fetching new HTML and replacing parts of the DOM, leading to a fast, single-page application feel without complex client-side routing.
    *   Stimulus controllers add specific, small-scale interactivity to HTML elements, such as the "Hello World!" example controller.
    *   Bootstrap provides the styling and responsive layout for the application's UI.
4.  **User Authentication**:
    *   Devise manages the entire user authentication lifecycle, including sign-up, login, logout, password recovery, and account editing.
    *   `ApplicationController` includes `before_action :configure_permitted_parameters, if: :devise_controller?` to handle custom user attributes like `name`, `homelocation`, and `phoneno` during sign-up and account updates.
    *   The root path for unauthenticated users is set to the Devise sign-in page (`devise/sessions#new`).
