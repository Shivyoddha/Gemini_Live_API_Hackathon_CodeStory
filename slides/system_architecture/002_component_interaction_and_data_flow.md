### Slide 2: Component Interaction and Data Flow
-   **Browser to Server**: User requests are sent from the web browser to the Django application server.
-   **URL Routing**: The main `urls.py` (in the root `traveller` directory) dispatches requests to the appropriate application's `urls.py` based on the URL pattern.
-   **View Processing**: Views (`views.py`) handle the request, interact with models (`models.py`) for data access, and render templates (`templates/`) to generate the HTML response.
-   **Database Interaction**: Models define the database schema and provide an ORM interface for Python code to interact with the underlying SQLite database.
-   **Static and Media Files**: `static/` directory serves static assets like CSS, JavaScript, and images, while `MEDIA_ROOT` and `MEDIA_URL` in `settings.py` indicate potential handling for user-uploaded content, such as images for hotels.