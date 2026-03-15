### Slide 3: Local Development and Production Environment
- Local development uses `docker-compose up` to start services.
- Database setup (create, migrate, seed) is managed via `docker-compose exec web rails ...` commands.
- Production deployment on Render requires setting environment variables for sensitive information and database connections.
- `Procfile` is configured for Render to specify the server start command.