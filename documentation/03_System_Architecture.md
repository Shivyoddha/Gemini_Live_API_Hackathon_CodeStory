# System Architecture
The Traveller application is built upon the robust Ruby on Rails 7 framework, adhering to the conventional MVC (Model-View-Controller) architectural pattern. Data persistence is managed by a MySQL database.

The frontend is highly interactive and modern, leveraging Hotwire (specifically Turbo for accelerated page navigation and Stimulus for reactive JavaScript behavior), complemented by Bootstrap and Sass for responsive and aesthetically pleasing design. Asset compilation for JavaScript is handled by ESBuild, while Sass compiles the CSS.

For local development, the `foreman` gem is utilized to orchestrate the concurrent execution of the Rails server, JavaScript builder, and CSS builder, ensuring a streamlined development workflow.

## Component Diagram

```mermaid
graph TD
    User(Browser/User Interface)
    Admin(Browser/Admin Interface)

    subgraph Frontend
        Hotwire(Hotwire: Turbo & Stimulus)
        Bootstrap(Bootstrap/Sass)
        ESBuild(ESBuild)
    end

    subgraph Backend
        RailsApp(Ruby on Rails Application)
        Devise(Devise Gem)
        RailsAdmin(RailsAdmin Gem)
    end

    Database(MySQL Database)

    User --> Hotwire
    Hotwire --> RailsApp : HTTP/HTTPS Requests
    Admin --> RailsAdmin : HTTP/HTTPS Requests (Secured)
    RailsAdmin --> RailsApp
    RailsApp --> Devise : Authentication/Authorization
    RailsApp <--> Database : ActiveRecord ORM
    RailsApp <--> Frontend : JSON/HTML Responses

    style RailsApp fill:#f9f,stroke:#333,stroke-width:2px
    style Frontend fill:#ccf,stroke:#333,stroke-width:2px
    style Backend fill:#cfc,stroke:#333,stroke-width:2px
```