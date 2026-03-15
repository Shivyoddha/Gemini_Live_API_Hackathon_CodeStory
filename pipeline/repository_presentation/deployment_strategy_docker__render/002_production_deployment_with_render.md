### Slide 2: Production Deployment with Render
- The application is configured for deployment on Render.
- `render.yaml` defines the service configuration, including build and start commands.
- Build command: `bundle install && bundle exec rails db:migrate RAILS_ENV=production`.
- Start command: `bundle exec rails server -p ${PORT:-3000}`.
- Environment variables (`DATABASE_URL`, `GMAIL_USERNAME`, `GMAIL_PASSWORD`, `SECRET_KEY_BASE`) are managed via Render's interface.