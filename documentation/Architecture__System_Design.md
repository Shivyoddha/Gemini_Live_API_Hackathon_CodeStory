## Architecture & System Design

The application follows the Model-View-Controller (MVC) architectural pattern, characteristic of Ruby on Rails frameworks. It is a monolithic application with a clear separation of concerns:

*   **Models**: Handle data logic and interactions with the MySQL database using ActiveRecord.
*   **Views**: Render the user interface using ERB templates, enhanced with modern frontend tools like Bootstrap, Sass, and Hotwire for dynamic interactions.
*   **Controllers**: Process user input, interact with models, and prepare data for views, serving both HTML and JSON responses.

Frontend interactivity is significantly boosted by Hotwire (Turbo Rails for fast page navigation and Stimulus Rails for modest JavaScript enhancements), reducing the need for heavy client-side frameworks.

### Component Diagram

```mermaid
graph TD
    User(User) -- Accesses --> Frontend(Web Browser / Mobile)
    Frontend -- Requests HTML/JSON --> Backend(Rails Application)
    Backend -- Reads/Writes --> Database(MySQL)
    Backend -- Admin Interface --> RailsAdmin(RailsAdmin Dashboard)
    Frontend -- Builds Assets --> AssetPipeline(JS/CSS Build Tools)
    AssetPipeline -- Delivers Assets --> Frontend
    Backend -- Asynchronous Tasks --> JobQueue(Active Job)
```
