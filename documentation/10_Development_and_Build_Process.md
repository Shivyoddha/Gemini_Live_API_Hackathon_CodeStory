# Development & Build Process
The Traveller application's development and build process is streamlined for efficiency and consistency.

## Environment Setup
*   **Ruby Version**: The project explicitly requires Ruby `3.1.3`, as defined in both `.ruby-version` and `Gemfile`.
*   **Dependency Management**:
    *   **Ruby Gems**: `Bundler` is used to manage Ruby dependencies (gems). The `Gemfile` lists all required gems, including `rails`, `mysql2`, `rails_admin`, `devise`, `puma`, `jsbundling-rails`, `turbo-rails`, `stimulus-rails`, `cssbundling-rails`, `jbuilder`, `sassc-rails`, and testing/development-specific gems like `debug`, `web-console`, `capybara`, `selenium-webdriver`, `webdrivers`.
    *   **Node.js Packages**: `Yarn` manages JavaScript and CSS build tool dependencies, as indicated by `package.json`. Key dependencies include `@hotwired/stimulus`, `@hotwired/turbo-rails`, `bootstrap`, `bootstrap-icons`, `esbuild`, and `sass`.
*   **Automated Setup Script**: The `bin/setup` script provides an automated way to initialize the development environment. It performs the following steps:
    1.  Installs `bundler` gem if not present.
    2.  Installs all Ruby gems listed in `Gemfile` using `bundle install`.
    3.  Prepares the database by running `bin/rails db:prepare` (which creates the database, loads the schema, and runs migrations).
    4.  Clears old log files and temporary files.
    5.  Restarts the application server.

## Local Development Workflow
*   **Foreman**: The `bin/dev` script utilizes `foreman` to run multiple processes concurrently, as defined in `Procfile.dev`:
    *   `web: unset PORT && bin/rails server`: Starts the Rails web server (Puma).
    *   `js: yarn build --watch`: Starts `esbuild` to compile JavaScript assets, continuously watching for changes.
    *   `css: yarn build:css --watch`: Starts `sass` to compile CSS assets, continuously watching for changes.
*   **Asset Compilation**:
    *   JavaScript assets (from `app/javascript/`) are bundled by `esbuild` into `app/assets/builds/application.js`.
    *   Sass stylesheets (e.g., `app/assets/stylesheets/application.bootstrap.scss`) are compiled by `sass` into `app/assets/builds/application.css`.
    *   These compiled assets are then served by Rails' asset pipeline.

## Build Commands
The `package.json` defines specific build scripts:
*   `"build": "esbuild app/javascript/*.* --bundle --sourcemap --outdir=app/assets/builds --public-path=assets"`: The command for bundling JavaScript files.
*   `"build:css": "sass ./app/assets/stylesheets/application.bootstrap.scss:./app/assets/builds/application.css --no-source-map --load-path=node_modules"`: The command for compiling Sass files into CSS.