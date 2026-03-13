## Configuration, Build & Deployment

### Dependencies

*   **Ruby Gems**: Managed by Bundler, as defined in `Gemfile` and `Gemfile.lock`. Key dependencies include `rails`, `mysql2`, `puma`, `rails_admin`, `devise`, `jsbundling-rails`, `turbo-rails`, `stimulus-rails`, `cssbundling-rails`, `jbuilder`, `sassc-rails`.
*   **JavaScript/CSS Packages**: Managed by Yarn, as defined in `package.json` and `yarn.lock`. Includes `@hotwired/stimulus`, `@hotwired/turbo-rails`, `bootstrap`, `bootstrap-icons`, `esbuild`, and `sass`.

### Build & Asset Management

*   **Asset Pipeline**: Rails' Sprockets-Rails manages the asset pipeline, compiling and serving static assets.
*   **JavaScript Build**: `jsbundling-rails` integrates `esbuild`. The `build` script in `package.json` uses `esbuild app/javascript/*.* --bundle --sourcemap --outdir=app/assets/builds --public-path=assets`.
*   **CSS Build**: `cssbundling-rails` integrates `sass`. The `build:css` script in `package.json` uses `sass ./app/assets/stylesheets/application.bootstrap.scss:./app/assets/builds/application.css --no-source-map --load-path=node_modules`.
*   **Development Build**: `Procfile.dev` defines commands to run the Rails server and watch for changes in JS/CSS assets for live recompilation.

### Database Configuration

*   **`config/database.yml`**: Configures the MySQL database connections for development, test, and production environments. It specifies `mysql2` adapter, `utf8mb4` encoding, connection pool size, and credentials. Production database credentials are expected from environment variables for security.

### Web Server

*   **`config/puma.rb`**: Configures the Puma web server, setting thread counts, worker timeout for development, port, environment, and PID file location.

### Routes

*   **`config/routes.rb`**: Defines application routes.
    *   Resources for `feedbacks`, `slots`, `companies`, `trippackages`.
    *   `RailsAdmin` mounted at `/admin`.
    *   `Devise` routes for `users`.
    *   Custom GET routes for `home/index`, `home/about`, `mainportal/admindashboard`, `mainportal/adminpackage`, `home/myslots`.
    *   Custom Devise logout route: `get '/users/sign_out' => 'devise/sessions#destroy'`.
    *   Root path for authenticated users is `home_index`, and for unauthenticated users is `devise/sessions#new`.

### Environment Configuration

*   **`config/application.rb`**: General Rails application configuration, loading defaults and Bundler gems.
*   **`config/environments/`**: Contains environment-specific settings for `development.rb`, `test.rb`, and `production.rb`, overriding general settings. This includes caching behavior, mailer options, logging levels, and asset compilation.

### Initializers

*   **`config/initializers/devise.rb`**: Configures the Devise gem for user authentication, including mailer sender, password length, reconfirmable settings, and Turbo integration.
*   **`config/initializers/rails_admin.rb`**: Configures the RailsAdmin gem, setting its asset source to Sprockets and defining the available actions for the dashboard.
*   **`config/initializers/assets.rb`**: Manages asset versioning and adds `bootstrap-icons` to the asset load path.
*   **`config/initializers/filter_parameter_logging.rb`**: Specifies sensitive parameters to be filtered from logs.
