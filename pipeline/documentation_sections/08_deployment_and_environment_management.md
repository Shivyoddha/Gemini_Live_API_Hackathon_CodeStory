## Deployment and Environment Management

The IRIS Procurement Portal is configured for flexible deployment across different environments, leveraging Docker for containerization and specific configurations for the Render platform.

### Docker and Docker Compose:

*   **Containerization**: The application is containerized using Docker to ensure consistent development, testing, and production environments.
    *   **`Dockerfile`**: Defines the build process for the Rails application image.
        *   Starts `FROM ruby:3.2.0`.
        *   Installs system dependencies: `nodejs`, `build-essential`, `sqlite3`, `libsqlite3-dev`. Note that PostgreSQL is the intended production DB, but `sqlite3` is installed for development/convenience (though not used if `database.yml` is correctly configured for Postgres).
        *   Sets `WORKDIR /app`.
        *   Installs `bundler` and then `bundle install` for Ruby gems.
        *   Copies the application code.
        *   Exposes `PORT 3000`.
        *   Default `CMD ["rails", "server", "-b", "0.0.0.0"]` for starting the server.
    *   **`.dockerignore`**: Excludes unnecessary files and directories (e.g., `.git`, `node_modules`, `log`, `tmp`, `Dockerfile`, `docker-compose.yml`, `*.md`) from being copied into the Docker image, optimizing build times and image size.
    *   **`docker-compose.yml`**: Orchestrates the multi-container application.
        *   Defines a `web` service that builds from the current directory (`.`).
        *   Overrides the default command to start the Rails server, ensuring `server.pid` is removed.
        *   Mounts the current directory (`.`) to `/app` (for code changes to be reflected) and `bundle_cache` volume to `/usr/local/bundle` (for efficient gem caching).
        *   Maps port `3000:3000`.
        *   Sets `RAILS_ENV=development`.
        *   Passes `GMAIL_USERNAME` and `GMAIL_PASSWORD` as environment variables, with defaults provided (`anish.kumbhar02@gmail.com`, `opqcjobzezaevrsk`).
        *   Includes a `bundle_cache` named volume.
*   **Docker Setup (`DOCKER_SETUP.md`)**: Provides clear instructions for cloning, starting, and managing the Dockerized application, including commands for database setup (`db:create`, `db:migrate`, `db:seed`), running Rails commands, and rebuilding containers.
*   **Database Service**: Although `docker-compose.yml` only explicitly defines a `web` service, the setup instructions for Docker mention connecting to a PostgreSQL database, implying an external or separately managed PostgreSQL instance for a complete Docker Compose setup (or relying on `docker-compose exec web psql -U iris_prototype -d iris_prototype_development` for direct DB access, meaning the DB might be assumed to be on the host or `web` container, but a typical setup would include a `db` service). However, given `db/schema.rb` and `INSTALL_SUMMARY.md` point to PostgreSQL, and `config/database.yml` defaults to `sqlite3`, there's a slight mismatch for the Docker setup if a Postgres container isn't explicitly defined in `docker-compose.yml`. For this analysis, it's assumed the explicit `docker-compose.yml` with *only* `web` is the Docker Compose configuration, and PostgreSQL is set up externally as per `INSTALL_SUMMARY.md`.

### Render Platform Deployment:

*   **`Procfile`**: Specifies the command to start the web server in a production environment: `web: bundle exec rails server -p ${PORT:-3000}`. This is picked up by platforms like Render.
*   **`render.yaml`**: Defines the Render service configuration.
    *   `type: web`, `env: ruby`.
    *   `buildCommand`: `bundle install && bundle exec rails db:migrate RAILS_ENV=production`. This ensures all gems are installed and database migrations are run during deployment.
    *   `startCommand`: `bundle exec rails server -p ${PORT:-3000}`.
    *   `envVars`: Specifies environment variables required for Render: `RAILS_ENV`, `SECRET_KEY_BASE` (auto-generated), `RAILS_MASTER_KEY` (synced externally), `DATABASE_URL` (synced externally by Render's Postgres service), `GMAIL_USERNAME`, `GMAIL_PASSWORD`, `APP_HOST`.
*   **`RENDER_DEPLOYMENT.md`**: Provides specific instructions for deploying to Render, including required environment variables and database setup steps (creating a PostgreSQL database in Render and running migrations/seeds).

### Environment Configuration:

*   **`config/database.yml`**: Defaults to `sqlite3` for `development`, `test`, and `production`. However, installation guides strongly recommend and use PostgreSQL. In a Docker/Render context, `DATABASE_URL` environment variable will override this, connecting to PostgreSQL.
*   **`config/environments/development.rb`**:
    *   `config.cache_classes = false`, `eager_load = false`, `consider_all_requests_local = true` for development ease.
    *   `action_mailer` configured with Gmail SMTP, using `ENV` variables or default hardcoded values if not set.
*   **`config/environments/production.rb`**:
    *   `config.cache_classes = true`, `eager_load = true`, `consider_all_requests_local = false` for performance.
    *   `SECRET_KEY_BASE` fetched from `ENV` or generated for security.
    *   `action_mailer` configured with Gmail SMTP, strictly using `ENV['GMAIL_USERNAME']` and `ENV['GMAIL_PASSWORD']` for production credentials.
*   **`config/environments/test.rb`**: Optimized for testing, `cache_classes = true`, `action_dispatch.show_exceptions = false`.

### Build and Runtime Execution:

*   **Local Development**: `rails server` or `bundle exec rails server` starts the application on `http://localhost:3000`. `bin/setup` script automates dependency installation and database setup.
*   **Docker**: `docker-compose up` builds and starts the web service. Database setup typically involves `docker-compose exec web rails db:create db:migrate db:seed`.
*   **Render**: The `buildCommand` and `startCommand` in `render.yaml` orchestrate the deployment lifecycle, installing dependencies, migrating the database, and starting the Puma server.