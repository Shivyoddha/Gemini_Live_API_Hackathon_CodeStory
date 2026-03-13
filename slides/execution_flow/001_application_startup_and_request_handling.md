### Slide 1: Application Startup and Request Handling
-   **Entry Point**: The application is initiated via `manage.py runserver` during development or through a WSGI/ASGI server in production, loading the Django project defined in `settings.py`.
-   **WSGI/ASGI Configuration**: `wsgi.py` and `asgi.py` serve as the entry points for web servers, configuring how the server communicates with the Django application.
-   **URL Dispatching**: Upon receiving an HTTP request, Django's URL dispatcher, configured in the root `traveller/urls.py`, matches the request URL to a defined pattern.
-   **App-Specific Routing**: The root `urls.py` includes URLs from individual applications (e.g., `home/urls.py`, `hotel/urls.py`), directing the request to the relevant app's routing configuration.