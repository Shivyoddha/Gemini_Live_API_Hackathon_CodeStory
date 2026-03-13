### Slide 1: High-Level Rails MVC Structure
- **Model-View-Controller (MVC)**: The application follows the standard Ruby on Rails MVC pattern.
- **Models (`app/models`)**: Represent business logic and data structures (`User`, `Trippackage`, `Company`, `Slot`, `Feedback`).
- **Views (`app/views`)**: Handle the presentation layer, rendering HTML using ERB templates and JSON via Jbuilder.
- **Controllers (`app/controllers`)**: Manage user input, interact with models, and select appropriate views for rendering responses.