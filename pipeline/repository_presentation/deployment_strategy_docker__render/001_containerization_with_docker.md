### Slide 1: Containerization with Docker
- Docker and Docker Compose are used for creating a consistent development environment.
- `Dockerfile` defines the Ruby on Rails application container setup.
- `docker-compose.yml` orchestrates the `web` service (Rails app) and `db` service (PostgreSQL).
- `.dockerignore` excludes unnecessary files from the Docker build context.