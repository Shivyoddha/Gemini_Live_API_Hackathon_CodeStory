### Slide 2: Exposed Endpoints and Functionalities
-   **User Authentication Endpoints**: The `user` application provides routes for `register`, `login`, and `logout`, allowing users to manage their authentication state.
-   **Home Page and Navigation**: The `home` application likely exposes the root URL and other static content or dashboard views.
-   **Travel Booking Endpoints**:
    -   `hotel`: Endpoints for searching hotels, viewing hotel details (`hotel_desc`), and booking rooms (`hotel_book`).
    -   `flights`: Endpoints for searching flights and managing flight bookings.
    -   `trains`: Endpoints for searching trains and managing train bookings.
-   **Payment Processing Endpoints**: The `payment` application would expose routes for initiating and confirming payment transactions (`payment_home`).
-   **Admin Endpoints**: While Django's built-in admin site is implicitly an API, specific `admin_login` and other admin-focused views exist within `user/views.py` and `traveller/views.py` for custom administrative functionalities.