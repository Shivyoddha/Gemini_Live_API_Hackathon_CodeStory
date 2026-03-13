### Slide 2: Data Models and Relationships
-   **Application-Specific Models**: Each Django application (`home`, `hotel`, `flights`, `trains`, `payment`, `user`) defines its own set of data models in its respective `models.py` file.
-   **User Model**: The `user` app likely contains models for user accounts, profiles, and authentication-related data, potentially extending Django's built-in `User` model.
-   **Service-Specific Models**:
    -   `hotel/models.py`: Defines models for hotels, rooms, bookings, and related attributes like images.
    -   `flights/models.py`: Defines models for flights, airlines, routes, and flight bookings.
    -   `trains/models.py`: Defines models for trains, routes, and train bookings.
    -   `payment/models.py`: Defines models for transactions, payment details, and booking statuses.
-   **Relationships**: Models establish relationships (e.g., One-to-Many, Many-to-Many, Foreign Key) between different entities, such as a user booking multiple flights or a hotel having many rooms.